// Orquestador: crea los módulos, los conecta y corre el game loop.
// La lógica de cada tema vive en su propia clase (Camara, MundoVoronoi, MundoCeldas, RasterizadorVoronoi,
// EntradaUsuario, HUD, SesionJuego). Esta clase sólo decide en qué orden se llaman y en qué MODO está
// la aplicación (editor = simulador original, juego = personaje controlable).
class SimuladorVoronoi {
    //Aplicación y render:
    pixiApp;
    textureBuffer;
    texturaMundo;
    spriteDrawer;

    //Módulos:
    camara;
    mundoCeldas;
    regiones;
    inicializador;
    simuladorMateriales;
    mundoVoronoi;
    rasterizador;
    sesionJuego;
    entrada;
    hud;
    textoFPS;
    sonidos;

    //Modo actual y promesa que se resuelve cuando Pixi terminó de iniciar:
    modo = MODOS.EDITOR;
    listo;

    preparandoJuego = false;
    partidaIniciada = false;
    posicionJugadorGuardada = null;
    versionPuntosAlSalirAlEditor = null;
    pausado = false;
    zonaPrecargada = null;
    precargandoZona = false;
    tareaPrecargaZona = null;

    //Botones y sliders:
    btnReset;
    btnRandom;
    btnDelete;
    btnCenter;
    btnModoJuego;
    btnModoEditor;
    btnReanudar;
    btnReiniciarMundo;
    btnConfiguraciones;
    btnGlosario;
    submenuConfiguraciones;
    submenuGlosario;
    glosarioEditor;
    glosarioPausa;
    contenidoGlosario;
    checkboxHudChips;
    checkboxEstadoSimulador;
    checkboxesDirtyChunks;
    procesamientoPorDirtyChunks = CONFIG.optimizacion.procesamientoDirtyChunksInicial;
    mensajePausa;
    menuPausa;
    seccionEditor;
    sliderMuro;
    sliderZoom;

    //Estado de las herramientas:
    muroGrosor = CONFIG.muro.grosorInicial;
    herramienta = {
        modoBorrador: false,
        areaActual: null,                   // índice del punto bajo el mouse (o null)
        materialActual: MATERIALES.NADA
    };
    mouseMundo = { x: -1, y: -1 };          // coordenada del mundo bajo el mouse
    ultimoPuntoCreadoMs = -Infinity;
    ultimaConsultaAmbienteMs = -Infinity;
    medicionesRendimiento = {
        frames: new Float32Array(120),
        intervalosTicker: new Float32Array(120),
        simulacion: new Float32Array(120),
        fisica: new Float32Array(120),
        voronoi: new Float32Array(120),
        composicion: new Float32Array(120),
        inicializacion: new Float32Array(120),
        subidaTextura: new Float32Array(120),
        redibujados: new Uint8Array(120),
        siguienteFrame: 0,
        cantidadFrames: 0,
        resumenActualizadoMs: -Infinity,
        promedioFrameMs: 0,
        p95FrameMs: 0,
        framesSobrePresupuesto: 0,
        promedioIntervaloTickerMs: 0,
        p95IntervaloTickerMs: 0,
        promedioSimulacionMs: 0,
        promedioFisicaMs: 0,
        promedioVoronoiMs: 0,
        promedioComposicionMs: 0,
        promedioInicializacionMs: 0,
        promedioSubidaTexturaMs: 0,
        cantidadRedibujados: 0,
        ultimoRedibujadoMs: null
    };
    medicionesRender = { subidaTexturaMs: 0, ultimoRedibujadoMs: null };
    medicionesHUD = {
        celdasInicializadas: 0,
        celdasVisitadas: 0,
        celdasActivas: 0,
        movimientos: 0
    };

    // `sonidos` (ControladorSonidos) viene de afuera para que el audio se desbloquee con el primer click de la página.
    // Si no se lo pasa, el simulador funciona igual pero en silencio (nadie desbloquea el audio).
    constructor(sonidos = null) {
        this.sonidos = sonidos || new ControladorSonidos(new ServicioAudio(CONFIG.audio), CONFIG.audio);
        this.initializeDOMBinds();

        this.listo = this.initPIXI();
    }

    initializeDOMBinds() {
        //Sliders:
        this.sliderMuro = document.getElementById("scaleWall");
        this.sliderZoom = document.getElementById("zoom-slider");

        //Botones:
        this.btnReset = document.getElementById("reset-canvas");
        this.btnRandom = document.getElementById("random-points");
        this.btnDelete = document.getElementById("delete-points-mode");
        this.btnCenter = document.getElementById("center-camera");
        this.btnModoJuego = document.getElementById("btn-modo-juego");
        this.btnModoEditor = document.getElementById("btn-modo-editor");
        this.btnReanudar = document.getElementById("btn-reanudar");
        this.btnReiniciarMundo = document.getElementById("btn-reiniciar-mundo");
        this.btnConfiguraciones = document.getElementById("btn-configuraciones");
        this.btnGlosario = document.getElementById("btn-glosario");
        this.submenuConfiguraciones = document.getElementById("submenu-configuraciones");
        this.submenuGlosario = document.getElementById("submenu-glosario");
        this.glosarioEditor = document.getElementById("glosario-editor");
        this.glosarioPausa = document.getElementById("glosario-pausa");
        this.contenidoGlosario = document.getElementById("contenido-glosario");
        this.glosarioEditor.append(this.contenidoGlosario.content.cloneNode(true));
        this.glosarioPausa.append(this.contenidoGlosario.content.cloneNode(true));
        this.checkboxHudChips = document.getElementById("config-hud-chips");
        this.checkboxEstadoSimulador = document.getElementById("config-estado-simulador");
        this.checkboxesDirtyChunks = Array.from(document.querySelectorAll("[data-procesamiento-dirty-chunks]"));
        this.procesamientoPorDirtyChunks = this._leerPreferenciaDirtyChunks();
        for (const checkbox of this.checkboxesDirtyChunks) checkbox.checked = this.procesamientoPorDirtyChunks;
        this.mensajePausa = document.getElementById("mensaje-pausa");
        this.menuPausa = document.getElementById("menu-pausa");
        this.seccionEditor = document.getElementById("seccion-editor");

        //Contenedor donde va el canvas de Pixi:
        this.contenedorLienzo = document.getElementById("superficie-canvas");
    }

