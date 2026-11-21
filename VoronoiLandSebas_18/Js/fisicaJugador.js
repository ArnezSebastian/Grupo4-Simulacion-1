// Física del jugador: gravedad, salto y choque de una CAJA contra las celdas del mundo.
//   - Paso fijo (60 Hz por defecto): el comportamiento no depende de los FPS.
//   - Se mueve un eje por vez y de a menos de una celda, así no atraviesa nada aunque caiga rápido.
//   - Es sólido todo lo que no sea NADA, AGUA ni LAVA y lo que está fuera del mundo. El aire (NADA) NUNCA es
//     sólido, esté en la región que esté.
//   - Los muros de Voronoi son la LÍNEA entre dos celdas de regiones distintas: se frena al intentar cruzarla
//     (igual que la arena), salvo por un pasaje que se haya abierto picando. Pasado el muro se camina normal.
//   - Sube escalones de 1-2 celdas sin saltar y lo saca de materiales sólidos que lo empotren.
class FisicaJugador {
    static EPS = 1e-6;  // tolerancia para que una arista exactamente sobre una línea de la grilla no cuente como choque

    constructor(mundoCeldas, regiones, config) {
        this.mundo = mundoCeldas;
        this.regiones = regiones;
        this.cfg = config;
        this.paso = 1 / config.pasoFisicaHz;
        this.acumulador = 0;
        this.alSaltar = null;       // callback opcional: se llama cada vez que el jugador salta desde el suelo
        this.alAterrizar = null;    // callback opcional: se llama una vez al tocar suelo tras estar en el aire
        this.jugadorEnAire = false;
        this.ultimoContactoMinX = -1;
        this.ultimoContactoMaxX = -1;
        this.ultimoContactoMinY = -1;
        this.ultimoContactoMaxY = -1;
    }

    // Se llama una vez por frame con el tiempo real transcurrido; internamente hace 0, 1 o varios pasos fijos.
    actualizar(jugador, intencion, deltaSeg) {
        this.acumulador = Math.min(this.acumulador + deltaSeg, 0.1);   // tope: tras una pausa no hay "ráfaga" de pasos

        while (this.acumulador >= this.paso) {
            this._paso(jugador, intencion, this.paso);
            this.acumulador -= this.paso;
        }
    }

    reiniciar() {
        this.acumulador = 0;
        this.jugadorEnAire = false;
        this.ultimoContactoMinX = -1;
        this.ultimoContactoMaxX = -1;
        this.ultimoContactoMinY = -1;
        this.ultimoContactoMaxY = -1;
    }

    materialBajoPies(j) {
        const fila = Math.floor(j.y + j.alto + FisicaJugador.EPS);
        if (fila < 0 || fila >= this.mundo.alto) return MATERIALES.NADA;

        const colIni = Math.floor(j.x + FisicaJugador.EPS);
        const colFin = Math.ceil(j.x + j.ancho - FisicaJugador.EPS) - 1;
        const centro = Math.floor(j.centroX);
        const materialCentro = this._materialSolido(centro, fila);
        if (materialCentro !== MATERIALES.NADA) return materialCentro;

        for (let x = colIni; x <= colFin; x++) {
            const material = this._materialSolido(x, fila);
            if (material !== MATERIALES.NADA) return material;
        }
        return MATERIALES.NADA;
    }

    romperCristalBajoPies(j) {
        const fila = Math.floor(j.y + j.alto + FisicaJugador.EPS);
        if (fila < 0 || fila >= this.mundo.alto) return 0;

        const colIni = Math.max(0, Math.floor(j.x + FisicaJugador.EPS));
        const colFin = Math.min(
            this.mundo.ancho - 1,
            Math.ceil(j.x + j.ancho - FisicaJugador.EPS) - 1
        );
        let cristalesRotos = 0;

        for (let x = colIni; x <= colFin; x++) {
            const indice = this.mundo.indiceDe(x, fila);
            if (this.mundo.estado[indice] === MATERIALES.CRISTAL && this.mundo.excavar(x, fila)) {
                cristalesRotos++;
            }
        }

        return cristalesRotos;
    }

    encontrarSuperficieSeguraArriba(x, y, jugador) {
        const colIni = Math.floor(x + FisicaJugador.EPS);
        const colFin = Math.ceil(x + jugador.ancho - FisicaJugador.EPS) - 1;
        const primeraFila = Math.min(this.mundo.alto - 1, Math.floor(y + jugador.alto));

        for (let fila = primeraFila; fila >= 0; fila--) {
            let haySoporte = false;
            for (let col = colIni; col <= colFin; col++) {
                if (this._materialSolido(col, fila) !== MATERIALES.NADA) {
                    haySoporte = true;
                    break;
                }
            }
            if (!haySoporte) continue;

            const ySeguro = fila - jugador.alto;
            if (!this._cajaChoca(x, ySeguro, jugador)) return ySeguro;
        }

        return null;
    }

