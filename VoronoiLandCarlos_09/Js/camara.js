// Cámara 2D: decide qué porción del mundo se ve en el canvas y con qué zoom.
// Sólo guarda estado y convierte coordenadas; no dibuja ni lee el mouse (SRP).
class Camara {
    // Niveles discretos: con zoom entero (o 1/2^n) cada celda ocupa un bloque regular de píxeles
    // y el pixel-art no "tiembla" al moverse.
    static NIVELES_ZOOM = [0.125, 0.25, 0.5, 1, 2, 3, 4, 6, 8];

    x = 0;              // esquina superior izquierda de la vista, en celdas del mundo (puede ser decimal)
    y = 0;
    indiceZoom = 4;
    indiceZoomMin = Camara.NIVELES_ZOOM.indexOf(2);  // evita mostrar más de 800 × 600 celdas en el editor
    indiceZoomMax = Camara.NIVELES_ZOOM.length - 1;
    version = 0;        // aumenta cuando cambia lo que se DIBUJA (origen ajustado a píxeles o zoom): es el "dirty flag".

    // suavizado: velocidad con que seguir() alcanza el objetivo (1/segundos).
    constructor(vistaAncho, vistaAlto, mundoAncho, mundoAlto, zoomInicial, suavizado = 10) {
        this.suavizado = suavizado;
        this.vistaAncho = vistaAncho;
        this.vistaAlto = vistaAlto;
        this.mundoAncho = mundoAncho;
        this.mundoAlto = mundoAlto;

        const indice = Camara.NIVELES_ZOOM.indexOf(zoomInicial);
        this.indiceZoom = indice >= 0 ? indice : 3;

        this.centrarEnMundo();
    }

    get zoom() { return Camara.NIVELES_ZOOM[this.indiceZoom]; }
    get anchoVisible() { return this.vistaAncho / this.zoom; }  // en celdas
    get altoVisible() { return this.vistaAlto / this.zoom; }

    // Origen "ajustado" a píxeles enteros de pantalla: es el que se usa para dibujar y para el mouse.
    get origenX() { return Math.round(this.x * this.zoom) / this.zoom; }
    get origenY() { return Math.round(this.y * this.zoom) / this.zoom; }

    // Conversiones pantalla <-> mundo:
    mundoXDe(pantallaX) { return this.origenX + pantallaX / this.zoom; }
    mundoYDe(pantallaY) { return this.origenY + pantallaY / this.zoom; }
    pantallaXDe(mundoX) { return (mundoX - this.origenX) * this.zoom; }
    pantallaYDe(mundoY) { return (mundoY - this.origenY) * this.zoom; }

    desplazarPantalla(dxPantalla, dyPantalla) {
        this._moverA(this.x + dxPantalla / this.zoom, this.y + dyPantalla / this.zoom);
    }

    centrarEn(mundoX, mundoY) {
        this._moverA(mundoX - this.anchoVisible / 2, mundoY - this.altoVisible / 2);
    }

    centrarEnMundo() {
        this.centrarEn(this.mundoAncho / 2, this.mundoAlto / 2);
    }

    // Persigue un punto del mundo con suavizado exponencial (independiente del framerate).
    // El origen que se dibuja sigue ajustado a píxeles enteros, así que no tiembla aunque x e y sean decimales.
    seguir(mundoX, mundoY, deltaSeg) {
        const objetivoX = mundoX - this.anchoVisible / 2;
        const objetivoY = mundoY - this.altoVisible / 2;
        const factor = 1 - Math.exp(-this.suavizado * deltaSeg);
        this._moverA(this.x + (objetivoX - this.x) * factor, this.y + (objetivoY - this.y) * factor);
    }

    // Acota el zoom a [zoomMin, zoomMax] (valores de NIVELES_ZOOM) y corrige el actual si quedó afuera.
    limitarRangoZoom(zoomMin, zoomMax) {
        const min = Camara.NIVELES_ZOOM.indexOf(zoomMin);
        const max = Camara.NIVELES_ZOOM.indexOf(zoomMax);
        if (min < 0 || max < 0 || min > max) return;

        this.indiceZoomMin = min;
        this.indiceZoomMax = max;
        this.fijarIndiceZoom(this.indiceZoom);
    }

    restablecerRangoZoom() {
        this.indiceZoomMin = Camara.NIVELES_ZOOM.indexOf(2);
        this.indiceZoomMax = Camara.NIVELES_ZOOM.length - 1;
        this.fijarIndiceZoom(this.indiceZoom);
    }

    fijarZoom(zoom, anclaX, anclaY) {
        const indice = Camara.NIVELES_ZOOM.indexOf(zoom);
        if (indice >= 0) this.fijarIndiceZoom(indice, anclaX, anclaY);
    }

    // Zoom anclado: el punto del mundo bajo (anclaX, anclaY) queda bajo el mismo píxel después de hacer zoom.
    cambiarZoom(deltaNiveles, anclaX, anclaY) {
        return this.fijarIndiceZoom(this.indiceZoom + deltaNiveles, anclaX, anclaY);
    }

    fijarIndiceZoom(indice, anclaX = this.vistaAncho / 2, anclaY = this.vistaAlto / 2) {
        indice = limitarValor(indice, this.indiceZoomMin, this.indiceZoomMax);
        if (indice === this.indiceZoom) return false;

        const mundoX = this.x + anclaX / this.zoom;
        const mundoY = this.y + anclaY / this.zoom;

        this.indiceZoom = indice;
        this.x = mundoX - anclaX / this.zoom;
        this.y = mundoY - anclaY / this.zoom;

        this._limitar();
        this.version++;
        return true;
    }

    // Sólo sube la versión si cambió el origen AJUSTADO (lo que realmente se ve): mover x en fracciones
    // menores a un píxel de pantalla no obliga a redibujar.
    _moverA(nuevoX, nuevoY) {
        const antesX = this.origenX, antesY = this.origenY;
        this.x = nuevoX;
        this.y = nuevoY;
        this._limitar();
        if (this.origenX !== antesX || this.origenY !== antesY) this.version++;
    }

    // Mantiene la vista dentro del mundo. Si la vista es más grande que el mundo (zoom muy alejado), lo centra.
    _limitar() {
        this.x = this._limitarEje(this.x, this.anchoVisible, this.mundoAncho);
        this.y = this._limitarEje(this.y, this.altoVisible, this.mundoAlto);
    }

    _limitarEje(valor, tamanioVisible, tamanioMundo) {
        if (tamanioVisible >= tamanioMundo) return (tamanioMundo - tamanioVisible) / 2;
        return limitarValor(valor, 0, tamanioMundo - tamanioVisible);
    }
}
