// Actualiza únicamente bloques con materiales que pueden moverse.
class SimuladorMateriales {
    constructor(mundoCeldas, mundoVoronoi, config) {
        this.mundo = mundoCeldas;
        this.mundoVoronoi = mundoVoronoi;
        this.maxCeldasPorPaso = config.materiales.celdasPorPaso;
        this.modificado = false;
    }

    actualizar() {
        this.modificado = false;
        const bloques = this.mundo.extraerBloquesActivos(this.maxCeldasPorPaso);
        if (bloques.length === 0) return;

        const tam = this.mundo.tamanioBloque;
        const anchoBloques = this.mundo.bloquesAncho;
        const estado = this.mundo.estado;
        const ancho = this.mundo.ancho;
        const alto = this.mundo.alto;
        const izquierdaADerecha = Math.random() < 0.5;

        for (const id of bloques) {
            const bx = id % anchoBloques;
            const by = Math.floor(id / anchoBloques);
            const x0 = bx * tam;
            const x1 = Math.min(x0 + tam, ancho);
            const y0 = by * tam;
            const y1 = Math.min(y0 + tam, alto);

            for (let y = y1 - 1; y >= y0; y--) {
                if (izquierdaADerecha) {
                    for (let x = x0; x < x1; x++) this._procesarCelda(x, y);
                } else {
                    for (let x = x1 - 1; x >= x0; x--) this._procesarCelda(x, y);
                }
            }
        }

        if (this.modificado) this.mundo.marcarModificado();
    }

    _procesarCelda(x, y) {
        const origen = y * this.mundo.ancho + x;
        const material = this.mundo.estado[origen];
        if (material === MATERIALES.NADA || material === MATERIALES.MURO) return;
        const regionOrigen = this._obtenerRegion(origen, x, y);

        if (this._moverA(x, y, x, y + 1, material, true, regionOrigen)) return;
        if (material === MATERIALES.PIEDRA) return;

        const direccion = Math.random() < 0.5 ? -1 : 1;
        if (this._moverA(x, y, x + direccion, y + 1, material, material !== MATERIALES.AGUA, regionOrigen)) return;
        if (this._moverA(x, y, x - direccion, y + 1, material, material !== MATERIALES.AGUA, regionOrigen)) return;

        if (material === MATERIALES.AGUA) {
            if (this._intentarMoverAguaHorizontal(x, y, direccion, regionOrigen)) return;
            this._intentarMoverAguaHorizontal(x, y, -direccion, regionOrigen);
        }
    }

    _intentarMoverAguaHorizontal(x, y, direccion, regionOrigen) {
        let destinoX = x + direccion;
        if (!this.mundo.estaDentro(destinoX, y)) return false;

        const ancho = this.mundo.ancho;
        let destinoIndice = y * ancho + destinoX;
        if (this._obtenerRegion(destinoIndice, destinoX, y) !== regionOrigen) return false;

        const materialVecino = this.mundo.estado[destinoIndice];
        if (materialVecino === MATERIALES.NADA) {
            if (Math.random() < 0.5) {
                this._moverA(x, y, destinoX, y, MATERIALES.AGUA, false, regionOrigen);
            }
            return true;
        }

        if (materialVecino !== MATERIALES.AGUA) return false;

        while (this.mundo.estaDentro(destinoX, y)) {
            destinoIndice = y * ancho + destinoX;
            if (this._obtenerRegion(destinoIndice, destinoX, y) !== regionOrigen
                || this.mundo.estado[destinoIndice] !== MATERIALES.AGUA) break;
            destinoX += direccion;
        }

        if (!this.mundo.estaDentro(destinoX, y)) return false;
        destinoIndice = y * ancho + destinoX;
        if (this._obtenerRegion(destinoIndice, destinoX, y) !== regionOrigen
            || this.mundo.estado[destinoIndice] !== MATERIALES.NADA) return false;

        if (Math.random() < 0.5) {
            const origenX = destinoX - direccion;
            this._moverA(origenX, y, destinoX, y, MATERIALES.AGUA, false, regionOrigen);
        }
        return true;
    }

    _moverA(x, y, destinoX, destinoY, material, desplazarAgua, regionOrigen) {
        if (!this.mundo.estaDentro(destinoX, destinoY)) return false;

        const origen = y * this.mundo.ancho + x;
        const destino = destinoY * this.mundo.ancho + destinoX;
        if (this._obtenerRegion(destino, destinoX, destinoY) !== regionOrigen) return false;

        const materialDestino = this.mundo.estado[destino];

        if (materialDestino !== MATERIALES.NADA
            && !(desplazarAgua && materialDestino === MATERIALES.AGUA && material !== MATERIALES.AGUA)) {
            return false;
        }

        this.mundo.marcarIndiceInicializado(destino);
        this.mundo._escribirIndice(origen, materialDestino);
        this.mundo._escribirIndice(destino, material);
        this.modificado = true;

        this._activarVecindad(x, y);
        this._activarVecindad(destinoX, destinoY);
        return true;
    }

    _obtenerRegion(indice, x, y) {
        let regionId = this.mundo.obtenerRegionIndice(indice);
        if (regionId >= 0) return regionId;

        const puntoId = this.mundoVoronoi.indiceMasCercano(x, y);
        regionId = puntoId + 1;
        this.mundo.fijarRegionIndice(indice, regionId);
        return regionId;
    }

    _activarVecindad(x, y) {
        for (let dy = -1; dy <= 0; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (this.mundo.estaDentro(nx, ny)) {
                    this.mundo.activarIndice(ny * this.mundo.ancho + nx);
                }
            }
        }
    }
}
