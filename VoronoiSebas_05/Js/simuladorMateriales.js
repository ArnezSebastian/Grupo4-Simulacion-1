// Actualiza únicamente bloques con materiales que pueden moverse.
class SimuladorMateriales {
    constructor(mundoCeldas, regiones, config) {
        this.mundo = mundoCeldas;
        this.regiones = regiones;               // RegionesDelMundo (consulta compartida con el jugador)
        this.maxBloquesPorPaso = Math.max(1, Math.floor(config.materiales.celdasPorPaso / (mundoCeldas.tamanioBloque ** 2)));
        this.presupuestoMs = config.materiales.presupuestoMs;
        this.modificado = false;

        // Bloque que se está procesando: su arreglo de regiones se lee UNA vez por bloque (no una vez por celda).
        this._bloqueId = -1;
        this._regionesBloque = null;
        this._lote = [];                        // ids del lote del frame (se reutiliza: sin basura)

        // ms: promedio móvil del costo de actualizar(); bloques: procesados en el último frame;
        // enCola: bloques activos que quedaron esperando (por el tope de bloques o de tiempo).
        this.mediciones = { ms: 0, bloques: 0, enCola: 0 };
    }

    actualizar() {
        const t0 = performance.now();
        this.modificado = false;

        const mundo = this.mundo;
        const tam = mundo.tamanioBloque;
        const anchoBloques = mundo.bloquesAncho;
        const ancho = mundo.ancho;
        const alto = mundo.alto;
        const izquierdaADerecha = Math.random() < 0.5;

        // Sólo se procesan los bloques que ya estaban en la cola al empezar: los que se activen ahora esperan al próximo frame.
        const lote = this._lote;
        const cantidad = mundo.extraerLote(this.maxBloquesPorPaso, lote);
        let procesados = 0;
        while (procesados < cantidad) {
            const id = lote[procesados++];

            this._bloqueId = id;
            this._regionesBloque = mundo.regionesPorBloque[id];

            const x0 = (id % anchoBloques) * tam;
            const x1 = Math.min(x0 + tam, ancho);
            const y0 = Math.floor(id / anchoBloques) * tam;
            const y1 = Math.min(y0 + tam, alto);

            for (let y = y1 - 1; y >= y0; y--) {
                if (izquierdaADerecha) {
                    for (let x = x0; x < x1; x++) this._procesarCelda(x, y);
                } else {
                    for (let x = x1 - 1; x >= x0; x--) this._procesarCelda(x, y);
                }
            }

            // Presupuesto de tiempo: lo que no entró queda al principio de la cola para el próximo frame.
            if (performance.now() - t0 >= this.presupuestoMs) break;
        }

        if (procesados < cantidad) mundo.devolverAlFrente(lote, procesados, cantidad);

        if (this.modificado) mundo.marcarModificado();
        this.mediciones.bloques = procesados;
        this.mediciones.enCola = mundo.cantidadBloquesActivos;
        this._registrarTiempo(performance.now() - t0);
    }

    _registrarTiempo(ms) {
        this.mediciones.ms += (ms - this.mediciones.ms) * 0.1;
    }

    // Región de la celda (x, y). Si está en el bloque que se procesa se lee directo de su arreglo.
    _regionDe(x, y) {
        const regiones = this._regionesBloque;
        if (regiones !== null && ((y >> 5) * this.mundo.bloquesAncho + (x >> 5)) === this._bloqueId) {
            const codificado = regiones[((y & 31) << 5) | (x & 31)];
            if (codificado !== 0) return codificado - 1;
        }
        return this.regiones.regionEn(x, y);
    }

    _procesarCelda(x, y) {
        const origen = y * this.mundo.ancho + x;
        const material = this.mundo.estado[origen];
        if (material === MATERIALES.NADA || material === MATERIALES.MURO) return;
        const regionOrigen = this._regionDe(x, y);

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
        if (this._regionDe(destinoX, y) !== regionOrigen) return false;

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
            if (this._regionDe(destinoX, y) !== regionOrigen
                || this.mundo.estado[destinoIndice] !== MATERIALES.AGUA) break;
            destinoX += direccion;
        }

        if (!this.mundo.estaDentro(destinoX, y)) return false;
        destinoIndice = y * ancho + destinoX;
        if (this._regionDe(destinoX, y) !== regionOrigen
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
        if (this._regionDe(destinoX, destinoY) !== regionOrigen) return false;

        const materialDestino = this.mundo.estado[destino];

        if (materialDestino !== MATERIALES.NADA
            && !(desplazarAgua && materialDestino === MATERIALES.AGUA && material !== MATERIALES.AGUA)) {
            return false;
        }

        this.mundo.marcarIndiceInicializado(destino);
        this.mundo._escribirIndice(origen, materialDestino);
        this.mundo._escribirIndice(destino, material);
        this.modificado = true;

        this.mundo.activarVecindad(x, y);
        this.mundo.activarVecindad(destinoX, destinoY);
        return true;
    }
}
