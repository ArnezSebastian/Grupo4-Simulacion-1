//Función para elegir un valor aleatorio en base a un mínimo y un máximo dados por parámetro:
function elegirValorAleatorioEntre(valMin, valMax) {
    //Serciorarse que el valor sea finalmente un entero:
    const min = Math.ceil(valMin);
    const max = Math.floor(valMax);

    //Retorna el valor entero entre esos valores:
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//Mantiene un valor dentro de [min, max]:
function limitarValor(valor, min, max) {
    return Math.min(Math.max(valor, min), max);
}

//Empaqueta un color en un entero de 32 bits para escribirlo en un Uint32Array.
//Orden en memoria R,G,B,A (little-endian, el de todos los navegadores actuales): 0xAABBGGRR.
function empaquetarColorRGBA(r, g, b, a = 255) {
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
