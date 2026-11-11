// Consulta compartida "¿a qué región de Voronoi pertenece esta celda?".
// La usan el motor de materiales y la física del jugador. Un MURO es la línea entre dos celdas vecinas de regiones
// distintas: ni la arena ni el jugador la cruzan, salvo por un "pasaje" que el jugador abrió picando.
// (El muro es sólo esa línea: el aire del otro lado NO es sólido, se camina normalmente.)
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

    // ¿Hay un muro cerrado entre dos celdas vecinas? Sí si son de regiones distintas y ninguna de las dos es un pasaje.
    // Fuera del mundo nunca hay muro (eso lo frena otra regla).
    hayMuroEntre(xA, yA, xB, yB) {
        const mundo = this.mundoCeldas;
        if (!mundo.estaDentro(xA, yA) || !mundo.estaDentro(xB, yB)) return false;

        const indiceA = mundo.indiceDe(xA, yA);
        const indiceB = mundo.indiceDe(xB, yB);
        if (this.regionEnIndice(indiceA, xA, yA) === this.regionEnIndice(indiceB, xB, yB)) return false;
        return !mundo.esPasaje(indiceA) && !mundo.esPasaje(indiceB);
    }

    // ¿La celda toca (en cruz) algún muro cerrado?
    celdaTocaMuro(x, y) {
        return this.hayMuroEntre(x, y, x + 1, y) || this.hayMuroEntre(x, y, x - 1, y)
            || this.hayMuroEntre(x, y, x, y + 1) || this.hayMuroEntre(x, y, x, y - 1);
    }
}
