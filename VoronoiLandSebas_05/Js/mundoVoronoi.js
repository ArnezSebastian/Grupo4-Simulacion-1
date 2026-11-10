// Modelo de los puntos (semillas) de Voronoi: crear, borrar, mover y consultar.
// No conoce el canvas, la cámara ni los píxeles: sólo datos del mundo.
class MundoVoronoi {
    puntos = [];
    version = 0;                // dirty flag: sube con cualquier cambio de puntos
    rebotes = 0;
    dinamismoActivado = false;
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

    alternarDinamismo() {
        this.dinamismoActivado = !this.dinamismoActivado;
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

        this.puntos.push(this._crearPunto(x, y, this.config.velocidadManual, 50, 229));
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
            this.puntos.push(this._crearPunto(x, y, this.config.velocidadAleatoria, 55, 254));
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

    // Mueve los puntos en diagonal y los hace rebotar contra los límites del MUNDO (no de la pantalla).
    avanzar() {
        if (!this.dinamismoActivado || this.puntos.length === 0) return;

        const m = this.config.margenRebote;
        const maxX = this.mundoAncho - m - 1;
        const maxY = this.mundoAlto - m - 1;

        for (let i = 0; i < this.puntos.length; i++) {
            const p = this.puntos[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x <= m || p.x >= this.mundoAncho - m) {
                p.vx *= -1;
                p.x = limitarValor(p.x, m, maxX);
                this.rebotes++;
            }
            if (p.y <= m || p.y >= this.mundoAlto - m) {
                p.vy *= -1;
                p.y = limitarValor(p.y, m, maxY);
                this.rebotes++;
            }
        }
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

    _crearPunto(x, y, velocidadMax, colorMin, colorMax) {
        return {
            x: x,
            y: y,
            color: [
                elegirValorAleatorioEntre(colorMin, colorMax),
                elegirValorAleatorioEntre(colorMin, colorMax),
                elegirValorAleatorioEntre(colorMin, colorMax)
            ],
            // Material granular al azar: arena, piedra o agua (ids numéricos).
            materialId: elegirValorAleatorioEntre(MATERIALES.ARENA, MATERIALES.AGUA),
            vx: (Math.random() - 0.5) * velocidadMax,
            vy: (Math.random() - 0.5) * velocidadMax
        };
    }
}
