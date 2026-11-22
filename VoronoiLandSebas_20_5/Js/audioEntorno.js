// Música y ambiente procedural. Los sonidos continuos se mantienen separados del bus de efectos.
class AudioEntorno {
    constructor(servicio, config, documento = document, almacenamiento) {
        this.servicio = servicio;
        this.almacenamiento = almacenamiento === undefined ? this._obtenerAlmacenamiento() : almacenamiento;
        this.documento = documento;
        this.escena = "inicio";
        this.pausado = false;
        this.material = null;
        this.musica = this._leerPreferencias("musica", config.musica);
        this.ambiente = this._leerPreferencias("ambiente", config.ambiente);
        this.pistaMusica = null;
        this.pistaAmbiente = null;
        this.bufferMusica = null;
        this.bufferRuido = null;

        this._enlazarControles();
        this.servicio.alRegistrarCambioEstado(() => this._sincronizar());
    }

    establecerEscena(escena, pausado = false) {
        this.escena = escena;
        this.pausado = pausado;
        this._sincronizar();
    }

    actualizarMaterial(material) {
        if (this.material === material) return;
        this.material = material;
        this._sincronizarAmbiente();
    }

    get necesitaMaterialAmbiental() {
        return this.escena === MODOS.JUEGO && !this.pausado && this.ambiente.activado && this.ambiente.volumen > 0
            && this.servicio.disponible;
    }

    _enlazarControles() {
        const controles = [
            ["musica", this.musica],
            ["ambiente", this.ambiente]
        ];

        for (const [tipo, preferencia] of controles) {
            const checkbox = this.documento.getElementById(`audio-${tipo}-activado`);
            const volumen = this.documento.getElementById(`audio-${tipo}-volumen`);
            const salida = this.documento.getElementById(`audio-${tipo}-valor`);
            if (!checkbox || !volumen || !salida) continue;

            checkbox.checked = preferencia.activado;
            volumen.value = String(preferencia.volumen);
            salida.value = `${preferencia.volumen}%`;
            salida.textContent = `${preferencia.volumen}%`;

            checkbox.addEventListener("change", () => {
                preferencia.activado = checkbox.checked;
                this._guardarPreferencias(tipo, preferencia);
                this._sincronizar();
            });
            volumen.addEventListener("input", () => {
                preferencia.volumen = Number(volumen.value);
                salida.value = `${preferencia.volumen}%`;
                salida.textContent = `${preferencia.volumen}%`;
                this._aplicarVolumenes();
                this._sincronizar();
            });
            volumen.addEventListener("change", () => this._guardarPreferencias(tipo, preferencia));
        }
    }

    _sincronizar() {
        this._sincronizarMusica();
        this._sincronizarAmbiente();
    }

    _sincronizarMusica() {
        const corresponde = this.escena === "inicio" || this.escena === MODOS.EDITOR;
        if (!corresponde || this.pausado || !this.musica.activado || this.musica.volumen === 0) {
            this._detenerPista("pistaMusica");
            return;
        }
        if (this.pistaMusica) {
            this._aplicarVolumenes();
            return;
        }

        const canal = this.servicio.crearCanalContinuo();
        if (!canal) return;
        this.pistaMusica = { canal, fuentes: [], nodos: [], temporizador: 0 };
        const contexto = this.servicio.contexto;
        if (!this.bufferMusica) this.bufferMusica = this._crearBufferMusical(contexto);
        const fuente = contexto.createBufferSource();
        fuente.buffer = this.bufferMusica;
        fuente.loop = true;
        fuente.connect(canal);
        fuente.start();
        this.pistaMusica.fuentes.push(fuente);
        this._aplicarVolumenes();
    }

    _sincronizarAmbiente() {
        const corresponde = this.escena === MODOS.JUEGO && !this.pausado
            && this.ambiente.activado && this.ambiente.volumen > 0 && this.material !== null;
        if (!corresponde) {
            this._detenerPista("pistaAmbiente");
            return;
        }
        if (this.pistaAmbiente && this.pistaAmbiente.material === this.material) {
            this._aplicarVolumenes();
            return;
        }

        this._detenerPista("pistaAmbiente");
        const canal = this.servicio.crearCanalContinuo();
        if (!canal) return;
        const pista = { canal, fuentes: [], nodos: [], temporizador: 0, material: this.material };
        this.pistaAmbiente = pista;
        this._crearCapaAmbiente(pista);
        this._aplicarVolumenes();
    }

