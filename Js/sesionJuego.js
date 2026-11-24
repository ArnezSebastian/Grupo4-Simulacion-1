// Una partida: junta al jugador con su física, el excavador, el spawn y la vista, y los actualiza en orden.
// No conoce el DOM ni el mouse (EntradaUsuario le da la intención ya armada); el orquestador sólo la inicia,
// la detiene y la actualiza una vez por frame.
class SesionJuego {
    activa = false;

    // Costos (promedio móvil, en ms) para el HUD / benchmark.
    mediciones = { fisicaMs: 0, fisicaFrameMs: 0 };
    animacionPicadoActual = null;
    distanciaDesdeUltimoPaso = 0;
    ultimaXJugador = 0;
    ultimaRegionActiva = -1;
    tiempoMiradaCamaraMs = 0;
    offsetMiradaCamaraY = 0;
    direccionMiradaCamara = 0;

    // `eventos` (opcional): callbacks que la sesión llama cuando pasa algo que puede interesar a otros módulos
    // (por ejemplo, el sonido) sin que la sesión sepa quién los escucha:
    //   alSaltar()       el jugador saltó desde el suelo
    //   alPicarSolido()  se está picando un material sólido o un muro divisor
    //   alPisar(material) el jugador dio un paso sobre un material
    constructor({ camara, mundoCeldas, mundoVoronoi, regiones, inicializador, escenario, recursosJugador, config, eventos = {} }) {
        this.camara = camara;
        this.mundoCeldas = mundoCeldas;
        this.regiones = regiones;
        this.inicializador = inicializador;
        this.config = config;
        this.alPicarSolido = eventos.alPicarSolido || null;
        this.alPisar = eventos.alPisar || null;
        this.distanciaPaso = config.jugador.distanciaPaso;

        this.jugador = new Jugador(config.jugador);
        this.fisica = new FisicaJugador(mundoCeldas, regiones, config.jugador);
        this.fisica.alSaltar = eventos.alSaltar || null;
        this.fisica.alAterrizar = material => {
            if (material === MATERIALES.NADA) return;
            if (this.alPisar) this.alPisar(material);
            const intensidad = limitarValor(this.fisica.ultimaVelocidadImpacto / config.jugador.velocidadCaidaMax, 0, 1);
            this._emitirPolvo(material, intensidad);
        };
        this.excavador = new Excavador(mundoCeldas, regiones, config.picar);
        this.excavador.configurarGrosorMuro(config.muro.grosorInicial);
        this.spawn = new GeneradorSpawn(mundoCeldas, mundoVoronoi, regiones, inicializador, config.jugador);
        // Los destellos del agua van debajo del jugador.
        this.agua = new ParticulasAgua(escenario, camara, mundoCeldas, regiones, config.agua);
        this.vista = new VistaJugador(escenario, recursosJugador);
        this.particulas = new ParticulasJugador(escenario, camara, config.particulas, config.jugador.ancho);
        this.fsm = new FSM(this.vista, config.jugador.histeresisCaidaMs);
        this.ritmoPicado = new GatilloPeriodico(this.vista.duracionCicloAnimacionSeg("picar"));
    }

    iniciar(spawnGenerado = this.spawn.generar()) {
        const s = spawnGenerado;
        this.jugador.reaparecer(s.x, s.y, s.regionId);
        this.ultimaXJugador = this.jugador.x;
        this.distanciaDesdeUltimoPaso = 0;
        this.tiempoMiradaCamaraMs = 0;
        this.offsetMiradaCamaraY = 0;
        this.direccionMiradaCamara = 0;
        this.fsm.iniciar();
        this.fisica.reiniciar();
        this.excavador.progresoMs = 0;
        this.animacionPicadoActual = null;
        this.ritmoPicado.reiniciar();

        // La cámara arranca ya sobre el jugador (sin viaje desde donde estuviera).
        this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
        this._inicializarVistaDeInicio();
        this.ultimaRegionActiva = -1;
        this._activarRegionActual();
        this.particulas.limpiar();
        this.agua.limpiar();
        this.vista.mostrar();
        this._dibujar();
        this.activa = true;
    }

    detener() {
        this.activa = false;
        this.ritmoPicado.reiniciar();
        this.particulas.limpiar();
        this.agua.limpiar();
        this.vista.ocultar();
    }

    // intencion = { mover, mirarVertical, saltar, picar }
    actualizar(deltaMs, intencion) {
        if (!this.activa) return;

        const t0 = performance.now();
        this.jugador.aplicarIntencion(intencion);
        this.fisica.actualizar(this.jugador, intencion, deltaMs / 1000);
        this._activarRegionActual();
        if (intencion.picar && intencion.mouseValido) {
            this.jugador.apuntarA(
                this.camara.mundoXDe(intencion.mouseX) - this.jugador.centroX,
                this.camara.mundoYDe(intencion.mouseY) - this.jugador.centroY
            );
        }
        this._actualizarPasos();
        this.mediciones.fisicaFrameMs = performance.now() - t0;
        this.mediciones.fisicaMs += (this.mediciones.fisicaFrameMs - this.mediciones.fisicaMs) * 0.1;

        const animacionDePicadoTerminada = this.vista.animacionTerminada
            && this.vista.animacionActual.startsWith("picar");
        this.excavador.actualizar(deltaMs, this.jugador, intencion, animacionDePicadoTerminada);
        this.fsm.actualizar(this.jugador, intencion, this.excavador.objetivo, deltaMs);
        this._actualizarMiradaCamara(deltaMs);

        // La cámara se mueve DESPUÉS de la física y ANTES de dibujar: sprite y mundo salen del mismo origen.
        this.camara.seguir(
            this.jugador.centroX,
            this.jugador.centroY + this.offsetMiradaCamaraY,
            deltaMs / 1000
        );
        this._avisarPicado(intencion, deltaMs / 1000);
        this.particulas.actualizar(deltaMs / 1000);
        this.agua.actualizar(deltaMs / 1000);
        this._dibujar();
    }

