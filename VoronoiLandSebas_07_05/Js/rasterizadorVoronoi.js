// Convierte (cámara + puntos + celdas) en los píxeles del canvas. Trabaja SIEMPRE en espacio de pantalla:
// el costo depende del tamaño del canvas, no del tamaño del mundo (5000x5000 cuesta lo mismo que 300x300).
//
// Idea clave para el Voronoi: en una fila fija, la distancia al cuadrado de cada semilla es una parábola
// (x - px)^2 + dy^2. La semilla más cercana en cada x es la parábola más baja ("envolvente inferior").
// Se arma la envolvente una vez por fila (O(N)) y luego se recorren los píxeles (O(ancho)).
// Costo por frame: alto * (N + ancho)   en vez de   ancho * alto * N   de la versión por fuerza bruta.
class RasterizadorVoronoi {
    constructor(camara, mundoVoronoi, mundoCeldas, config, inicializador) {
        this.inicializador = inicializador;     // InicializadorMateriales: decide qué hay en las celdas recién vistas
        this.camara = camara;
        this.mundoVoronoi = mundoVoronoi;
        this.mundoCeldas = mundoCeldas;
        this.config = config;

        this.ancho = config.canvas.ancho;
        this.alto = config.canvas.alto;

        // Buffer RGBA que se sube a la textura, con una vista de 32 bits (un píxel = una escritura).
        this.bufferPixeles = new Uint8ClampedArray(this.ancho * this.alto * 4);
        this.pixeles32 = new Uint32Array(this.bufferPixeles.buffer);

        // Id de región de cada píxel de PANTALLA (0 = vacío, 1..N = punto, N+1 = fuera del mundo).
        this.regiones = new Uint16Array(this.ancho * this.alto);

        // Celda del mundo que corresponde a cada columna / fila de pantalla.
        this.columnasX = new Int32Array(this.ancho);
        this.filasY = new Int32Array(this.alto);
        this.colIni = 0;    // primera y última columna que caen dentro del mundo
        this.colFin = -1;

        // Memoria de trabajo reutilizable (sin crear arrays en cada frame):
        const cap = config.puntos.max + 2;
        this.capacidad = cap;
        this.sx = new Float64Array(cap);        // semillas ordenadas por x
        this.sy = new Float64Array(cap);
        this.sid = new Uint16Array(cap);
        this.g = new Float64Array(cap);         // x^2 + dy^2 de cada semilla en la fila actual
        this.v = new Int32Array(cap);           // semillas que forman la envolvente
        this.z = new Float64Array(cap + 1);     // x donde empieza cada tramo de la envolvente
        this.paleta32 = new Uint32Array(cap + 1);
        this.cantSemillas = 0;
        this.idFuera = 1;
        this.versionSemillas = -1;

        this.colorMuro32 = this._colorPackeado(config.muro.color);
        this.colorSemilla32 = this._colorPackeado(config.colores.semilla);
        this.coloresMaterial32 = new Uint32Array(256).fill(empaquetarColorRGBA(255, 0, 255)); // magenta = material sin color
        for (const id in COLORES_MATERIAL) this.coloresMaterial32[id] = this._colorPackeado(COLORES_MATERIAL[id]);

        this.mediciones = { voronoiMs: 0, composicionMs: 0 };
        this.ultimas = { camara: -1, puntos: -1, celdas: -1, grosor: -1 };

        // Descripción del espacio de pantalla que se le pasa al inicializador (se reutiliza: sin objetos nuevos por frame).
        this.vista = {
            ancho: this.ancho, alto: this.alto, regiones: this.regiones,
            filasY: this.filasY, columnasX: this.columnasX, colIni: 0, colFin: -1
        };
    }

    // Dirty flag: sólo se redibuja si cambió algo que afecte a la imagen.
    estaDesactualizado(grosorMuro) {
        return this.ultimas.camara !== this.camara.version
            || this.ultimas.puntos !== this.mundoVoronoi.version
            || this.ultimas.celdas !== this.mundoCeldas.version
            || this.ultimas.grosor !== grosorMuro;
    }