    // --- Un paso de simulación ---

    _paso(j, intencion, dt) {
        const c = this.cfg;

        this._resolverEmpotramiento(j);
        const materialCentro = this.mundo.obtener(Math.floor(j.centroX), Math.floor(j.centroY));
        j.enLiquido = materialCentro === MATERIALES.AGUA || materialCentro === MATERIALES.LAVA;

        // Horizontal: se acelera hacia la velocidad deseada (también para frenar).
        const factorLiquido = j.enLiquido ? c.liquido.factorVelocidad : 1;
        const objetivoVx = intencion.mover * c.velocidad * factorLiquido;
        const aceleracion = j.enSuelo ? c.aceleracionSuelo : c.aceleracionAire;
        j.vx = this._acercar(j.vx, objetivoVx, aceleracion * dt);

        // En los líquidos se "nada" hacia arriba mientras se mantenga Espacio.
        if (intencion.saltar) {
            if (j.enSuelo && !j.enLiquido) {
                j.vy = -c.velocidadSalto;
                j.enSuelo = false;
                if (this.alSaltar) this.alSaltar();
            } else if (j.enLiquido && j.vy > -c.liquido.velocidadNado) {
                j.vy = -c.liquido.velocidadNado;
            }
        } else if (j.vy < -c.velocidadCorteSalto && !j.enLiquido) {
            j.vy = -c.velocidadCorteSalto;      // soltó Espacio: salto más corto
        }

        // Vertical:
        const gravedad = c.gravedad * (j.enLiquido ? c.liquido.factorGravedad : 1);
        const caidaMax = j.enLiquido ? c.liquido.velocidadCaidaMax : c.velocidadCaidaMax;
        j.vy = Math.min(j.vy + gravedad * dt, caidaMax);

        this._moverEjeX(j, j.vx * dt);
        this._moverEjeY(j, j.vy * dt);

        if (!j.enSuelo) {
            this.jugadorEnAire = true;
        } else if (this.jugadorEnAire) {
            this.jugadorEnAire = false;
            if (this.alAterrizar) this.alAterrizar(this.materialBajoPies(j));
        }

        this._activarMaterialesEnContacto(j);
    }

