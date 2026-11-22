// Actualiza únicamente bloques con materiales que pueden moverse.
class SimuladorMateriales {
    static DESPLAZAMIENTOS_VAPOR = new Int8Array([
        0, -1, -1, -1, 1, -1, -1, 0,
        1, 0, 0, 1, -1, 1, 1, 1
    ]);

    constructor(mundoCeldas, regiones, config, inicializador) {
        this.mundo = mundoCeldas;
        this.regiones = regiones;               // RegionesDelMundo (consulta compartida con el jugador)
        this.inicializador = inicializador;
        this.caidaMaximaCeldas = Math.max(1, Math.floor(config.materiales.caidaMaximaCeldas));
        this.probabilidadCaidaTierra = Math.min(1, Math.max(0, config.materiales.probabilidadCaidaTierra ?? 0.02));
        this.probabilidadCaidaDiagonalTierra = Math.min(
            1,
            Math.max(0, config.materiales.probabilidadCaidaDiagonalTierra ?? 0.005)
        );
        this.probabilidadFlujoHorizontalAgua = Math.min(1, Math.max(0, config.materiales.probabilidadFlujoHorizontalAgua ?? 1));
        this.alcanceFlujoHorizontalAgua = Math.max(1, Math.floor(config.materiales.alcanceFlujoHorizontalAgua ?? 6));
        this.probabilidadFlujoHorizontalLava = Math.min(1, Math.max(0, config.materiales.probabilidadFlujoHorizontalLava ?? 0.55));
        this.alcanceFlujoHorizontalLava = Math.max(1, Math.floor(config.materiales.alcanceFlujoHorizontalLava ?? 3));
        this.probabilidadMovimientoVapor = Math.min(
            1,
            Math.max(0, config.materiales.probabilidadMovimientoVapor ?? 0.5)
        );
        this.probabilidadMovimientoBurbuja = Math.min(
            1,
            Math.max(0, config.materiales.probabilidadMovimientoBurbuja ?? 0.75)
        );
        this.probabilidadMovimientoBurbujaLava = Math.min(
            1,
            Math.max(0, config.materiales.probabilidadMovimientoBurbujaLava ?? 0.65)
        );
        this.probabilidadDisipacionVapor = Math.min(1, Math.max(0, config.materiales.probabilidadDisipacionVapor ?? 0.01));
        this.pixelesVaporPorPixelAgua = Math.max(1, Math.floor(config.materiales.pixelesVaporPorPixelAgua ?? 4));
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
        this.mediciones = {
            ms: 0, ultimoFrameMs: 0, bloques: 0, enCola: 0,
            celdasVisitadas: 0, celdasActivas: 0, movimientos: 0
        };
    }

