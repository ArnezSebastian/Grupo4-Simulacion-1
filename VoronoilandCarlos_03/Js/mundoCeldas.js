// Grilla lógica del mundo (falling sand): 1 byte por celda con el id del material.
// 5000x5000 = 25 MB. No hay buffer de color a escala del mundo: el color se calcula sólo para lo visible.
class MundoCeldas {
    constructor(ancho, alto) {
        this.ancho = ancho;
        this.alto = alto;
        this.estado = new Uint8Array(ancho * alto);
        this.inicializadas = new Uint8Array(Math.ceil(ancho * alto / 8));
        this.particulas = 0;    // celdas ocupadas (material distinto de NADA)
        this.version = 0;       // dirty flag para el rasterizador
        this.versionInicializacion = 0;
        this.tamanioBloque = 32;
        this.bloquesAncho = Math.ceil(ancho / this.tamanioBloque);
        this.bloquesActivos = new Set();
        this.regionesPorBloque = new Map();
        this.bloquesPorRegion = new Map();
        this.conteosRegionPorBloque = new Map();
        this.celdasPorRegion = new Map();
        this.particulasPorRegion = new Map();
    }

    estaDentro(x, y) {
        return x >= 0 && x < this.ancho && y >= 0 && y < this.alto;
    }

    indiceDe(x, y) {
        return y * this.ancho + x;
    }

    // Fuera del mundo se comporta como muro (decisión provisoria, la lógica del falling sand puede cambiarla).
    obtener(x, y) {
        return this.estaDentro(x, y) ? this.estado[this.indiceDe(x, y)] : MATERIALES.MURO;
    }

    fijar(x, y, material) {
        if (!this.estaDentro(x, y)) return false;

        const i = this.indiceDe(x, y);
        this.marcarIndiceInicializado(i);
        this._escribirIndice(i, material);
        if (material === MATERIALES.ARENA || material === MATERIALES.AGUA || material === MATERIALES.PIEDRA) {
            this.activarIndice(i);
        }
        this.version++;
        return true;
    }

    marcarIndiceInicializado(indice) {
        const byte = indice >> 3;
        const mascara = 1 << (indice & 7);
        this.inicializadas[byte] |= mascara;
    }

    fijarRegionIndice(indice, regionId) {
        const x = indice % this.ancho;
        const y = Math.floor(indice / this.ancho);
        const bx = Math.floor(x / this.tamanioBloque);
        const by = Math.floor(y / this.tamanioBloque);
        const bloqueId = by * this.bloquesAncho + bx;
        let regiones = this.regionesPorBloque.get(bloqueId);
        if (!regiones) {
            regiones = new Uint16Array(this.tamanioBloque * this.tamanioBloque);
            this.regionesPorBloque.set(bloqueId, regiones);
        }

        const indiceLocal = (y % this.tamanioBloque) * this.tamanioBloque + (x % this.tamanioBloque);
        const anteriorCodificada = regiones[indiceLocal];
        const nuevaCodificada = regionId + 1;
        if (anteriorCodificada === nuevaCodificada) return;

        if (anteriorCodificada !== 0) {
            const anteriorRegion = anteriorCodificada - 1;
            this._actualizarConteoRegionEnBloque(bloqueId, anteriorRegion, -1);
            this._incrementarConteo(this.celdasPorRegion, anteriorRegion, -1);
            if (this.estado[indice] !== MATERIALES.NADA) {
                this._incrementarConteo(this.particulasPorRegion, anteriorRegion, -1);
            }
        }

        regiones[indiceLocal] = regionId + 1;
        this._actualizarConteoRegionEnBloque(bloqueId, regionId, 1);
        this._incrementarConteo(this.celdasPorRegion, regionId, 1);
        if (this.estado[indice] !== MATERIALES.NADA) {
            this._incrementarConteo(this.particulasPorRegion, regionId, 1);
        }
    }

    _actualizarConteoRegionEnBloque(bloqueId, regionId, cambio) {
        let conteos = this.conteosRegionPorBloque.get(bloqueId);
        if (!conteos) {
            conteos = new Map();
            this.conteosRegionPorBloque.set(bloqueId, conteos);
        }

        const nuevo = (conteos.get(regionId) || 0) + cambio;
        if (nuevo > 0) {
            conteos.set(regionId, nuevo);
            let bloques = this.bloquesPorRegion.get(regionId);
            if (!bloques) {
                bloques = new Set();
                this.bloquesPorRegion.set(regionId, bloques);
            }
            bloques.add(bloqueId);
            return;
        }

        conteos.delete(regionId);
        const bloques = this.bloquesPorRegion.get(regionId);
        if (bloques) {
            bloques.delete(bloqueId);
            if (bloques.size === 0) this.bloquesPorRegion.delete(regionId);
        }
        if (conteos.size === 0) this.conteosRegionPorBloque.delete(bloqueId);
    }

    _incrementarConteo(conteos, regionId, cambio) {
        const nuevo = (conteos.get(regionId) || 0) + cambio;
        if (nuevo > 0) conteos.set(regionId, nuevo);
        else conteos.delete(regionId);
    }