    async initPIXI() {
        this.pixiApp = new PIXI.Application();
        const { ancho, alto } = this._medirContenedor();

        await this.pixiApp.init({
            width: ancho,
            height: alto,
            backgroundColor: CONFIG.canvas.colorFondo
        });

        this.contenedorLienzo.prepend(this.pixiApp.canvas);
        this.pixiApp.stage.eventMode = 'static';

        this.plantearModelo(ancho, alto);
        await this.plantearRender();
        this.plantearEntrada();
        this.plantearHUD();
        this.agregarInteractividadGeneral();

        //Activo el gameloop:
        this.pixiApp.ticker.add(this.gameLoop.bind(this));

        // No uso `resizeTo` de Pixi: sólo escucha el resize de la ventana, y el lienzo también cambia de tamaño
        // al pasar de editor a juego. ResizeObserver avisa en los dos casos.
        new ResizeObserver(() => this._ajustarAlContenedor()).observe(this.contenedorLienzo);
    }

    // Tamaño del lugar donde va el canvas, en píxeles CSS (si todavía no tiene tamaño, el de CONFIG).
    _medirContenedor() {
        return {
            ancho: this.contenedorLienzo.clientWidth || CONFIG.canvas.ancho,
            alto: this.contenedorLienzo.clientHeight || CONFIG.canvas.alto
        };
    }

    // El canvas mide siempre lo mismo que su contenedor (la ventana entera en juego, el recuadro en el editor),
    // 1 píxel del canvas = 1 píxel CSS. Así nunca se estira: si la ventana crece se ve más mundo, y el personaje
    // y las celdas quedan del mismo tamaño (eso lo decide sólo el zoom de la cámara).
    _ajustarAlContenedor() {
        const ancho = this.contenedorLienzo.clientWidth;
        const alto = this.contenedorLienzo.clientHeight;
        if (ancho === 0 || alto === 0) return;      // ventana minimizada o lienzo oculto
        if (ancho === this.camara.vistaAncho && alto === this.camara.vistaAlto) return;

        this.pixiApp.renderer.resize(ancho, alto);
        this.camara.redimensionarVista(ancho, alto);
        this.rasterizador.redimensionar(ancho, alto);
        this._crearTexturaMundo();
        this.hud.mostrarTamanioVista();

        // En pausa el game loop no dibuja: se redibuja acá para que el fondo del menú no quede vacío.
        if (this.pausado && !this.preparandoJuego) {
            this.redibujarSiCorresponde();
            this.sesionJuego._dibujar();
        }
    }

    // --- Planteo de módulos ---

    plantearModelo(vistaAncho, vistaAlto) {
        const m = CONFIG.mundo;

        this.camara = new Camara(vistaAncho, vistaAlto, m.ancho, m.alto,
            CONFIG.camara.zoomInicial, CONFIG.camara.suavizadoSeguimiento);
        this.mundoCeldas = new MundoCeldas(m.ancho, m.alto);
        this.mundoCeldas.configurarProcesamientoPorDirtyChunks(this.procesamientoPorDirtyChunks);
        this.mundoVoronoi = new MundoVoronoi(m.ancho, m.alto, CONFIG.puntos, CONFIG.materiales);

        // Compartidos por el motor de materiales, el rasterizador y el jugador:
        this.regiones = new RegionesDelMundo(this.mundoCeldas, this.mundoVoronoi);
        this.inicializador = new InicializadorMateriales(this.mundoCeldas, this.mundoVoronoi, CONFIG);

        this.simuladorMateriales = new SimuladorMateriales(
            this.mundoCeldas,
            this.regiones,
            CONFIG,
            this.inicializador
        );
    }

    async plantearRender() {
        this.rasterizador = new RasterizadorVoronoi(this.camara, this.mundoVoronoi, this.mundoCeldas, CONFIG, this.inicializador);

        //El sprite mide lo mismo que el canvas: 1 píxel de textura = 1 píxel de pantalla (el zoom lo hace la cámara).
        this.spriteDrawer = new PIXI.Sprite();
        this._crearTexturaMundo();
        this.pixiApp.stage.addChild(this.spriteDrawer);

        const recursosJugador = await VistaJugador.cargarRecursos();

        // El jugador va en sprites aparte, ENCIMA del sprite del mundo (que se redibuja entero cada vez).
        this.sesionJuego = new SesionJuego({
            camara: this.camara,
            mundoCeldas: this.mundoCeldas,
            mundoVoronoi: this.mundoVoronoi,
            regiones: this.regiones,
            inicializador: this.inicializador,
            escenario: this.pixiApp.stage,
            recursosJugador,
            config: CONFIG,
            eventos: {
                alSaltar: () => this.sonidos.alSaltar(),
                alPicarSolido: () => this.sonidos.alPicarSolido(),
                alPisar: material => this.sonidos.alPisar(material)
            }
        });
    }

