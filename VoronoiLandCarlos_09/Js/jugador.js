// Estado del personaje controlado por el jugador. Sólo datos y cosas derivadas de ellos:
// no lee el teclado (EntradaUsuario), no choca contra nada (FisicaJugador) y no se dibuja (VistaJugador).
// Posición (x, y) = esquina superior izquierda de la caja, en CELDAS (decimales permitidos).
class Jugador {
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;

    enSuelo = false;
    enAgua = false;
    regionId = 0;           // región donde apareció (informativo: los muros se resuelven por pares de celdas, no por región)

    orientacion = 1;        // hacia dónde mira en horizontal: -1 izquierda, 1 derecha (queda la última dirección)
    miradaVertical = 0;     // -1 arriba (W), 0 horizontal, 1 abajo (S)
    moviendo = 0;           // -1, 0, 1: tecla horizontal apretada en este momento

    constructor(config) {
        this.ancho = config.ancho;
        this.alto = config.alto;
        this._direccion = { x: 1, y: 0 };   // se reutiliza: direccionMirada no crea objetos en cada llamada
    }

    get centroX() { return this.x + this.ancho / 2; }
    get centroY() { return this.y + this.alto / 2; }

    reaparecer(x, y, regionId) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.enSuelo = false;
        this.enAgua = false;
        this.regionId = regionId;
        this.orientacion = 1;
        this.miradaVertical = 0;
        this.moviendo = 0;
    }

    // intencion = { mover, mirarVertical, saltar, picar } (la arma EntradaUsuario según el modo).
    aplicarIntencion(intencion) {
        this.moviendo = intencion.mover;
        this.miradaVertical = intencion.mirarVertical;
        if (intencion.mover !== 0) this.orientacion = intencion.mover;
    }

    // Vector unitario hacia donde apunta: sólo W / S = recto arriba / abajo; W / S + moverse = diagonal.
    get direccionMirada() {
        const d = this._direccion;
        if (this.miradaVertical === 0) {
            d.x = this.orientacion;
            d.y = 0;
        } else if (this.moviendo !== 0) {
            d.x = this.orientacion * Math.SQRT1_2;
            d.y = this.miradaVertical * Math.SQRT1_2;
        } else {
            d.x = 0;
            d.y = this.miradaVertical;
        }
        return d;
    }
}
