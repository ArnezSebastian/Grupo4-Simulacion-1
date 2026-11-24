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

function crearRngMulberry32(seed) {
    let valor = (Number(seed) >>> 0);
    return function siguiente() {
        valor = (valor + 0x6D2B79F5) | 0;
        let resultado = Math.imul(valor ^ (valor >>> 15), 1 | valor);
        resultado = (resultado + Math.imul(resultado ^ (resultado >>> 7), 61 | resultado)) ^ resultado;
        return ((resultado ^ (resultado >>> 14)) >>> 0) / 4294967296;
    };
}

function hashSeedTexto(texto) {
    let hash = 2166136261;
    const valor = String(texto);
    for (let i = 0; i < valor.length; i++) {
        hash ^= valor.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function normalizarSeed(texto) {
    const limpio = String(texto ?? "").trim();
    if (!limpio || limpio.length > 64) return null;
    if (/^\d+$/.test(limpio)) {
        const numero = Number(limpio);
        if (!Number.isSafeInteger(numero) || numero < 0) return null;
        return numero >>> 0;
    }
    return hashSeedTexto(limpio);
}

function crearSeedAleatoria() {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
        const datos = new Uint32Array(1);
        globalThis.crypto.getRandomValues(datos);
        return datos[0] >>> 0;
    }
    return Math.floor(Math.random() * 4294967296) >>> 0;
}

//Empaqueta un color en un entero de 32 bits para escribirlo en un Uint32Array.
//Orden en memoria R,G,B,A (little-endian, el de todos los navegadores actuales): 0xAABBGGRR.
function empaquetarColorRGBA(r, g, b, a = 255) {
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
