// Traduce eventos del navegador (mouse, rueda, teclado) en acciones de alto nivel.
// Mueve la cámara directamente (pan/zoom) y avisa al simulador de lo demás mediante callbacks.
// Qué hace cada tecla depende del MODO (editor / juego): ver MAPA_ACCIONES.
class EntradaUsuario {
    // Mapa de acciones por modo: acción -> teclas (event.code) que la disparan.
    static MAPA_ACCIONES = Object.freeze({
        [MODOS.EDITOR]: Object.freeze({
            camaraIzquierda: ["KeyA", "ArrowLeft"],
            camaraDerecha: ["KeyD", "ArrowRight"],
            camaraArriba: ["KeyW", "ArrowUp"],
            camaraAbajo: ["KeyS", "ArrowDown"]
        }),
        [MODOS.JUEGO]: Object.freeze({
            moverIzquierda: ["KeyA", "ArrowLeft"],
            moverDerecha: ["KeyD", "ArrowRight"],
            mirarArriba: ["KeyW", "ArrowUp"],
            mirarAbajo: ["KeyS", "ArrowDown"],
            saltar: ["Space"]
        })
    });

    modo = MODOS.EDITOR;

    // Estado del mouse en píxeles del canvas (no del mundo: la conversión la hace la cámara).
    mouse = { pantallaX: -1, pantallaY: -1, dentro: false };

    botonIzquierdoPresionado = false;   // en juego, mantenerlo = picar

    // Intención del jugador en este frame (se reutiliza el mismo objeto: nada de basura por frame).
    intencion = {
        mover: 0, mirarVertical: 0, saltar: false, picar: false,
        mouseX: -1, mouseY: -1, mouseValido: false
    };

    teclas = new Set();
    espacioPresionado = false;
    arrastrando = false;
    ultimoX = 0;
    ultimoY = 0;
    ultimoZoomMs = 0;

    constructor(canvas, camara, config, acciones) {
        this.canvas = canvas;
        this.camara = camara;
        this.anchoLogico = config.canvas.ancho;
        this.altoLogico = config.canvas.alto;
        this.velocidadTeclado = config.camara.velocidadTeclado;
        this.acciones = acciones;   // { alPresionarIzquierdo, alAlternarBorrador, alCentrar }

        this.canvas.style.cursor = "crosshair";
        this._registrarMouse();
        this._registrarRueda();
        this._registrarTeclado();
    }

    // Cambia de modo: se sueltan teclas y botones para que no queden "pegados" de un modo al otro.
    cambiarModo(modo) {
        this.modo = modo;
        this.teclas.clear();
        this.espacioPresionado = false;
        this.botonIzquierdoPresionado = false;
        this._terminarArrastre();
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    }

    accionActiva(nombre) {
        const codigos = EntradaUsuario.MAPA_ACCIONES[this.modo][nombre];
        if (!codigos) return false;
        for (let i = 0; i < codigos.length; i++) {
            if (this.teclas.has(codigos[i])) return true;
        }
        return false;
    }

    // Modo juego: traduce teclas y mouse a la intención del personaje.
    leerIntencionJugador() {
        const it = this.intencion;
        it.mouseX = this.mouse.pantallaX;
        it.mouseY = this.mouse.pantallaY;
        it.mouseValido = this.mouse.dentro;
        if (this.modo !== MODOS.JUEGO) {
            it.mover = 0;
            it.mirarVertical = 0;
            it.saltar = false;
            it.picar = false;
            return it;
        }

        it.mover = (this.accionActiva("moverDerecha") ? 1 : 0) - (this.accionActiva("moverIzquierda") ? 1 : 0);
        it.mirarVertical = (this.accionActiva("mirarAbajo") ? 1 : 0) - (this.accionActiva("mirarArriba") ? 1 : 0);
        it.saltar = this.accionActiva("saltar");
        it.picar = this.botonIzquierdoPresionado;
        return it;
    }

    // Modo editor, una vez por frame: mueve la cámara con WASD / flechas.
    aplicarTeclado(deltaMs) {
        if (this.modo !== MODOS.EDITOR) return;

        const dx = (this.accionActiva("camaraDerecha") ? 1 : 0) - (this.accionActiva("camaraIzquierda") ? 1 : 0);
        const dy = (this.accionActiva("camaraAbajo") ? 1 : 0) - (this.accionActiva("camaraArriba") ? 1 : 0);
        if (dx === 0 && dy === 0) return;

        const paso = this.velocidadTeclado * deltaMs / 1000;
        this.camara.desplazarPantalla(dx * paso, dy * paso);
    }

    // --- Mouse ---