    // La textura comparte memoria con el buffer del rasterizador: lo que se escribe ahí se sube a la GPU con update().
    // Se rehace cada vez que el rasterizador cambia de tamaño, porque entonces su buffer es otro.
    _crearTexturaMundo() {
        const texturaAnterior = this.texturaMundo;

        this.textureBuffer = PIXI.BufferImageSource.from({
            resource: this.rasterizador.bufferPixeles,
            width: this.rasterizador.ancho,
            height: this.rasterizador.alto,
            scaleMode: 'nearest' //evita la difuminación de pixeles al escalar.
        });
        this.texturaMundo = new PIXI.Texture({ source: this.textureBuffer });
        this.spriteDrawer.texture = this.texturaMundo;

        texturaAnterior?.destroy(true);
    }

    plantearEntrada() {
        this.entrada = new EntradaUsuario(this.pixiApp.canvas, this.camara, CONFIG, {
            alPresionarIzquierdo: () => this.usarHerramientaEnMouse(),
            alAlternarBorrador: () => this.alternarModoBorrador(),
            alCentrar: () => this.centrarCamara(),
            alAlternarPausa: () => this.alternarPausa()
        });
    }

    plantearHUD() {
        this.textoFPS = new TextoFPS(this.pixiApp);
        // El minimapa sólo mueve la cámara en el editor (en juego la cámara sigue al jugador).
        this.hud = new HUD(CONFIG, this.camara, this.mundoVoronoi, (x, y) => {
            if (this.modo === MODOS.EDITOR) this.camara.centrarEn(x, y);
        });
    }

    // --- Game loop ---

    gameLoop(ticker) {
        if (this.preparandoJuego || this.pausado) return;
        const inicioFrame = performance.now();
        this.inicializador.iniciarMedicionesFrame();
        this.simuladorMateriales.mediciones.ultimoFrameMs = 0;
        this.sesionJuego.mediciones.fisicaFrameMs = 0;

        if (this.modo === MODOS.JUEGO) {
            if (this._zonaNecesitaExpansion()) this._iniciarPrecargaDeZona();
            this.simuladorMateriales.actualizar();
            this.sesionJuego.actualizar(ticker.deltaMS, this.entrada.leerIntencionJugador());
            this.actualizarAmbienteSiCorresponde();
        } else {
            this.entrada.aplicarTeclado(ticker.deltaMS);
            this.actualizarArenaDelEditor();
        }

        this.actualizarAreaYMaterialDelMouse();
        const redibujado = this.redibujarSiCorresponde();
        this._acumularMedicionesHUD();
        this.actualizarHUD();
        this._registrarDuracionFrame(performance.now() - inicioFrame, ticker.deltaMS, redibujado);
    }

    _acumularMedicionesHUD() {
        const ventana = this.medicionesHUD;
        const simulacion = this.simuladorMateriales.mediciones;
        ventana.celdasInicializadas += this.inicializador.mediciones.celdasInicializadas;
        ventana.celdasVisitadas += simulacion.celdasVisitadas;
        ventana.celdasActivas += simulacion.celdasActivas;
        ventana.movimientos += simulacion.movimientos;
    }

    redibujarSiCorresponde() {
        if (!this.rasterizador.estaDesactualizado(this.muroGrosor)) return false;

        this.rasterizador.dibujar(this.muroGrosor);
        const t0 = performance.now();
        this.textureBuffer.update();
        this.medicionesRender.subidaTexturaMs = performance.now() - t0;
        this.medicionesRender.ultimoRedibujadoMs = performance.now();
        return true;
    }

    _registrarDuracionFrame(ms, intervaloTickerMs, redibujado) {
        const estadisticas = this.medicionesRendimiento;
        const indice = estadisticas.siguienteFrame;
        estadisticas.frames[indice] = ms;
        estadisticas.intervalosTicker[indice] = intervaloTickerMs;
        estadisticas.simulacion[indice] = this.simuladorMateriales.mediciones.ultimoFrameMs;
        estadisticas.fisica[indice] = this.modo === MODOS.JUEGO
            ? this.sesionJuego.mediciones.fisicaFrameMs
            : 0;
        estadisticas.voronoi[indice] = redibujado ? this.rasterizador.mediciones.voronoiMs : 0;
        estadisticas.composicion[indice] = redibujado ? this.rasterizador.mediciones.composicionMs : 0;
        estadisticas.inicializacion[indice] = this.inicializador.mediciones.inicializacionMs;
        estadisticas.subidaTextura[indice] = redibujado ? this.medicionesRender.subidaTexturaMs : 0;
        estadisticas.redibujados[indice] = redibujado ? 1 : 0;
        estadisticas.siguienteFrame = (estadisticas.siguienteFrame + 1) % estadisticas.frames.length;
        estadisticas.cantidadFrames = Math.min(estadisticas.cantidadFrames + 1, estadisticas.frames.length);
        estadisticas.ultimoRedibujadoMs = this.medicionesRender.ultimoRedibujadoMs;
    }

