// Consulta compartida "¿a qué región de Voronoi pertenece esta celda?".
// La usan el motor de materiales (la arena no cruza bordes) y la física del jugador (tampoco).
// La primera vez que se pregunta por una celda se calcula con el punto más cercano y el resultado queda
// guardado en MundoCeldas, así las siguientes consultas son una lectura de memoria.
class RegionesDelMundo {
    constructor(mundoCeldas, mundoVoronoi) {
        this.mundoCeldas = mundoCeldas;
        this.mundoVoronoi = mundoVoronoi;
    }

    // Id de región (índice del punto + 1; 0 si no hay puntos). Versión rápida si ya se conoce el índice lineal.
    regionEnIndice(indice, x, y) {
        let regionId = this.mundoCeldas.obtenerRegionXY(x, y);
        if (regionId >= 0) return regionId;

        regionId = this.mundoVoronoi.indiceMasCercano(x, y) + 1;
        this.mundoCeldas.fijarRegionIndice(indice, regionId);
        return regionId;
    }

    // (x, y) debe estar dentro del mundo.
    regionEn(x, y) {
        return this.regionEnIndice(this.mundoCeldas.indiceDe(x, y), x, y);
    }

    // Un borde de región es la línea de celdas donde una región toca a otra. Ese borde (y sólo ese) es la
    // barrera: lo de adentro de la región vecina, aunque esté vacío, es espacio normal.
    // esBorde: la celda toca (en 4 direcciones) a una celda de otra región, de cualquiera de los dos lados.
    esBorde(x, y) {
        const regionId = this.regionEn(x, y);
        return this._vecinoDistinto(regionId, x - 1, y, false)
            || this._vecinoDistinto(regionId, x + 1, y, false)
            || this._vecinoDistinto(regionId, x, y - 1, false)
            || this._vecinoDistinto(regionId, x, y + 1, false);
    }

    // esBarrera: la celda de borde que está del lado de la región de id MAYOR (así la línea tiene 1 celda de
    // grosor y no 2) y que todavía no fue picada. Es lo que bloquea al jugador y lo que el rayo detecta.
    esBarrera(x, y) {
        const mundo = this.mundoCeldas;
        if (mundo.cantidadBarrerasAbiertas > 0 && mundo.estaAbierta(mundo.indiceDe(x, y))) return false;

        const regionId = this.regionEn(x, y);
        return this._vecinoDistinto(regionId, x - 1, y, true)
            || this._vecinoDistinto(regionId, x + 1, y, true)
            || this._vecinoDistinto(regionId, x, y - 1, true)
            || this._vecinoDistinto(regionId, x, y + 1, true);
    }

    // soloMenor = true: el vecino tiene que ser de una región de id menor; false: de cualquier otra región.
    _vecinoDistinto(regionId, x, y, soloMenor) {
        if (!this.mundoCeldas.estaDentro(x, y)) return false;

        const vecino = this.regionEn(x, y);
        return soloMenor ? vecino < regionId : vecino !== regionId;
    }
}
