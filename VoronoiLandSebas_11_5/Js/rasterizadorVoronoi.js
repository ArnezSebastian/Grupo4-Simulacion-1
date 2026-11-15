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
        this.origenFondoX = new Int32Array(cap + 1);
        this.origenFondoY = new Int32Array(cap + 1);
        this.g = new Float64Array(cap);         // x^2 + dy^2 de cada semilla en la fila actual
        this.v = new Int32Array(cap);           // semillas que forman la envolvente
        this.z = new Float64Array(cap + 1);     // x donde empieza cada tramo de la envolvente
        this.paleta32 = new Uint32Array(cap + 1);
        this.materialPorRegion = new Uint8Array(cap + 1);
        this.cantSemillas = 0;
        this.idFuera = 1;
        this.versionSemillas = -1;

        this.colorMuro32 = this._colorPackeado(config.muro.color);
        this.colorSemilla32 = this._colorPackeado(config.colores.semilla);
        this.coloresMaterial32 = new Uint32Array(256).fill(empaquetarColorRGBA(255, 0, 255)); // magenta = material sin color
        this.variantesMaterial32 = new Array(256);
        for (const id in COLORES_MATERIAL) {
            const color = COLORES_MATERIAL[id];
            this.coloresMaterial32[id] = this._colorPackeado(color);
            this.variantesMaterial32[id] = Uint32Array.from([-6, -3, 0, 3, 6], variacion =>
                this._colorPackeado(color.map(componente => limitarValor(componente + variacion, 0, 255))));
        }
        this.tamanioFondo = 128;
        this.mascaraFondo = this.tamanioFondo - 1;
        this.fondosPixelArt32 = this._crearFondosPixelArt();

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
        this.materialPorRegion.fill(MATERIALES.NADA);
        for (let k = 0; k < n; k++) {
            const indicePunto = orden[k];
            const p = puntos[indicePunto];
            this.sx[k] = p.x;
            this.sy[k] = p.y;
            const regionId = indicePunto + 1;
            this.sid[k] = regionId;     // el id es el índice original + 1 (0 queda para "vacío")
            this.materialPorRegion[regionId] = p.materialId;
            this.origenFondoX[regionId] = Math.floor(p.x) - (this.tamanioFondo >> 1);
            this.origenFondoY[regionId] = Math.floor(p.y) - (this.tamanioFondo >> 1);
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
        const { ancho, alto, regiones, pixeles32, paleta32, filasY, columnasX,
            materialPorRegion, fondosPixelArt32, mascaraFondo, origenFondoX, origenFondoY } = this;

        for (let y = 0; y < alto; y++) {
            const mundoY = filasY[y];
            const off = y * ancho;
            for (let x = 0; x < ancho; x++) {
                const indice = off + x;
                const regionId = regiones[indice];
                const material = materialPorRegion[regionId];
                const fondo = fondosPixelArt32[material];
                if (!fondo) {
                    pixeles32[indice] = paleta32[regionId];
                    continue;
                }

                const filaFondo = (mundoY - origenFondoY[regionId]) & mascaraFondo;
                pixeles32[indice] = fondo[filaFondo * this.tamanioFondo
                    + ((columnasX[x] - origenFondoX[regionId]) & mascaraFondo)];
            }
        }
    }

    _crearFondosPixelArt() {
        const lado = this.tamanioFondo;
        const total = lado * lado;
        const fondos = new Array(256);
        const color = rgb => this._colorPackeado(rgb);
        const rectangulo = (fondo, x, y, ancho, alto, tono) => {
            for (let py = Math.max(0, y); py < Math.min(lado, y + alto); py++) {
                fondo.fill(tono, py * lado + Math.max(0, x), py * lado + Math.min(lado, x + ancho));
            }
        };
        const bloques = (fondo, lista) => {
            for (const [x, y, ancho, alto, tono] of lista) rectangulo(fondo, x, y, ancho, alto, tono);
        };
        const crearBase = rgb => new Uint32Array(total).fill(color(rgb));

        const bosque = crearBase([105, 174, 126]);
        bloques(bosque, [
            [0, 0, 128, 18, color([76, 142, 83])],
            [0, 18, 128, 10, color([92, 161, 98])],
            [0, 28, 128, 12, color([120, 187, 131])],
            [0, 40, 128, 36, color([83, 158, 111])],
            [0, 76, 128, 10, color([67, 133, 84])],
            [0, 86, 128, 5, color([106, 170, 72])],
            [0, 91, 128, 5, color([76, 115, 58])],
            [0, 96, 128, 32, color([85, 49, 49])]
        ]);
        bloques(bosque, [
            [12, 24, 9, 67, color([111, 73, 55])], [14, 26, 3, 65, color([158, 91, 68])],
            [18, 47, 19, 5, color([111, 73, 55])], [32, 34, 5, 16, color([111, 73, 55])],
            [64, 34, 8, 61, color([111, 73, 55])], [67, 36, 3, 57, color([158, 91, 68])],
            [70, 53, 17, 5, color([111, 73, 55])], [84, 37, 5, 18, color([111, 73, 55])],
            [0, 30, 30, 12, color([55, 119, 68])], [7, 24, 28, 12, color([72, 152, 79])],
            [28, 32, 24, 13, color([61, 137, 71])], [50, 23, 30, 14, color([76, 157, 76])],
            [77, 29, 34, 12, color([55, 119, 68])], [99, 22, 29, 14, color([76, 157, 76])],
            [5, 65, 24, 11, color([71, 151, 92])], [39, 67, 24, 10, color([93, 171, 106])],
            [84, 64, 34, 12, color([71, 151, 92])],
            [10, 102, 9, 3, color([112, 70, 59])], [41, 111, 15, 3, color([112, 70, 59])],
            [78, 100, 11, 3, color([112, 70, 59])], [104, 119, 16, 3, color([112, 70, 59])]
        ]);
        for (let i = 0; i < 80; i++) {
            const x = (i * 47 + 13) & 127;
            const y = (i * 29 + 7) % 80;
            const verde = i % 3 === 0 ? [129, 199, 98] : [87, 169, 83];
            rectangulo(bosque, x, y, 2 + i % 4, 1 + (i % 3 === 0 ? 2 : 0), color(verde));
        }
        for (let i = 0; i < 34; i++) {
            const x = (i * 31 + 9) & 127;
            const y = 98 + (i * 17) % 28;
            rectangulo(bosque, x, y, 2 + i % 5, 1 + i % 2, color(i % 2 ? [105, 61, 56] : [65, 42, 48]));
        }
        fondos[MATERIALES.TIERRA] = bosque;

        const agua = crearBase([79, 190, 208]);
        bloques(agua, [
            [0, 0, 128, 12, color([68, 182, 205])],
            [0, 12, 128, 18, color([86, 204, 220])],
            [0, 30, 128, 8, color([109, 223, 229])],
            [0, 38, 128, 5, color([153, 241, 238])],
            [0, 43, 128, 4, color([52, 164, 186])],
            [0, 47, 128, 81, color([14, 105, 135])]
        ]);
        bloques(agua, [
            [12, 8, 22, 3, color([232, 247, 248])], [16, 5, 13, 4, color([246, 251, 250])],
            [70, 20, 25, 3, color([232, 247, 248])], [77, 16, 13, 5, color([246, 251, 250])],
            [25, 29, 18, 2, color([178, 242, 240])], [98, 34, 23, 2, color([178, 242, 240])],
            [7, 54, 25, 2, color([23, 127, 151])], [52, 62, 18, 2, color([38, 143, 162])],
            [91, 53, 31, 2, color([24, 125, 150])], [22, 76, 17, 2, color([33, 134, 157])],
            [73, 87, 28, 2, color([20, 122, 147])], [5, 101, 34, 2, color([31, 137, 158])],
            [48, 113, 24, 2, color([22, 122, 147])], [100, 119, 20, 2, color([38, 143, 162])]
        ]);
        for (let y = 51; y < lado; y += 6) {
            const desplazamiento = (y * 13) & 127;
            for (let x = 0; x < lado; x += 29) {
                const inicio = (x + desplazamiento) & 127;
                const anchoOla = 7 + ((x + y) % 17);
                const tono = (x + y) % 3 === 0 ? [29, 137, 159] : [19, 119, 145];
                rectangulo(agua, inicio, y, anchoOla, 1, color(tono));
                if ((x + y) % 2 === 0) rectangulo(agua, (inicio + 9) & 127, y + 2, 4 + x % 8, 1, color([44, 153, 170]));
            }
        }
        fondos[MATERIALES.AGUA] = agua;

        const arena = crearBase([239, 209, 146]);
        bloques(arena, [
            [0, 0, 128, 18, color([69, 190, 210])],
            [0, 18, 128, 17, color([100, 214, 221])],
            [0, 35, 128, 12, color([22, 188, 198])],
            [0, 47, 128, 8, color([48, 211, 210])],
            [0, 55, 128, 4, color([164, 238, 221])],
            [0, 59, 128, 4, color([244, 224, 172])],
            [0, 63, 128, 65, color([239, 209, 146])]
        ]);
        bloques(arena, [
            [16, 8, 19, 3, color([240, 249, 242])], [20, 4, 12, 5, color([250, 252, 246])],
            [83, 23, 24, 2, color([213, 244, 232])], [89, 20, 12, 4, color([245, 251, 240])],
            [6, 51, 30, 2, color([87, 224, 215])], [69, 57, 35, 2, color([183, 240, 222])],
            [0, 70, 40, 2, color([245, 220, 166])], [75, 68, 53, 2, color([245, 220, 166])],
            [10, 81, 33, 3, color([228, 187, 126])], [56, 95, 49, 3, color([228, 187, 126])],
            [0, 112, 42, 3, color([228, 187, 126])], [94, 119, 34, 3, color([228, 187, 126])],
            [43, 73, 3, 2, color([250, 232, 187])], [113, 101, 3, 2, color([250, 232, 187])]
        ]);
        for (let y = 67; y < lado; y += 7) {
            const desplazamiento = (y * 11) & 127;
            for (let x = 0; x < lado; x += 31) {
                const inicio = (x + desplazamiento) & 127;
                rectangulo(arena, inicio, y, 8 + (x * 3 + y) % 24, 1, color([222, 187, 127]));
                if ((x + y) % 2 === 0) rectangulo(arena, (inicio + 13) & 127, y + 2, 3 + x % 7, 1, color([250, 229, 184]));
            }
        }
        for (let i = 0; i < 50; i++) {
            const x = (i * 43 + 17) & 127;
            const y = 72 + (i * 19) % 52;
            rectangulo(arena, x, y, 1 + i % 3, 1, color(i % 2 ? [229, 196, 139] : [248, 224, 172]));
        }
        fondos[MATERIALES.ARENA] = arena;

        const cueva = crearBase([10, 17, 34]);
        const tonosRoca = [
            color([18, 31, 52]), color([28, 47, 69]), color([42, 68, 88]),
            color([59, 88, 106]), color([79, 111, 121]), color([105, 133, 129])
        ];
        const tonosPortal = [color([5, 9, 24]), color([7, 13, 30]), color([10, 20, 39])];

        for (let y = 0; y < lado; y++) {
            const centro = lado >> 1;
            const portalAncho = y < 16 ? 12 + y : y < 43 ? 28 + Math.floor((y - 16) / 4)
                : y < 70 ? 34 - Math.floor((y - 43) / 5) : 0;
            const portalAlto = y >= 12 && y < 72;
            for (let x = 0; x < lado; x++) {
                const distanciaCentro = Math.abs(x - centro);
                const distanciaPared = Math.max(0, distanciaCentro - portalAncho);
                let indiceTono = distanciaPared < 5 ? 4 : distanciaPared < 12 ? 3 : distanciaPared < 25 ? 2 : 1;
                if ((y >> 4) % 3 === 1 && indiceTono > 1) indiceTono--;
                let tono = tonosRoca[indiceTono];

                if (portalAlto && distanciaCentro <= portalAncho) {
                    tono = tonosPortal[y < 27 ? 0 : y < 51 ? 1 : 2];
                } else if (portalAlto && distanciaCentro <= portalAncho + 3) {
                    tono = tonosRoca[distanciaCentro === portalAncho + 1 ? 5 : 3];
                }

                cueva[y * lado + x] = tono;
            }
        }

        for (let ladoPared = 0; ladoPared < 2; ladoPared++) {
            for (let tramo = 0; tramo < 15; tramo++) {
                const x = ladoPared === 0 ? (tramo * 7 + 2) % 29 : lado - 2 - (tramo * 7 + 2) % 29;
                const y = (tramo * 19 + 5) % 78;
                const anchoRoca = 5 + (tramo * 11) % 13;
                const altoRoca = 3 + (tramo * 7) % 9;
                const roca = tonosRoca[1 + (tramo % 4)];
                rectangulo(cueva, x, y, anchoRoca, altoRoca, roca);
                rectangulo(cueva, x + 1, y + 1, Math.max(1, anchoRoca - 3), 1, tonosRoca[4]);
                rectangulo(cueva, x + anchoRoca - 2, y + altoRoca, 2, 2 + tramo % 4, tonosRoca[1]);
            }
        }

        for (let x = 5; x < lado - 4; x += 13) {
            const anchoPico = 2 + (x % 4);
            const altoPico = 7 + (x * 7) % 17;
            rectangulo(cueva, x, 0, anchoPico, altoPico, tonosPortal[0]);
            rectangulo(cueva, x + 1, altoPico - 3, 1, 3, tonosRoca[2]);
        }

        for (let y = 74; y < lado; y++) {
            const anchoCamino = Math.min(lado, 28 + (y - 74) * 3);
            const inicio = (lado - anchoCamino) >> 1;
            const tonoSuelo = y % 16 < 2 ? color([41, 66, 78]) : color([51, 79, 91]);
            rectangulo(cueva, inicio, y, anchoCamino, 1, tonoSuelo);

            if (y % 8 === 0) {
                for (let x = inicio; x < inicio + anchoCamino; x += Math.max(8, 18 - (y >> 4))) {
                    rectangulo(cueva, x, y, 1, 2, color([21, 39, 57]));
                }
            }
        }

        for (let fila = 0; fila < 6; fila++) {
            const y = 82 + fila * 7;
            const anchoCamino = Math.min(lado, 48 + (y - 74) * 3);
            const inicio = (lado - anchoCamino) >> 1;
            for (let x = inicio + (fila % 2) * 7; x < inicio + anchoCamino - 5; x += 17) {
                rectangulo(cueva, x, y, 13, 1, color([92, 123, 126]));
                rectangulo(cueva, x + 2, y + 1, 9, 1, color([35, 60, 75]));
            }
        }

        const musgo = [color([88, 144, 82]), color([126, 177, 82]), color([59, 111, 74])];
        for (let i = 0; i < 20; i++) {
            const x = i % 2 === 0 ? (i * 19 + 7) % 42 : lado - 1 - (i * 23 + 9) % 42;
            const y = 63 + (i * 17) % 48;
            rectangulo(cueva, x, y, 2 + i % 5, 1 + i % 2, musgo[i % musgo.length]);
            rectangulo(cueva, x + 2, y - 1, 2, 1, musgo[(i + 1) % musgo.length]);
        }
        fondos[MATERIALES.PIEDRA] = cueva;

        return fondos;
    }

    // Dibuja encima las celdas con material (falling sand). Sólo recorre lo visible.
    _pintarParticulas() {
        const celdas = this.mundoCeldas;
        if (celdas.particulas === 0) return;

        const { ancho, alto, filasY, columnasX, pixeles32, coloresMaterial32, variantesMaterial32 } = this;
        const estado = celdas.estado;

        for (let y = 0; y < alto; y++) {
            const wy = filasY[y];
            if (wy < 0 || wy >= celdas.alto) continue;

            const base = wy * celdas.ancho;
            const off = y * ancho;
            for (let x = this.colIni; x <= this.colFin; x++) {
                const indiceMundo = base + columnasX[x];
                const material = estado[indiceMundo];
                if (material !== MATERIALES.NADA) {
                    let hash = Math.imul(indiceMundo, 0x45d9f3b);
                    hash ^= hash >>> 16;
                    hash = Math.imul(hash, 0x45d9f3b);
                    hash ^= hash >>> 16;
                    const variantes = variantesMaterial32[material];
                    pixeles32[off + x] = variantes
                        ? variantes[(hash >>> 0) % variantes.length]
                        : coloresMaterial32[material];
                }
            }
        }
    }

    // Muros = píxeles de pantalla donde cambia la región respecto al vecino derecho o inferior.
    // El grosor está en píxeles de pantalla (se ve igual de grueso con cualquier zoom).
    // Donde el jugador abrió un pasaje, el muro deja de dibujarse.
    _pintarMuros(grosorMuro) {
        const { ancho, alto, regiones } = this;
        const radio = Math.floor((Number(grosorMuro) || 1) / 2);
        const hayPasajes = this.mundoCeldas.cantidadPasajes > 0;

        for (let y = 0; y < alto - 1; y++) {
            let i = y * ancho;
            for (let x = 0; x < ancho - 1; x++, i++) {
                const r = regiones[i];
                const aLaDerecha = r !== regiones[i + 1];
                const abajo = r !== regiones[i + ancho];
                if (!aLaDerecha && !abajo) continue;
                if (hayPasajes && this._muroAbierto(x, y, aLaDerecha, abajo)) continue;

                this._pintarCuadrado(x, y, radio, this.colorMuro32);
            }
        }
    }

    // ¿Alguna de las dos celdas que separa este muro es un pasaje? (misma regla que usan la física y la arena)
    _muroAbierto(x, y, aLaDerecha, abajo) {
        const celdas = this.mundoCeldas;
        const wx = this.columnasX[x], wy = this.filasY[y];
        if (wx < 0 || wx >= celdas.ancho || wy < 0 || wy >= celdas.alto) return false;

        if (celdas.esPasaje(wy * celdas.ancho + wx)) return true;
        if (aLaDerecha) {
            const nx = this.columnasX[x + 1];
            if (nx >= 0 && nx < celdas.ancho && celdas.esPasaje(wy * celdas.ancho + nx)) return true;
        }
        if (abajo) {
            const ny = this.filasY[y + 1];
            if (ny >= 0 && ny < celdas.alto && celdas.esPasaje(ny * celdas.ancho + wx)) return true;
        }
        return false;
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
