// Una partida: junta al jugador con su física, el excavador, el spawn y la vista, y los actualiza en orden.
// No conoce el DOM ni el mouse (EntradaUsuario le da la intención ya armada); el orquestador sólo la inicia,
// la detiene y la actualiza una vez por frame.
class SesionJuego {
    activa = false;

    // Costos (promedio móvil, en ms) para el HUD / benchmark.
    mediciones = { fisicaMs: 0 };

    // `eventos` (opcional): callbacks que la sesión llama cuando pasa algo que puede interesar a otros módulos
    // (por ejemplo, el sonido) sin que la sesión sepa quién los escucha:
    //   alSaltar()       el jugador saltó desde el suelo
    //   alPicarSolido()  se está picando un material sólido: al empezar y luego cada config.audio.intervaloPicadoSeg
    constructor({ camara, mundoCeldas, mundoVoronoi, regiones, inicializador, escenario, config, eventos = {} }) {
        this.camara = camara;
        this.inicializador = inicializador;
        this.config = config;
        this.alPicarSolido = eventos.alPicarSolido || null;
        this.ritmoPicado = new GatilloPeriodico(config.audio.intervaloPicadoSeg);

        this.jugador = new Jugador(config.jugador);
        this.fisica = new FisicaJugador(mundoCeldas, regiones, config.jugador);
        this.fisica.alSaltar = eventos.alSaltar || null;
        this.excavador = new Excavador(mundoCeldas, camara, regiones, config.picar);
        this.spawn = new GeneradorSpawn(mundoCeldas, mundoVoronoi, regiones, inicializador, config.jugador);
        this.vista = new VistaJugador(escenario, config.jugador);
    }

    iniciar(spawnGenerado = this.spawn.generar()) {
        const s = spawnGenerado;
        this.jugador.reaparecer(s.x, s.y, s.regionId);
        this.fisica.reiniciar();
        this.excavador.progresoMs = 0;
        this.ritmoPicado.reiniciar();

        // La cámara arranca ya sobre el jugador (sin viaje desde donde estuviera).
        this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
        this._inicializarVistaDeInicio();
        this.vista.mostrar();
        this._dibujar();
        this.activa = true;
    }

    detener() {
        this.activa = false;
        this.ritmoPicado.reiniciar();
        this.vista.ocultar();
    }

    // intencion = { mover, mirarVertical, saltar, picar }
    actualizar(deltaMs, intencion) {
        if (!this.activa) return;

        const t0 = performance.now();
        this.jugador.aplicarIntencion(intencion);
        this.fisica.actualizar(this.jugador, intencion, deltaMs / 1000);
        this.mediciones.fisicaMs += (performance.now() - t0 - this.mediciones.fisicaMs) * 0.1;

        // La cámara se mueve DESPUÉS de la física y ANTES de dibujar: sprite y mundo salen del mismo origen.
        this.camara.seguir(this.jugador.centroX, this.jugador.centroY, deltaMs / 1000);
        this.excavador.actualizar(deltaMs, this.jugador, intencion);
        this._avisarPicado(intencion, deltaMs / 1000);
        this._dibujar();
    }

    // "Picando un sólido" = click mantenido con la mira sobre un material (no sobre un muro entre regiones).
    // Como el aire y el agua no se pican, el rayo no impacta contra ellos y no cuentan.
    _avisarPicado(intencion, deltaSeg) {
        const objetivo = this.excavador.objetivo;
        const picandoSolido = Boolean(intencion.picar) && objetivo.hayImpacto && objetivo.tipoImpacto !== MATERIALES.MURO;

        if (this.ritmoPicado.avanzar(picandoSolido, deltaSeg) && this.alPicarSolido) this.alPicarSolido();
    }

    centrarCamara() {
        if (this.activa) this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
    }

    _dibujar() {
        this.vista.actualizar(this.jugador, this.camara, this.excavador.objetivo);
    }

    // Prepara el área visible con el zoom más alejado permitido; los zooms más cercanos quedan cubiertos.
    _inicializarVistaDeInicio() {
        const zoomActual = this.camara.zoom;
        const zoomMinimo = Camara.NIVELES_ZOOM[this.camara.indiceZoomMin];

        this.camara.fijarZoom(zoomMinimo);
        this.inicializador.inicializarZona(
            this.camara.origenX,
            this.camara.origenY,
            this.camara.origenX + this.camara.anchoVisible,
            this.camara.origenY + this.camara.altoVisible
        );

        this.camara.fijarZoom(zoomActual);
        this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
    }
}
