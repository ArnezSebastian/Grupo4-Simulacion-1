// Pantalla de inicio: el botón "Jugar" es el que crea e inicializa el simulador (Pixi, módulos, game loop).
// Hasta que se elige un modo no se reserva memoria (el mundo son 25 MB) ni arranca ningún ticker.
class PantallaInicio {
    constructor(alElegirModo) {
        this.alElegirModo = alElegirModo;       // async (modo) => void
        this.elemento = document.getElementById("pantalla-inicio");
        this.btnJugar = document.getElementById("btn-jugar");
        this.btnEditor = document.getElementById("btn-editor");
        this.mensaje = document.getElementById("inicio-mensaje");

        // El lienzo todavía no tiene canvas: se le da el tamaño que va a tener para que la pantalla lo cubra.
        const raiz = document.documentElement.style;
        raiz.setProperty("--canvas-ancho", `${CONFIG.canvas.ancho}px`);
        raiz.setProperty("--canvas-alto", `${CONFIG.canvas.alto}px`);
        document.body.dataset.estado = "inicio";

        this.btnJugar.addEventListener("click", () => this._elegir(MODOS.JUEGO));
        this.btnEditor.addEventListener("click", () => this._elegir(MODOS.EDITOR));
    }

    async _elegir(modo) {
        this._bloquear(true);
        this.mensaje.textContent = "Cargando…";

        try {
            await this.alElegirModo(modo);
            this.ocultar();
        } catch (error) {
            console.error(error);
            this.mensaje.textContent = "No se pudo iniciar el simulador (revisá la consola).";
            this._bloquear(false);
        }
    }

    _bloquear(bloqueado) {
        this.btnJugar.disabled = bloqueado;
        this.btnEditor.disabled = bloqueado;
    }

    ocultar() {
        this.elemento.hidden = true;
        document.body.dataset.estado = "activo";
    }
}
