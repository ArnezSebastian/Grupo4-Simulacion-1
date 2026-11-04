// Grilla lógica del mundo (falling sand): 1 byte por celda con el id del material.
// 5000x5000 = 25 MB. No hay buffer de color a escala del mundo: el color se calcula sólo para lo visible.
class MundoCeldas {
    constructor(ancho, alto) {
        this.ancho = ancho;
        this.alto = alto;
        this.estado = new Uint8Array(ancho * alto);
        this.particulas = 0;    // celdas ocupadas (material distinto de NADA)
        this.version = 0;       // dirty flag para el rasterizador
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
        const anterior = this.estado[i];
        if (anterior === material) return true;

        if (anterior === MATERIALES.NADA) this.particulas++;
        else if (material === MATERIALES.NADA) this.particulas--;

        this.estado[i] = material;
        this.version++;
        return true;
    }

    // Si la lógica de simulación escribe directo en this.estado (más rápido), debe llamar a esto
    // al terminar el paso para que se vuelva a dibujar.
    marcarModificado() {
        this.version++;
    }

    vaciar() {
        this.estado.fill(MATERIALES.NADA);
        this.particulas = 0;
        this.version++;
    }
}
