// Picar: apunta hacia donde MIRA el jugador (no hacia el mouse) y, mientras se mantiene el click,
// vacía un disco de celdas alrededor de la primera celda picable que encuentra dentro del alcance.
// Cada material tiene una dureza: la arena cede rápido, la piedra tarda varias veces más.
class Excavador {
    // Último apuntado (lo lee la vista para dibujar la mira). Se reutiliza: no se crean objetos por frame.
    objetivo = { hayImpacto: false, celdaX: 0, celdaY: 0, puntoX: 0, puntoY: 0 };
    celdasExcavadas = 0;

    constructor(mundoCeldas, config) {
        this.mundo = mundoCeldas;
        this.periodoBaseMs = 1000 / config.tasaHz;
        this.alcance = config.alcance;
        this.radio = config.radio;
        this.dureza = config.dureza;
        this.progresoMs = 0;

        // Se crea una sola vez (el DDA la llama por cada celda que recorre).
        this._esPicable = (x, y) => this._durezaEn(x, y) > 0;
    }

    actualizar(deltaMs, jugador, picando) {
        this._apuntar(jugador);

        if (!picando || !this.objetivo.hayImpacto) {
            this.progresoMs = 0;
            return;
        }

        this.progresoMs += deltaMs;
        for (let mordiscos = 0; mordiscos < 3; mordiscos++) {
            const dureza = this._durezaEn(this.objetivo.celdaX, this.objetivo.celdaY);
            const periodo = this.periodoBaseMs * dureza;
            if (dureza === 0 || this.progresoMs < periodo) return;

            this.progresoMs -= periodo;
            this._excavarDisco(this.objetivo.celdaX, this.objetivo.celdaY, dureza);
            this._apuntar(jugador);     // la celda ya no está: se apunta a la siguiente
            if (!this.objetivo.hayImpacto) {
                this.progresoMs = 0;
                return;
            }
        }
        this.progresoMs = 0;            // frame muy largo: se descarta el exceso en vez de acumular mordiscos
    }

    // Lanza un rayo DDA desde el centro del cuerpo. El alcance se mide desde el borde de la caja, así que
    // cavar hacia abajo (la caja es alta) o de costado (es angosta) llega a la misma distancia.
    _apuntar(jugador) {
        const dir = jugador.direccionMirada;
        const ox = jugador.centroX;
        const oy = jugador.centroY;

        const hastaBordeX = dir.x !== 0 ? (jugador.ancho / 2) / Math.abs(dir.x) : Infinity;
        const hastaBordeY = dir.y !== 0 ? (jugador.alto / 2) / Math.abs(dir.y) : Infinity;
        const distanciaMax = Math.min(hastaBordeX, hastaBordeY) + this.alcance;

        const o = this.objetivo;
        const impacto = RayoDDA.lanzar(ox, oy, dir.x, dir.y, distanciaMax, this._esPicable);
        if (impacto) {
            o.hayImpacto = true;
            o.celdaX = impacto.x;
            o.celdaY = impacto.y;
            o.puntoX = impacto.x + 0.5;
            o.puntoY = impacto.y + 0.5;
        } else {
            o.hayImpacto = false;
            o.puntoX = ox + dir.x * distanciaMax;
            o.puntoY = oy + dir.y * distanciaMax;
        }
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
                if (this.mundo.excavar(cx + dx, cy + dy)) this.celdasExcavadas++;
            }
        }
    }

    // 0 = no se puede picar (nada, agua, fuera del mundo).
    _durezaEn(x, y) {
        if (!this.mundo.estaDentro(x, y)) return 0;
        return this.dureza[this.mundo.estado[this.mundo.indiceDe(x, y)]] || 0;
    }
}