    _actualizarMiradaCamara(deltaMs) {
        const estado = this.fsm.estadoActual.nombre;
        const mirandoArriba = estado === "mirarArriba";
        const mirandoAbajo = estado === "mirarAbajo";

        if (mirandoArriba || mirandoAbajo) {
            this.tiempoMiradaCamaraMs += deltaMs;
            if (this.tiempoMiradaCamaraMs >= this.config.camara.demoraMiradaMs) {
                this.direccionMiradaCamara = mirandoArriba
                    ? -1
                    : 1;
            }
        } else {
            this.tiempoMiradaCamaraMs = 0;
            this.direccionMiradaCamara = 0;
        }

        const objetivo = this.direccionMiradaCamara === 0
            ? 0
            : this.direccionMiradaCamara * this.config.camara.desplazamientoMiradaCeldas;
        const suavizado = objetivo === 0
            ? this.config.camara.suavizadoMiradaSalida
            : this.config.camara.suavizadoMiradaEntrada;
        const factor = 1 - Math.exp(-suavizado * deltaMs / 1000);
        this.offsetMiradaCamaraY += (objetivo - this.offsetMiradaCamaraY) * factor;

        if (objetivo === 0 && Math.abs(this.offsetMiradaCamaraY) < 0.01) {
            this.offsetMiradaCamaraY = 0;
        }
    }

    _activarRegionActual() {
        const x = Math.floor(this.jugador.centroX);
        const y = Math.floor(this.jugador.centroY);
        if (!this.mundoCeldas.estaDentro(x, y)) return;

        const regionId = this.regiones.regionEn(x, y);
        if (regionId === this.ultimaRegionActiva) return;

        this.ultimaRegionActiva = regionId;
        this.mundoCeldas.activarMaterialesDeRegion(regionId);
    }

    _actualizarPasos() {
        const jugador = this.jugador;
        const distancia = Math.abs(jugador.x - this.ultimaXJugador);
        this.ultimaXJugador = jugador.x;

        if (!jugador.enSuelo || jugador.enLiquido || Math.abs(jugador.vx) <= 1) {
            this.distanciaDesdeUltimoPaso = 0;
            return;
        }

        if (distancia > 0) this.fisica.romperCristalBajoPies(jugador);

        this.distanciaDesdeUltimoPaso += distancia;
        if (this.distanciaDesdeUltimoPaso < this.distanciaPaso) return;

        this.distanciaDesdeUltimoPaso %= this.distanciaPaso;
        const material = this.fisica.materialBajoPies(jugador);
        if (material === MATERIALES.NADA) return;
        if (this.alPisar) this.alPisar(material);
        this._emitirPolvo(material, this.config.particulas.polvo.intensidadPaso);
    }

    // Caminar y aterrizar comparten el mismo efecto: sólo cambia la intensidad.
    _emitirPolvo(material, intensidad) {
        if (!this.config.particulas.activadas) return;
        const j = this.jugador;
        this.particulas.polvo(j.centroX, j.y + j.alto, material, intensidad);
    }

    // El excavador sólo informa impactos picables: materiales sólidos o muros divisorios.
    _avisarPicado(intencion, deltaSeg) {
        const objetivo = this.excavador.objetivo;
        const animacion = this.vista.animacionActual;
        const esAnimacionDePicado = animacion === "picar"
            || animacion === "picar_arriba"
            || animacion === "picar_abajo";
        const picando = esAnimacionDePicado && Boolean(intencion.picar) && objetivo.hayImpacto;

        if (!picando) {
            this.animacionPicadoActual = null;
            this.ritmoPicado.avanzar(false, deltaSeg);
            return;
        }

        if (this.animacionPicadoActual !== animacion) {
            this.animacionPicadoActual = animacion;
            this.ritmoPicado.configurarIntervalo(this.vista.duracionCicloAnimacionSeg());
        }

        if (!this.ritmoPicado.avanzar(true, deltaSeg)) return;
        if (this.alPicarSolido) this.alPicarSolido();
        if (this.config.particulas.activadas) {
            this.particulas.esquirlas(objetivo.celdaX, objetivo.celdaY, objetivo.tipoImpacto, objetivo.direccionX, objetivo.direccionY);
        }
    }

    centrarCamara() {
        if (this.activa) this.camara.centrarEn(this.jugador.centroX, this.jugador.centroY);
    }

    _dibujar() {
        this.vista.actualizar(this.jugador, this.camara, this.excavador.objetivo);
        this.particulas.dibujar();
        this.agua.dibujar();
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
