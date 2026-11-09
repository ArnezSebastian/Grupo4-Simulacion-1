// Picar: lanza un rayo desde el jugador hasta el mouse y, mientras se mantiene el click,
// vacía por intervalos un disco alrededor de la primera celda picable del trayecto.
// También abre las barreras de región; agua y piedra usan su dureza configurada.
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
        this._esPicable = (x, y) => this._durezaEn(x, y) > 0;
    }

    actualizar(deltaMs, jugador, intencion) {
        this._apuntar(jugador, intencion);

        if (!intencion.picar || !this.objetivo.hayImpacto) {
            this.progresoMs = 0;
            return;
        }

        this.progresoMs += deltaMs;
        for (let mordiscos = 0; mordiscos < 3; mordiscos++) {
            const dureza = this._durezaEn(this.objetivo.celdaX, this.objetivo.celdaY);
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
        this.regionOrigen = jugador.regionId;
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
            const regionId = this.regiones.regionEn(impacto.x, impacto.y);
            o.tipoImpacto = regionId !== this.regionOrigen
                ? MATERIALES.MURO
                : this.mundo.obtener(impacto.x, impacto.y);
            o.puntoX = impacto.x + 0.5;
            o.puntoY = impacto.y + 0.5;
            o.finPantallaX = this.camara.pantallaXDe(o.puntoX);
            o.finPantallaY = this.camara.pantallaYDe(o.puntoY);
        } else {
            o.hayImpacto = false;
            o.tipoImpacto = MATERIALES.NADA;
        }
    }

    _excavarBarrera(cx, cy) {
        let huboCambios = false;
        const r = this.radioBarrera;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;

                const x = cx + dx;
                const y = cy + dy;
                if (!this.mundo.estaDentro(x, y)) continue;
                if (this.regiones.regionEn(x, y) === this.regionOrigen) continue;
                if (this.mundo.reasignarRegion(x, y, this.regionOrigen)) {
                    this.celdasExcavadas++;
                    huboCambios = true;
                }
            }
        }
        return huboCambios;
    }

    // Vacía las celdas del disco que no sean más duras que la que se está picando
    // (picar arena no rompe de rebote la piedra de al lado).
    _excavarDisco(cx, cy, durezaMaxima) {
        const r = this.radio;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r + 1) continue;

                const dureza = this._durezaEn(cx + dx, cy + dy);
                if (dureza === 0 || dureza > durezaMaxima) continue;
                if (this.regiones.regionEn(cx + dx, cy + dy) !== this.regionOrigen) continue;
                if (this.mundo.excavar(cx + dx, cy + dy)) this.celdasExcavadas++;
            }
        }
    }

    // Las celdas de otra región son barreras; el resto usa la dureza de su material.
    _durezaEn(x, y) {
        if (!this.mundo.estaDentro(x, y)) return 0;
        if (this.regiones.regionEn(x, y) !== this.regionOrigen) return this.durezaBarrera;
        return this.dureza[this.mundo.estado[this.mundo.indiceDe(x, y)]] || 0;
    }
}
