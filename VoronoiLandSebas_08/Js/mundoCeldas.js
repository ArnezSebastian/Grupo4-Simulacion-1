// Grilla lógica del mundo (falling sand): 1 byte por celda con el id del material.
// 5000x5000 = 25 MB. No hay buffer de color a escala del mundo: el color se calcula sólo para lo visible.
class MundoCeldas {
    constructor(ancho, alto) {
        this.ancho = ancho;
        this.alto = alto;
        this.estado = new Uint8Array(ancho * alto);
        this.inicializadas = new Uint8Array(Math.ceil(ancho * alto / 8));
        this.particulas = 0;    // celdas ocupadas (material distinto de NADA)
        this.version = 0;       // dirty flag para el rasterizador
        this.versionInicializacion = 0;

        // Bloques de 32x32: las divisiones por 32 se hacen con desplazamientos (>> 5) y máscaras (& 31).
        this.tamanioBloque = 32;
        this.desplazamientoBloque = 5;
        this.mascaraBloque = 31;
        this.bloquesAncho = Math.ceil(ancho / this.tamanioBloque);
        this.bloquesAlto = Math.ceil(alto / this.tamanioBloque);
        const totalBloques = this.bloquesAncho * this.bloquesAlto;

        // Bloques activos = cola FIFO de ids + un byte por bloque que dice si ya está en la cola.
        // (Antes era un Set: cada activación costaba un hash; ahora es una lectura y una escritura.)
        this.flagsBloqueActivo = new Uint8Array(totalBloques);
        this.colaActivos = [];
        this.cabezaCola = 0;

        // Regiones por celda, un Uint16Array de 32x32 por bloque (null mientras el bloque no se haya visto).
        this.regionesPorBloque = new Array(totalBloques).fill(null);
        this.bloquesPorRegion = new Map();
        this.conteosRegionPorBloque = new Map();
        this.celdasPorRegion = new Map();
        this.particulasPorRegion = new Map();

        // Pasajes abiertos en los muros (1 bit por celda, ~3 MB en 5000x5000).
        this.pasajes = new Uint8Array(Math.ceil(ancho * alto / 8));
        this.cantidadPasajes = 0;
    }

    estaDentro(x, y) {
        return x >= 0 && x < this.ancho && y >= 0 && y < this.alto;
    }

    indiceDe(x, y) {
        return y * this.ancho + x;
    }

    // Fuera del mundo se comporta como muro (decisión provisoria, la lógica del falling sand puede cambiarla).
    obtener(x, y) {
        return this.estaDentro(x, y) ? this.estado[this.indiceDe(x, y)] : MATERIALES.MURO;
    }

    fijar(x, y, material) {
        if (!this.estaDentro(x, y)) return false;

        const i = this.indiceDe(x, y);
        this.marcarIndiceInicializado(i);
        this._escribirIndice(i, material);
        if (material === MATERIALES.ARENA || material === MATERIALES.AGUA || material === MATERIALES.PIEDRA) {
            this.activarIndice(i);
        }
        this.version++;
        return true;
    }

    estaInicializada(indice) {
        return (this.inicializadas[indice >> 3] & (1 << (indice & 7))) !== 0;
    }

    // Vacía una celda (picar). Despierta los bloques de ARRIBA y de los COSTADOS para que lo que quedó
    // sin apoyo (arena, agua) vuelva a simularse. Devuelve true si realmente había algo.
    excavar(x, y) {
        if (!this.estaDentro(x, y)) return false;

        const i = this.indiceDe(x, y);
        this.marcarIndiceInicializado(i);   // que la inicialización perezosa no vuelva a llenar el hueco
        if (this.estado[i] === MATERIALES.NADA) return false;

        this._escribirIndice(i, MATERIALES.NADA);
        this.activarVecindad(x, y);
        this.version++;
        return true;
    }

    marcarIndiceInicializado(indice) {
        const byte = indice >> 3;
        const mascara = 1 << (indice & 7);
        this.inicializadas[byte] |= mascara;
    }

