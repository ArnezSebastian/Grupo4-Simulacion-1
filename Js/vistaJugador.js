// Dibuja al jugador y el área de picado con PixiJS, ENCIMA del sprite que contiene el mundo.
// La FSM selecciona el clip; esta clase reproduce sus cuadros y resuelve la colocación visual.
class VistaJugador {
    static async cargarRecursos() {
        const urlAtlas = new URL("Personajes/Nuevo_Minero/jugador_atlas.json", document.baseURI);
        const respuesta = await fetch(urlAtlas);
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar el atlas del jugador: ${respuesta.status} ${respuesta.statusText}`);
        }

        const atlas = await respuesta.json();
        if (!atlas.meta || !atlas.meta.image || !atlas.meta.ancla || !atlas.meta.frameSize || !atlas.meta.animaciones) {
            throw new Error("El atlas del jugador no contiene los metadatos requeridos.");
        }

        const urlImagen = new URL(atlas.meta.image, urlAtlas);
        const textura = await PIXI.Assets.load(urlImagen.href);
        textura.source.scaleMode = "nearest";

        const spritesheet = new PIXI.Spritesheet(textura, atlas);
        await spritesheet.parse();

        for (const nombre in atlas.meta.animaciones) {
            const definicion = atlas.meta.animaciones[nombre];
            const cuadros = spritesheet.animations[nombre];
            if (!cuadros || cuadros.length === 0 || !Number.isFinite(definicion.fps) || definicion.fps <= 0) {
                throw new Error(`La animación "${nombre}" no tiene cuadros o FPS válidos en el atlas.`);
            }
        }

        return {
            spritesheet,
            ancla: atlas.meta.ancla,
            frameSize: atlas.meta.frameSize,
            animaciones: atlas.meta.animaciones
        };
    }

    constructor(escenario, recursos) {
        this.contenedor = new PIXI.Container();
        this.contenedor.visible = false;
        this.recursos = recursos;

        this.cuerpo = new PIXI.Sprite(recursos.spritesheet.animations.idle[0]);
        this.cuerpo.anchor.set(recursos.ancla.x, recursos.ancla.y);
        this.animacionActual = null;
        this.cuadrosAnimacion = null;
        this.fpsAnimacion = 0;
        this.repetirAnimacion = false;
        this.tiempoAnimacionMs = 0;
        this.indiceCuadro = 0;
        this.animacionTerminada = false;

        this.contenedor.addChild(this.cuerpo);
        escenario.addChild(this.contenedor);
    }

    mostrar() { this.contenedor.visible = true; }
    ocultar() { this.contenedor.visible = false; }

    reproducirAnimacion(nombre, reiniciar = false) {
        if (nombre === this.animacionActual && !reiniciar) return;

        const cuadros = this.recursos.spritesheet.animations[nombre];
        const definicion = this.recursos.animaciones[nombre];
        if (!cuadros || !definicion) {
            throw new Error(`No existe la animación "${nombre}" en el atlas del jugador.`);
        }

        this.animacionActual = nombre;
        this.cuadrosAnimacion = cuadros;
        this.fpsAnimacion = definicion.fps;
        this.repetirAnimacion = definicion.bucle;
        this.tiempoAnimacionMs = 0;
        this.indiceCuadro = 0;
        this.animacionTerminada = false;
        this.cuerpo.texture = cuadros[0];
    }

    duracionCicloAnimacionSeg(nombre = this.animacionActual) {
        const cuadros = nombre
            ? this.recursos.spritesheet.animations[nombre]
            : this.cuadrosAnimacion;
        const definicion = nombre ? this.recursos.animaciones[nombre] : null;
        const fps = definicion ? definicion.fps : this.fpsAnimacion;
        if (!cuadros || fps <= 0) {
            throw new Error("No hay una animación activa para calcular su duración.");
        }
        return cuadros.length / fps;
    }

    actualizarAnimacion(deltaMs) {
        if (this.animacionTerminada || !this.cuadrosAnimacion) return;

        this.tiempoAnimacionMs += Math.max(0, deltaMs);
        const duracionCuadroMs = 1000 / this.fpsAnimacion;
        let indice = Math.floor(this.tiempoAnimacionMs / duracionCuadroMs);

        if (this.repetirAnimacion) {
            indice %= this.cuadrosAnimacion.length;
        } else if (indice >= this.cuadrosAnimacion.length) {
            indice = this.cuadrosAnimacion.length - 1;
            this.animacionTerminada = true;
        }

        if (indice !== this.indiceCuadro) {
            this.indiceCuadro = indice;
            this.cuerpo.texture = this.cuadrosAnimacion[indice];
        }
    }

    actualizar(jugador, camara, objetivo) {
        const zoom = camara.zoom;
        const direccion = jugador.orientacion < 0 ? -1 : 1;

        this.cuerpo.position.set(
            Math.round(camara.pantallaXDe(jugador.centroX)),
            Math.round(camara.pantallaYDe(jugador.y + jugador.alto))
        );
        this.cuerpo.scale.set(direccion * zoom, zoom);

    }
}
