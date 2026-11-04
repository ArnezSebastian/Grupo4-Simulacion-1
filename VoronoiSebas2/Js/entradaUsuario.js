// Traduce eventos del navegador (mouse, rueda, teclado) en acciones de alto nivel.
// Mueve la cámara directamente (pan/zoom) y avisa al simulador de lo demás mediante callbacks.
class EntradaUsuario {
    // Estado del mouse en píxeles del canvas (no del mundo: la conversión la hace la cámara).
    mouse = { pantallaX: -1, pantallaY: -1, dentro: false };

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

    // Llamar en cada frame: mueve la cámara con WASD / flechas.
    aplicarTeclado(deltaMs) {
        const dx = (this.teclas.has("KeyD") || this.teclas.has("ArrowRight") ? 1 : 0)
                 - (this.teclas.has("KeyA") || this.teclas.has("ArrowLeft") ? 1 : 0);
        const dy = (this.teclas.has("KeyS") || this.teclas.has("ArrowDown") ? 1 : 0)
                 - (this.teclas.has("KeyW") || this.teclas.has("ArrowUp") ? 1 : 0);
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
        window.addEventListener("mouseup", () => this._terminarArrastre());
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
            if (e.target.closest("input, textarea, select")) return;    // no pelear con los sliders

            if (e.code === "Space" && !e.target.closest("button")) {
                this.espacioPresionado = true;
                e.preventDefault();
                return;
            }
            this.teclas.add(e.code);
            this._atajo(e);
        });

        window.addEventListener("keyup", (e) => {
            if (e.code === "Space") this.espacioPresionado = false;
            this.teclas.delete(e.code);
        });

        window.addEventListener("blur", () => {
            this.teclas.clear();
            this.espacioPresionado = false;
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
            case "KeyB": this.acciones.alAlternarBorrador(); break;
        }
    }
}
