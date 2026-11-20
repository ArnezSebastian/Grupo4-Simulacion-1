// Servicio de audio (Web Audio API): dueño del AudioContext, del volumen y del silencio.
//   - Los navegadores NO dejan reproducir sonido hasta que el usuario hace algo (click, tecla): el contexto se
//     crea recién en desbloquear(), que hay que llamar desde un gesto. Antes de eso reproducir() no hace nada.
//   - Si el navegador no soporta Web Audio, el servicio queda como "mudo" y nada falla.
//   - El estado de silencio se guarda en el navegador (localStorage) para recordarlo entre visitas.
class ServicioAudio {
    // `ClaseContexto` y `almacenamiento` se pueden inyectar (por ejemplo para probar sin navegador).
    constructor(config, { ClaseContexto, almacenamiento } = {}) {
        this.config = config;
        this.ClaseContexto = ClaseContexto === undefined
            ? (globalThis.AudioContext || globalThis.webkitAudioContext || null)
            : ClaseContexto;
        this.almacenamiento = almacenamiento === undefined ? this._obtenerAlmacenamiento() : almacenamiento;

        this.contexto = null;
        this.maestro = null;
        this.busContinuo = null;
        this.busEfectos = null;
        this.envioEco = null;
        this.retornoEco = null;
        this.ecoRebote = null;
        this.ecoActivo = false;
        this.sintetizador = null;
        this.escuchasEstado = new Set();

        this.vocesActivas = 0;                  // efectos que todavía están sonando
        this.ultimaReproduccion = new Map();    // id del efecto -> instante (ms) de su última reproducción
        this.silenciado = this._leerSilencioGuardado();
    }

    get disponible() {
        return this.ClaseContexto !== null;
    }

    alRegistrarCambioEstado(callback) {
        this.escuchasEstado.add(callback);
        if (this.contexto) callback(this.contexto);
    }

    crearCanalContinuo() {
        if (!this.contexto || this.contexto.state !== "running" || !this.busContinuo) return null;
        const canal = this.contexto.createGain();
        canal.connect(this.busContinuo);
        return canal;
    }

    // Crea (la primera vez) o reanuda el contexto. Llamar SIEMPRE dentro de un gesto del usuario.
    desbloquear() {
        if (!this.disponible) return false;

        if (!this.contexto) this._crearContexto();
        if (this.contexto.state === "suspended") {
            const reanudando = this.contexto.resume();
            if (reanudando && reanudando.catch) reanudando.catch(() => { });     // sin permiso todavía: se reintenta en el próximo gesto
        }
        return this.contexto.state === "running";
    }

    // Reproduce un efecto de DEFINICIONES_SONIDO. Devuelve true si realmente se programó.
    reproducir(id) {
        if (this.silenciado || !this.contexto) return false;

        const definicion = DEFINICIONES_SONIDO[id];
        if (!definicion) return false;

        if (this.contexto.state !== "running") {
            this.desbloquear();                 // por ejemplo, la pestaña estuvo en segundo plano
            return false;
        }
        if (this.vocesActivas >= this.config.maxVoces) return false;

        const ahora = performance.now();
        const ultima = this.ultimaReproduccion.get(id);
        if (ultima !== undefined && ahora - ultima < definicion.minIntervaloMs) return false;
        this.ultimaReproduccion.set(id, ahora);

        this._programar(definicion, id !== "salto");
        return true;
    }

    establecerEco(activado) {
        this.ecoActivo = Boolean(activado);
        if (!this.envioEco || !this.contexto) return;

        this.envioEco.gain.setTargetAtTime(
            this.ecoActivo ? 0.9 : 0,
            this.contexto.currentTime,
            0.04
        );
    }

    establecerSilenciado(silenciado) {
        this.silenciado = Boolean(silenciado);
        this._guardarSilencio();
        this._aplicarVolumen();
    }