    _crearBufferMusical(contexto) {
        const duracion = 12;
        const frecuenciaMuestreo = Math.min(contexto.sampleRate, 22050);
        const buffer = contexto.createBuffer(1, Math.ceil(duracion * frecuenciaMuestreo), frecuenciaMuestreo);
        const datos = buffer.getChannelData(0);
        const acordes = [
            [261.63, 329.63, 392.00],
            [220.00, 261.63, 329.63],
            [174.61, 220.00, 261.63],
            [196.00, 246.94, 293.66]
        ];
        const melodia = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 392.00,
            440.00, 523.25, 587.33, 659.25, 587.33, 523.25, 440.00, 392.00];
        for (let i = 0; i < datos.length; i++) {
            const t = i / frecuenciaMuestreo;
            const indiceAcorde = Math.floor(t / 3);
            const dentroAcorde = t - indiceAcorde * 3;
            const fadeAcorde = Math.min(1, dentroAcorde / 0.25, (3 - dentroAcorde) / 0.25);
            let muestra = 0;
            for (const frecuencia of acordes[indiceAcorde]) {
                muestra += Math.sin(2 * Math.PI * frecuencia * t) * 0.055 * fadeAcorde;
            }

            const indiceNota = Math.floor(t / 0.75);
            const dentroNota = t - indiceNota * 0.75;
            const envolvente = Math.min(1, dentroNota / 0.035, (0.62 - dentroNota) / 0.12);
            if (envolvente > 0) {
                muestra += Math.sin(2 * Math.PI * melodia[indiceNota] * t) * 0.10 * envolvente;
            }

            const fadeBucle = Math.min(1, t / 0.04, (duracion - t) / 0.04);
            datos[i] = muestra * Math.max(0, fadeBucle);
        }
        return buffer;
    }

    _crearCapaAmbiente(pista) {
        const contexto = this.servicio.contexto;
        const perfil = this._perfilAmbiente(pista.material);
        if (!perfil) return;

        const fuente = contexto.createBufferSource();
        fuente.buffer = this._obtenerBufferRuido(contexto);
        fuente.loop = true;
        const filtro = contexto.createBiquadFilter();
        filtro.type = perfil.filtro;
        filtro.frequency.value = perfil.frecuencia;
        const gananciaRuido = contexto.createGain();
        gananciaRuido.gain.value = perfil.ganancia;
        fuente.connect(filtro);
        filtro.connect(gananciaRuido);
        gananciaRuido.connect(pista.canal);
        fuente.start();
        pista.fuentes.push(fuente);
        pista.nodos.push(filtro, gananciaRuido);

        const lfo = contexto.createOscillator();
        const gananciaLfo = contexto.createGain();
        lfo.frequency.value = perfil.velocidadOla;
        gananciaLfo.gain.value = perfil.profundidadOla;
        lfo.connect(gananciaLfo);
        gananciaLfo.connect(gananciaRuido.gain);
        lfo.start();
        pista.fuentes.push(lfo);
        pista.nodos.push(gananciaLfo);

        if (perfil.aves) this._programarAve(pista, perfil.aves);
    }

    _programarAve(pista, perfil) {
        if (this.pistaAmbiente !== pista) return;
        const espera = perfil.esperaMin + Math.random() * (perfil.esperaMax - perfil.esperaMin);
        pista.temporizador = setTimeout(() => {
            if (this.pistaAmbiente !== pista) return;
            this._crearChirrido(pista, perfil);
            this._programarAve(pista, perfil);
        }, espera * 1000);
    }

    _crearChirrido(pista, perfil) {
        const contexto = this.servicio.contexto;
        if (contexto.state !== "running") return;
        const inicio = contexto.currentTime + 0.02;
        const base = perfil.frecuencia * (0.85 + Math.random() * 0.3);
        const duracion = perfil.duracion;
        const oscilador = contexto.createOscillator();
        const envolvente = contexto.createGain();
        oscilador.type = "sine";
        oscilador.frequency.setValueAtTime(base, inicio);
        oscilador.frequency.exponentialRampToValueAtTime(base * perfil.subida, inicio + duracion * 0.45);
        oscilador.frequency.exponentialRampToValueAtTime(base * 0.92, inicio + duracion);
        envolvente.gain.setValueAtTime(0.0001, inicio);
        envolvente.gain.linearRampToValueAtTime(perfil.volumen, inicio + 0.04);
        envolvente.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
        oscilador.connect(envolvente);
        envolvente.connect(pista.canal);
        oscilador.start(inicio);
        oscilador.stop(inicio + duracion + 0.02);
        pista.fuentes.push(oscilador);
        pista.nodos.push(envolvente);
        oscilador.addEventListener("ended", () => {
            oscilador.disconnect();
            envolvente.disconnect();
            pista.fuentes = pista.fuentes.filter((fuente) => fuente !== oscilador);
            pista.nodos = pista.nodos.filter((nodo) => nodo !== envolvente);
        }, { once: true });
    }

    _perfilAmbiente(material) {
        if (material === MATERIALES.ARENA) {
            return {
                filtro: "lowpass", frecuencia: 520, ganancia: 0.10, velocidadOla: 0.10, profundidadOla: 0.045,
                aves: { esperaMin: 8, esperaMax: 14, frecuencia: 850, subida: 1.8, duracion: 0.85, volumen: 0.035 }
            };
        }
        if (material === MATERIALES.TIERRA) {
            return {
                filtro: "lowpass", frecuencia: 1900, ganancia: 0.035, velocidadOla: 0.16, profundidadOla: 0.012,
                aves: { esperaMin: 3, esperaMax: 7, frecuencia: 1250, subida: 2.0, duracion: 0.32, volumen: 0.025 }
            };
        }
        if (material === MATERIALES.PIEDRA) {
            return { filtro: "lowpass", frecuencia: 290, ganancia: 0.12, velocidadOla: 0.07, profundidadOla: 0.025 };
        }
        if (material === MATERIALES.AGUA) {
            return { filtro: "bandpass", frecuencia: 1150, ganancia: 0.035, velocidadOla: 0.23, profundidadOla: 0.012 };
        }
        if (material === MATERIALES.LAVA) {
            return { filtro: "lowpass", frecuencia: 260, ganancia: 0.14, velocidadOla: 0.08, profundidadOla: 0.035 };
        }
        return null;
    }

    _obtenerBufferRuido(contexto) {
        if (this.bufferRuido && this.bufferRuido.sampleRate === contexto.sampleRate) return this.bufferRuido;
        const longitud = contexto.sampleRate * 2;
        this.bufferRuido = contexto.createBuffer(1, longitud, contexto.sampleRate);
        const datos = this.bufferRuido.getChannelData(0);
        for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
        return this.bufferRuido;
    }

    _aplicarVolumenes() {
        this._ajustarGanancia(this.pistaMusica, this.musica);
        this._ajustarGanancia(this.pistaAmbiente, this.ambiente);
    }

    _ajustarGanancia(pista, preferencia) {
        if (!pista) return;
        pista.canal.gain.setTargetAtTime(preferencia.activado ? preferencia.volumen / 100 : 0,
            this.servicio.contexto.currentTime, 0.08);
    }

    _detenerPista(propiedad) {
        const pista = this[propiedad];
        if (!pista) return;
        this[propiedad] = null;
        clearTimeout(pista.temporizador);
        const contexto = this.servicio.contexto;
        if (contexto && contexto.state !== "closed") {
            const fin = contexto.currentTime + 0.12;
            pista.canal.gain.cancelScheduledValues(contexto.currentTime);
            pista.canal.gain.setTargetAtTime(0, contexto.currentTime, 0.025);
            for (const fuente of pista.fuentes) {
                try {
                    fuente.stop(fin);
                } catch (error) {
                    if (error.name !== "InvalidStateError") throw error;
                }
            }
        }
        setTimeout(() => {
            for (const fuente of pista.fuentes) fuente.disconnect();
            for (const nodo of pista.nodos) nodo.disconnect();
            pista.canal.disconnect();
        }, 200);
    }

    _leerPreferencias(tipo, valoresPorDefecto) {
        const activado = this._leerDato(`voronoiland.audio.${tipo}.activado`);
        const volumenGuardado = this._leerDato(`voronoiland.audio.${tipo}.volumen`);
        const volumen = volumenGuardado === null ? valoresPorDefecto : Number(volumenGuardado);
        return {
            activado: activado === null ? true : activado !== "0",
            volumen: Number.isFinite(volumen) ? Math.min(100, Math.max(0, volumen)) : valoresPorDefecto
        };
    }

    _leerDato(clave) {
        try {
            return this.almacenamiento ? this.almacenamiento.getItem(clave) : null;
        } catch (error) {
            return null;
        }
    }

    _obtenerAlmacenamiento() {
        try {
            return globalThis.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    _guardarPreferencias(tipo, preferencia) {
        try {
            if (!this.almacenamiento) return;
            this.almacenamiento.setItem(`voronoiland.audio.${tipo}.activado`, preferencia.activado ? "1" : "0");
            this.almacenamiento.setItem(`voronoiland.audio.${tipo}.volumen`, String(preferencia.volumen));
        } catch (error) {
            // Si el almacenamiento está bloqueado, los ajustes siguen vigentes hasta cerrar la página.
        }
    }
}
