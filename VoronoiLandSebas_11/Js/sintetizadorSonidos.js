// Convierte la descripción de un efecto (DEFINICIONES_SONIDO) en nodos de Web Audio.
// No decide CUÁNDO suena nada ni lleva el volumen o el silencio: eso es de ServicioAudio.
class SintetizadorSonidos {
    static VOLUMEN_MINIMO = 0.0001;     // las rampas exponenciales no pueden llegar a 0 exacto

    constructor(contexto) {
        this.contexto = contexto;
        this.bufferRuido = null;
    }

    // Programa todas las voces del efecto a partir del instante `t0` (en segundos del contexto, ver currentTime).
    // Devuelve { fin, ultimaFuente }: cuándo termina la última voz y qué nodo es (para saber cuándo liberar el efecto).
    reproducir(definicion, destino, t0) {
        const variacion = 1 + (Math.random() * 2 - 1) * (definicion.variacionTono || 0);
        let fin = t0;
        let ultimaFuente = null;

        for (const voz of definicion.voces) {
            const { fuente, finVoz } = this._crearVoz(voz, destino, t0, variacion);
            if (finVoz >= fin) {
                fin = finVoz;
                ultimaFuente = fuente;
            }
        }
        return { fin, ultimaFuente };
    }

    // --- Una voz: fuente -> (filtro) -> envolvente de volumen -> destino ---

    _crearVoz(voz, destino, t0, variacion) {
        const inicio = t0 + (voz.inicio || 0);
        const fin = inicio + voz.duracion;

        const fuente = voz.tipo === "ruido" ? this._crearRuido() : this._crearOscilador(voz, inicio, variacion);
        const envolvente = this._crearEnvolvente(voz, inicio);

        let salida = fuente;
        if (voz.filtro) {
            const filtro = this._crearFiltro(voz.filtro, inicio, variacion);
            salida.connect(filtro);
            salida = filtro;
        }
        salida.connect(envolvente);
        envolvente.connect(destino);

        if (voz.tipo === "ruido") fuente.start(inicio, Math.random() * 0.5);    // cada golpe usa otro tramo del ruido
        else fuente.start(inicio);
        fuente.stop(fin + 0.02);

        return { fuente, finVoz: fin + 0.02 };
    }

    _crearOscilador(voz, inicio, variacion) {
        const oscilador = this.contexto.createOscillator();
        oscilador.type = voz.onda || "sine";
        this._programarCurva(oscilador.frequency, voz.frecuencia, inicio, variacion);
        return oscilador;
    }

    _crearRuido() {
        const fuente = this.contexto.createBufferSource();
        fuente.buffer = this._obtenerBufferDeRuido();
        return fuente;
    }

    _crearFiltro(configuracion, inicio, variacion) {
        const filtro = this.contexto.createBiquadFilter();
        filtro.type = configuracion.tipo;
        filtro.Q.value = configuracion.q === undefined ? 1 : configuracion.q;
        this._programarCurva(filtro.frequency, configuracion.frecuencia, inicio, variacion);
        return filtro;
    }

    // Volumen: sube linealmente hasta el máximo durante el ataque y cae exponencialmente hasta el silencio.
    _crearEnvolvente(voz, inicio) {
        const minimo = SintetizadorSonidos.VOLUMEN_MINIMO;
        const ataque = Math.min(voz.ataque === undefined ? 0.003 : voz.ataque, voz.duracion / 2);
        const ganancia = this.contexto.createGain();

        ganancia.gain.setValueAtTime(minimo, inicio);
        ganancia.gain.linearRampToValueAtTime(Math.max(voz.volumen, minimo), inicio + ataque);
        ganancia.gain.exponentialRampToValueAtTime(minimo, inicio + voz.duracion);
        return ganancia;
    }

    // `valor` es un número (constante) o una curva [[segundos, valor], ...] relativa a `inicio`.
    _programarCurva(parametro, valor, inicio, variacion) {
        if (typeof valor === "number") {
            parametro.setValueAtTime(valor * variacion, inicio);
            return;
        }

        valor.forEach(([segundos, v], i) => {
            if (i === 0) parametro.setValueAtTime(v * variacion, inicio + segundos);
            else parametro.exponentialRampToValueAtTime(v * variacion, inicio + segundos);
        });
    }

    // Un segundo de ruido blanco, creado una sola vez y reutilizado por todas las voces de ruido.
    _obtenerBufferDeRuido() {
        if (this.bufferRuido) return this.bufferRuido;

        const frecuenciaMuestreo = this.contexto.sampleRate;
        const buffer = this.contexto.createBuffer(1, frecuenciaMuestreo, frecuenciaMuestreo);
        const datos = buffer.getChannelData(0);
        for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;

        this.bufferRuido = buffer;
        return buffer;
    }
}
