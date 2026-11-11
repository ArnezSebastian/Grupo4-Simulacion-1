// Actualiza únicamente bloques con materiales que pueden moverse.
class SimuladorMateriales {
    constructor(mundoCeldas, regiones, config) {
        this.mundo = mundoCeldas;
        this.regiones = regiones;               // RegionesDelMundo (consulta compartida con el jugador)
        this.caidaMaximaCeldas = Math.max(1, Math.floor(config.materiales.caidaMaximaCeldas));
        this.alcanceHorizontalAgua = Math.max(1, Math.floor(config.materiales.alcanceHorizontalAgua || 1));
        this.probabilidadRodarPiedra = config.materiales.probabilidadRodarPiedra;
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

    actualizar(rectangulo = null) {
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
        const cantidad = rectangulo
            ? mundo.extraerLoteEnRectangulo(
                this.maxBloquesPorPaso,
                lote,
                rectangulo.x0,
                rectangulo.y0,
                rectangulo.x1,
                rectangulo.y1
            )
            : mundo.extraerLote(this.maxBloquesPorPaso, lote);
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
        this.mediciones.enCola = rectangulo
            ? mundo.contarBloquesActivosEnRectangulo(
                rectangulo.x0,
                rectangulo.y0,
                rectangulo.x1,
                rectangulo.y1
            )
            : mundo.cantidadBloquesActivos;
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

    // Un muro (región distinta) frena a las partículas, salvo que alguna de las dos celdas sea un pasaje abierto.
    // (x, y) es la celda de la que se viene y (destinoX, destinoY) la vecina a la que se quiere ir.
    _muroBloquea(x, y, destinoX, destinoY, regionOrigen) {
        if (this._regionDe(destinoX, destinoY) === regionOrigen) return false;

        const mundo = this.mundo;
        if (mundo.cantidadPasajes === 0) return true;
        return !(mundo.esPasaje(y * mundo.ancho + x) || mundo.esPasaje(destinoY * mundo.ancho + destinoX));
    }

    _procesarCelda(x, y) {
        const origen = y * this.mundo.ancho + x;
        const material = this.mundo.estado[origen];
        if (material === MATERIALES.NADA || material === MATERIALES.MURO) return;
        const regionOrigen = this._regionDe(x, y);

        if (this._caer(x, y, material, regionOrigen)) return;

        if (material === MATERIALES.PIEDRA) {
            if (Math.random() < this.probabilidadRodarPiedra) {
                const direccion = Math.random() < 0.5 ? -1 : 1;
                if (this._moverA(x, y, x + direccion, y + 1, material, false, regionOrigen)) return;
                this._moverA(x, y, x - direccion, y + 1, material, false, regionOrigen);
            }
            return;
        }

        const direccion = Math.random() < 0.5 ? -1 : 1;
        if (this._moverA(x, y, x + direccion, y + 1, material, material !== MATERIALES.AGUA, regionOrigen)) return;
        if (this._moverA(x, y, x - direccion, y + 1, material, material !== MATERIALES.AGUA, regionOrigen)) return;

        if (material === MATERIALES.AGUA) {
            if (this._intentarMoverAguaHorizontal(x, y, direccion, regionOrigen)) return;
            this._intentarMoverAguaHorizontal(x, y, -direccion, regionOrigen);
        }
    }

    _caer(x, y, material, regionOrigen) {
        let destinoY = y;
        for (let pasos = 1; pasos <= this.caidaMaximaCeldas; pasos++) {
            const siguienteY = y + pasos;
            if (!this.mundo.estaDentro(x, siguienteY)
                || this._muroBloquea(x, siguienteY - 1, x, siguienteY, regionOrigen)) break;

            const materialDestino = this.mundo.estado[siguienteY * this.mundo.ancho + x];
            if (materialDestino === MATERIALES.NADA) {
                destinoY = siguienteY;
                continue;
            }

            // Conserva el desplazamiento de agua que ya tenía arena y piedra al tocarla directamente.
            if (pasos === 1 && material !== MATERIALES.AGUA && materialDestino === MATERIALES.AGUA) {
                return this._moverA(x, y, x, siguienteY, material, true, regionOrigen);
            }
            break;
        }

        if (destinoY === y) return false;
        return this._intercambiar(x, y, x, destinoY, material, false);   // el recorrido ya se validó celda por celda
    }

    _intentarMoverAguaHorizontal(x, y, direccion, regionOrigen) {
        const mundo = this.mundo;
        let origenX = x;
        let destinoX = x + direccion;
        if (!mundo.estaDentro(destinoX, y) || this._muroBloquea(origenX, y, destinoX, y, regionOrigen)) return false;

        let material = mundo.estado[y * mundo.ancho + destinoX];
        if (material !== MATERIALES.NADA && material !== MATERIALES.AGUA) return false;

        if (material === MATERIALES.AGUA) {
            while (mundo.estaDentro(destinoX, y)
                && mundo.estado[y * mundo.ancho + destinoX] === MATERIALES.AGUA
                && !this._muroBloquea(origenX, y, destinoX, y, regionOrigen)) {
                origenX = destinoX;
                destinoX += direccion;
            }
        }

        if (!mundo.estaDentro(destinoX, y)
            || this._muroBloquea(origenX, y, destinoX, y, regionOrigen)
            || mundo.estado[y * mundo.ancho + destinoX] !== MATERIALES.NADA) return false;

        let ultimoDestinoX = destinoX;
        for (let paso = 1; paso < this.alcanceHorizontalAgua; paso++) {
            const siguienteX = ultimoDestinoX + direccion;
            if (!mundo.estaDentro(siguienteX, y)
                || this._muroBloquea(ultimoDestinoX, y, siguienteX, y, regionOrigen)
                || mundo.estado[y * mundo.ancho + siguienteX] !== MATERIALES.NADA) break;
            ultimoDestinoX = siguienteX;
        }

        return this._moverA(origenX, y, ultimoDestinoX, y, MATERIALES.AGUA, false, regionOrigen);
    }

    _moverA(x, y, destinoX, destinoY, material, desplazarAgua, regionOrigen) {
        if (!this.mundo.estaDentro(destinoX, destinoY)) return false;
        if (this._muroBloquea(x, y, destinoX, destinoY, regionOrigen)) return false;

        return this._intercambiar(x, y, destinoX, destinoY, material, desplazarAgua);
    }

    // El destino ya se verificó (dentro del mundo y sin muro de por medio): sólo falta que esté libre.
    _intercambiar(x, y, destinoX, destinoY, material, desplazarAgua) {
        const origen = y * this.mundo.ancho + x;
        const destino = destinoY * this.mundo.ancho + destinoX;
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