    dibujar(grosorMuro) {
        const t0 = performance.now();

        this._prepararSemillas();
        this._prepararEjesDeVista();
        this._calcularRegiones();
        this.vista.colIni = this.colIni;
        this.vista.colFin = this.colFin;
        this.inicializador.inicializarVista(this.vista, this.camara.version);

        const t1 = performance.now();

        this._pintarRegiones();
        this._pintarParticulas();
        this._pintarMuros(grosorMuro);
        this._pintarSemillas();

        const t2 = performance.now();

        this.mediciones.voronoiMs = t1 - t0;        // costo de recalcular las regiones (lo que antes era actualizarDiagramaVoronoi)
        this.mediciones.composicionMs = t2 - t1;    // costo de pintar colores, partículas, muros y semillas

        this.ultimas.camara = this.camara.version;
        this.ultimas.puntos = this.mundoVoronoi.version;
        this.ultimas.celdas = this.mundoCeldas.version;
        this.ultimas.grosor = grosorMuro;
    }

    // --- Preparación ---

    // Ordena las semillas por x y arma la paleta. Sólo se rehace si cambiaron los puntos.
    _prepararSemillas() {
        const puntos = this.mundoVoronoi.puntos;
        if (this.versionSemillas === this.mundoVoronoi.version) return;

        const n = Math.min(puntos.length, this.capacidad - 2);
        const orden = Array.from({ length: n }, (_, i) => i).sort((a, b) => puntos[a].x - puntos[b].x);

        this.paleta32[0] = this._colorPackeado(this.config.colores.vacio);
        for (let k = 0; k < n; k++) {
            const p = puntos[orden[k]];
            this.sx[k] = p.x;
            this.sy[k] = p.y;
            this.sid[k] = orden[k] + 1;     // el id es el índice original + 1 (0 queda para "vacío")
        }
        for (let i = 0; i < n; i++) {
            const c = puntos[i].color;
            this.paleta32[i + 1] = empaquetarColorRGBA(c[0], c[1], c[2]);
        }

        this.cantSemillas = n;
        this.idFuera = n + 1;
        this.paleta32[this.idFuera] = this._colorPackeado(this.config.colores.fueraDelMundo);
        this.versionSemillas = this.mundoVoronoi.version;
    }

    // Calcula qué celda del mundo cae en cada columna y fila de pantalla (se usa el centro del píxel).
    _prepararEjesDeVista() {
        const inv = 1 / this.camara.zoom;
        const ox = this.camara.origenX;
        const oy = this.camara.origenY;
        const mundoAncho = this.mundoCeldas.ancho;

        this.colIni = this.ancho;
        this.colFin = -1;
        for (let x = 0; x < this.ancho; x++) {
            const wx = Math.floor(ox + (x + 0.5) * inv);
            this.columnasX[x] = wx;
            if (wx >= 0 && wx < mundoAncho) {
                if (x < this.colIni) this.colIni = x;
                this.colFin = x;
            }
        }
        for (let y = 0; y < this.alto; y++) {
            this.filasY[y] = Math.floor(oy + (y + 0.5) * inv);
        }
    }

    // --- Voronoi ---

    _calcularRegiones() {
        const { ancho, alto, regiones, filasY } = this;
        const mundoAlto = this.mundoCeldas.alto;
        let ultimaFila = NaN;

        for (let y = 0; y < alto; y++) {
            const wy = filasY[y];
            const off = y * ancho;

            // Con zoom > 1 varias filas de pantalla son la misma fila del mundo: se copia la anterior.
            if (wy === ultimaFila) {
                regiones.copyWithin(off, off - ancho, off);
                continue;
            }
            ultimaFila = wy;

            if (wy < 0 || wy >= mundoAlto) {
                regiones.fill(this.idFuera, off, off + ancho);
                continue;
            }

            if (this.cantSemillas > 0) this._regionesDeFila(wy, off);
            else regiones.fill(0, off, off + ancho);

            // Columnas fuera del mundo:
            regiones.fill(this.idFuera, off, off + this.colIni);
            regiones.fill(this.idFuera, off + this.colFin + 1, off + ancho);
        }
    }

