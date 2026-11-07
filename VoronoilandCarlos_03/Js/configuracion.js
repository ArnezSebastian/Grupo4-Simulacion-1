// Constantes globales del simulador. Todo número "mágico" vive acá y no repartido por las clases.

// Materiales: ids numéricos (es lo que se guarda en los Uint8Array). Los nombres sólo sirven para mostrar.
const MATERIALES = Object.freeze({ NADA: 0, MURO: 1, ARENA: 2, PIEDRA: 3, AGUA: 4 });
const NOMBRES_MATERIAL = Object.freeze({ 0: "nada", 1: "muro", 2: "arena", 3: "piedra", 4: "agua" });
const COLORES_MATERIAL = Object.freeze({
    1: [107, 107, 107],
    2: [220, 190, 110],
    3: [90, 90, 98],
    4: [40, 110, 220]
});

const CONFIG = Object.freeze({
    // Canvas = tamaño de la cámara (en píxeles de pantalla).
    canvas: { ancho: 800, alto: 600, colorFondo: "#020202" },

    // Mundo lógico (en celdas). 5000x5000 = 25 M de celdas = 25 MB en un Uint8Array.
    mundo: { ancho: 5000, alto: 5000 },

    materiales: {
        porcentajeLlenado: 0.5,
        celdasPorPaso: 131072
    },

    // velocidadTeclado: píxeles de pantalla por segundo al mover la cámara con WASD/flechas.
    camara: { zoomInicial: 2, velocidadTeclado: 700 },

    puntos: {
        max: 300,               // los ids de región van en un Uint16Array: no hay tope de 255 como antes.
        distMinima: 35,         // distancia mínima entre puntos (en celdas).
        aleatorios: 120,        // cantidad que genera el botón "Generar puntos random".
        intervaloCreacionMs: 1000, // espera mínima entre puntos colocados manualmente.
        velocidadManual: 2,
        velocidadAleatoria: 3,
        margenRebote: 2,
        radioSemilla: 3         // radio del cuadradito blanco de cada semilla (en píxeles de pantalla).
    },

    muro: { grosorInicial: 1, color: [107, 107, 107] },

    colores: {
        semilla: [255, 255, 255],
        vacio: [2, 2, 2],               // dentro del mundo, sin puntos.
        fueraDelMundo: [30, 30, 38]     // fuera de los límites del mundo (cámara alejada).
    },

    hud: { intervaloMs: 100 }           // cada cuánto se refresca el texto del HUD.
});