    _actualizarResumenFrames(ahoraMs) {
        const estadisticas = this.medicionesRendimiento;
        if (ahoraMs - estadisticas.resumenActualizadoMs < 500) return;

        const muestras = Array.from(estadisticas.frames.subarray(0, estadisticas.cantidadFrames));
        if (muestras.length === 0) return;
        estadisticas.resumenActualizadoMs = ahoraMs;

        const promedio = (valores) => {
            let total = 0;
            for (let i = 0; i < estadisticas.cantidadFrames; i++) total += valores[i];
            return total / estadisticas.cantidadFrames;
        };
        const intervalosTicker = Array.from(
            estadisticas.intervalosTicker.subarray(0, estadisticas.cantidadFrames)
        );
        let total = 0;
        let sobrePresupuesto = 0;
        let redibujados = 0;
        for (const ms of muestras) {
            total += ms;
            if (ms > 1000 / 60) sobrePresupuesto++;
        }
        muestras.sort((a, b) => a - b);
        intervalosTicker.sort((a, b) => a - b);
        estadisticas.promedioFrameMs = total / muestras.length;
        estadisticas.p95FrameMs = muestras[Math.ceil(muestras.length * 0.95) - 1];
        estadisticas.framesSobrePresupuesto = sobrePresupuesto;
        estadisticas.promedioIntervaloTickerMs = promedio(estadisticas.intervalosTicker);
        estadisticas.p95IntervaloTickerMs =
            intervalosTicker[Math.ceil(intervalosTicker.length * 0.95) - 1];
        estadisticas.promedioSimulacionMs = promedio(estadisticas.simulacion);
        estadisticas.promedioFisicaMs = promedio(estadisticas.fisica);
        estadisticas.promedioVoronoiMs = promedio(estadisticas.voronoi);
        estadisticas.promedioComposicionMs = promedio(estadisticas.composicion);
        estadisticas.promedioInicializacionMs = promedio(estadisticas.inicializacion);
        estadisticas.promedioSubidaTexturaMs = promedio(estadisticas.subidaTextura);
        for (let i = 0; i < estadisticas.cantidadFrames; i++) {
            redibujados += estadisticas.redibujados[i];
        }
        estadisticas.cantidadRedibujados = redibujados;
    }

    _reiniciarMedicionesRendimiento() {
        const estadisticas = this.medicionesRendimiento;
        for (const clave of [
            "frames", "intervalosTicker", "simulacion", "fisica", "voronoi",
            "composicion", "inicializacion", "subidaTextura", "redibujados"
        ]) {
            estadisticas[clave].fill(0);
        }
        estadisticas.siguienteFrame = 0;
        estadisticas.cantidadFrames = 0;
        estadisticas.resumenActualizadoMs = -Infinity;
        estadisticas.promedioFrameMs = 0;
        estadisticas.p95FrameMs = 0;
        estadisticas.framesSobrePresupuesto = 0;
        estadisticas.promedioIntervaloTickerMs = 0;
        estadisticas.p95IntervaloTickerMs = 0;
        estadisticas.promedioSimulacionMs = 0;
        estadisticas.promedioFisicaMs = 0;
        estadisticas.promedioVoronoiMs = 0;
        estadisticas.promedioComposicionMs = 0;
        estadisticas.promedioInicializacionMs = 0;
        estadisticas.promedioSubidaTexturaMs = 0;
        estadisticas.cantidadRedibujados = 0;
        estadisticas.ultimoRedibujadoMs = null;
        this.medicionesRender.subidaTexturaMs = 0;
        this.medicionesRender.ultimoRedibujadoMs = null;
        this.medicionesHUD.celdasInicializadas = 0;
        this.medicionesHUD.celdasVisitadas = 0;
        this.medicionesHUD.celdasActivas = 0;
        this.medicionesHUD.movimientos = 0;
        this.hud.historialCola.length = 0;
    }

    actualizarHUD() {
        this.textoFPS.tick();
        this.hud.actualizarSiCorresponde(() => this.obtenerSnapshot(), performance.now());
    }

    actualizarAmbienteSiCorresponde() {
        const ahora = performance.now();
        if (ahora - this.ultimaConsultaAmbienteMs < CONFIG.audio.intervaloAmbienteMs) return;
        this.ultimaConsultaAmbienteMs = ahora;

        const jugador = this.sesionJuego.jugador;
        const x = Math.floor(jugador.centroX);
        const y = Math.floor(jugador.centroY);
        if (!this.mundoCeldas.estaDentro(x, y)) {
            this.sonidos.actualizarMaterialAmbiental(null);
            return;
        }

        const regionId = this.regiones.regionEn(x, y);
        const region = this.mundoVoronoi.puntos[regionId - 1];
        this.sonidos.actualizarMaterialAmbiental(region ? region.materialId : null);
    }

