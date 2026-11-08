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
        let regionId = this.mundoCeldas.obtenerRegionIndice(indice);
        if (regionId >= 0) return regionId;

        regionId = this.mundoVoronoi.indiceMasCercano(x, y) + 1;
        this.mundoCeldas.fijarRegionIndice(indice, regionId);
        return regionId;
    }

    // (x, y) debe estar dentro del mundo.
    regionEn(x, y) {
        return this.regionEnIndice(this.mundoCeldas.indiceDe(x, y), x, y);
    }
}
