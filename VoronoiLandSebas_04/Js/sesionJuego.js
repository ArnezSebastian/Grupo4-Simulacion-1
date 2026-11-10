// Una partida: junta al jugador con su física, el excavador, el spawn y la vista, y los actualiza en orden.
// No conoce el DOM ni el mouse (EntradaUsuario le da la intención ya armada); el orquestador sólo la inicia,
// la detiene y la actualiza una vez por frame.
class SesionJuego {
    activa = false;

    // Costos (promedio móvil, en ms) para el HUD / benchmark.
    mediciones = { fisicaMs: 0 };

    constructor({ camara, mundoCeldas, mundoVoronoi, regiones, inicializador, escenario, config }) {
        this.camara = camara;
        this.config = config;

        this.jugador = new Jugador(config.jugador);
        this.fisica = new FisicaJugador(mundoCeldas, regiones, config.jugador);
        this.excavador = new Excavador(mundoCeldas, config.picar);
        this.spawn = new GeneradorSpawn(mundoCeldas, mundoVoronoi, regiones, inicializador, config.jugador);
        this.vista = new VistaJugador(escenario, config.jugador);
    }

    iniciar() {
        const s = this.spawn.generar();
        this.jugador.reaparecer(s.x, s.y, s.regionId);
        this.fisica.reiniciar();
        this.excavador.progresoMs = 0;

        // La cámara arranca ya sobre el jugador (sin viaje desde donde estuviera).
        this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
        this.vista.mostrar();
        this._dibujar();
        this.activa = true;
    }

    detener() {
        this.activa = false;
        this.vista.ocultar();
    }

    // intencion = { mover, mirarVertical, saltar, picar }
    actualizar(deltaMs, intencion) {
        if (!this.activa) return;

        const t0 = performance.now();
        this.jugador.aplicarIntencion(intencion);
        this.fisica.actualizar(this.jugador, intencion, deltaMs / 1000);
        this.mediciones.fisicaMs += (performance.now() - t0 - this.mediciones.fisicaMs) * 0.1;

        this.excavador.actualizar(deltaMs, this.jugador, intencion.picar);

        // La cámara se mueve DESPUÉS de la física y ANTES de dibujar: sprite y mundo salen del mismo origen.
        this.camara.seguir(this.jugador.centroX, this.jugador.centroY, deltaMs / 1000);
        this._dibujar();
    }

    centrarCamara() {
        if (this.activa) this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
    }

    _dibujar() {
        this.vista.actualizar(this.jugador, this.camara, this.excavador.objetivo);
    }
}