    // Foto del estado actual para el HUD (y, más adelante, para el benchmark).
    obtenerSnapshot() {
        const dentro = this.entrada.mouse.dentro && this.mundoCeldas.estaDentro(this.mouseMundo.x, this.mouseMundo.y);
        const ahoraMs = performance.now();
        this._actualizarResumenFrames(ahoraMs);
        const ventana = this.medicionesHUD;

        const snapshot = {
            modo: this.modo,
            frameMs: this.medicionesRendimiento.promedioIntervaloTickerMs,
            frameP95TickerMs: this.medicionesRendimiento.p95IntervaloTickerMs,
            frameTrabajoMs: this.medicionesRendimiento.cantidadFrames > 0
                ? this.medicionesRendimiento.frames[
                    (this.medicionesRendimiento.siguienteFrame - 1 + this.medicionesRendimiento.frames.length)
                        % this.medicionesRendimiento.frames.length
                ]
                : 0,
            framePromedioMs: this.medicionesRendimiento.promedioFrameMs,
            frameP95Ms: this.medicionesRendimiento.p95FrameMs,
            framesSobrePresupuesto: this.medicionesRendimiento.framesSobrePresupuesto,
            muestrasFrame: this.medicionesRendimiento.cantidadFrames,
            voronoiMs: this.medicionesRendimiento.promedioVoronoiMs,
            composicionMs: this.medicionesRendimiento.promedioComposicionMs,
            inicializacionMs: this.medicionesRendimiento.promedioInicializacionMs,
            celdasInicializadas: ventana.celdasInicializadas,
            subidaTexturaMs: this.medicionesRendimiento.promedioSubidaTexturaMs,
            framesRedibujados: this.medicionesRendimiento.cantidadRedibujados,
            ultimoRedibujadoHaceMs: this.medicionesRendimiento.ultimoRedibujadoMs === null
                ? null
                : Math.max(0, ahoraMs - this.medicionesRendimiento.ultimoRedibujadoMs),
            fisicaMs: this.modo === MODOS.JUEGO
                ? this.medicionesRendimiento.promedioFisicaMs
                : null,
            simulacionMs: this.medicionesRendimiento.promedioSimulacionMs,
            bloquesProcesados: this.simuladorMateriales.mediciones.bloques,
            bloquesEnCola: this.simuladorMateriales.mediciones.enCola,
            celdasVisitadas: ventana.celdasVisitadas,
            celdasActivas: ventana.celdasActivas,
            movimientos: ventana.movimientos,

            jugadorX: this.modo === MODOS.JUEGO ? this.sesionJuego.jugador.centroX : null,
            jugadorY: this.modo === MODOS.JUEGO ? this.sesionJuego.jugador.centroY : null,

            mundoX: dentro ? this.mouseMundo.x : null,
            mundoY: dentro ? this.mouseMundo.y : null,
            materialNombre: NOMBRES_MATERIAL[this.herramienta.materialActual],
            borrador: this.herramienta.modoBorrador,

            zoom: this.camara.zoom,
            indiceZoom: this.camara.indiceZoom,
            camX: this.camara.x,
            camY: this.camara.y,
            anchoVisible: this.camara.anchoVisible,
            altoVisible: this.camara.altoVisible,
            versionCamara: this.camara.version,

            puntosUsados: this.mundoVoronoi.puntos.length,
            puntosMax: CONFIG.puntos.max,
            versionPuntos: this.mundoVoronoi.version,
            celdasOcupadas: this.mundoCeldas.particulas
        };

        ventana.celdasInicializadas = 0;
        ventana.celdasVisitadas = 0;
        ventana.celdasActivas = 0;
        ventana.movimientos = 0;
        return snapshot;
    }

    // --- Interactividad de botones y sliders ---

    agregarInteractividadGeneral() {
        this.agregarInteractividadDeBotones();
        this.agregarInteractividadDeSliders();
    }

    agregarInteractividadDeBotones() {
        this.btnReanudar.addEventListener("click", () => this.alternarPausa());
        this.btnReiniciarMundo.addEventListener("click", () => this.reiniciarMundo());
        this.btnConfiguraciones.addEventListener("click", () => {
            const abrir = this.submenuConfiguraciones.hidden;
            this._cerrarSubmenusPausa();
            this.submenuConfiguraciones.hidden = !abrir;
            this.btnConfiguraciones.setAttribute("aria-expanded", String(abrir));
        });
        this.btnGlosario.addEventListener("click", () => {
            const abrir = this.submenuGlosario.hidden;
            this._cerrarSubmenusPausa();
            this.submenuGlosario.hidden = !abrir;
            this.btnGlosario.setAttribute("aria-expanded", String(abrir));
        });
        this.checkboxHudChips.addEventListener("change", () => {
            document.body.dataset.mostrarHudChips = String(this.checkboxHudChips.checked);
        });
        this.checkboxEstadoSimulador.addEventListener("change", () => {
            document.body.dataset.mostrarEstadoSimulador = String(this.checkboxEstadoSimulador.checked);
        });
        for (const checkbox of this.checkboxesDirtyChunks) {
            checkbox.addEventListener("change", () => this.establecerProcesamientoPorDirtyChunks(checkbox.checked));
        }
        this.btnReset.addEventListener("click", () => this.resetearCanvas());
        this.btnRandom.addEventListener("click", () => this.generarPuntosAleatoriamente());
        this.btnDelete.addEventListener("click", () => this.alternarModoBorrador());
        this.btnCenter.addEventListener("click", () => this.centrarCamara());
        this.btnModoJuego.addEventListener("click", () => {
            this.cambiarModo(MODOS.JUEGO)
                .catch((error) => {
                    console.error(error);
                    this.progresoCarga.textContent = "No se pudo preparar el mundo. Revisá la consola.";
                });
        });
        this.btnModoEditor.addEventListener("click", () => this.cambiarModo(MODOS.EDITOR));
    }

    agregarInteractividadDeSliders() {
        this.sliderMuro.addEventListener("input", (e) => {
            this.muroGrosor = Number(e.target.value);
            document.getElementById("valor-muro").textContent = this.muroGrosor;
        });

        //El zoom (antes "escala del canvas") ahora es el de la cámara; se ancla al centro de la vista.
        this.sliderZoom.addEventListener("input", (e) => {
            this.camara.fijarIndiceZoom(Number(e.target.value));
        });

        // Al soltar un slider se le saca el foco: con el foco puesto, el teclado ignora A/D/Espacio.
        for (const slider of [this.sliderMuro, this.sliderZoom]) {
            slider.addEventListener("change", (e) => e.target.blur());
        }
    }

