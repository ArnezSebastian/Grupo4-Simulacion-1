// Partículas del jugador, dibujadas con PixiJS ENCIMA del mundo y del personaje. Hay dos efectos:
//   - polvo (paso / aterrizaje): una nubecita suave del color del suelo, que sube un poco, se frena y se desvanece.
//   - esquirlas (picar): trocitos del material golpeado que salen despedidos hacia el jugador y caen con gravedad;
//     en materiales duros (piedra, roca, muro) se suman unas chispas claras y muy cortas.
// Caminar y aterrizar usan EXACTAMENTE el mismo efecto (polvo); sólo cambia la cantidad, que en el aterrizaje crece
// con la velocidad del impacto.
//
// Las partículas viven en coordenadas del MUNDO (en celdas), así que se quedan donde nacieron aunque la cámara se mueva.
// Se reutiliza un pool fijo de sprites y de arrays tipados: no se crean objetos por frame ni por partícula.
class ParticulasJugador {
    static TIPO_POLVO = 0;
    static TIPO_ESQUIRLA = 1;
    static TIPO_CHISPA = 2;

    // Los materiales que sueltan chispas al picarlos.
    static DUROS = new Set([MATERIALES.PIEDRA, MATERIALES.ROCA, MATERIALES.MURO]);

    constructor(escenario, camara, config, anchoJugador) {
        this.camara = camara;
        this.config = config;
        this.anchoJugador = anchoJugador;

        const max = config.maximo;
        this.max = max;
        this.siguiente = 0;     // anillo: si se acaba el pool se reutiliza la partícula más vieja

        this.activa = new Uint8Array(max);
        this.tipo = new Uint8Array(max);
        this.x = new Float32Array(max);
        this.y = new Float32Array(max);
        this.vx = new Float32Array(max);
        this.vy = new Float32Array(max);
        this.vida = new Float32Array(max);
        this.vidaTotal = new Float32Array(max);
        this.tamanio = new Float32Array(max);       // en celdas
        this.gravedad = new Float32Array(max);
        this.arrastre = new Float32Array(max);

        this.contenedor = new PIXI.Container();
        this.sprites = new Array(max);
        for (let i = 0; i < max; i++) {
            const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            sprite.visible = false;
            this.contenedor.addChild(sprite);
            this.sprites[i] = sprite;
        }
        escenario.addChild(this.contenedor);
    }

    // --- Emisores ---

    // Polvo en los pies. `intensidad` va de 0 a 1: más intensidad = más partículas y más dispersión.
    polvo(centroX, piesY, material, intensidad) {
        const c = this.config.polvo;
        const cantidad = Math.round(c.cantidadMin + (c.cantidadMax - c.cantidadMin) * intensidad);
        const dispersion = 1 + intensidad * 0.6;

        for (let n = 0; n < cantidad; n++) {
            const i = this._reservar();
            this.tipo[i] = ParticulasJugador.TIPO_POLVO;
            this.x[i] = centroX + (Math.random() - 0.5) * this.anchoJugador * 0.8;
            this.y[i] = piesY - 0.5;
            this.vx[i] = (Math.random() * 2 - 1) * c.velocidadHorizontal * dispersion;
            this.vy[i] = -(c.velocidadVertical * (0.3 + Math.random() * 0.7));
            this.gravedad[i] = c.gravedad;
            this.arrastre[i] = c.arrastre;
            this.vidaTotal[i] = this.vida[i] = c.vidaMin + Math.random() * (c.vidaMax - c.vidaMin);
            this.tamanio[i] = c.tamanioMin + Math.random() * (c.tamanioMax - c.tamanioMin);
            this._colorear(i, this._colorSuelo(material, 0.35, 12));
        }
    }

