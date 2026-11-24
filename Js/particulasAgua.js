// Destellos del agua: píxeles claros que aparecen y se desvanecen sobre el agua, para que parezca viva.
// Siguen el mismo criterio que la simulación de materiales: una región de agua se activa (MundoCeldas.regionesActivas)
// cuando el jugador entra en ella o cuando se le abre un pasaje en el muro, y entonces todo su
// agua visible empieza a tener destellos. Las regiones que nunca se despertaron no gastan nada.
//
// Los destellos NO se mueven: nacen en un lugar, se encienden, se apagan y desaparecen. Cada uno cubre sólo celdas de
// agua de una misma región activa (si el agua llega hasta el borde de la región, el destello se acorta para no pasarse)
// y si el agua se corre de debajo, el destello se va.
//
// Viven en coordenadas del MUNDO (en celdas) y se dibujan con sprites de PixiJS encima del mundo y debajo del jugador.
// Se reutiliza un pool fijo de sprites y de arrays tipados, como en ParticulasJugador.
class ParticulasAgua {
    constructor(escenario, camara, mundoCeldas, regiones, config) {
        this.camara = camara;
        this.mundoCeldas = mundoCeldas;
        this.regiones = regiones;
        this.config = config;

        const max = config.maximo;
        this.max = max;
        this.siguiente = 0;
        this.acumuladorSpawn = 0;
        this.activas = 0;

        this.activa = new Uint8Array(max);
        this.celdaX = new Int32Array(max);        // celda de la izquierda del destello
        this.celdaY = new Int32Array(max);
        this.largo = new Uint8Array(max);         // en celdas (ya recortado para quedar dentro del agua de la región)
        this.edad = new Float32Array(max);
        this.vida = new Float32Array(max);
        this.alfaMaximo = new Float32Array(max);

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

    actualizar(deltaSeg) {
        const c = this.config;
        const hayRegionesActivas = c.activado && this.mundoCeldas.regionesActivas.size > 0;

        if (hayRegionesActivas && this.activas < this.max) {
            this.acumuladorSpawn += c.porSegundo * deltaSeg;
            while (this.acumuladorSpawn >= 1) {
                this.acumuladorSpawn -= 1;
                this._crear();
            }
        } else if (!hayRegionesActivas) {
            this.acumuladorSpawn = 0;
        }

        const mundo = this.mundoCeldas;
        for (let i = 0; i < this.max; i++) {
            if (!this.activa[i]) continue;

            this.edad[i] += deltaSeg;
            if (this.edad[i] >= this.vida[i]) {
                this._apagar(i);
                continue;
            }

            // Debe seguir sobre agua: si el agua se corrió, el destello se apaga.
            const fila = this.celdaY[i] * mundo.ancho;
            for (let k = 0; k < this.largo[i]; k++) {
                if (mundo.estado[fila + this.celdaX[i] + k] !== MATERIALES.AGUA) {
                    this._apagar(i);
                    break;
                }
            }
        }
    }

    dibujar() {
        const camara = this.camara;
        const zoom = camara.zoom;
        const alto = Math.max(1, Math.round(zoom * this.config.alto));

        for (let i = 0; i < this.max; i++) {
            if (!this.activa[i]) continue;

            // Aparece y se desvanece suavemente (0 -> máximo -> 0 a lo largo de su vida).
            const progreso = this.edad[i] / this.vida[i];

            const sprite = this.sprites[i];
            sprite.width = Math.max(1, Math.round(this.largo[i] * zoom));
            sprite.height = alto;
            sprite.alpha = this.alfaMaximo[i] * Math.sin(Math.PI * progreso);
            sprite.position.set(
                Math.round(camara.pantallaXDe(this.celdaX[i])),
                Math.round(camara.pantallaYDe(this.celdaY[i]))
            );
        }
    }

    limpiar() {
        this.activa.fill(0);
        this.activas = 0;
        this.acumuladorSpawn = 0;
        for (let i = 0; i < this.max; i++) this.sprites[i].visible = false;
    }

    // --- Internos ---

    // Deja un destello sobre agua de una región activa dentro de lo que se ve. Una parte (fraccionSuperficie) va sobre la
    // superficie, que se busca bajando por una columna al azar; el resto va en celdas de agua al azar, más adentro.
    _crear() {
        const c = this.config;
        const camara = this.camara;
        const mundo = this.mundoCeldas;
        const activas = mundo.regionesActivas;

        const yInicio = Math.max(0, Math.floor(camara.origenY));
        const yFin = Math.min(mundo.alto - 1, Math.ceil(camara.origenY + camara.altoVisible));

        if (Math.random() < c.fraccionSuperficie) {
            for (let intento = 0; intento < c.intentosPorDestello; intento++) {
                const x = Math.floor(camara.origenX + Math.random() * camara.anchoVisible);
                if (x < 0 || x >= mundo.ancho) continue;

                for (let y = yInicio; y <= yFin; y++) {
                    const indice = y * mundo.ancho + x;
                    if (mundo.estado[indice] !== MATERIALES.AGUA) continue;
                    if (y > 0 && mundo.estado[indice - mundo.ancho] === MATERIALES.AGUA) break;     // ya no es la superficie
                    const regionId = this.regiones.regionEnIndice(indice, x, y);
                    if (!activas.has(regionId)) break;
                    this._escribir(x, y, regionId, true);
                    return true;
                }
            }
            return false;
        }

        for (let intento = 0; intento < c.intentosPorDestello; intento++) {
            const x = Math.floor(camara.origenX + Math.random() * camara.anchoVisible);
            const y = yInicio + Math.floor(Math.random() * (yFin - yInicio + 1));
            if (x < 0 || x >= mundo.ancho) continue;

            const indice = y * mundo.ancho + x;
            if (mundo.estado[indice] !== MATERIALES.AGUA) continue;
            const regionId = this.regiones.regionEnIndice(indice, x, y);
            if (!activas.has(regionId)) continue;

            this._escribir(x, y, regionId, false);
            return true;
        }
        return false;
    }

    _escribir(x, y, regionId, enSuperficie) {
        const c = this.config;
        const mundo = this.mundoCeldas;

        let i = -1;
        for (let n = 0; n < this.max; n++) {
            const candidato = (this.siguiente + n) % this.max;
            if (!this.activa[candidato]) { i = candidato; break; }
        }
        if (i < 0) return;
        this.siguiente = (i + 1) % this.max;

        // Largo deseado, recortado hacia la derecha hasta donde haya agua de la misma región.
        const deseado = c.largoMin + Math.floor(Math.random() * (c.largoMax - c.largoMin + 1));
        let largo = 1;
        while (largo < deseado && x + largo < mundo.ancho) {
            const indice = y * mundo.ancho + x + largo;
            if (mundo.estado[indice] !== MATERIALES.AGUA) break;
            if (this.regiones.regionEnIndice(indice, x + largo, y) !== regionId) break;
            largo++;
        }

        this.activa[i] = 1;
        this.activas++;
        this.celdaX[i] = x;
        this.celdaY[i] = y;
        this.largo[i] = largo;
        this.edad[i] = 0;
        this.vida[i] = c.vidaMin + Math.random() * (c.vidaMax - c.vidaMin);
        this.alfaMaximo[i] = (enSuperficie ? c.alfaSuperficie : c.alfaInterior) * (0.75 + Math.random() * 0.25);

        const sprite = this.sprites[i];
        sprite.tint = enSuperficie ? c.colorSuperficie : c.colorInterior;
        sprite.visible = true;
    }

    _apagar(i) {
        this.activa[i] = 0;
        this.activas--;
        this.sprites[i].visible = false;
    }
}