    _activarMaterialesEnContacto(j) {
        const minX = Math.floor(j.x + FisicaJugador.EPS) - 1;
        const maxX = Math.ceil(j.x + j.ancho - FisicaJugador.EPS);
        const minY = Math.floor(j.y + FisicaJugador.EPS) - 1;
        const maxY = Math.ceil(j.y + j.alto - FisicaJugador.EPS);
        if (minX === this.ultimoContactoMinX && maxX === this.ultimoContactoMaxX
            && minY === this.ultimoContactoMinY && maxY === this.ultimoContactoMaxY) return;

        this.ultimoContactoMinX = minX;
        this.ultimoContactoMaxX = maxX;
        this.ultimoContactoMinY = minY;
        this.ultimoContactoMaxY = maxY;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (!this.mundo.estaDentro(x, y)) continue;

                const indice = this.mundo.indiceDe(x, y);
                const material = this.mundo.estado[indice];
                if (material !== MATERIALES.NADA && material !== MATERIALES.MURO
                    && material !== MATERIALES.CRISTAL) {
                    this.mundo.activarIndice(indice);
                }
            }
        }
    }

    _acercar(valor, objetivo, maxCambio) {
        if (valor < objetivo) return Math.min(valor + maxCambio, objetivo);
        if (valor > objetivo) return Math.max(valor - maxCambio, objetivo);
        return valor;
    }

    // --- Movimiento por ejes ---

    _moverEjeX(j, dx) {
        let restante = dx;
        while (Math.abs(restante) > 1e-9) {
            const paso = Math.abs(restante) > 1 ? Math.sign(restante) : restante;
            const nuevoX = j.x + paso;

            const filaIni = Math.floor(j.y + FisicaJugador.EPS);
            const filaFin = Math.ceil(j.y + j.alto - FisicaJugador.EPS) - 1;
            const colIni = Math.floor(j.x + FisicaJugador.EPS);
            const colFin = Math.ceil(j.x + j.ancho - FisicaJugador.EPS) - 1;
            const nuevaColIni = Math.floor(nuevoX + FisicaJugador.EPS);
            const nuevaColFin = Math.ceil(nuevoX + j.ancho - FisicaJugador.EPS) - 1;

            // Sólo hay que mirar las columnas que la caja ocupa de más al moverse:
            let bloqueado = false;
            if (paso > 0 && nuevaColFin > colFin) {
                bloqueado = this._hayBloqueo(colFin + 1, filaIni, nuevaColFin, filaFin)
                    || this._hayMuroEntreColumnas(colFin, colFin + 1, filaIni, filaFin);
            } else if (paso < 0 && nuevaColIni < colIni) {
                bloqueado = this._hayBloqueo(nuevaColIni, filaIni, colIni - 1, filaFin)
                    || this._hayMuroEntreColumnas(colIni, colIni - 1, filaIni, filaFin);
            }

            if (!bloqueado) {
                j.x = nuevoX;
                restante -= paso;
                continue;
            }

            if (j.enSuelo && this._subirEscalon(j, nuevoX)) {
                restante -= paso;
                continue;
            }

            // Choque: la caja queda pegada a la pared.
            j.x = paso > 0 ? (colFin + 1) - j.ancho : colIni;
            j.vx = 0;
            return;
        }
    }

    _moverEjeY(j, dy) {
        j.enSuelo = false;
        let restante = dy;
        while (Math.abs(restante) > 1e-9) {
            const paso = Math.abs(restante) > 1 ? Math.sign(restante) : restante;
            const nuevoY = j.y + paso;

            const colIni = Math.floor(j.x + FisicaJugador.EPS);
            const colFin = Math.ceil(j.x + j.ancho - FisicaJugador.EPS) - 1;
            const filaIni = Math.floor(j.y + FisicaJugador.EPS);
            const filaFin = Math.ceil(j.y + j.alto - FisicaJugador.EPS) - 1;
            const nuevaFilaIni = Math.floor(nuevoY + FisicaJugador.EPS);
            const nuevaFilaFin = Math.ceil(nuevoY + j.alto - FisicaJugador.EPS) - 1;

            let bloqueado = false;
            if (paso > 0 && nuevaFilaFin > filaFin) {
                bloqueado = this._hayBloqueo(colIni, filaFin + 1, colFin, nuevaFilaFin)
                    || this._hayMuroEntreFilas(filaFin, filaFin + 1, colIni, colFin);
            } else if (paso < 0 && nuevaFilaIni < filaIni) {
                bloqueado = this._hayBloqueo(colIni, nuevaFilaIni, colFin, filaIni - 1)
                    || this._hayMuroEntreFilas(filaIni, filaIni - 1, colIni, colFin);
            }

            if (!bloqueado) {
                j.y = nuevoY;
                restante -= paso;
                continue;
            }

            if (paso > 0) {
                j.y = (filaFin + 1) - j.alto;
                j.enSuelo = true;
            } else {
                j.y = filaIni;
            }
            j.vy = 0;
            return;
        }
    }

    // Si chocó de costado contra un desnivel chico, se sube encima en vez de frenar en seco.
    _subirEscalon(j, nuevoX) {
        for (let alto = 1; alto <= this.cfg.escalonMaximo; alto++) {
            if (this._cajaChoca(nuevoX, j.y - alto, j)) continue;
            if (this._escalonCruzaMuro(j, nuevoX, alto)) continue;
            j.x = nuevoX;
            j.y -= alto;
            return true;
        }
        return false;
    }

    // Busca una posición libre cercana cuando un material sólido empotra al jugador.
    _resolverEmpotramiento(j) {
        if (!this._cajaChoca(j.x, j.y, j)) return;

        const eps = FisicaJugador.EPS;
        const colIni = Math.floor(j.x + eps);
        const colFin = Math.ceil(j.x + j.ancho - eps) - 1;
        const filaIni = Math.floor(j.y + eps);
        const filaFin = Math.ceil(j.y + j.alto - eps) - 1;
        let puedeMoverDerecha = true;
        let puedeMoverIzquierda = true;

        for (let k = 1; k <= this.cfg.empujeMaximo; k++) {
            if (puedeMoverDerecha) {
                puedeMoverDerecha = !this._hayMuroEntreColumnas(
                    colFin + k - 1,
                    colFin + k,
                    filaIni,
                    filaFin
                );
                if (puedeMoverDerecha && !this._cajaChoca(j.x + k, j.y, j)) {
                    j.x += k;
                    j.vx = 0;
                    return;
                }
            }
            if (puedeMoverIzquierda) {
                puedeMoverIzquierda = !this._hayMuroEntreColumnas(
                    colIni - k + 1,
                    colIni - k,
                    filaIni,
                    filaFin
                );
                if (puedeMoverIzquierda && !this._cajaChoca(j.x - k, j.y, j)) {
                    j.x -= k;
                    j.vx = 0;
                    return;
                }
            }
        }

        let puedeMoverArriba = true;
        let puedeMoverAbajo = true;
        for (let k = 1; k <= this.cfg.empujeMaximo; k++) {
            if (puedeMoverArriba) {
                puedeMoverArriba = !this._hayMuroEntreFilas(
                    filaIni - k + 1,
                    filaIni - k,
                    colIni,
                    colFin
                );
                if (puedeMoverArriba && !this._cajaChoca(j.x, j.y - k, j)) {
                    j.y -= k;
                    j.vy = 0;
                    return;
                }
            }
            if (puedeMoverAbajo) {
                puedeMoverAbajo = !this._hayMuroEntreFilas(
                    filaFin + k - 1,
                    filaFin + k,
                    colIni,
                    colFin
                );
                if (puedeMoverAbajo && !this._cajaChoca(j.x, j.y + k, j)) {
                    j.y += k;
                    j.vy = 0;
                    return;
                }
            }
        }
    }

    // --- Consultas a la grilla ---

    _cajaChoca(x, y, j) {
        const eps = FisicaJugador.EPS;
        return this._hayBloqueo(
            Math.floor(x + eps), Math.floor(y + eps),
            Math.ceil(x + j.ancho - eps) - 1, Math.ceil(y + j.alto - eps) - 1
        );
    }

    // ¿Alguna celda del rectángulo [c0..c1] x [f0..f1] (inclusive) es sólida?
    _hayBloqueo(c0, f0, c1, f1) {
        for (let f = f0; f <= f1; f++) {
            for (let c = c0; c <= c1; c++) {
                if (this._esSolida(c, f)) return true;
            }
        }
        return false;
    }

    // Sólido = material duro o fuera del mundo. El aire y los líquidos no lo son, sea cual sea su región.
    _esSolida(x, y) {
        const mundo = this.mundo;
        if (!mundo.estaDentro(x, y)) return true;

        const material = mundo.estado[mundo.indiceDe(x, y)];
        return material !== MATERIALES.NADA
            && material !== MATERIALES.AGUA
            && material !== MATERIALES.LAVA
            && material !== MATERIALES.VAPOR;
    }

    _materialSolido(x, y) {
        if (!this.mundo.estaDentro(x, y)) return MATERIALES.NADA;

        const material = this.mundo.estado[this.mundo.indiceDe(x, y)];
        return material !== MATERIALES.AGUA && material !== MATERIALES.LAVA
            && material !== MATERIALES.VAPOR && material !== MATERIALES.NADA
            ? material
            : MATERIALES.NADA;
    }

    // ¿Hay un muro cerrado entre la columna `desde` y la contigua `hasta`, en alguna fila de [f0..f1]?
    _hayMuroEntreColumnas(desde, hasta, f0, f1) {
        for (let f = f0; f <= f1; f++) {
            if (this.regiones.hayMuroEntre(desde, f, hasta, f)) return true;
        }
        return false;
    }

    // Lo mismo entre la fila `desde` y la contigua `hasta`, en alguna columna de [c0..c1].
    _hayMuroEntreFilas(desde, hasta, c0, c1) {
        for (let c = c0; c <= c1; c++) {
            if (this.regiones.hayMuroEntre(c, desde, c, hasta)) return true;
        }
        return false;
    }

    // Subir un escalón son dos movimientos (arriba y al costado): ninguno puede cruzar un muro cerrado.
    _escalonCruzaMuro(j, nuevoX, alto) {
        const eps = FisicaJugador.EPS;
        const colIni = Math.floor(j.x + eps);
        const colFin = Math.ceil(j.x + j.ancho - eps) - 1;
        const filaIni = Math.floor(j.y + eps);
        const filaFin = Math.ceil(j.y + j.alto - eps) - 1;

        for (let k = 1; k <= alto; k++) {
            if (this._hayMuroEntreFilas(filaIni - k + 1, filaIni - k, colIni, colFin)) return true;
        }

        const nuevaColIni = Math.floor(nuevoX + eps);
        const nuevaColFin = Math.ceil(nuevoX + j.ancho - eps) - 1;
        if (nuevaColFin > colFin) return this._hayMuroEntreColumnas(colFin, colFin + 1, filaIni - alto, filaFin - alto);
        if (nuevaColIni < colIni) return this._hayMuroEntreColumnas(colIni, colIni - 1, filaIni - alto, filaFin - alto);
        return false;
    }
}
