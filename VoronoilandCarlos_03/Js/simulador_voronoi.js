// Orquestador: crea los módulos, los conecta y corre el game loop.
// La lógica de cada tema vive en su propia clase (Camara, MundoVoronoi, MundoCeldas, RasterizadorVoronoi,
// EntradaUsuario, HUD). Esta clase sólo decide en qué orden se llaman.
class SimuladorVoronoi {
    //Aplicación y render:
    pixiApp;
    textureBuffer;
    spriteDrawer;

    //Módulos:
    camara;
    mundoCeldas;
    simuladorMateriales;
    mundoVoronoi;
    rasterizador;
    entrada;
    hud;
    textoFPS;

    //Botones y sliders:
    btnReset;
    btnRandom;
    btnDinamic;
    btnDelete;
    btnCenter;
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

        this.initPIXI();
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

        this.camara = new Camara(CONFIG.canvas.ancho, CONFIG.canvas.alto, m.ancho, m.alto, CONFIG.camara.zoomInicial);
        this.mundoCeldas = new MundoCeldas(m.ancho, m.alto);
        this.mundoVoronoi = new MundoVoronoi(m.ancho, m.alto, CONFIG.puntos);
        this.simuladorMateriales = new SimuladorMateriales(this.mundoCeldas, this.mundoVoronoi, CONFIG);
    }

    plantearRender() {
        this.rasterizador = new RasterizadorVoronoi(this.camara, this.mundoVoronoi, this.mundoCeldas, CONFIG);

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
    }

    plantearEntrada() {
        this.entrada = new EntradaUsuario(this.pixiApp.canvas, this.camara, CONFIG, {
            alPresionarIzquierdo: () => this.usarHerramientaEnMouse(),
            alAlternarBorrador: () => this.alternarModoBorrador(),
            alCentrar: () => this.camara.centrarEnMundo()
        });
    }

    plantearHUD() {
        this.textoFPS = new TextoFPS(this.pixiApp);
        this.hud = new HUD(CONFIG, this.camara, this.mundoVoronoi, (x, y) => this.camara.centrarEn(x, y));
    }

    // --- Game loop ---

    gameLoop(ticker) {
        this.entrada.aplicarTeclado(ticker.deltaMS);
        this.mundoVoronoi.avanzar();
        this.simuladorMateriales.actualizar();
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
            frameMs: this.pixiApp.ticker.deltaMS,
            voronoiMs: med.voronoiMs,
            composicionMs: med.composicionMs,

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
        this.btnCenter.addEventListener("click", () => this.camara.centrarEnMundo());
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
