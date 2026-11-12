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
    sonidos;

    //Modo actual y promesa que se resuelve cuando Pixi terminó de iniciar:
    modo = MODOS.EDITOR;
    listo;

    preparandoJuego = false;
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
    submenuConfiguraciones;
    checkboxHudChips;
    checkboxEstadoSimulador;
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
        this.submenuConfiguraciones = document.getElementById("submenu-configuraciones");
        this.checkboxHudChips = document.getElementById("config-hud-chips");
        this.checkboxEstadoSimulador = document.getElementById("config-estado-simulador");
        this.mensajePausa = document.getElementById("mensaje-pausa");
        this.menuPausa = document.getElementById("menu-pausa");
        this.seccionEditor = document.getElementById("seccion-editor");

        //Contenedor donde va el canvas de Pixi:
        this.contenedorLienzo = document.getElementById("superficie-canvas");
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
            config: CONFIG,
            eventos: {
                alSaltar: () => this.sonidos.alSaltar(),
                alPicarSolido: () => this.sonidos.alPicarSolido()
            }
        });
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

        if (this.modo === MODOS.JUEGO) {
            if (this._zonaNecesitaExpansion()) this._iniciarPrecargaDeZona();
            this.simuladorMateriales.actualizar();
            this.sesionJuego.actualizar(ticker.deltaMS, this.entrada.leerIntencionJugador());
        } else {
            this.entrada.aplicarTeclado(ticker.deltaMS);
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
            this.submenuConfiguraciones.hidden = !this.submenuConfiguraciones.hidden;
            this.btnConfiguraciones.setAttribute("aria-expanded", String(!this.submenuConfiguraciones.hidden));
        });
        this.checkboxHudChips.addEventListener("change", () => {
            document.body.dataset.mostrarHudChips = String(this.checkboxHudChips.checked);
        });
        this.checkboxEstadoSimulador.addEventListener("change", () => {
            document.body.dataset.mostrarEstadoSimulador = String(this.checkboxEstadoSimulador.checked);
        });
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

    // --- Modos ---

    async cambiarModo(modo) {
        if (modo === MODOS.JUEGO) {
            await this.entrarEnJuego();
        } else {
            this.entrarEnEditor();
        }

        this.pausado = false;
        document.body.removeAttribute("data-pausado");
        this.menuPausa.removeAttribute("role");
        this.menuPausa.removeAttribute("aria-modal");
        this.menuPausa.removeAttribute("aria-labelledby");
        this.seccionEditor.open = this.modo === MODOS.EDITOR;
        document.body.dataset.modo = this.modo;     // el CSS muestra u oculta lo propio de cada modo
        this.hud.configurarRangoZoom();
    }

    alternarPausa() {
        if (this.modo !== MODOS.JUEGO || this.preparandoJuego) return;

        this.pausado = !this.pausado;
        this.entrada.cambiarModo(this.modo);
        this.seccionEditor.open = false;

        if (this.pausado) {
            document.body.dataset.pausado = "true";
            this.menuPausa.setAttribute("role", "dialog");
            this.menuPausa.setAttribute("aria-modal", "true");
            this.menuPausa.setAttribute("aria-labelledby", "titulo-pausa");
            this.btnReanudar.focus();
        } else {
            document.body.removeAttribute("data-pausado");
            this.menuPausa.removeAttribute("role");
            this.menuPausa.removeAttribute("aria-modal");
            this.menuPausa.removeAttribute("aria-labelledby");
        }
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

            // Se parte de celdas "limpias": las regiones que MundoCeldas tenía guardadas pueden estar desfasadas
            // si en el editor se movieron o borraron puntos, y el jugador choca contra esos bordes.
            this.mundoCeldas.vaciar();
            this.zonaPrecargada = null;

            this.entrada.cambiarModo(MODOS.JUEGO);
            this.camara.limitarRangoZoom(CONFIG.camara.zoomMinJuego, CONFIG.camara.zoomMaxJuego);
            this.camara.fijarZoom(CONFIG.camara.zoomInicial);

            const spawn = this.sesionJuego.spawn.generar();
            this.camara.centrarEn(spawn.x + CONFIG.jugador.ancho / 2, spawn.y + CONFIG.jugador.alto / 2);
            await this._precargarZonaDeJuego();
            this.entrada.cambiarModo(MODOS.JUEGO);
            this.sesionJuego.iniciar(spawn);
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
                this.sonidos.alCrearPunto();
            }
        }
    }

    eliminarPuntoDelAreaActual() {
        if (this.herramienta.areaActual === null) return;

        if (this.mundoVoronoi.eliminarPunto(this.herramienta.areaActual)) {
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
