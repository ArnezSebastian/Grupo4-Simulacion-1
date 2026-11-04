// Cámara 2D: decide qué porción del mundo se ve en el canvas y con qué zoom.
// Sólo guarda estado y convierte coordenadas; no dibuja ni lee el mouse (SRP).
class Camara {
    // Niveles discretos: con zoom entero (o 1/2^n) cada celda ocupa un bloque regular de píxeles
    // y el pixel-art no "tiembla" al moverse.
    static NIVELES_ZOOM = [0.125, 0.25, 0.5, 1, 2, 3, 4, 6, 8];

    x = 0;              // esquina superior izquierda de la vista, en celdas del mundo (puede ser decimal)
    y = 0;
    indiceZoom = 4;
    version = 0;        // aumenta con cada cambio: los demás módulos la usan como "dirty flag".

    constructor(vistaAncho, vistaAlto, mundoAncho, mundoAlto, zoomInicial) {
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

    // Zoom anclado: el punto del mundo bajo (anclaX, anclaY) queda bajo el mismo píxel después de hacer zoom.
    cambiarZoom(deltaNiveles, anclaX, anclaY) {
        const nuevo = limitarValor(this.indiceZoom + deltaNiveles, 0, Camara.NIVELES_ZOOM.length - 1);
        return this.fijarIndiceZoom(nuevo, anclaX, anclaY);
    }

    fijarIndiceZoom(indice, anclaX = this.vistaAncho / 2, anclaY = this.vistaAlto / 2) {
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

    _moverA(nuevoX, nuevoY) {
        const antesX = this.x, antesY = this.y;
        this.x = nuevoX;
        this.y = nuevoY;
        this._limitar();
        if (this.x !== antesX || this.y !== antesY) this.version++;
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
