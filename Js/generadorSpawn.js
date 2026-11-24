// Busca una superficie despejada para el jugador en el terreno generado.
class GeneradorSpawn {
    constructor(mundoCeldas, mundoVoronoi, regiones, inicializador, config) {
        this.mundo = mundoCeldas;
        this.mundoVoronoi = mundoVoronoi;
        this.regiones = regiones;
        this.inicializador = inicializador;
        this.configJugador = config;
        this.resultado = { x: 0, y: 0, regionId: 0, camaraVaciada: false };
    }

    generar() {
        const resultado = this.resultado;
        resultado.camaraVaciada = false;

        if (this._buscarSuperficie(false, resultado) || this._buscarSuperficie(true, resultado)) {
            return resultado;
        }

        return this._buscarFallbackEnSuperficie(resultado);
    }

    _buscarFallbackEnSuperficie(salida) {
        const { ancho, alto, spawn } = this.configJugador;
        const regionesSuperficie = this._obtenerRegionesSuperficie();
        if (regionesSuperficie.size === 0) return salida;

        const ids = Array.from(regionesSuperficie);
        for (let i = 0; i < ids.length; i++) {
            const regionId = ids[i];
            const punto = this.mundoVoronoi.puntos[regionId - 1];
            if (!punto) continue;

            const centroX = Math.max(ancho / 2, Math.min(this.mundo.ancho - ancho / 2, punto.x));
            const superficieY = this.mundoVoronoi.alturaSuperficie(regionId, Math.floor(centroX));
            const x = Math.max(0, Math.floor(centroX - ancho / 2));
            const y = Math.max(0, Math.floor(superficieY - alto - 2));

            this.inicializador.inicializarZona(
                Math.max(0, x - 1),
                0,
                Math.min(this.mundo.ancho, x + ancho + 1),
                Math.min(this.mundo.alto, y + alto + 4)
            );

            const regionCaja = this._regionUnicaDeCaja(x, y, ancho, alto);
            if (regionCaja !== regionId) continue;

            salida.x = x;
            salida.y = y;
            salida.regionId = regionId;
            salida.camaraVaciada = false;
            this._vaciarCamara(x, y, ancho, alto, regionId, spawn);
            salida.camaraVaciada = true;
            return salida;
        }

        return salida;
    }

    _obtenerRegionesSuperficie() {
        const regionesSuperficie = new Set();
        for (let x = 0; x < this.mundo.ancho; x++) {
            const indice = this.mundoVoronoi.indiceMasCercano(x, 0);
            if (indice >= 0) regionesSuperficie.add(indice + 1);
        }
        return regionesSuperficie;
    }

    _buscarSuperficie(permitirAgua, salida) {
        const { ancho, alto } = this.configJugador;
        const maxX = this.mundo.ancho - ancho;
        const xCandidatos = new Set();
        const paso = Math.max(8, ancho * 2);

        for (let x = 0; x <= maxX; x += paso) xCandidatos.add(x);
        for (const punto of this.mundoVoronoi.puntos) {
            xCandidatos.add(Math.max(0, Math.min(maxX, Math.floor(punto.x - ancho / 2))));
        }

        const xOrdenados = Array.from(xCandidatos).sort((a, b) => a - b);
        for (let regionId = 1; regionId <= this.mundoVoronoi.puntos.length; regionId++) {
            const material = this.mundoVoronoi.puntos[regionId - 1].materialId;
            const esAgua = material === MATERIALES.AGUA;
            if (esAgua !== permitirAgua) continue;
            if (!this._obtenerRegionesSuperficie().has(regionId)) continue;

            for (const x of xOrdenados) {
                const centroX = Math.floor(x + ancho / 2);
                const filaApoyo = Math.ceil(this.mundoVoronoi.alturaSuperficie(regionId, centroX));
                const y = filaApoyo - alto;
                if (y < 0 || filaApoyo >= this.mundo.alto) continue;
                if (this.mundoVoronoi.indiceMasCercano(centroX, filaApoyo) !== regionId - 1) continue;

                this.inicializador.inicializarZona(
                    Math.max(0, x - 1),
                    Math.max(0, y - 1),
                    Math.min(this.mundo.ancho, x + ancho + 1),
                    Math.min(this.mundo.alto, filaApoyo + 1)
                );

                const regionCaja = this._regionUnicaDeCaja(x, y, ancho, alto);
                if (regionCaja !== regionId) continue;
                if (!this._hayMaterialEnPies(x, y, ancho, alto, permitirAgua)) continue;

                salida.x = x;
                salida.y = y;
                salida.regionId = regionCaja;
                salida.camaraVaciada = false;
                return true;
            }
        }
        return false;
    }

    _regionUnicaDeCaja(x0, y0, ancho, alto) {
        const estado = this.mundo.estado;
        let regionId = -1;

        for (let y = y0; y < y0 + alto; y++) {
            for (let x = x0; x < x0 + ancho; x++) {
                if (estado[this.mundo.indiceDe(x, y)] !== MATERIALES.NADA) return -1;

                const id = this.regiones.regionEn(x, y);
                if (regionId < 0) regionId = id;
                else if (id !== regionId) return -1;
            }
        }
        return regionId;
    }

    _hayMaterialEnPies(x, y, ancho, alto, permitirAgua) {
        const fila = Math.floor(y + alto);
        for (let col = x; col < x + ancho; col++) {
            const material = this.mundo.estado[this.mundo.indiceDe(col, fila)];
            if (material === MATERIALES.NADA) continue;
            if (permitirAgua || material !== MATERIALES.AGUA) return true;
        }
        return false;
    }

    _vaciarCamara(x0, y0, ancho, alto, regionId, spawn) {
        const desdeX = x0 - spawn.margenLateral;
        const hastaX = x0 + ancho + spawn.margenLateral;
        const desdeY = y0 - spawn.margenSuperior;
        const hastaY = y0 + alto;

        for (let y = Math.max(0, desdeY); y < hastaY; y++) {
            for (let x = Math.max(0, desdeX); x < hastaX; x++) {
                if (!this.mundo.estaDentro(x, y)) continue;
                if (this.regiones.regionEn(x, y) !== regionId) continue;
                this.mundo.excavar(x, y);
            }
        }
    }
}
