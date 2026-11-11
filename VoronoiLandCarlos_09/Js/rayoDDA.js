// Ray casting sobre la grilla con DDA (Digital Differential Analyzer, Amanatides & Woo):
// avanza celda por celda, siempre hacia el próximo borde de celda que cruza el rayo.
// Cuesta O(celdas recorridas), no O(distancia / paso) como un "ray marching" con paso fijo, y no se saltea celdas.
class RayoDDA {
    static resultado = { x: 0, y: 0, previaX: 0, previaY: 0, distancia: 0 };    // reutilizado: lanzar() no crea objetos

    // Primer celda (a lo sumo a `distanciaMax`) para la que esImpacto(x, y, previaX, previaY) es verdadero, o null.
    // `previa` es la celda de la que el rayo viene (siempre vecina en cruz; en la primera celda es ella misma),
    // así se puede detectar qué hay ENTRE las dos (por ejemplo, un muro).
    // (origenX, origenY) en coordenadas de mundo (decimales); (dirX, dirY) unitario.
    static lanzar(origenX, origenY, dirX, dirY, distanciaMax, esImpacto) {
        let x = Math.floor(origenX);
        let y = Math.floor(origenY);

        const pasoX = dirX > 0 ? 1 : -1;
        const pasoY = dirY > 0 ? 1 : -1;
        const deltaX = dirX !== 0 ? Math.abs(1 / dirX) : Infinity;      // distancia entre dos bordes verticales
        const deltaY = dirY !== 0 ? Math.abs(1 / dirY) : Infinity;
        let tX = dirX > 0 ? (x + 1 - origenX) * deltaX : dirX < 0 ? (origenX - x) * deltaX : Infinity;
        let tY = dirY > 0 ? (y + 1 - origenY) * deltaY : dirY < 0 ? (origenY - y) * deltaY : Infinity;

        let previaX = x;
        let previaY = y;
        let t = 0;      // distancia a la que el rayo ENTRA en la celda actual
        while (t <= distanciaMax) {
            if (esImpacto(x, y, previaX, previaY)) {
                const r = RayoDDA.resultado;
                r.x = x;
                r.y = y;
                r.previaX = previaX;
                r.previaY = previaY;
                r.distancia = t;
                return r;
            }

            previaX = x;
            previaY = y;
            if (tX < tY) { t = tX; tX += deltaX; x += pasoX; }
            else { t = tY; tY += deltaY; y += pasoY; }
        }
        return null;
    }
}
