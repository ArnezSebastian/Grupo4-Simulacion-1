// Física del jugador: gravedad, salto y choque de una CAJA contra las celdas del mundo.
//   - Paso fijo (60 Hz por defecto): el comportamiento no depende de los FPS.
//   - Se mueve un eje por vez y de a menos de una celda, así no atraviesa nada aunque caiga rápido.
//   - Es sólido todo lo que no sea NADA ni AGUA, lo que está fuera del mundo y toda celda de OTRA región
//     de Voronoi (igual que la arena, el jugador no cruza los bordes).
//   - Sube escalones de 1-2 celdas sin saltar y, si le cae arena encima, se lo empuja hacia arriba.
class FisicaJugador {
    static EPS = 1e-6;  // tolerancia para que una arista exactamente sobre una línea de la grilla no cuente como choque

    constructor(mundoCeldas, regiones, config) {
        this.mundo = mundoCeldas;
        this.regiones = regiones;
        this.cfg = config;
        this.paso = 1 / config.pasoFisicaHz;
        this.acumulador = 0;
        this.regionActual = 0;
    }

    // Se llama una vez por frame con el tiempo real transcurrido; internamente hace 0, 1 o varios pasos fijos.
    actualizar(jugador, intencion, deltaSeg) {
        this.acumulador = Math.min(this.acumulador + deltaSeg, 0.1);   // tope: tras una pausa no hay "ráfaga" de pasos
        this.regionActual = jugador.regionId;

        while (this.acumulador >= this.paso) {
            this._paso(jugador, intencion, this.paso);
            this.acumulador -= this.paso;
        }
    }

    reiniciar() {
        this.acumulador = 0;
    }

    // --- Un paso de simulación ---

    _paso(j, intencion, dt) {
        const c = this.cfg;

        this._resolverEmpotramiento(j);
        j.enAgua = this.mundo.obtener(Math.floor(j.centroX), Math.floor(j.centroY)) === MATERIALES.AGUA;

        // Horizontal: se acelera hacia la velocidad deseada (también para frenar).
        const factorAgua = j.enAgua ? c.agua.factorVelocidad : 1;
        const objetivoVx = intencion.mover * c.velocidad * factorAgua;
        const aceleracion = j.enSuelo ? c.aceleracionSuelo : c.aceleracionAire;
        j.vx = this._acercar(j.vx, objetivoVx, aceleracion * dt);

        // Salto (en el agua se "nada" hacia arriba mientras se mantenga Espacio).
        if (intencion.saltar) {
            if (j.enSuelo && !j.enAgua) {
                j.vy = -c.velocidadSalto;
                j.enSuelo = false;
            } else if (j.enAgua && j.vy > -c.agua.velocidadNado) {
                j.vy = -c.agua.velocidadNado;
            }
        } else if (j.vy < -c.velocidadCorteSalto && !j.enAgua) {
            j.vy = -c.velocidadCorteSalto;      // soltó Espacio: salto más corto
        }

        // Vertical:
        const gravedad = c.gravedad * (j.enAgua ? c.agua.factorGravedad : 1);
        const caidaMax = j.enAgua ? c.agua.velocidadCaidaMax : c.velocidadCaidaMax;
        j.vy = Math.min(j.vy + gravedad * dt, caidaMax);

        this._moverEjeX(j, j.vx * dt);
        this._moverEjeY(j, j.vy * dt);
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
                bloqueado = this._hayBloqueo(colFin + 1, filaIni, nuevaColFin, filaFin);
            } else if (paso < 0 && nuevaColIni < colIni) {
                bloqueado = this._hayBloqueo(nuevaColIni, filaIni, colIni - 1, filaFin);
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
                bloqueado = this._hayBloqueo(colIni, filaFin + 1, colFin, nuevaFilaFin);
            } else if (paso < 0 && nuevaFilaIni < filaIni) {
                bloqueado = this._hayBloqueo(colIni, nuevaFilaIni, colFin, filaIni - 1);
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
            j.x = nuevoX;
            j.y -= alto;
            return true;
        }
        return false;
    }

    // Arena que cayó dentro de la caja: se sube al jugador hasta la primera posición libre.
    _resolverEmpotramiento(j) {
        if (!this._cajaChoca(j.x, j.y, j)) return;

        for (let k = 1; k <= this.cfg.empujeMaximo; k++) {
            if (this._cajaChoca(j.x, j.y - k, j)) continue;
            j.y -= k;
            if (j.vy > 0) j.vy = 0;
            return;
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

    _esSolida(x, y) {
        const mundo = this.mundo;
        if (!mundo.estaDentro(x, y)) return true;

        const indice = mundo.indiceDe(x, y);
        const material = mundo.estado[indice];
        if (material !== MATERIALES.NADA && material !== MATERIALES.AGUA) return true;

        return this.regiones.regionEnIndice(indice, x, y) !== this.regionActual;
    }
}