    // Envolvente inferior de parábolas (distance transform de Felzenszwalb, con semillas reales no enteras).
    _regionesDeFila(wy, off) {
        const n = this.cantSemillas;
        const { sx, sy, sid, g, v, z } = this;

        for (let i = 0; i < n; i++) {
            const dy = wy - sy[i];
            g[i] = sx[i] * sx[i] + dy * dy;
        }

        let k = 0;              // índice del último tramo de la envolvente
        v[0] = 0;
        z[0] = -Infinity;
        z[1] = Infinity;

        for (let q = 1; q < n; q++) {
            let s = 0;
            let descartar = false;

            while (true) {
                const p = v[k];
                const dq = 2 * (sx[q] - sx[p]);

                if (dq === 0) {     // misma x: se queda la de menor g
                    if (g[q] < g[p]) {
                        if (k === 0) { v[0] = q; descartar = true; break; }
                        k--;
                        continue;
                    }
                    descartar = true;
                    break;
                }

                s = (g[q] - g[p]) / dq;     // x donde la parábola q pasa a ser más baja que la p
                if (s <= z[k]) { k--; continue; }   // p queda tapada: se descarta (z[0] = -Inf impide bajar de 0)
                break;
            }

            if (descartar) { z[k + 1] = Infinity; continue; }

            k++;
            v[k] = q;
            z[k] = s;
            z[k + 1] = Infinity;
        }

        // Se recorren los píxeles de izquierda a derecha avanzando de tramo (x del mundo nunca decrece).
        const cols = this.columnasX;
        const regiones = this.regiones;
        let seg = 0;
        for (let x = this.colIni; x <= this.colFin; x++) {
            const wx = cols[x];
            while (seg < k && z[seg + 1] <= wx) seg++;
            regiones[off + x] = sid[v[seg]];
        }
    }

    // --- Composición ---

    _pintarRegiones() {
        const { regiones, pixeles32, paleta32 } = this;
        const total = regiones.length;
        for (let i = 0; i < total; i++) pixeles32[i] = paleta32[regiones[i]];
    }

    // Dibuja encima las celdas con material (falling sand). Sólo recorre lo visible.
    _pintarParticulas() {
        const celdas = this.mundoCeldas;
        if (celdas.particulas === 0) return;

        const { ancho, alto, filasY, columnasX, pixeles32, coloresMaterial32 } = this;
        const estado = celdas.estado;

        for (let y = 0; y < alto; y++) {
            const wy = filasY[y];
            if (wy < 0 || wy >= celdas.alto) continue;

            const base = wy * celdas.ancho;
            const off = y * ancho;
            for (let x = this.colIni; x <= this.colFin; x++) {
                const material = estado[base + columnasX[x]];
                if (material !== MATERIALES.NADA) pixeles32[off + x] = coloresMaterial32[material];
            }
        }
    }

    // Muros = píxeles de pantalla donde cambia la región respecto al vecino derecho o inferior.
    // El grosor está en píxeles de pantalla (se ve igual de grueso con cualquier zoom).
    _pintarMuros(grosorMuro) {
        const { ancho, alto, regiones } = this;
        const radio = Math.floor((Number(grosorMuro) || 1) / 2);

        // Los tramos que el jugador ya abrió no se dibujan (sólo se consulta si hay alguno abierto).
        const celdas = this.mundoCeldas;
        const hayAbiertas = celdas.cantidadBarrerasAbiertas > 0;

        for (let y = 0; y < alto - 1; y++) {
            let i = y * ancho;
            const wy = this.filasY[y];
            const filaDentro = wy >= 0 && wy < celdas.alto;
            for (let x = 0; x < ancho - 1; x++, i++) {
                const r = regiones[i];
                if (r !== regiones[i + 1] || r !== regiones[i + ancho]) {
                    if (hayAbiertas && filaDentro) {
                        const wx = this.columnasX[x];
                        if (wx >= 0 && wx < celdas.ancho && celdas.estaAbierta(wy * celdas.ancho + wx)) continue;
                    }
                    this._pintarCuadrado(x, y, radio, this.colorMuro32);
                }
            }
        }
    }

    _pintarSemillas() {
        const puntos = this.mundoVoronoi.puntos;
        const radio = this.config.puntos.radioSemilla;

        for (let i = 0; i < puntos.length; i++) {
            const px = Math.floor(this.camara.pantallaXDe(puntos[i].x));
            const py = Math.floor(this.camara.pantallaYDe(puntos[i].y));
            if (px < -radio || px >= this.ancho + radio || py < -radio || py >= this.alto + radio) continue;

            this._pintarCuadrado(px, py, radio, this.colorSemilla32);
        }
    }

    _pintarCuadrado(cx, cy, radio, color32) {
        const x0 = Math.max(0, cx - radio), x1 = Math.min(this.ancho - 1, cx + radio);
        const y0 = Math.max(0, cy - radio), y1 = Math.min(this.alto - 1, cy + radio);

        for (let y = y0; y <= y1; y++) {
            const off = y * this.ancho;
            for (let x = x0; x <= x1; x++) this.pixeles32[off + x] = color32;
        }
    }

    _colorPackeado(rgb) {
        return empaquetarColorRGBA(rgb[0], rgb[1], rgb[2]);
    }
}
