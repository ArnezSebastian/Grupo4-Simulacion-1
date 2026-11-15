// Modelo de los puntos (semillas) de Voronoi: crear, borrar, mover y consultar.
// No conoce el canvas, la cámara ni los píxeles: sólo datos del mundo.
class MundoVoronoi {
    puntos = [];
    version = 0;                // dirty flag: sube con cualquier cambio de puntos
    regionesPendientesInicializacion = new Set();
    regionesAgregadasRecientemente = new Set();

    constructor(mundoAncho, mundoAlto, configPuntos) {
        this.mundoAncho = mundoAncho;
        this.mundoAlto = mundoAlto;
        this.config = configPuntos;
    }

    get cantidadDisponible() {
        return this.config.max - this.puntos.length;
    }

    puedeAgregarEn(x, y) {
        if (this.puntos.length >= this.config.max) return false;
        if (x < 0 || x >= this.mundoAncho || y < 0 || y >= this.mundoAlto) return false;

        // Distancia mínima comparada al cuadrado (evita la raíz cuadrada):
        const minDistSq = this.config.distMinima * this.config.distMinima;
        for (let i = 0; i < this.puntos.length; i++) {
            const dx = x - this.puntos[i].x;
            const dy = y - this.puntos[i].y;
            if (dx * dx + dy * dy < minDistSq) return false;
        }
        return true;
    }

    agregarPuntoEn(x, y) {
        if (!this.puedeAgregarEn(x, y)) return false;

        this.puntos.push(this._crearPunto(x, y, 50, 229));
        const regionId = this.puntos.length;
        this.regionesPendientesInicializacion.add(regionId);
        this.regionesAgregadasRecientemente.add(regionId);
        this.version++;
        return true;
    }

    agregarAleatorios(cantidad) {
        const total = Math.min(cantidad, this.cantidadDisponible);
        for (let i = 0; i < total; i++) {
            const x = Math.floor(Math.random() * this.mundoAncho);
            const y = Math.floor(Math.random() * this.mundoAlto);
            this.puntos.push(this._crearPunto(x, y, 55, 254));
        }
        this.version++;
    }

    eliminarPunto(indice) {
        if (indice < 0 || indice >= this.puntos.length) return false;

        this.puntos.splice(indice, 1);
        this.version++;
        return true;
    }

    vaciar() {
        this.puntos = [];
        this.regionesPendientesInicializacion.clear();
        this.regionesAgregadasRecientemente.clear();
        this.version++;
    }

    // Índice del punto más cercano a (x, y), o -1 si no hay puntos. Es la región "bajo" esa coordenada.
    indiceMasCercano(x, y) {
        let mejor = -1;
        let mejorDist = Infinity;

        for (let i = 0; i < this.puntos.length; i++) {
            const dx = x - this.puntos[i].x;
            const dy = y - this.puntos[i].y;
            const distSq = dx * dx + dy * dy;
            if (distSq < mejorDist) {
                mejorDist = distSq;
                mejor = i;
            }
        }
        return mejor;
    }

    _crearPunto(x, y, colorMin, colorMax) {
        return {
            x: x,
            y: y,
            color: [
                elegirValorAleatorioEntre(colorMin, colorMax),
                elegirValorAleatorioEntre(colorMin, colorMax),
                elegirValorAleatorioEntre(colorMin, colorMax)
            ],
            // Material al azar: arena, piedra, agua o tierra (ids numéricos).
            materialId: elegirValorAleatorioEntre(MATERIALES.ARENA, MATERIALES.TIERRA)
        };
    }
}