    // Esquirlas en el punto del golpe. (direccionX, direccionY) = hacia dónde pica el jugador; salen en sentido contrario.
    esquirlas(celdaX, celdaY, material, direccionX, direccionY) {
        const c = this.config.esquirlas;
        const baseX = celdaX + 0.5, baseY = celdaY + 0.5;
        const anguloBase = Math.atan2(-direccionY, -direccionX);

        for (let n = 0; n < c.cantidad; n++) {
            const i = this._reservar();
            const angulo = anguloBase + (Math.random() * 2 - 1) * c.abanico;
            const velocidad = c.velocidadMin + Math.random() * (c.velocidadMax - c.velocidadMin);
            this.tipo[i] = ParticulasJugador.TIPO_ESQUIRLA;
            this.x[i] = baseX + (Math.random() - 0.5) * 2;
            this.y[i] = baseY + (Math.random() - 0.5) * 2;
            this.vx[i] = Math.cos(angulo) * velocidad;
            this.vy[i] = Math.sin(angulo) * velocidad - c.impulsoArriba;
            this.gravedad[i] = c.gravedad;
            this.arrastre[i] = 0;
            this.vidaTotal[i] = this.vida[i] = c.vidaMin + Math.random() * (c.vidaMax - c.vidaMin);
            this.tamanio[i] = c.tamanioMin + Math.random() * (c.tamanioMax - c.tamanioMin);
            this._colorear(i, this._colorSuelo(material, Math.random() * 0.3 - 0.15, 22));
        }

        if (!ParticulasJugador.DUROS.has(material)) return;
        const ch = this.config.chispas;
        for (let n = 0; n < ch.cantidad; n++) {
            const i = this._reservar();
            const angulo = anguloBase + (Math.random() * 2 - 1) * ch.abanico;
            const velocidad = ch.velocidadMin + Math.random() * (ch.velocidadMax - ch.velocidadMin);
            this.tipo[i] = ParticulasJugador.TIPO_CHISPA;
            this.x[i] = baseX;
            this.y[i] = baseY;
            this.vx[i] = Math.cos(angulo) * velocidad;
            this.vy[i] = Math.sin(angulo) * velocidad;
            this.gravedad[i] = ch.gravedad;
            this.arrastre[i] = 0;
            this.vidaTotal[i] = this.vida[i] = ch.vidaMin + Math.random() * (ch.vidaMax - ch.vidaMin);
            this.tamanio[i] = ch.tamanioMin + Math.random() * (ch.tamanioMax - ch.tamanioMin);
            this._colorear(i, ch.color);
        }
    }

    // --- Ciclo ---

    actualizar(deltaSeg) {
        for (let i = 0; i < this.max; i++) {
            if (!this.activa[i]) continue;

            this.vida[i] -= deltaSeg;
            if (this.vida[i] <= 0) {
                this.activa[i] = 0;
                this.sprites[i].visible = false;
                continue;
            }

            this.vy[i] += this.gravedad[i] * deltaSeg;
            if (this.arrastre[i] > 0) {
                const freno = Math.max(0, 1 - this.arrastre[i] * deltaSeg);
                this.vx[i] *= freno;
                this.vy[i] *= freno;
            }
            this.x[i] += this.vx[i] * deltaSeg;
            this.y[i] += this.vy[i] * deltaSeg;
        }
    }

    // Coloca los sprites según la cámara actual. Se llama después de mover la cámara, igual que el sprite del jugador.
    dibujar() {
        const camara = this.camara;
        const zoom = camara.zoom;

        for (let i = 0; i < this.max; i++) {
            if (!this.activa[i]) continue;

            const restante = this.vida[i] / this.vidaTotal[i];  // 1 al nacer, 0 al morir
            let escala = 1, alfa = 1;
            switch (this.tipo[i]) {
                case ParticulasJugador.TIPO_POLVO:
                    escala = 0.55 + 0.45 * restante;
                    alfa = 0.85 * restante;
                    break;
                case ParticulasJugador.TIPO_ESQUIRLA:
                    alfa = restante < 0.25 ? restante / 0.25 : 1;
                    break;
                default:    // chispa
                    escala = 0.4 + 0.6 * restante;
                    break;
            }

            const lado = Math.max(1, Math.round(this.tamanio[i] * escala * zoom));
            const sprite = this.sprites[i];
            sprite.width = lado;
            sprite.height = lado;
            sprite.alpha = alfa;
            sprite.position.set(
                Math.round(camara.pantallaXDe(this.x[i])) - (lado >> 1),
                Math.round(camara.pantallaYDe(this.y[i])) - (lado >> 1)
            );
        }
    }

    limpiar() {
        this.activa.fill(0);
        for (let i = 0; i < this.max; i++) this.sprites[i].visible = false;
    }

    // --- Internos ---

    _reservar() {
        const i = this.siguiente;
        this.siguiente = (this.siguiente + 1) % this.max;
        this.activa[i] = 1;
        return i;
    }

    _colorear(i, rgb) {
        const sprite = this.sprites[i];
        sprite.tint = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        sprite.visible = true;
    }

    // Color del material aclarado (aclarar > 0) u oscurecido (< 0), con una variación al azar de ±variacion.
    _colorSuelo(material, aclarar, variacion) {
        const base = COLORES_MATERIAL[material] || COLORES_MATERIAL[MATERIALES.MURO];
        const azar = (Math.random() * 2 - 1) * variacion;
        const canal = valor => {
            const mezclado = aclarar >= 0 ? valor + (255 - valor) * aclarar : valor * (1 + aclarar);
            return Math.max(0, Math.min(255, Math.round(mezclado + azar)));
        };
        return [canal(base[0]), canal(base[1]), canal(base[2])];
    }
}