    fijarRegionIndice(indice, regionId) {
        const y = (indice / this.ancho) | 0;
        const x = indice - y * this.ancho;
        const bloqueId = (y >> 5) * this.bloquesAncho + (x >> 5);
        let regiones = this.regionesPorBloque[bloqueId];
        if (regiones === null) {
            regiones = new Uint16Array(this.tamanioBloque * this.tamanioBloque);
            this.regionesPorBloque[bloqueId] = regiones;
        }

        const indiceLocal = ((y & 31) << 5) | (x & 31);
        const anteriorCodificada = regiones[indiceLocal];
        const nuevaCodificada = regionId + 1;
        if (anteriorCodificada === nuevaCodificada) return;

        if (anteriorCodificada !== 0) {
            const anteriorRegion = anteriorCodificada - 1;
            this._actualizarConteoRegionEnBloque(bloqueId, anteriorRegion, -1);
            this._incrementarConteo(this.celdasPorRegion, anteriorRegion, -1);
            if (this.estado[indice] !== MATERIALES.NADA) {
                this._incrementarConteo(this.particulasPorRegion, anteriorRegion, -1);
            }
        }

        regiones[indiceLocal] = regionId + 1;
        this._actualizarConteoRegionEnBloque(bloqueId, regionId, 1);
        this._incrementarConteo(this.celdasPorRegion, regionId, 1);
        if (this.estado[indice] !== MATERIALES.NADA) {
            this._incrementarConteo(this.particulasPorRegion, regionId, 1);
        }
    }

    // Pasajes: tramos de muro entre regiones que el jugador abrió picando (1 bit por celda).
    // Dos celdas vecinas de regiones distintas sólo se comunican si alguna de las dos es un pasaje.
    esPasaje(indice) {
        return (this.pasajes[indice >> 3] & (1 << (indice & 7))) !== 0;
    }

    abrirPasaje(x, y) {
        if (!this.estaDentro(x, y)) return false;

        const indice = this.indiceDe(x, y);
        const mascara = 1 << (indice & 7);
        if (this.pasajes[indice >> 3] & mascara) return false;

        this.pasajes[indice >> 3] |= mascara;
        this.cantidadPasajes++;
        this.activarVecindad(x, y);     // la arena y el agua de los dos lados pueden empezar a fluir
        this.marcarModificado();        // ese tramo de muro deja de dibujarse
        return true;
    }

    reasignarRegion(x, y, regionId) {
        if (!this.estaDentro(x, y) || this.obtenerRegionXY(x, y) === regionId) return false;

        const indice = this.indiceDe(x, y);
        this.fijarRegionIndice(indice, regionId);
        this.activarVecindad(x, y);
        this.marcarModificado();
        return true;
    }

    _actualizarConteoRegionEnBloque(bloqueId, regionId, cambio) {
        let conteos = this.conteosRegionPorBloque.get(bloqueId);
        if (!conteos) {
            conteos = new Map();
            this.conteosRegionPorBloque.set(bloqueId, conteos);
        }

        const nuevo = (conteos.get(regionId) || 0) + cambio;
        if (nuevo > 0) {
            conteos.set(regionId, nuevo);
            let bloques = this.bloquesPorRegion.get(regionId);
            if (!bloques) {
                bloques = new Set();
                this.bloquesPorRegion.set(regionId, bloques);
            }
            bloques.add(bloqueId);
            return;
        }

        conteos.delete(regionId);
        const bloques = this.bloquesPorRegion.get(regionId);
        if (bloques) {
            bloques.delete(bloqueId);
            if (bloques.size === 0) this.bloquesPorRegion.delete(regionId);
        }
        if (conteos.size === 0) this.conteosRegionPorBloque.delete(bloqueId);
    }

    _incrementarConteo(conteos, regionId, cambio) {
        const nuevo = (conteos.get(regionId) || 0) + cambio;
        if (nuevo > 0) conteos.set(regionId, nuevo);
        else conteos.delete(regionId);
    }

    obtenerRegionIndice(indice) {
        const y = (indice / this.ancho) | 0;
        return this.obtenerRegionXY(indice - y * this.ancho, y);
    }

    // Región guardada de la celda (x, y), o -1 si todavía no se calculó. Sin divisiones ni Map.
    obtenerRegionXY(x, y) {
        const regiones = this.regionesPorBloque[(y >> 5) * this.bloquesAncho + (x >> 5)];
        if (regiones === null) return -1;

        const codificado = regiones[((y & 31) << 5) | (x & 31)];
        return codificado === 0 ? -1 : codificado - 1;
    }

    inicializarIndice(indice, material) {
        const byte = indice >> 3;
        const mascara = 1 << (indice & 7);
        if (this.inicializadas[byte] & mascara) return false;

        this.marcarIndiceInicializado(indice);
        this._escribirIndice(indice, material);
        if (material === MATERIALES.ARENA || material === MATERIALES.AGUA || material === MATERIALES.PIEDRA) {
            this.activarIndice(indice);
        }
        return true;
    }

    _escribirIndice(indice, material) {
        const anterior = this.estado[indice];
        if (anterior === material) return false;

        if (anterior === MATERIALES.NADA) this.particulas++;
        else if (material === MATERIALES.NADA) this.particulas--;

        const regionId = this.obtenerRegionIndice(indice);
        if (regionId >= 0) {
            if (anterior === MATERIALES.NADA && material !== MATERIALES.NADA) {
                this._incrementarConteo(this.particulasPorRegion, regionId, 1);
            } else if (anterior !== MATERIALES.NADA && material === MATERIALES.NADA) {
                this._incrementarConteo(this.particulasPorRegion, regionId, -1);
            }
        }

        this.estado[indice] = material;
        return true;
    }

