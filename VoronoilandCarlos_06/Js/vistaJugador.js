// Dibuja al jugador y su mira con PixiJS, ENCIMA del sprite que contiene el mundo.
// Sólo convierte coordenadas con la cámara: no tiene lógica de juego. Hoy el cuerpo es un recuadro de color;
// cuando haya spritesheet se cambia acá (y sólo acá).
class VistaJugador {
    constructor(escenario, config) {
        this.contenedor = new PIXI.Container();
        this.contenedor.visible = false;

        // Cuerpo: un sprite blanco de 1x1 teñido y estirado al tamaño de la caja.
        this.cuerpo = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.cuerpo.tint = config.color;

        // Celda que se va a picar (resaltado translúcido) y cruz en el punto de apunte.
        this.resaltado = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.resaltado.tint = 0xffffff;
        this.resaltado.alpha = 0.35;
        this.resaltado.visible = false;

        this.rayo = new PIXI.Graphics();
        this.rayo.visible = false;

        this.mira = new PIXI.Graphics();
        this.mira.moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6).stroke({ width: 2, color: 0xffffff });

        this.contenedor.addChild(this.resaltado, this.rayo, this.cuerpo, this.mira);
        escenario.addChild(this.contenedor);
    }

    mostrar() { this.contenedor.visible = true; }
    ocultar() { this.contenedor.visible = false; }

    actualizar(jugador, camara, objetivo) {
        const zoom = camara.zoom;

        this.cuerpo.position.set(
            Math.round(camara.pantallaXDe(jugador.x)),
            Math.round(camara.pantallaYDe(jugador.y))
        );
        this.cuerpo.width = Math.round(jugador.ancho * zoom);
        this.cuerpo.height = Math.round(jugador.alto * zoom);

        this.rayo.clear();
        this.rayo.visible = objetivo.rayoVisible;
        if (objetivo.rayoVisible) {
            this.rayo
                .moveTo(objetivo.origenPantallaX, objetivo.origenPantallaY)
                .lineTo(objetivo.finPantallaX, objetivo.finPantallaY)
                .stroke({ width: 2, color: 0xffe26b, alpha: 0.8 });
        }

        this.mira.visible = objetivo.apuntadoValido;
        this.mira.position.set(
            Math.round(camara.pantallaXDe(objetivo.puntoX)),
            Math.round(camara.pantallaYDe(objetivo.puntoY))
        );

        this.resaltado.visible = objetivo.hayImpacto;
        if (objetivo.hayImpacto) {
            this.resaltado.position.set(
                Math.round(camara.pantallaXDe(objetivo.celdaX)),
                Math.round(camara.pantallaYDe(objetivo.celdaY))
            );
            this.resaltado.width = zoom;
            this.resaltado.height = zoom;
        }
    }
}