    obtenerRegionIndice(indice) {
        const x = indice % this.ancho;
        const y = Math.floor(indice / this.ancho);
        const bx = Math.floor(x / this.tamanioBloque);
        const by = Math.floor(y / this.tamanioBloque);
        const regiones = this.regionesPorBloque.get(by * this.bloquesAncho + bx);
        if (!regiones) return -1;

        const indiceLocal = (y % this.tamanioBloque) * this.tamanioBloque + (x % this.tamanioBloque);
        const codificado = regiones[indiceLocal];
        return codificado === 0 ? -1 : codificado - 1;
    }

    inicializarIndice(indice, material) {
        const byte = indice >> 3;
        const mascara = 1 << (indice & 7);
        if (this.inicializadas[byte] & mascara) return false;

        this.marcarIndiceInicializado(indice);
        this._escribirIndice(indice, material);
        if (material === MATERIALES.ARENA || material === MATERIALES.AGUA || material === MATERIALES.PIEDRA) {
            this.activarIndice(indice);
        }
        return true;
    }

    _escribirIndice(indice, material) {
        const anterior = this.estado[indice];
        if (anterior === material) return false;

        if (anterior === MATERIALES.NADA) this.particulas++;
        else if (material === MATERIALES.NADA) this.particulas--;

        const regionId = this.obtenerRegionIndice(indice);
        if (regionId >= 0) {
            if (anterior === MATERIALES.NADA && material !== MATERIALES.NADA) {
                this._incrementarConteo(this.particulasPorRegion, regionId, 1);
            } else if (anterior !== MATERIALES.NADA && material === MATERIALES.NADA) {
                this._incrementarConteo(this.particulasPorRegion, regionId, -1);
            }
        }

        this.estado[indice] = material;
        return true;
    }

    limitarOcupacionPorRegion(regionIds, porcentaje) {
        let huboCambios = false;
        for (const regionId of regionIds) {
            const maximo = Math.floor((this.celdasPorRegion.get(regionId) || 0) * porcentaje);
            let exceso = (this.particulasPorRegion.get(regionId) || 0) - maximo;
            if (exceso <= 0) continue;

            const bloques = this.bloquesPorRegion.get(regionId);
            if (!bloques) continue;

            for (const bloqueId of bloques) {
                const regiones = this.regionesPorBloque.get(bloqueId);
                if (!regiones) continue;

                const bx = bloqueId % this.bloquesAncho;
                const by = Math.floor(bloqueId / this.bloquesAncho);
                const x0 = bx * this.tamanioBloque;
                const y0 = by * this.tamanioBloque;
                const anchoBloque = Math.min(this.tamanioBloque, this.ancho - x0);
                const altoBloque = Math.min(this.tamanioBloque, this.alto - y0);
                const inicio = Math.floor(Math.random() * (this.tamanioBloque * this.tamanioBloque));

                for (let paso = 0; paso < anchoBloque * altoBloque && exceso > 0; paso++) {
                    const indiceLocal = (inicio + paso) % (this.tamanioBloque * this.tamanioBloque);
                    const xLocal = indiceLocal % this.tamanioBloque;
                    const yLocal = Math.floor(indiceLocal / this.tamanioBloque);
                    if (xLocal >= anchoBloque || yLocal >= altoBloque) continue;
                    if (regiones[indiceLocal] !== regionId + 1) continue;

                    const indice = (y0 + yLocal) * this.ancho + x0 + xLocal;
                    if (this.estado[indice] === MATERIALES.NADA) continue;

                    this._escribirIndice(indice, MATERIALES.NADA);
                    exceso--;
                    huboCambios = true;
                }

                if (exceso === 0) break;
            }
        }

        if (huboCambios) this.marcarModificado();
        return huboCambios;
    }

    activarIndice(indice) {
        const x = indice % this.ancho;
        const y = Math.floor(indice / this.ancho);
        const bx = Math.floor(x / this.tamanioBloque);
        const by = Math.floor(y / this.tamanioBloque);
        this.bloquesActivos.add(by * this.bloquesAncho + bx);
    }

    extraerBloquesActivos(maxCeldas) {
        const maxBloques = Math.max(1, Math.floor(maxCeldas / (this.tamanioBloque * this.tamanioBloque)));
        const bloques = [];
        for (const id of this.bloquesActivos) {
            bloques.push(id);
            this.bloquesActivos.delete(id);
            if (bloques.length >= maxBloques) break;
        }
        return bloques;
    }

    // Si la lógica de simulación escribe directo en this.estado (más rápido), debe llamar a esto
    // al terminar el paso para que se vuelva a dibujar.
    marcarModificado() {
        this.version++;
    }

    vaciar() {
        this.estado.fill(MATERIALES.NADA);
        this.inicializadas.fill(0);
        this.bloquesActivos.clear();
        this.regionesPorBloque.clear();
        this.bloquesPorRegion.clear();
        this.conteosRegionPorBloque.clear();
        this.celdasPorRegion.clear();
        this.particulasPorRegion.clear();
        this.particulas = 0;
        this.versionInicializacion++;
        this.version++;
    }
}