    limitarOcupacionPorRegion(regionIds, porcentaje) {
        let huboCambios = false;
        for (const regionId of regionIds) {
            const maximo = Math.floor((this.celdasPorRegion.get(regionId) || 0) * porcentaje);
            let exceso = (this.particulasPorRegion.get(regionId) || 0) - maximo;
            if (exceso <= 0) continue;

            const bloques = this.bloquesPorRegion.get(regionId);
            if (!bloques) continue;

            for (const bloqueId of bloques) {
                const regiones = this.regionesPorBloque[bloqueId];
                if (!regiones) continue;

                const bx = bloqueId % this.bloquesAncho;
                const by = Math.floor(bloqueId / this.bloquesAncho);
                const x0 = bx * this.tamanioBloque;
                const y0 = by * this.tamanioBloque;
                const anchoBloque = Math.min(this.tamanioBloque, this.ancho - x0);
                const altoBloque = Math.min(this.tamanioBloque, this.alto - y0);
                const inicio = Math.floor(Math.random() * (this.tamanioBloque * this.tamanioBloque));

                for (let paso = 0; paso < anchoBloque * altoBloque && exceso > 0; paso++) {
                    const indiceLocal = (inicio + paso) % (this.tamanioBloque * this.tamanioBloque);
                    const xLocal = indiceLocal % this.tamanioBloque;
                    const yLocal = Math.floor(indiceLocal / this.tamanioBloque);
                    if (xLocal >= anchoBloque || yLocal >= altoBloque) continue;
                    if (regiones[indiceLocal] !== regionId + 1) continue;

                    const indice = (y0 + yLocal) * this.ancho + x0 + xLocal;
                    if (this.estado[indice] === MATERIALES.NADA) continue;

                    this._escribirIndice(indice, MATERIALES.NADA);
                    exceso--;
                    huboCambios = true;
                }

                if (exceso === 0) break;
            }
        }

        if (huboCambios) this.marcarModificado();
        return huboCambios;
    }

    activarBloque(bloqueId) {
        if (this.flagsBloqueActivo[bloqueId] !== 0) return;
        this.flagsBloqueActivo[bloqueId] = 1;
        this.colaActivos.push(bloqueId);
    }

    activarIndice(indice) {
        const y = (indice / this.ancho) | 0;
        this.activarBloque((y >> 5) * this.bloquesAncho + ((indice - y * this.ancho) >> 5));
    }

    // Despierta los bloques que contienen a (x, y) y a sus vecinos de ARRIBA y de los COSTADOS (8 celdas
    // alrededor menos las de abajo). Sólo los bordes del bloque pueden tocar otros bloques, así que no hace
    // falta mirar las 6 celdas: alcanza con ver si (x, y) está en el borde. (x, y) debe estar dentro del mundo.
    activarVecindad(x, y) {
        const base = (y >> 5) * this.bloquesAncho + (x >> 5);
        const izquierda = (x & 31) === 0 && x > 0;
        const derecha = (x & 31) === 31 && x + 1 < this.ancho;
        const arriba = (y & 31) === 0 && y > 0;

        // Mismo orden que recorrer las celdas (fila de arriba y después la propia, de izquierda a derecha):
        // el orden de la cola determina el orden de simulación, así que se mantiene el comportamiento anterior.
        const filaSuperior = arriba ? base - this.bloquesAncho : base;
        if (izquierda) this.activarBloque(filaSuperior - 1);
        this.activarBloque(filaSuperior);
        if (derecha) this.activarBloque(filaSuperior + 1);

        if (arriba) {
            if (izquierda) this.activarBloque(base - 1);
            this.activarBloque(base);
            if (derecha) this.activarBloque(base + 1);
        }
    }

    get cantidadBloquesActivos() {
        return this.colaActivos.length - this.cabezaCola;
    }

    contarBloquesActivosEnRectangulo(x0, y0, x1, y1) {
        const bx0 = Math.max(0, Math.floor(x0 / this.tamanioBloque));
        const by0 = Math.max(0, Math.floor(y0 / this.tamanioBloque));
        const bx1 = Math.min(this.bloquesAncho, Math.ceil(x1 / this.tamanioBloque));
        const by1 = Math.min(this.bloquesAlto, Math.ceil(y1 / this.tamanioBloque));
        let activos = 0;

        for (let by = by0; by < by1; by++) {
            for (let bx = bx0; bx < bx1; bx++) {
                activos += this.flagsBloqueActivo[by * this.bloquesAncho + bx];
            }
        }
        return activos;
    }