    // Editor: la arena se simula en el área visible.
    actualizarArenaDelEditor() {
        const margen = CONFIG.materiales.margenSimulacionChunks * this.mundoCeldas.tamanioBloque;
        this.simuladorMateriales.actualizar({
            x0: this.camara.origenX - margen,
            y0: this.camara.origenY - margen,
            x1: this.camara.origenX + this.camara.anchoVisible + margen,
            y1: this.camara.origenY + this.camara.altoVisible + margen
        });
    }

    establecerProcesamientoPorDirtyChunks(activado) {
        this.procesamientoPorDirtyChunks = Boolean(activado);
        for (const checkbox of this.checkboxesDirtyChunks) checkbox.checked = this.procesamientoPorDirtyChunks;
        if (this.mundoCeldas) {
            this.mundoCeldas.configurarProcesamientoPorDirtyChunks(this.procesamientoPorDirtyChunks);
        }

        try {
            localStorage.setItem(
                CONFIG.optimizacion.claveProcesamientoDirtyChunks,
                this.procesamientoPorDirtyChunks ? "1" : "0"
            );
        } catch (error) {
            console.warn("No se pudo guardar la preferencia de procesamiento por Dirty Chunks.", error);
        }
    }

    _leerPreferenciaDirtyChunks() {
        try {
            const guardada = localStorage.getItem(CONFIG.optimizacion.claveProcesamientoDirtyChunks);
            if (guardada === null) return CONFIG.optimizacion.procesamientoDirtyChunksInicial;
            if (guardada === "1") return true;
            if (guardada === "0") return false;

            console.warn("La preferencia guardada de procesamiento por Dirty Chunks no es válida.");
            return CONFIG.optimizacion.procesamientoDirtyChunksInicial;
        } catch (error) {
            console.warn("No se pudo leer la preferencia de procesamiento por Dirty Chunks.", error);
            return CONFIG.optimizacion.procesamientoDirtyChunksInicial;
        }
    }

    // --- Modos ---

    async cambiarModo(modo) {
        if (modo === MODOS.JUEGO) {
            await this.entrarEnJuego();
        } else {
            this.entrarEnEditor();
        }

        this.pausado = false;
        this._reiniciarMedicionesRendimiento();
        this._cerrarSubmenusPausa();
        document.body.removeAttribute("data-pausado");
        this.menuPausa.removeAttribute("role");
        this.menuPausa.removeAttribute("aria-modal");
        this.menuPausa.removeAttribute("aria-labelledby");
        this.seccionEditor.open = this.modo === MODOS.EDITOR;
        document.body.dataset.modo = this.modo;     // el CSS muestra u oculta lo propio de cada modo
        this.ultimaConsultaAmbienteMs = -Infinity;
        this.sonidos.establecerEscenaAudio(this.modo);
        this.hud.configurarRangoZoom();
    }

    alternarPausa() {
        if (this.modo !== MODOS.JUEGO || this.preparandoJuego) return;

        this.pausado = !this.pausado;
        this.entrada.cambiarModo(this.modo);
        this.seccionEditor.open = false;
        this.sonidos.establecerEscenaAudio(this.modo, this.pausado);

        if (this.pausado) {
            document.body.dataset.pausado = "true";
            this.menuPausa.setAttribute("role", "dialog");
            this.menuPausa.setAttribute("aria-modal", "true");
            this.menuPausa.setAttribute("aria-labelledby", "titulo-pausa");
            this.btnReanudar.focus();
        } else {
            this._cerrarSubmenusPausa();
            document.body.removeAttribute("data-pausado");
            this.menuPausa.removeAttribute("role");
            this.menuPausa.removeAttribute("aria-modal");
            this.menuPausa.removeAttribute("aria-labelledby");
        }
    }

    _cerrarSubmenusPausa() {
        this.submenuConfiguraciones.hidden = true;
        this.btnConfiguraciones.setAttribute("aria-expanded", "false");
        this.submenuGlosario.hidden = true;
        this.btnGlosario.setAttribute("aria-expanded", "false");
    }

    async reiniciarMundo() {
        if (this.modo !== MODOS.JUEGO || this.preparandoJuego) return;

        this.preparandoJuego = true;
        this.btnReanudar.disabled = true;
        this.btnReiniciarMundo.disabled = true;
        this.btnReiniciarMundo.textContent = "Generando mundo…";
        this.mensajePausa.hidden = true;

        try {
            if (this.tareaPrecargaZona) await this.tareaPrecargaZona;
            this.partidaIniciada = false;
            this.posicionJugadorGuardada = null;
            this.mundoVoronoi.vaciar();
            await this.cambiarModo(MODOS.JUEGO);
        } catch (error) {
            console.error(error);
            this.pausado = true;
            document.body.dataset.pausado = "true";
            this.entrada.cambiarModo(this.modo);
            this.mensajePausa.textContent = "No se pudo reiniciar el mundo. Revisá la consola.";
            this.mensajePausa.hidden = false;
        } finally {
            this.preparandoJuego = false;
            this.btnReanudar.disabled = false;
            this.btnReiniciarMundo.disabled = false;
            this.btnReiniciarMundo.textContent = "Reiniciar Mundo";
        }
    }

