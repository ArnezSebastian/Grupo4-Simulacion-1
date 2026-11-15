// Decide qué material hay en cada celda la PRIMERA vez que se la necesita (inicialización perezosa).
// Antes vivía dentro del rasterizador; ahora lo comparten el rasterizador (zona visible) y el spawn (esquina).
//   - inicializarVista(...): camino rápido, aprovecha las regiones que el rasterizador ya calculó por píxel.
//   - inicializarZona(x0, y0, x1, y1): camino general para rectángulos pequeños.
//   - inicializarFilaMundo(y, x0, x1): inicialización optimizada por filas para preparar una zona.
class InicializadorMateriales {
    constructor(mundoCeldas, mundoVoronoi, config) {
        this.celdas = mundoCeldas;
        this.mundoVoronoi = mundoVoronoi;
        this.porcentaje = config.materiales.porcentajeLlenado;

        this.versionCamaraInicializada = -1;
        this.versionCeldasInicializadas = -1;

        const capacidad = config.puntos.max + 1;
        this.sx = new Float64Array(capacidad);
        this.sy = new Float64Array(capacidad);
        this.sid = new Uint16Array(capacidad);
        this.g = new Float64Array(capacidad);
        this.v = new Int32Array(capacidad);
        this.z = new Float64Array(capacidad + 1);
        this.regionesFila = new Uint16Array(mundoCeldas.ancho);
        this.regionesAfectadasFila = new Set();
        this.versionSemillas = -1;
        this.cantidadSemillas = 0;
    }

    // vista = { ancho, alto, regiones, filasY, columnasX, colIni, colFin } (espacio de pantalla, lo arma el rasterizador).
    inicializarVista(vista, versionCamara) {
        if (this.mundoVoronoi.puntos.length === 0) return;

        const celdas = this.celdas;
        const puntos = this.mundoVoronoi.puntos;
        const { ancho, alto, regiones, filasY, columnasX, colIni, colFin } = vista;
        const porcentaje = this.porcentaje;
        const regionesPendientes = this.mundoVoronoi.regionesPendientesInicializacion;
        const regionesAgregadas = this.mundoVoronoi.regionesAgregadasRecientemente;
        const areaNecesitaInicializacion = this.versionCamaraInicializada !== versionCamara
            || this.versionCeldasInicializadas !== celdas.versionInicializacion;
        if (!areaNecesitaInicializacion && regionesAgregadas.size === 0) return;

        const soloRegionesNuevas = regionesAgregadas.size > 0 && !areaNecesitaInicializacion;
        const regionesParaInicializar = soloRegionesNuevas ? regionesAgregadas : regionesPendientes;

        let huboCambios = false;
        const regionesAfectadas = new Set();
        let ultimaFilaMundo = NaN;
        for (let y = 0; y < alto; y++) {
            const wy = filasY[y];
            if (wy === ultimaFilaMundo) continue;
            ultimaFilaMundo = wy;
            if (wy < 0 || wy >= celdas.alto) continue;

            const base = wy * celdas.ancho;
            const off = y * ancho;
            let ultimaColumnaMundo = NaN;
            for (let x = colIni; x <= colFin; x++) {
                const wx = columnasX[x];
                if (wx === ultimaColumnaMundo) continue;
                ultimaColumnaMundo = wx;
                const indice = base + wx;
                const regionId = regiones[off + x];

                if (soloRegionesNuevas && !regionesParaInicializar.has(regionId)) continue;

                if (regionesParaInicializar.has(regionId)) {
                    if (celdas.obtenerRegionIndice(indice) === regionId) continue;

                    const regionAnterior = celdas.obtenerRegionIndice(indice);
                    const materialAnterior = celdas.estado[indice];
                    celdas.inicializarIndice(indice, MATERIALES.NADA);
                    celdas.marcarIndiceInicializado(indice);
                    celdas.fijarRegionIndice(indice, regionId);
                    if (regionAnterior >= 0) regionesAfectadas.add(regionAnterior);
                    regionesAfectadas.add(regionId);
                    huboCambios = true;
                    const material = puntos[regionId - 1].materialId;
                    if (materialAnterior !== MATERIALES.NADA) {
                        celdas._escribirIndice(indice, material);
                        celdas.activarIndice(indice);
                    } else if (regionId > 0 && this._hayLugarParaParticula(regionId)) {
                        celdas._escribirIndice(indice, material);
                        celdas.activarIndice(indice);
                    }
                    continue;
                }

                if (this._inicializarCeldaNueva(indice, regionId, regionesAfectadas)) huboCambios = true;
            }
        }

        if (huboCambios) celdas.marcarModificado();
        if (regionesParaInicializar.size > 0 && regionesAfectadas.size > 0) {
            celdas.limitarOcupacionPorRegion(regionesAfectadas, porcentaje);
        }
        regionesAgregadas.clear();
        this.versionCamaraInicializada = versionCamara;
        this.versionCeldasInicializadas = celdas.versionInicializacion;
    }