    // Saca de la cola hasta `maxBloques` bloques (en orden de llegada) y los deja en `lote`; devuelve cuántos.
    // Los flags se limpian ya: un bloque del lote que se vuelva a activar mientras se procesa queda en la cola
    // para el frame siguiente (no se pierde la activación).
    extraerLote(maxBloques, lote) {
        let n = 0;
        while (n < maxBloques && this.cabezaCola < this.colaActivos.length) {
            const id = this.colaActivos[this.cabezaCola++];
            this.flagsBloqueActivo[id] = 0;
            lote[n++] = id;
        }

        if (this.cabezaCola >= this.colaActivos.length) {
            this.colaActivos.length = 0;
            this.cabezaCola = 0;
        } else if (this.cabezaCola > 4096 && this.cabezaCola * 2 > this.colaActivos.length) {
            // Cada tanto se descarta lo ya consumido para que el arreglo no crezca sin fin.
            this.colaActivos.splice(0, this.cabezaCola);
            this.cabezaCola = 0;
        }
        return n;
    }

    extraerLoteEnRectangulo(maxBloques, lote, x0, y0, x1, y1) {
        const bx0 = Math.max(0, Math.floor(x0 / this.tamanioBloque));
        const by0 = Math.max(0, Math.floor(y0 / this.tamanioBloque));
        const bx1 = Math.min(this.bloquesAncho, Math.ceil(x1 / this.tamanioBloque));
        const by1 = Math.min(this.bloquesAlto, Math.ceil(y1 / this.tamanioBloque));
        const cola = this.colaActivos;
        const inicio = this.cabezaCola;
        const fin = cola.length;
        let escritura = inicio;
        let cantidad = 0;

        for (let lectura = inicio; lectura < fin; lectura++) {
            const id = cola[lectura];
            const bx = id % this.bloquesAncho;
            const by = Math.floor(id / this.bloquesAncho);
            const dentro = bx >= bx0 && bx < bx1 && by >= by0 && by < by1;

            if (dentro && cantidad < maxBloques) {
                this.flagsBloqueActivo[id] = 0;
                lote[cantidad++] = id;
            } else {
                cola[escritura++] = id;
            }
        }

        const pendientes = escritura - inicio;
        cola.copyWithin(0, inicio, escritura);
        cola.length = pendientes;
        this.cabezaCola = 0;
        return cantidad;
    }

    // Devuelve al FRENTE de la cola los bloques lote[desde..hasta) que no se llegaron a procesar (presupuesto agotado).
    devolverAlFrente(lote, desde, hasta) {
        const pendientes = [];
        for (let i = desde; i < hasta; i++) {
            const id = lote[i];
            if (this.flagsBloqueActivo[id] !== 0) continue;     // ya se volvió a activar: está en la cola
            this.flagsBloqueActivo[id] = 1;
            pendientes.push(id);
        }
        if (pendientes.length > 0) this.colaActivos.splice(this.cabezaCola, 0, ...pendientes);
    }

    // Las regiones guardadas dejaron de ser confiables (los puntos de Voronoi se movieron): se descartan y se
    // recalculan a demanda con el punto más cercano. Se despiertan todos los bloques conocidos: con los bordes
    // nuevos puede haber arena que ahora sí puede moverse.
    invalidarRegiones() {
        for (let id = 0; id < this.regionesPorBloque.length; id++) {
            if (this.regionesPorBloque[id] === null) continue;
            this.regionesPorBloque[id] = null;
            this.activarBloque(id);
        }
        this.conteosRegionPorBloque.clear();
        this.bloquesPorRegion.clear();
        this.celdasPorRegion.clear();
        this.particulasPorRegion.clear();
        this.version++;
    }

    // Si la lógica de simulación escribe directo en this.estado (más rápido), debe llamar a esto
    // al terminar el paso para que se vuelva a dibujar.
    marcarModificado() {
        this.version++;
    }

    vaciar() {
        this.estado.fill(MATERIALES.NADA);
        this.inicializadas.fill(0);
        this.flagsBloqueActivo.fill(0);
        this.colaActivos.length = 0;
        this.cabezaCola = 0;
        this.regionesPorBloque.fill(null);
        this.bloquesPorRegion.clear();
        this.conteosRegionPorBloque.clear();
        this.celdasPorRegion.clear();
        this.particulasPorRegion.clear();
        this.particulas = 0;
        this.pasajes.fill(0);
        this.cantidadPasajes = 0;
        this.versionInicializacion++;
        this.version++;
    }
}
