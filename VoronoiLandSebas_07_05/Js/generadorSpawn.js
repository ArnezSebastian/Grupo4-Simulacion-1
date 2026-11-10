// Decide dónde aparece el jugador: en la esquina superior izquierda del mundo.
//   1. Inicializa la zona de la esquina (si no, las celdas todavía no existen).
//   2. Barre desde (0, 0) buscando la primera caja del tamaño del jugador que esté vacía y dentro de una sola región.
//   3. Si no hay ninguna (el relleno al azar casi nunca deja un hueco así), busca la primera caja que
//      no cruce un borde de región y vacía una cámara de spawn alrededor.
class GeneradorSpawn {
    constructor(mundoCeldas, mundoVoronoi, regiones, inicializador, config) {
        this.mundo = mundoCeldas;
        this.mundoVoronoi = mundoVoronoi;
        this.regiones = regiones;
        this.inicializador = inicializador;
        this.configJugador = config;
        this.resultado = { x: 0, y: 0, regionId: 0, camaraVaciada: false };
    }

    generar() {
        const { ancho, alto, spawn } = this.configJugador;
        const zona = spawn.zona;

        this.inicializador.inicializarZona(0, 0, zona, zona);

        const r = this.resultado;
        r.camaraVaciada = false;

        let regionId = this._buscarCaja(ancho, alto, zona, true, r);
        if (regionId < 0) {
            regionId = this._buscarCaja(ancho, alto, zona, false, r);
            if (regionId < 0) {
                // Un borde de región cruza toda la esquina: se aparece igual en (0, 0) con la región de su centro.
                r.x = 0;
                r.y = 0;
                regionId = this.regiones.regionEn(Math.floor(ancho / 2), Math.floor(alto / 2));
            }
            this._vaciarCamara(r.x, r.y, ancho, alto, regionId, spawn);
            r.camaraVaciada = true;
        }

        r.regionId = regionId;
        return r;
    }

    // Recorre las posiciones de la zona fila por fila desde (0, 0). Devuelve el id de región de la primera caja
    // válida (y deja su posición en `salida`) o -1. Si exigeVacia, todas las celdas tienen que ser NADA.
    _buscarCaja(ancho, alto, zona, exigeVacia, salida) {
        const maxX = Math.min(zona, this.mundo.ancho) - ancho;
        const maxY = Math.min(zona, this.mundo.alto) - alto;

        for (let y = 0; y <= maxY; y++) {
            for (let x = 0; x <= maxX; x++) {
                const regionId = this._regionUnicaDeCaja(x, y, ancho, alto, exigeVacia);
                if (regionId < 0) continue;

                salida.x = x;
                salida.y = y;
                return regionId;
            }
        }
        return -1;
    }

    // Id de región si TODAS las celdas de la caja pertenecen a la misma (y, si exigeVacia, están vacías); si no, -1.
    _regionUnicaDeCaja(x0, y0, ancho, alto, exigeVacia) {
        const estado = this.mundo.estado;
        let regionId = -1;

        for (let y = y0; y < y0 + alto; y++) {
            for (let x = x0; x < x0 + ancho; x++) {
                if (exigeVacia && estado[this.mundo.indiceDe(x, y)] !== MATERIALES.NADA) return -1;

                if (this.regiones.esBarrera(x, y)) return -1;       // no aparecer encima de un borde

                const id = this.regiones.regionEn(x, y);
                if (regionId < 0) regionId = id;
                else if (id !== regionId) return -1;
            }
        }
        return regionId;
    }

    // Vacía la caja y un margen lateral y superior (sólo celdas de la misma región: no se "rompe" el borde).
    _vaciarCamara(x0, y0, ancho, alto, regionId, spawn) {
        const desdeX = x0 - spawn.margenLateral;
        const hastaX = x0 + ancho + spawn.margenLateral;
        const desdeY = y0 - spawn.margenSuperior;
        const hastaY = y0 + alto;

        for (let y = Math.max(0, desdeY); y < hastaY; y++) {
            for (let x = Math.max(0, desdeX); x < hastaX; x++) {
                if (!this.mundo.estaDentro(x, y)) continue;
                if (this.regiones.regionEn(x, y) !== regionId) continue;
                this.mundo.excavar(x, y);
            }
        }
    }
}
