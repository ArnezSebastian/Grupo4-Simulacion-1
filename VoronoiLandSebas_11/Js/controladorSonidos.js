// Conecta el audio con la aplicación: decide QUÉ suena en cada situación.
//   - Eventos del juego y del editor (los llama el simulador): saltar, picar, crear y borrar puntos.
//   - Interfaz: click en cualquier botón. Cada botón puede elegir su efecto con data-sonido="id" o apagarlo con
//     data-sonido="ninguno".
//   - Silencio: las casillas con el atributo data-control-sonido y la tecla M.
// El juego (física, excavador, sesión) no conoce esta clase: sólo recibe callbacks.
class ControladorSonidos {
    constructor(servicioAudio, config) {
        this.servicio = servicioAudio;
        this.sonidoEnBotones = config.sonidoEnBotones;
        this.casillas = [];
        this.conectado = false;
    }

    // Registra los listeners de la página. Es aparte del constructor para poder crear el controlador sin tocar el DOM.
    conectarDOM(documento = document, ventana = window) {
        if (this.conectado) return;
        this.conectado = true;

        this._registrarDesbloqueo(documento);
        this._registrarSonidoDeBotones(documento);
        this._registrarControlDeSilencio(documento, ventana);
    }

    // --- Eventos de la aplicación ---

    alSaltar() { this.servicio.reproducir("salto"); }
    alPicarSolido() { this.servicio.reproducir("picar"); }
    alCrearPunto() { this.servicio.reproducir("puntoCreado"); }
    alBorrarPunto() { this.servicio.reproducir("puntoBorrado"); }

    // --- Silencio ---

    establecerActivado(activado) {
        this.servicio.establecerSilenciado(!activado);
        this._sincronizarCasillas();
        if (activado) this.servicio.reproducir("boton");        // confirma que el sonido volvió
    }

    alternar() {
        this.establecerActivado(this.servicio.silenciado);
    }

    // --- Interno ---

    // Los navegadores sólo dejan iniciar el audio después de un gesto del usuario.
    _registrarDesbloqueo(documento) {
        const desbloquear = () => this.servicio.desbloquear();
        documento.addEventListener("pointerdown", desbloquear, true);
        documento.addEventListener("keydown", desbloquear, true);
    }

    _registrarSonidoDeBotones(documento) {
        documento.addEventListener("click", (evento) => {
            const boton = evento.target && evento.target.closest ? evento.target.closest("button") : null;
            if (!boton || boton.disabled) return;

            const elegido = boton.dataset.sonido;
            if (elegido === "ninguno") return;
            if (elegido === undefined && !this.sonidoEnBotones) return;

            this.servicio.reproducir(elegido === undefined ? "boton" : elegido);
        });
    }

    _registrarControlDeSilencio(documento, ventana) {
        this.casillas = Array.from(documento.querySelectorAll("[data-control-sonido]"));
        for (const casilla of this.casillas) {
            casilla.addEventListener("change", () => this.establecerActivado(casilla.checked));
        }
        this._sincronizarCasillas();

        ventana.addEventListener("keydown", (evento) => {
            if (evento.code !== "KeyM" || evento.repeat || evento.ctrlKey || evento.metaKey || evento.altKey) return;

            const destino = evento.target;
            if (destino && destino.closest && destino.closest('input[type="text"], textarea, select')) return;
            this.alternar();
        });
    }

    _sincronizarCasillas() {
        for (const casilla of this.casillas) casilla.checked = !this.servicio.silenciado;
    }
}
