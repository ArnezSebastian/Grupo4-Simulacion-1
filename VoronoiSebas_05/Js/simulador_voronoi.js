// Orquestador: crea los módulos, los conecta y corre el game loop.
// La lógica de cada tema vive en su propia clase (Camara, MundoVoronoi, MundoCeldas, RasterizadorVoronoi,
// EntradaUsuario, HUD, SesionJuego). Esta clase sólo decide en qué orden se llaman y en qué MODO está
// la aplicación (editor = simulador original, juego = personaje controlable).
class SimuladorVoronoi {
    //Aplicación y render:
    pixiApp;
    textureBuffer;
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

    //Modo actual y promesa que se resuelve cuando Pixi terminó de iniciar:
    modo = MODOS.EDITOR;
    listo;

    // En el editor, mientras el dinamismo está activo los puntos de Voronoi se mueven y la arena queda congelada
    // (sus regiones guardadas dejarían de coincidir con los bordes). Al apagarlo se recalculan y se reanuda.
    simulacionPausada = false;

    //Botones y sliders:
    btnReset;
    btnRandom;
    btnDinamic;
    btnDelete;
    btnCenter;
    btnModoJuego;
    btnModoEditor;
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

    constructor() {
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
        this.btnDinamic = document.getElementById("dinamic-points");
        this.btnDelete = document.getElementById("delete-points-mode");
        this.btnCenter = document.getElementById("center-camera");
        this.btnModoJuego = document.getElementById("btn-modo-juego");
        this.btnModoEditor = document.getElementById("btn-modo-editor");

        //Contenedor donde va el canvas de Pixi:
        this.contenedorLienzo = document.getElementById("lienzo");
    }

    async initPIXI() {
        this.pixiApp = new PIXI.Application();

        await this.pixiApp.init({
            width: CONFIG.canvas.ancho,
            height: CONFIG.canvas.alto,
            backgroundColor: CONFIG.canvas.colorFondo
        });

        this.contenedorLienzo.prepend(this.pixiApp.canvas);
        this.pixiApp.stage.eventMode = 'static';

        this.plantearModelo();
        this.plantearRender();
        this.plantearEntrada();
        this.plantearHUD();
        this.agregarInteractividadGeneral();

        //Activo el gameloop:
        this.pixiApp.ticker.add(this.gameLoop.bind(this));
    }

    // --- Planteo de módulos ---

    plantearModelo() {
        const m = CONFIG.mundo;

        this.camara = new Camara(CONFIG.canvas.ancho, CONFIG.canvas.alto, m.ancho, m.alto,
            CONFIG.camara.zoomInicial, CONFIG.camara.suavizadoSeguimiento);
        this.mundoCeldas = new MundoCeldas(m.ancho, m.alto);
        this.mundoVoronoi = new MundoVoronoi(m.ancho, m.alto, CONFIG.puntos);

        // Compartidos por el motor de materiales, el rasterizador y el jugador:
        this.regiones = new RegionesDelMundo(this.mundoCeldas, this.mundoVoronoi);
        this.inicializador = new InicializadorMateriales(this.mundoCeldas, this.mundoVoronoi, CONFIG);

        this.simuladorMateriales = new SimuladorMateriales(this.mundoCeldas, this.regiones, CONFIG);
    }

    plantearRender() {
        this.rasterizador = new RasterizadorVoronoi(this.camara, this.mundoVoronoi, this.mundoCeldas, CONFIG, this.inicializador);

        // La textura comparte memoria con el buffer del rasterizador: lo que se escribe ahí se sube a la GPU con update().
        this.textureBuffer = PIXI.BufferImageSource.from({
            resource: this.rasterizador.bufferPixeles,
            width: CONFIG.canvas.ancho,
            height: CONFIG.canvas.alto,
            scaleMode: 'nearest' //evita la difuminación de pixeles al escalar.
        });

        const textura = new PIXI.Texture({ source: this.textureBuffer });

        //El sprite mide lo mismo que el canvas: 1 píxel de textura = 1 píxel de pantalla (el zoom lo hace la cámara).
        this.spriteDrawer = new PIXI.Sprite(textura);
        this.pixiApp.stage.addChild(this.spriteDrawer);

        // El jugador va en sprites aparte, ENCIMA del sprite del mundo (que se redibuja entero cada vez).
        this.sesionJuego = new SesionJuego({
            camara: this.camara,
            mundoCeldas: this.mundoCeldas,
            mundoVoronoi: this.mundoVoronoi,
            regiones: this.regiones,
            inicializador: this.inicializador,
            escenario: this.pixiApp.stage,
            config: CONFIG
        });
    }