    _registrarMouse() {
        this.canvas.addEventListener("mousemove", (e) => this._actualizarPosicion(e));

        this.canvas.addEventListener("mouseleave", () => {
            this.mouse.dentro = false;
            this.mouse.pantallaX = -1;
            this.mouse.pantallaY = -1;
        });

        this.canvas.addEventListener("mousedown", (e) => {
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            this._actualizarPosicion(e);

            if (this.modo === MODOS.JUEGO) {
                // En juego no hay pan de cámara: el click izquierdo mantenido pica.
                if (e.button === 0) this.botonIzquierdoPresionado = true;
                else e.preventDefault();
                return;
            }

            const esPan = e.button === 1 || e.button === 2 || (e.button === 0 && this.espacioPresionado);
            if (esPan) {
                e.preventDefault();
                this._iniciarArrastre();
            } else if (e.button === 0) {
                this.acciones.alPresionarIzquierdo();
            }
        });

        // Arrastre y soltar en window: no se "pega" si el mouse sale del canvas mientras se arrastra.
        window.addEventListener("mousemove", (e) => this._arrastrar(e));
        window.addEventListener("mouseup", (e) => {
            if (e.button === 0) this.botonIzquierdoPresionado = false;
            this._terminarArrastre();
        });
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    _registrarRueda() {
        this.canvas.addEventListener("wheel", (e) => {
            e.preventDefault();

            // Limita la cantidad de pasos por segundo (los trackpads disparan decenas de eventos).
            const ahora = performance.now();
            if (ahora - this.ultimoZoomMs < 50) return;
            this.ultimoZoomMs = ahora;

            const p = this._posicionEnCanvas(e);
            this.camara.cambiarZoom(e.deltaY < 0 ? 1 : -1, p.x, p.y);
        }, { passive: false });
    }

    _iniciarArrastre() {
        this.arrastrando = true;
        this.ultimoX = this.mouse.pantallaX;
        this.ultimoY = this.mouse.pantallaY;
        this.canvas.style.cursor = "grabbing";
    }

    _arrastrar(e) {
        if (!this.arrastrando) return;

        const p = this._posicionEnCanvas(e);
        this.camara.desplazarPantalla(this.ultimoX - p.x, this.ultimoY - p.y);
        this.ultimoX = p.x;
        this.ultimoY = p.y;
    }

    _terminarArrastre() {
        if (!this.arrastrando) return;
        this.arrastrando = false;
        this.canvas.style.cursor = "crosshair";
    }

    _actualizarPosicion(e) {
        const p = this._posicionEnCanvas(e);
        this.mouse.pantallaX = p.x;
        this.mouse.pantallaY = p.y;
        this.mouse.dentro = true;
    }

    // Posición relativa al canvas, en píxeles lógicos (corrige si el CSS escala el canvas).
    _posicionEnCanvas(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * this.anchoLogico / rect.width,
            y: (e.clientY - rect.top) * this.altoLogico / rect.height
        };
    }

    // --- Teclado ---

    _registrarTeclado() {
        window.addEventListener("keydown", (e) => {
            if (e.code === "Escape" && this.modo === MODOS.JUEGO) {
                e.preventDefault();
                if (!e.repeat) this.acciones.alAlternarPausa();
                return;
            }

            if (e.target.closest("input, textarea, select")) return;    // no pelear con los sliders

            if (e.code === "Space") {
                if (this.modo === MODOS.JUEGO) {
                    // En juego Espacio es SALTAR (aunque haya un botón con el foco: no debe "apretarlo").
                    e.preventDefault();
                    this.teclas.add("Space");
                    return;
                }
                if (!e.target.closest("button")) {
                    this.espacioPresionado = true;      // editor: Espacio + arrastrar = pan
                    e.preventDefault();
                    return;
                }
            }

            // En juego las flechas no deben scrollear la página.
            if (this.modo === MODOS.JUEGO && e.code.startsWith("Arrow")) e.preventDefault();

            this.teclas.add(e.code);
            this._atajo(e);
        });

        window.addEventListener("keyup", (e) => {
            if (e.code === "Space") {
                this.espacioPresionado = false;
                if (this.modo === MODOS.JUEGO) e.preventDefault();
            }
            this.teclas.delete(e.code);
        });

        window.addEventListener("blur", () => {
            this.teclas.clear();
            this.espacioPresionado = false;
            this.botonIzquierdoPresionado = false;
            this._terminarArrastre();
        });
    }

    _atajo(e) {
        if (e.repeat) return;

        switch (e.code) {
            case "Equal":
            case "NumpadAdd": this.camara.cambiarZoom(1); break;
            case "Minus":
            case "NumpadSubtract": this.camara.cambiarZoom(-1); break;
            case "Digit0": this.acciones.alCentrar(); break;
            case "KeyB": if (this.modo === MODOS.EDITOR) this.acciones.alAlternarBorrador(); break;
        }
    }
}