    async entrarEnJuego() {
        this.preparandoJuego = true;
        try {
            this.modo = MODOS.JUEGO;
            this.pausado = false;
            this.seccionEditor.open = false;

            // En juego no hay borrador ni puntos nuevos: el mapa queda fijo.
            this.herramienta.modoBorrador = false;
            this.resetearPincel();

            if (this.mundoVoronoi.puntos.length === 0) this.mundoVoronoi.agregarAleatorios(CONFIG.puntos.aleatorios);

            const continuarPartida = this.partidaIniciada && this.posicionJugadorGuardada !== null;
            const puntosCambiaronEnEditor = continuarPartida
                && this.versionPuntosAlSalirAlEditor !== this.mundoVoronoi.version;
            if (!continuarPartida) {
                // Una partida nueva empieza con celdas limpias para que las regiones se inicialicen correctamente.
                this.mundoCeldas.vaciar();
                this.zonaPrecargada = null;
            }

            this.entrada.cambiarModo(MODOS.JUEGO);
            this.camara.limitarRangoZoom(CONFIG.camara.zoomMinJuego, CONFIG.camara.zoomMaxJuego);
            this.camara.fijarZoom(CONFIG.camara.zoomInicial);

            const spawn = continuarPartida
                ? { ...this.posicionJugadorGuardada }
                : this.sesionJuego.spawn.generar();
            this.camara.centrarEn(spawn.x + CONFIG.jugador.ancho / 2, spawn.y + CONFIG.jugador.alto / 2);
            await this._precargarZonaDeJuego();
            if (puntosCambiaronEnEditor) {
                this.redibujarSiCorresponde();
                const ySeguro = this.sesionJuego.fisica.encontrarSuperficieSeguraArriba(
                    spawn.x,
                    spawn.y,
                    this.sesionJuego.jugador
                );
                if (ySeguro !== null) spawn.y = ySeguro;
            }
            this.entrada.cambiarModo(MODOS.JUEGO);
            this.sesionJuego.iniciar(spawn);
            if (puntosCambiaronEnEditor) {
                const jugador = this.sesionJuego.jugador;
                const ySeguro = this.sesionJuego.fisica.encontrarSuperficieSeguraArriba(
                    jugador.x,
                    jugador.y,
                    jugador
                );
                if (ySeguro !== null && ySeguro !== jugador.y) {
                    jugador.y = ySeguro;
                    jugador.vy = 0;
                    jugador.enSuelo = false;
                    this.sesionJuego.centrarCamara();
                    this.sesionJuego._dibujar();
                }
            }
            const jugador = this.sesionJuego.jugador;
            this.posicionJugadorGuardada = { x: jugador.x, y: jugador.y, regionId: jugador.regionId };
            this.versionPuntosAlSalirAlEditor = null;
            this.partidaIniciada = true;
        } finally {
            this.preparandoJuego = false;
        }
    }

    _crearZonaPrecarga() {
        const zoom = Camara.NIVELES_ZOOM[this.camara.indiceZoomMin];
        const centroX = this.camara.origenX + this.camara.anchoVisible / 2;
        const centroY = this.camara.origenY + this.camara.altoVisible / 2;
        const margen = CONFIG.materiales.margenPrecargaPx / zoom;
        const mitadAncho = this.camara.vistaAncho / zoom / 2 + margen;
        const mitadAlto = this.camara.vistaAlto / zoom / 2 + margen;

        return {
            x0: Math.max(0, Math.floor(centroX - mitadAncho)),
            y0: Math.max(0, Math.floor(centroY - mitadAlto)),
            x1: Math.min(this.mundoCeldas.ancho, Math.ceil(centroX + mitadAncho)),
            y1: Math.min(this.mundoCeldas.alto, Math.ceil(centroY + mitadAlto))
        };
    }

    _zonaNecesitaExpansion() {
        if (!this.zonaPrecargada || this.precargandoZona) return false;
        const zona = this.zonaPrecargada;
        const zoom = Camara.NIVELES_ZOOM[this.camara.indiceZoomMin];
        const margenRestante = CONFIG.materiales.margenPrecargaPx / zoom / 2;
        return (zona.x0 > 0 && this.camara.origenX - zona.x0 < margenRestante)
            || (zona.y0 > 0 && this.camara.origenY - zona.y0 < margenRestante)
            || (zona.x1 < this.mundoCeldas.ancho
                && zona.x1 - (this.camara.origenX + this.camara.anchoVisible) < margenRestante)
            || (zona.y1 < this.mundoCeldas.alto
                && zona.y1 - (this.camara.origenY + this.camara.altoVisible) < margenRestante);
    }