    actualizar(rectangulo = null) {
        const t0 = performance.now();
        this.modificado = false;
        this.mediciones.celdasVisitadas = 0;
        this.mediciones.celdasActivas = 0;
        this.mediciones.movimientos = 0;

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

            if (mundo.procesamientoFinoActivo) {
                this._procesarCeldasActivas(id, x0, x1, y0, y1, izquierdaADerecha);
            } else {
                for (let y = y1 - 1; y >= y0; y--) {
                    if (izquierdaADerecha) {
                        for (let x = x0; x < x1; x++) this._procesarCelda(x, y);
                    } else {
                        for (let x = x1 - 1; x >= x0; x--) this._procesarCelda(x, y);
                    }
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

    _procesarCeldasActivas(bloqueId, x0, x1, y0, y1, izquierdaADerecha) {
        for (let y = y1 - 1; y >= y0; y--) {
            let activas = this.mundo.extraerCeldasActivasPorFila(bloqueId, y & 31);
            while (activas !== 0) {
                const bit = izquierdaADerecha
                    ? 31 - Math.clz32(activas & -activas)
                    : 31 - Math.clz32(activas);
                activas = (activas & ~(1 << bit)) >>> 0;
                const x = x0 + bit;
                if (x >= x1) continue;
                this._procesarCelda(x, y);
            }
        }
    }

    _registrarTiempo(ms) {
        this.mediciones.ultimoFrameMs = ms;
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

    _asegurarCeldaInicializada(x, y) {
        const indice = this.mundo.indiceDe(x, y);
        if (!this.mundo.estaInicializada(indice)) {
            // Una celda no explorada puede formar parte del terreno; no debe parecer aire al caer sobre ella.
            this.inicializador.inicializarZona(x, y, x + 1, y + 1);
        }
    }

    _procesarCelda(x, y) {
        this.mediciones.celdasVisitadas++;
        const origen = y * this.mundo.ancho + x;
        const material = this.mundo.estado[origen];
        if (material === MATERIALES.NADA || material === MATERIALES.MURO) return;
        this.mediciones.celdasActivas++;
        const regionOrigen = this._regionDe(x, y);

        if (material === MATERIALES.TIERRA) {
            if (Math.random() < this.probabilidadCaidaTierra
                && this._moverA(x, y, x, y + 1, material, false, regionOrigen)) return;
            if (Math.random() >= this.probabilidadCaidaDiagonalTierra) return;

            const direccion = Math.random() < 0.5 ? -1 : 1;
            if (!this._moverA(x, y, x + direccion, y + 1, material, false, regionOrigen)) {
                this._moverA(x, y, x - direccion, y + 1, material, false, regionOrigen);
            }
            return;
        }

        if (this._interactuarMateriales(x, y, material, regionOrigen)) return;
        if (material === MATERIALES.VAPOR) {
            this._procesarVapor(x, y, regionOrigen);
            return;
        }
        if (material === MATERIALES.BURBUJA_AGUA) {
            this._procesarBurbuja(x, y, regionOrigen, MATERIALES.AGUA, material, this.probabilidadMovimientoBurbuja);
            return;
        }
        if (material === MATERIALES.BURBUJA_LAVA) {
            this._procesarBurbuja(
                x, y, regionOrigen, MATERIALES.LAVA, material, this.probabilidadMovimientoBurbujaLava
            );
            return;
        }
        if (material === MATERIALES.CRISTAL) return;

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
        const desplazarAgua = material !== MATERIALES.AGUA && material !== MATERIALES.LAVA;
        if (this._moverA(x, y, x + direccion, y + 1, material, desplazarAgua, regionOrigen)) return;
        if (this._moverA(x, y, x - direccion, y + 1, material, desplazarAgua, regionOrigen)) return;

        if (material === MATERIALES.AGUA || material === MATERIALES.LAVA) {
            const probabilidad = material === MATERIALES.AGUA
                ? this.probabilidadFlujoHorizontalAgua
                : this.probabilidadFlujoHorizontalLava;
            if (Math.random() >= probabilidad) return;
            if (this._intentarMoverLiquidoHorizontal(x, y, direccion, regionOrigen, material)) return;
            this._intentarMoverLiquidoHorizontal(x, y, -direccion, regionOrigen, material);
        }
    }

    _interactuarMateriales(x, y, material, regionOrigen) {
        if (material !== MATERIALES.LAVA && material !== MATERIALES.AGUA
            && material !== MATERIALES.ARENA) return false;

        const mundo = this.mundo;
        for (let direccion = 0; direccion < 4; direccion++) {
            const destinoX = x + (direccion === 1 ? 1 : direccion === 3 ? -1 : 0);
            const destinoY = y + (direccion === 0 ? -1 : direccion === 2 ? 1 : 0);
            if (!mundo.estaDentro(destinoX, destinoY)) continue;

            this._asegurarCeldaInicializada(destinoX, destinoY);
            if (this._muroBloquea(x, y, destinoX, destinoY, regionOrigen)) continue;

            const indiceOrigen = y * mundo.ancho + x;
            const indiceDestino = destinoY * mundo.ancho + destinoX;
            const materialDestino = mundo.estado[indiceDestino];
            let productoOrigen = material;
            let productoDestino = materialDestino;

            if (material === MATERIALES.LAVA && materialDestino === MATERIALES.AGUA) {
                productoOrigen = MATERIALES.ROCA;
                productoDestino = MATERIALES.VAPOR;
            } else if (material === MATERIALES.AGUA && materialDestino === MATERIALES.LAVA) {
                productoOrigen = MATERIALES.VAPOR;
                productoDestino = MATERIALES.ROCA;
            } else if (material === MATERIALES.LAVA && materialDestino === MATERIALES.ARENA) {
                productoDestino = MATERIALES.CRISTAL;
            } else if (material === MATERIALES.ARENA && materialDestino === MATERIALES.LAVA) {
                productoOrigen = MATERIALES.CRISTAL;
            } else {
                continue;
            }

            mundo._escribirIndice(indiceOrigen, productoOrigen);
            mundo._escribirIndice(indiceDestino, productoDestino);
            if (productoOrigen === MATERIALES.VAPOR || productoDestino === MATERIALES.VAPOR) {
                const vaporX = productoOrigen === MATERIALES.VAPOR ? x : destinoX;
                const vaporY = productoOrigen === MATERIALES.VAPOR ? y : destinoY;
                const regionVapor = this._regionDe(vaporX, vaporY);
                this._expandirVapor(vaporX, vaporY, regionVapor);
            }
            mundo.activarVecindad(x, y);
            mundo.activarVecindad(destinoX, destinoY);
            this.modificado = true;
            return true;
        }

        return false;
    }

    _expandirVapor(x, y, regionVapor) {
        const mundo = this.mundo;
        const extrasNecesarios = this.pixelesVaporPorPixelAgua - 1;
        let extrasCreados = 0;

        for (let direccion = 0; direccion < 8 && extrasCreados < extrasNecesarios; direccion++) {
            const destinoX = x + SimuladorMateriales.DESPLAZAMIENTOS_VAPOR[direccion * 2];
            const destinoY = y + SimuladorMateriales.DESPLAZAMIENTOS_VAPOR[direccion * 2 + 1];
            if (!mundo.estaDentro(destinoX, destinoY)) continue;

            this._asegurarCeldaInicializada(destinoX, destinoY);
            if (mundo.estado[destinoY * mundo.ancho + destinoX] !== MATERIALES.NADA) continue;
            if (this._muroBloquea(x, y, destinoX, destinoY, regionVapor)) continue;

            const indice = destinoY * mundo.ancho + destinoX;
            mundo.marcarIndiceInicializado(indice);
            mundo._escribirIndice(indice, MATERIALES.VAPOR);
            mundo.activarVecindad(destinoX, destinoY);
            extrasCreados++;
            this.modificado = true;
        }
    }

    _procesarVapor(x, y, regionOrigen) {
        const mundo = this.mundo;
        const indice = y * mundo.ancho + x;
        if (y > 0) {
            this._asegurarCeldaInicializada(x, y - 1);
            const materialSuperior = mundo.estado[indice - mundo.ancho];
            const tipoBurbuja = materialSuperior === MATERIALES.AGUA
                ? MATERIALES.BURBUJA_AGUA
                : materialSuperior === MATERIALES.LAVA
                    ? MATERIALES.BURBUJA_LAVA
                    : MATERIALES.NADA;
            if (tipoBurbuja !== MATERIALES.NADA) {
                mundo._escribirIndice(indice, tipoBurbuja);
                mundo.activarIndice(indice);
                this.modificado = true;
                return;
            }
        }

        if (y === 0 || Math.random() < this.probabilidadDisipacionVapor) {
            mundo._escribirIndice(indice, MATERIALES.NADA);
            mundo.activarVecindad(x, y);
            this.modificado = true;
            return;
        }

        if (Math.random() >= this.probabilidadMovimientoVapor) {
            mundo.activarIndice(indice);
            return;
        }

        const direccion = Math.random() < 0.5 ? -1 : 1;
        if (this._moverA(x, y, x, y - 1, MATERIALES.VAPOR, false, regionOrigen)) return;
        if (this._moverA(x, y, x + direccion, y - 1, MATERIALES.VAPOR, false, regionOrigen)) return;
        if (this._moverA(x, y, x - direccion, y - 1, MATERIALES.VAPOR, false, regionOrigen)) return;

        mundo.activarIndice(indice);
    }

    _procesarBurbuja(x, y, regionOrigen, liquido, materialBurbuja, probabilidadMovimiento) {
        const mundo = this.mundo;
        const indice = y * mundo.ancho + x;
        if (y === 0) {
            mundo._escribirIndice(indice, MATERIALES.NADA);
            mundo.activarVecindad(x, y);
            this.modificado = true;
            return;
        }

        if (Math.random() >= probabilidadMovimiento) {
            mundo.activarIndice(indice);
            return;
        }

        const direccion = Math.random() < 0.5 ? -1 : 1;
        const desplazamientos = [[0, -1], [direccion, -1], [-direccion, -1]];
        let hayAireSobreBurbuja = false;

        for (const [dx, dy] of desplazamientos) {
            const destinoX = x + dx;
            const destinoY = y + dy;
            if (!mundo.estaDentro(destinoX, destinoY)) continue;
            this._asegurarCeldaInicializada(destinoX, destinoY);
            if (this._muroBloquea(x, y, destinoX, destinoY, regionOrigen)) continue;

            const materialDestino = mundo.estado[destinoY * mundo.ancho + destinoX];
            if (materialDestino === liquido) {
                this._moverA(
                    x, y, destinoX, destinoY, materialBurbuja,
                    liquido === MATERIALES.AGUA,
                    regionOrigen,
                    liquido === MATERIALES.LAVA
                );
                return;
            }
            if (materialDestino === MATERIALES.NADA) hayAireSobreBurbuja = true;
        }

        if (hayAireSobreBurbuja) {
            mundo._escribirIndice(indice, MATERIALES.NADA);
            mundo.activarVecindad(x, y);
            this.modificado = true;
            return;
        }

        mundo.activarIndice(indice);
    }

    _caer(x, y, material, regionOrigen) {
        let destinoY = y;
        for (let pasos = 1; pasos <= this.caidaMaximaCeldas; pasos++) {
            const siguienteY = y + pasos;
            if (!this.mundo.estaDentro(x, siguienteY)) break;
            this._asegurarCeldaInicializada(x, siguienteY);
            if (this._muroBloquea(x, siguienteY - 1, x, siguienteY, regionOrigen)) break;

            const materialDestino = this.mundo.estado[siguienteY * this.mundo.ancho + x];
            if (materialDestino === MATERIALES.NADA) {
                destinoY = siguienteY;
                continue;
            }

            // Conserva el desplazamiento de agua que ya tenía arena y piedra al tocarla directamente.
            if (pasos === 1 && material !== MATERIALES.AGUA && material !== MATERIALES.LAVA
                && materialDestino === MATERIALES.AGUA) {
                return this._moverA(x, y, x, siguienteY, material, true, regionOrigen);
            }
            break;
        }

        if (destinoY === y) return false;
        return this._intercambiar(x, y, x, destinoY, material, false);   // el recorrido ya se validó celda por celda
    }

    _intentarMoverLiquidoHorizontal(x, y, direccion, regionOrigen, tipoLiquido) {
        const mundo = this.mundo;
        const alcance = tipoLiquido === MATERIALES.AGUA
            ? this.alcanceFlujoHorizontalAgua
            : this.alcanceFlujoHorizontalLava;
        let distancia = 0;

        for (let pasos = 1; pasos <= alcance; pasos++) {
            const anteriorX = x + direccion * (pasos - 1);
            const destinoX = x + direccion * pasos;
            if (!mundo.estaDentro(destinoX, y)) break;

            this._asegurarCeldaInicializada(destinoX, y);
            if (this._muroBloquea(anteriorX, y, destinoX, y, regionOrigen)) break;

            const materialDestino = mundo.estado[y * mundo.ancho + destinoX];
            if (materialDestino === MATERIALES.NADA) {
                distancia = pasos;
                break;
            }
            if (materialDestino !== tipoLiquido) return false;
        }

        if (distancia === 0) return false;
        if (distancia === 1) {
            return this._moverA(x, y, x + direccion, y, tipoLiquido, false, regionOrigen);
        }

        // Desplaza lateralmente una fila conectada del líquido para aliviar su acumulación en escalones.
        for (let pasos = distancia; pasos >= 1; pasos--) {
            const origenX = x + direccion * (pasos - 1);
            const destinoX = x + direccion * pasos;
            if (!this._intercambiar(origenX, y, destinoX, y, tipoLiquido, false)) return false;
        }
        return true;
    }

    _moverA(x, y, destinoX, destinoY, material, desplazarAgua, regionOrigen, desplazarLava = false) {
        if (!this.mundo.estaDentro(destinoX, destinoY)) return false;
        this._asegurarCeldaInicializada(destinoX, destinoY);
        if (this._muroBloquea(x, y, destinoX, destinoY, regionOrigen)) return false;

        return this._intercambiar(x, y, destinoX, destinoY, material, desplazarAgua, desplazarLava);
    }

    // El destino ya se verificó (dentro del mundo y sin muro de por medio): sólo falta que esté libre.
    _intercambiar(x, y, destinoX, destinoY, material, desplazarAgua, desplazarLava = false) {
        const origen = y * this.mundo.ancho + x;
        const destino = destinoY * this.mundo.ancho + destinoX;
        const materialDestino = this.mundo.estado[destino];

        if (materialDestino !== MATERIALES.NADA
            && !(desplazarAgua && materialDestino === MATERIALES.AGUA && material !== MATERIALES.AGUA)
            && !(desplazarLava && materialDestino === MATERIALES.LAVA && material !== MATERIALES.LAVA)) {
            return false;
        }

        this.mundo.marcarIndiceInicializado(destino);
        this.mundo._escribirIndice(origen, materialDestino);
        this.mundo._escribirIndice(destino, material);
        this.modificado = true;
        this.mediciones.movimientos++;

        this.mundo.activarVecindad(x, y);
        this.mundo.activarVecindad(destinoX, destinoY);
        return true;
    }
}