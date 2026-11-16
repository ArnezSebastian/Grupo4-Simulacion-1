// Estado base para las animaciones del jugador.
class Estado {
    constructor(vista, nombre, animacion) {
        this.vista = vista;
        this.nombre = nombre;
        this.animacion = animacion;
    }

    enter() {
        this.vista.reproducirAnimacion(this.animacion);
    }

    update(contexto, deltaMs) {
        this.vista.actualizarAnimacion(deltaMs);
    }

    exit() {}
}