    async _precargarZonaDeJuego() {
        const zona = this._crearZonaPrecarga();
        const filas = zona.y1 - zona.y0;
        let y = zona.y0;

        while (y < zona.y1) {
            const inicio = performance.now();
            do {
                this.inicializador.inicializarFilaMundo(y, zona.x0, zona.x1);
                y++;
            } while (y < zona.y1 && performance.now() - inicio < 8);

            await new Promise((resolver) => requestAnimationFrame(resolver));
        }

        let framesEstables = 0;
        let framesSimulados = 0;
        const maxFramesEstabilizacion = 180;
        const zoomMasAlejado = Camara.NIVELES_ZOOM[this.camara.indiceZoomMin];
        const centroX = this.camara.origenX + this.camara.anchoVisible / 2;
        const centroY = this.camara.origenY + this.camara.altoVisible / 2;
        const mitadAnchoVista = this.camara.vistaAncho / zoomMasAlejado / 2;
        const mitadAltoVista = this.camara.vistaAlto / zoomMasAlejado / 2;
        const vista = {
            x0: Math.max(0, centroX - mitadAnchoVista),
            y0: Math.max(0, centroY - mitadAltoVista),
            x1: Math.min(this.mundoCeldas.ancho, centroX + mitadAnchoVista),
            y1: Math.min(this.mundoCeldas.alto, centroY + mitadAltoVista)
        };

        while (framesEstables < 2 && framesSimulados < maxFramesEstabilizacion) {
            this.simuladorMateriales.actualizar();
            framesSimulados++;
            const activos = this.mundoCeldas.contarBloquesActivosEnRectangulo(
                vista.x0, vista.y0, vista.x1, vista.y1
            );
            if (activos === 0) framesEstables++;
            else framesEstables = 0;
            await new Promise((resolver) => requestAnimationFrame(resolver));
        }
        this.zonaPrecargada = zona;
    }

    _iniciarPrecargaDeZona() {
        if (this.preparandoJuego || this.precargandoZona) return;

        this.precargandoZona = true;
        this.tareaPrecargaZona = this._precargarZonaEnSegundoPlano()
            .catch((error) => {
                console.error(error);
            })
            .finally(() => {
                this.precargandoZona = false;
                this.tareaPrecargaZona = null;
            });
    }

    async _precargarZonaEnSegundoPlano() {
        const zona = this._crearZonaPrecarga();
        let y = zona.y0;

        while (y < zona.y1) {
            const inicio = performance.now();
            do {
                this.inicializador.inicializarFilaMundo(y, zona.x0, zona.x1);
                y++;
            } while (y < zona.y1 && performance.now() - inicio < 6);

            await new Promise((resolver) => requestAnimationFrame(resolver));
        }

        this.zonaPrecargada = zona;
    }

    entrarEnEditor() {
        this.modo = MODOS.EDITOR;

        if (this.partidaIniciada && this.sesionJuego.activa) {
            const jugador = this.sesionJuego.jugador;
            this.posicionJugadorGuardada = {
                x: jugador.x,
                y: jugador.y,
                regionId: jugador.regionId
            };
            this.versionPuntosAlSalirAlEditor = this.mundoVoronoi.version;
        }
        this.sesionJuego.detener();
        this.entrada.cambiarModo(MODOS.EDITOR);
        this.camara.restablecerRangoZoom();
    }

    centrarCamara() {
        if (this.modo === MODOS.JUEGO) this.sesionJuego.centrarCamara();
        else this.camara.centrarEnMundo();
    }

    // --- Acciones ---

    alternarModoBorrador() {
        this.herramienta.modoBorrador = !this.herramienta.modoBorrador;
    }

    resetearCanvas() {
        this.partidaIniciada = false;
        this.posicionJugadorGuardada = null;
        this.mundoVoronoi.vaciar();
        this.mundoCeldas.vaciar();
        this.resetearPincel();
    }

    resetearPincel() {
        this.herramienta.areaActual = null;
        this.herramienta.materialActual = MATERIALES.NADA;
    }

    generarPuntosAleatoriamente() {
        this.resetearCanvas();
        this.mundoVoronoi.agregarAleatorios(CONFIG.puntos.aleatorios);
    }

    // Click izquierdo: borra el punto de la región bajo el mouse o agrega uno nuevo, según el modo.
    usarHerramientaEnMouse() {
        this.actualizarAreaYMaterialDelMouse();

        if (this.herramienta.modoBorrador) this.eliminarPuntoDelAreaActual();
        else {
            const ahora = performance.now();
            if (ahora - this.ultimoPuntoCreadoMs < CONFIG.puntos.intervaloCreacionMs) return;

            if (this.mundoVoronoi.agregarPuntoEn(this.mouseMundo.x, this.mouseMundo.y)) {
                this.ultimoPuntoCreadoMs = ahora;
                this.sonidos.alCrearPunto();
            }
        }
    }

    eliminarPuntoDelAreaActual() {
        if (this.herramienta.areaActual === null) return;

        if (this.mundoVoronoi.eliminarPunto(this.herramienta.areaActual)) {
            this.partidaIniciada = false;
            this.posicionJugadorGuardada = null;
            this.mundoCeldas.vaciar();
            this.sonidos.alBorrarPunto();
        }
        this.resetearPincel();
    }

    // Convierte el mouse a coordenadas del mundo y busca la región (punto más cercano) y su material.
    actualizarAreaYMaterialDelMouse() {
        const mouse = this.entrada.mouse;
        if (!mouse.dentro) {
            this.mouseMundo.x = -1;
            this.mouseMundo.y = -1;
            this.resetearPincel();
            return;
        }

        this.mouseMundo.x = Math.floor(this.camara.mundoXDe(mouse.pantallaX));
        this.mouseMundo.y = Math.floor(this.camara.mundoYDe(mouse.pantallaY));

        const indice = this.mundoCeldas.estaDentro(this.mouseMundo.x, this.mouseMundo.y)
            ? this.mundoVoronoi.indiceMasCercano(this.mouseMundo.x, this.mouseMundo.y)
            : -1;

        if (indice < 0) {
            this.resetearPincel();
            return;
        }

        this.herramienta.areaActual = indice;
        this.herramienta.materialActual = this.mundoVoronoi.puntos[indice].materialId;
    }
}