    plantearEntrada() {
        this.entrada = new EntradaUsuario(this.pixiApp.canvas, this.camara, CONFIG, {
            alPresionarIzquierdo: () => this.usarHerramientaEnMouse(),
            alAlternarBorrador: () => this.alternarModoBorrador(),
            alCentrar: () => this.centrarCamara()
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
        if (this.modo === MODOS.JUEGO) {
            this.simuladorMateriales.actualizar();
            this.sesionJuego.actualizar(ticker.deltaMS, this.entrada.leerIntencionJugador());
        } else {
            this.entrada.aplicarTeclado(ticker.deltaMS);
            this.mundoVoronoi.avanzar();
            this.actualizarArenaDelEditor();
        }

        this.actualizarAreaYMaterialDelMouse();
        this.redibujarSiCorresponde();
        this.actualizarHUD();
    }

    redibujarSiCorresponde() {
        if (!this.rasterizador.estaDesactualizado(this.muroGrosor)) return;

        this.rasterizador.dibujar(this.muroGrosor);
        this.textureBuffer.update();
    }

    actualizarHUD() {
        this.textoFPS.tick();
        this.hud.actualizarSiCorresponde(() => this.obtenerSnapshot(), performance.now());
    }

    // Foto del estado actual para el HUD (y, más adelante, para el benchmark).
    obtenerSnapshot() {
        const dentro = this.entrada.mouse.dentro && this.mundoCeldas.estaDentro(this.mouseMundo.x, this.mouseMundo.y);
        const med = this.rasterizador.mediciones;

        return {
            modo: this.modo,
            frameMs: this.pixiApp.ticker.deltaMS,
            voronoiMs: med.voronoiMs,
            composicionMs: med.composicionMs,
            fisicaMs: this.modo === MODOS.JUEGO ? this.sesionJuego.mediciones.fisicaMs : null,
            simulacionMs: this.simuladorMateriales.mediciones.ms,
            bloquesProcesados: this.simuladorMateriales.mediciones.bloques,
            bloquesEnCola: this.simuladorMateriales.mediciones.enCola,
            simulacionPausada: this.simulacionPausada,

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
            celdasOcupadas: this.mundoCeldas.particulas,
            dinamismo: this.mundoVoronoi.dinamismoActivado,
            rebotes: this.mundoVoronoi.rebotes
        };
    }

    // --- Interactividad de botones y sliders ---

    agregarInteractividadGeneral() {
        this.agregarInteractividadDeBotones();
        this.agregarInteractividadDeSliders();
    }

    agregarInteractividadDeBotones() {
        this.btnReset.addEventListener("click", () => this.resetearCanvas());
        this.btnRandom.addEventListener("click", () => this.generarPuntosAleatoriamente());
        this.btnDinamic.addEventListener("click", () => this.mundoVoronoi.alternarDinamismo());
        this.btnDelete.addEventListener("click", () => this.alternarModoBorrador());
        this.btnCenter.addEventListener("click", () => this.centrarCamara());
        this.btnModoJuego.addEventListener("click", () => this.cambiarModo(MODOS.JUEGO));
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

    // Editor: la arena sólo se simula con el dinamismo apagado.
    actualizarArenaDelEditor() {
        const dinamico = this.mundoVoronoi.dinamismoActivado;

        if (dinamico) {
            this.simulacionPausada = true;
            this.simuladorMateriales.mediciones.bloques = 0;
            return;
        }

        if (this.simulacionPausada) {
            // Se acaba de apagar el dinamismo: los puntos se movieron, las regiones guardadas están viejas.
            this.mundoCeldas.invalidarRegiones();
            this.simulacionPausada = false;
        }
        this.simuladorMateriales.actualizar();
    }

    // --- Modos ---

    cambiarModo(modo) {
        if (modo === MODOS.JUEGO) this.entrarEnJuego();
        else this.entrarEnEditor();

        document.body.dataset.modo = this.modo;     // el CSS muestra u oculta lo propio de cada modo
        this.hud.configurarRangoZoom();
    }

    entrarEnJuego() {
        this.modo = MODOS.JUEGO;
        this.simulacionPausada = false;

        // En juego no hay dinamismo, ni borrador, ni puntos nuevos: el mapa tiene que quedarse quieto.
        if (this.mundoVoronoi.dinamismoActivado) this.mundoVoronoi.alternarDinamismo();
        this.herramienta.modoBorrador = false;
        this.resetearPincel();

        if (this.mundoVoronoi.puntos.length === 0) this.mundoVoronoi.agregarAleatorios(CONFIG.puntos.aleatorios);

        // Se parte de celdas "limpias": las regiones que MundoCeldas tenía guardadas pueden estar desfasadas
        // si en el editor se movieron o borraron puntos, y el jugador choca contra esos bordes.
        this.mundoCeldas.vaciar();

        this.entrada.cambiarModo(MODOS.JUEGO);
        this.camara.limitarRangoZoom(CONFIG.camara.zoomMinJuego, CONFIG.camara.zoomMaxJuego);
        this.camara.fijarZoom(CONFIG.camara.zoomInicial);

        this.sesionJuego.iniciar();
    }

    entrarEnEditor() {
        this.modo = MODOS.EDITOR;

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
            }
        }
    }

    eliminarPuntoDelAreaActual() {
        if (this.herramienta.areaActual === null) return;

        if (this.mundoVoronoi.eliminarPunto(this.herramienta.areaActual)) this.mundoCeldas.vaciar();
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