    // Inicializa el rectángulo de celdas [x0, x1) x [y0, y1) (se recorta a los límites del mundo).
    // Las celdas ya inicializadas no se tocan. Devuelve cuántas celdas nuevas se inicializaron.
    inicializarZona(x0, y0, x1, y1) {
        if (this.mundoVoronoi.puntos.length === 0) return 0;

        const celdas = this.celdas;
        x0 = Math.max(0, Math.floor(x0));
        y0 = Math.max(0, Math.floor(y0));
        x1 = Math.min(celdas.ancho, Math.ceil(x1));
        y1 = Math.min(celdas.alto, Math.ceil(y1));

        const regionesAfectadas = new Set();
        let nuevas = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const indice = celdas.indiceDe(x, y);
                if (celdas.estaInicializada(indice)) continue;

                const regionId = this.mundoVoronoi.indiceMasCercano(x, y) + 1;
                if (this._inicializarCeldaNueva(indice, regionId, regionesAfectadas)) nuevas++;
            }
        }

        if (nuevas > 0) celdas.marcarModificado();
        return nuevas;
    }

    // Inicializa una fila completa sin buscar el punto más cercano por separado para cada celda.
    inicializarFilaMundo(y, x0 = 0, x1 = this.celdas.ancho) {
        this._calcularRegionesDeFila(y);

        const celdas = this.celdas;
        const regiones = this.regionesFila;
        const afectadas = this.regionesAfectadasFila;
        afectadas.clear();
        x0 = Math.max(0, Math.floor(x0));
        x1 = Math.min(celdas.ancho, Math.ceil(x1));
        let nuevas = 0;

        for (let x = x0; x < x1; x++) {
            const indice = y * celdas.ancho + x;
            if (celdas.estaInicializada(indice)) continue;
            if (this._inicializarCeldaNueva(indice, regiones[x], afectadas)) nuevas++;
        }

        if (nuevas > 0) celdas.marcarModificado();
        return nuevas;
    }

    _calcularRegionesDeFila(y) {
        const puntos = this.mundoVoronoi.puntos;
        if (this.versionSemillas !== this.mundoVoronoi.version) {
            const orden = Array.from({ length: puntos.length }, (_, i) => i)
                .sort((a, b) => puntos[a].x - puntos[b].x);
            for (let i = 0; i < orden.length; i++) {
                const id = orden[i];
                this.sx[i] = puntos[id].x;
                this.sy[i] = puntos[id].y;
                this.sid[i] = id + 1;
            }
            this.cantidadSemillas = orden.length;
            this.versionSemillas = this.mundoVoronoi.version;
        }

        const n = this.cantidadSemillas;
        const { sx, sy, sid, g, v, z, regionesFila } = this;
        if (n === 0) {
            regionesFila.fill(0);
            return;
        }

        for (let i = 0; i < n; i++) {
            const dy = y - sy[i];
            g[i] = sx[i] * sx[i] + dy * dy;
        }

        let k = 0;
        v[0] = 0;
        z[0] = -Infinity;
        z[1] = Infinity;

        for (let q = 1; q < n; q++) {
            let s = 0;
            let descartar = false;
            while (true) {
                const p = v[k];
                const dq = 2 * (sx[q] - sx[p]);
                if (dq === 0) {
                    if (g[q] < g[p]) {
                        if (k === 0) {
                            v[0] = q;
                            descartar = true;
                            break;
                        }
                        k--;
                        continue;
                    }
                    descartar = true;
                    break;
                }

                s = (g[q] - g[p]) / dq;
                if (s <= z[k]) {
                    k--;
                    continue;
                }
                break;
            }

            if (descartar) {
                z[k + 1] = Infinity;
                continue;
            }

            k++;
            v[k] = q;
            z[k] = s;
            z[k + 1] = Infinity;
        }

        let segmento = 0;
        for (let x = 0; x < this.celdas.ancho; x++) {
            while (segmento < k && z[segmento + 1] <= x) segmento++;
            regionesFila[x] = sid[v[segmento]];
        }
    }

    // Una celda que nunca se había visto: se le asigna región y, con probabilidad `porcentaje`, material.
    _inicializarCeldaNueva(indice, regionId, regionesAfectadas) {
        const celdas = this.celdas;
        if (!celdas.inicializarIndice(indice, MATERIALES.NADA)) return false;

        celdas.fijarRegionIndice(indice, regionId);
        if (regionId === 0) return true;

        regionesAfectadas.add(regionId);
        if (this._hayLugarParaParticula(regionId) && Math.random() < this.porcentaje) {
            celdas._escribirIndice(indice, this.mundoVoronoi.puntos[regionId - 1].materialId);
            celdas.activarIndice(indice);
        }
        return true;
    }

    // La región todavía no llegó al porcentaje máximo de ocupación.
    _hayLugarParaParticula(regionId) {
        const celdas = this.celdas;
        return (celdas.particulasPorRegion.get(regionId) || 0)
            < Math.floor((celdas.celdasPorRegion.get(regionId) || 0) * this.porcentaje);
    }

}
