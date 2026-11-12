// Picar: lanza un rayo desde el jugador hasta el mouse y, mientras se mantiene el click,
// vacía por intervalos un disco alrededor de lo primero picable del trayecto.
// Lo picable es: el MURO entre dos regiones (si el rayo lo cruza) o el material de una celda.
// La dureza de cada material sale de la configuración; con dureza 0 (el agua) el material no se puede picar,
// y el aire (NADA) tampoco: el rayo los atraviesa y el disco no los toca.
// Abrir un muro convierte en "pasajes" sólo las celdas que tocan la línea del muro, no la región de al lado.
class Excavador {
    // Último apuntado (lo lee la vista para dibujar la mira). Se reutiliza: no se crean objetos por frame.
    objetivo = {
        hayImpacto: false, celdaX: 0, celdaY: 0, puntoX: 0, puntoY: 0,
        tipoImpacto: MATERIALES.NADA,
        apuntadoValido: false, origenPantallaX: 0, origenPantallaY: 0,
        finPantallaX: 0, finPantallaY: 0, rayoVisible: false
    };
    celdasExcavadas = 0;

    constructor(mundoCeldas, camara, regiones, config) {
        this.mundo = mundoCeldas;
        this.camara = camara;
        this.regiones = regiones;
        this.periodoBaseMs = 1000 / config.tasaHz;
        this.radio = config.radio;
        this.radioBarrera = config.radioBarrera;
        this.durezaBarrera = config.durezaBarrera;
        this.dureza = config.dureza;
        this.progresoMs = 0;

        // Se crea una sola vez (el DDA la llama por cada celda que recorre).
        this._esPicable = (x, y, previaX, previaY) =>
            this._tipoDeImpacto(x, y, previaX, previaY) !== MATERIALES.NADA;
    }

    actualizar(deltaMs, jugador, intencion) {
        this._apuntar(jugador, intencion);

        if (!intencion.picar || !this.objetivo.hayImpacto) {
            this.progresoMs = 0;
            return;
        }

        this.progresoMs += deltaMs;
        for (let mordiscos = 0; mordiscos < 3; mordiscos++) {
            const dureza = this._durezaDelObjetivo();
            const periodo = this.periodoBaseMs * dureza;
            if (dureza === 0 || this.progresoMs < periodo) return;

            this.progresoMs -= periodo;
            if (this.objetivo.tipoImpacto === MATERIALES.MURO) {
                if (!this._excavarBarrera(this.objetivo.celdaX, this.objetivo.celdaY)) {
                    this.progresoMs = 0;
                    return;
                }
            } else {
                this._excavarDisco(this.objetivo.celdaX, this.objetivo.celdaY, dureza);
            }
            this._apuntar(jugador, intencion);     // la celda ya no está: se apunta a la siguiente
            if (!this.objetivo.hayImpacto) {
                this.progresoMs = 0;
                return;
            }
        }
        this.progresoMs = 0;            // frame muy largo: se descarta el exceso en vez de acumular mordiscos
    }

    // Recorre con DDA desde el centro del jugador hasta la celda bajo el mouse, sin alcance fijo adicional.
    _apuntar(jugador, intencion) {
        const o = this.objetivo;
        o.apuntadoValido = intencion.mouseValido;
        o.rayoVisible = intencion.picar && intencion.mouseValido;
        o.origenPantallaX = this.camara.pantallaXDe(jugador.centroX);
        o.origenPantallaY = this.camara.pantallaYDe(jugador.centroY);
        o.finPantallaX = intencion.mouseX;
        o.finPantallaY = intencion.mouseY;
        if (!intencion.mouseValido) {
            o.hayImpacto = false;
            return;
        }

        const ox = jugador.centroX;
        const oy = jugador.centroY;
        const mouseMundoX = this.camara.mundoXDe(intencion.mouseX);
        const mouseMundoY = this.camara.mundoYDe(intencion.mouseY);
        const dx = mouseMundoX - ox;
        const dy = mouseMundoY - oy;
        const distancia = Math.hypot(dx, dy);
        o.puntoX = mouseMundoX;
        o.puntoY = mouseMundoY;
        if (distancia === 0) {
            o.hayImpacto = false;
            return;
        }

        const impacto = RayoDDA.lanzar(ox, oy, dx / distancia, dy / distancia, distancia, this._esPicable);
        if (impacto) {
            o.hayImpacto = true;
            o.celdaX = impacto.x;
            o.celdaY = impacto.y;
            o.tipoImpacto = this._tipoDeImpacto(impacto.x, impacto.y, impacto.previaX, impacto.previaY);
            o.puntoX = impacto.x + 0.5;
            o.puntoY = impacto.y + 0.5;
            o.finPantallaX = this.camara.pantallaXDe(o.puntoX);
            o.finPantallaY = this.camara.pantallaYDe(o.puntoY);
        } else {
            o.hayImpacto = false;
            o.tipoImpacto = MATERIALES.NADA;
        }
    }

    // Abre el muro: las celdas del disco que tocan un muro cerrado pasan a ser pasajes. Sólo se abre la LÍNEA del muro;
    // el aire del otro lado sigue siendo aire y se camina con normalidad (no hay que "picarlo").
    _excavarBarrera(cx, cy) {
        let huboCambios = false;
        const r = this.radioBarrera;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;

                const x = cx + dx;
                const y = cy + dy;
                if (!this.mundo.estaDentro(x, y) || !this.regiones.celdaTocaMuro(x, y)) continue;
                if (this.mundo.abrirPasaje(x, y)) {
                    this.celdasExcavadas++;
                    huboCambios = true;
                }
            }
        }
        return huboCambios;
    }

    // Vacía las celdas del disco que no sean más duras que la que se está picando
    // (picar arena no rompe de rebote la piedra de al lado). No atraviesa muros cerrados: sólo se excavan las celdas
    // de la misma región que la picada, o los pasajes ya abiertos.
    _excavarDisco(cx, cy, durezaMaxima) {
        const mundo = this.mundo;
        const regionObjetivo = this.regiones.regionEn(cx, cy);
        const r = this.radio;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r + 1) continue;

                const x = cx + dx, y = cy + dy;
                if (!mundo.estaDentro(x, y)) continue;

                const indice = mundo.indiceDe(x, y);
                const dureza = this.dureza[mundo.estado[indice]] || 0;
                if (dureza === 0 || dureza > durezaMaxima) continue;
                if (this.regiones.regionEnIndice(indice, x, y) !== regionObjetivo && !mundo.esPasaje(indice)) continue;
                if (mundo.excavar(x, y)) this.celdasExcavadas++;
            }
        }
    }

    // Qué se golpea al entrar a la celda (x, y) viniendo de (previaX, previaY):
    //   - MURO si hay un muro cerrado entre las dos (se golpea antes que cualquier cosa que haya del otro lado);
    //   - el material de la celda, si se puede picar (dureza > 0);
    //   - NADA si no hay nada que picar (aire, agua, fuera del mundo).
    _tipoDeImpacto(x, y, previaX, previaY) {
        const mundo = this.mundo;
        if (!mundo.estaDentro(x, y)) return MATERIALES.NADA;
        if ((x !== previaX || y !== previaY) && this.regiones.hayMuroEntre(previaX, previaY, x, y)) return MATERIALES.MURO;

        const material = mundo.estado[mundo.indiceDe(x, y)];
        return this.dureza[material] > 0 ? material : MATERIALES.NADA;
    }

    _durezaDelObjetivo() {
        const tipo = this.objetivo.tipoImpacto;
        return tipo === MATERIALES.MURO ? this.durezaBarrera : (this.dureza[tipo] || 0);
    }
}