    alternarSilencio() {
        this.establecerSilenciado(!this.silenciado);
        return this.silenciado;
    }

    // --- Interno ---

    _crearContexto() {
        this.contexto = new this.ClaseContexto();

        // Efectos y sonidos continuos comparten compresor, pero sólo los efectos alimentan el eco.
        this.maestro = this.contexto.createGain();
        this.busContinuo = this.contexto.createGain();
        this.busEfectos = this.contexto.createGain();
        const compresor = this.contexto.createDynamicsCompressor();
        this.maestro.connect(compresor);
        this.busContinuo.connect(compresor);
        this.busEfectos.connect(this.maestro);
        compresor.connect(this.contexto.destination);

        const delay = this.contexto.createDelay(1);
        delay.delayTime.value = 0.34;
        const filtroEco = this.contexto.createBiquadFilter();
        filtroEco.type = "lowpass";
        filtroEco.frequency.value = 1000;
        this.ecoRebote = this.contexto.createConvolver();
        this.ecoRebote.normalize = false;
        this.ecoRebote.buffer = this._crearImpulsoEco(1);
        this.envioEco = this.contexto.createGain();
        this.envioEco.gain.value = 0;
        this.retornoEco = this.contexto.createGain();
        this.retornoEco.gain.value = 0.34;

        this.busEfectos.connect(this.envioEco);
        this.envioEco.connect(delay);
        delay.connect(filtroEco);
        filtroEco.connect(this.ecoRebote);
        this.ecoRebote.connect(this.retornoEco);
        this.retornoEco.connect(this.maestro);

        this.sintetizador = new SintetizadorSonidos(this.contexto);
        this.contexto.addEventListener("statechange", () => {
            for (const callback of this.escuchasEstado) callback(this.contexto);
        });
        this._aplicarVolumen();
        this.establecerEco(this.ecoActivo);
    }

    _crearImpulsoEco(duracion) {
        const longitud = Math.ceil(this.contexto.sampleRate * duracion);
        const impulso = this.contexto.createBuffer(1, longitud, this.contexto.sampleRate);
        const muestras = impulso.getChannelData(0);

        muestras[0] = 1;
        for (let i = 1; i < longitud; i++) {
            const tiempo = i / this.contexto.sampleRate;
            const envolvente = Math.exp(-5 * tiempo / duracion);
            muestras[i] = (Math.random() * 2 - 1) * 0.12 * envolvente;
        }

        return impulso;
    }

    _aplicarVolumen() {
        if (!this.maestro) return;

        const volumen = this.silenciado ? 0 : this.config.volumenMaestro;
        this.maestro.gain.setTargetAtTime(volumen, this.contexto.currentTime, 0.01);    // cambio suave: sin "clicks"
    }

    _programar(definicion, conEco) {
        const t0 = this.contexto.currentTime + 0.005;
        const destino = conEco ? this.busEfectos : this.maestro;
        const { ultimaFuente } = this.sintetizador.reproducir(definicion, destino, t0);

        // El efecto cuenta como "sonando" hasta que termina su última voz.
        this.vocesActivas++;
        ultimaFuente.onended = () => { this.vocesActivas = Math.max(0, this.vocesActivas - 1); };
    }

    // El almacenamiento del navegador puede estar bloqueado (modo privado, iframes): nunca debe romper nada.
    _obtenerAlmacenamiento() {
        try {
            return globalThis.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    _leerSilencioGuardado() {
        try {
            return this.almacenamiento !== null && this.almacenamiento.getItem(this.config.claveSilencio) === "1";
        } catch (error) {
            return false;
        }
    }

    _guardarSilencio() {
        try {
            if (this.almacenamiento !== null) this.almacenamiento.setItem(this.config.claveSilencio, this.silenciado ? "1" : "0");
        } catch (error) {
            // sin almacenamiento: el silencio sólo dura mientras la página esté abierta
        }
    }
}
