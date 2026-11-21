// Modelo de los puntos (semillas) de Voronoi: crear, borrar, mover y consultar.
// No conoce el canvas, la cámara ni los píxeles: sólo datos del mundo.
class MundoVoronoi {
    puntos = [];
    version = 0;                // dirty flag: sube con cualquier cambio de puntos
    regionesPendientesInicializacion = new Set();
    regionesAgregadasRecientemente = new Set();

    constructor(mundoAncho, mundoAlto, configPuntos, configMateriales = {}) {
        this.mundoAncho = mundoAncho;
        this.mundoAlto = mundoAlto;
        this.config = configPuntos;
        this.configMateriales = configMateriales;
        this.superficiesRegiones = null;
        this.versionSuperficies = -1;
        this.indicesOrdenadosPorY = new Int32Array(configPuntos.max);
        this.idsEnvolventeVertical = new Int32Array(configPuntos.max);
        this.iniciosEnvolventeVertical = new Float64Array(configPuntos.max);
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
        const porcentajeMinimo = this.configMateriales.porcentajeLlenadoMin ?? 0.25;
        const porcentajeMaximo = this.configMateriales.porcentajeLlenadoMax ?? 0.5;
        const probabilidadLava = limitarValor(this.configMateriales.probabilidadLava ?? 0, 0, 1);
        const sorteoMaterial = Math.random();
        const materialId = sorteoMaterial < probabilidadLava
            ? MATERIALES.LAVA
            : MATERIALES.ARENA + Math.floor(
                ((sorteoMaterial - probabilidadLava) / (1 - probabilidadLava))
                * (MATERIALES.TIERRA - MATERIALES.ARENA + 1)
            );
        return {
            x: x,
            y: y,
            color: [
                elegirValorAleatorioEntre(colorMin, colorMax),
                elegirValorAleatorioEntre(colorMin, colorMax),
                elegirValorAleatorioEntre(colorMin, colorMax)
            ],
            materialId,
            porcentajeTerreno: porcentajeMinimo + Math.random() * (porcentajeMaximo - porcentajeMinimo)
        };
    }

    alturaSuperficie(regionId, x) {
        this._precalcularSuperficies();
        if (regionId <= 0 || regionId > this.puntos.length) return this.mundoAlto;
        return this.superficiesRegiones[regionId * this.mundoAncho + x];
    }

    _precalcularSuperficies() {
        if (this.versionSuperficies === this.version) return;

        const ancho = this.mundoAncho;
        const alto = this.mundoAlto;
        const cantidad = this.puntos.length;
        const superficies = new Float32Array((cantidad + 1) * ancho);
        superficies.fill(alto);
        this.superficiesRegiones = superficies;

        if (cantidad === 0) {
            this.versionSuperficies = this.version;
            return;
        }

        const ordenados = this.indicesOrdenadosPorY;
        const ids = this.idsEnvolventeVertical;
        const inicios = this.iniciosEnvolventeVertical;
        for (let i = 0; i < cantidad; i++) ordenados[i] = i;
        ordenados.subarray(0, cantidad).sort((a, b) => {
            const diferencia = this.puntos[a].y - this.puntos[b].y;
            return diferencia || a - b;
        });

        for (let x = 0; x < ancho; x++) {
            let cantidadEnvolvente = 0;
            let inicioGrupo = 0;

            while (inicioGrupo < cantidad) {
                const ySemilla = this.puntos[ordenados[inicioGrupo]].y;
                let finGrupo = inicioGrupo + 1;
                let idMasCercano = ordenados[inicioGrupo];
                let distanciaHorizontalMinima = (x - this.puntos[idMasCercano].x) ** 2;
                while (finGrupo < cantidad && this.puntos[ordenados[finGrupo]].y === ySemilla) {
                    const id = ordenados[finGrupo];
                    const distanciaHorizontal = (x - this.puntos[id].x) ** 2;
                    if (distanciaHorizontal < distanciaHorizontalMinima
                        || (distanciaHorizontal === distanciaHorizontalMinima && id < idMasCercano)) {
                        idMasCercano = id;
                        distanciaHorizontalMinima = distanciaHorizontal;
                    }
                    finGrupo++;
                }

                const aNuevo = distanciaHorizontalMinima + ySemilla * ySemilla;
                const bNuevo = -2 * ySemilla;
                let inicioInterseccion = -Infinity;
                while (cantidadEnvolvente > 0) {
                    const ultimoId = ids[cantidadEnvolvente - 1];
                    const ultimoPunto = this.puntos[ultimoId];
                    const aUltimo = (x - ultimoPunto.x) ** 2 + ultimoPunto.y * ultimoPunto.y;
                    const bUltimo = -2 * ultimoPunto.y;
                    inicioInterseccion = (aNuevo - aUltimo) / (bUltimo - bNuevo);
                    if (inicioInterseccion > inicios[cantidadEnvolvente - 1]) break;
                    cantidadEnvolvente--;
                }

                if (cantidadEnvolvente === 0) inicioInterseccion = -Infinity;
                ids[cantidadEnvolvente] = idMasCercano;
                inicios[cantidadEnvolvente] = inicioInterseccion;
                cantidadEnvolvente++;
                inicioGrupo = finGrupo;
            }

            for (let i = 0; i < cantidadEnvolvente; i++) {
                const inicioY = Math.max(0, Math.ceil(inicios[i]));
                const finY = Math.min(alto, i + 1 < cantidadEnvolvente
                    ? Math.ceil(inicios[i + 1])
                    : alto);
                if (finY <= inicioY) continue;

                const id = ids[i];
                const indiceSuperficie = (id + 1) * ancho + x;
                const punto = this.puntos[id];
                const proporcion = punto.porcentajeTerreno
                    ?? this._porcentajeTerrenoPredeterminado();
                const alturaRegion = finY - inicioY;
                const proporcionMinima = this.configMateriales.porcentajeLlenadoMin ?? 0.25;
                const proporcionMaxima = this.configMateriales.porcentajeLlenadoMax ?? 0.5;
                const minimoMaterial = Math.ceil(alturaRegion * proporcionMinima);
                const maximoMaterial = Math.floor(alturaRegion * proporcionMaxima);
                const minimoFilasMaterial = minimoMaterial <= maximoMaterial ? minimoMaterial : 0;
                const maximoFilasMaterial = Math.max(minimoFilasMaterial, maximoMaterial);
                const amplitud = Math.min(
                    this.configMateriales.variacionSuperficie ?? 40,
                    alturaRegion * 0.1
                );
                const variacion = amplitud * (
                    0.62 * Math.sin(x * 0.0043)
                    + 0.26 * Math.sin(x * 0.013 + 1.7)
                    + 0.12 * Math.sin(x * 0.033 + 0.8)
                );
                const filasMaterial = limitarValor(
                    alturaRegion * proporcion,
                    minimoFilasMaterial,
                    maximoFilasMaterial
                );
                superficies[indiceSuperficie] = limitarValor(
                    finY - filasMaterial + variacion,
                    finY - maximoFilasMaterial,
                    finY - minimoFilasMaterial
                );
            }
        }

        this.versionSuperficies = this.version;
    }

    _porcentajeTerrenoPredeterminado() {
        const minimo = this.configMateriales.porcentajeLlenadoMin ?? 0.25;
        const maximo = this.configMateriales.porcentajeLlenadoMax ?? 0.5;
        return (minimo + maximo) / 2;
    }
}
