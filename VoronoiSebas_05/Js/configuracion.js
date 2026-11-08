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

// Modos de la aplicación: el editor es el simulador original (puntos de Voronoi, borrador, pan de cámara);
// en el juego se controla un personaje.
const MODOS = Object.freeze({ EDITOR: "editor", JUEGO: "juego" });

const CONFIG = Object.freeze({
    // Canvas = tamaño de la cámara (en píxeles de pantalla).
    canvas: { ancho: 800, alto: 600, colorFondo: "#020202" },

    // Mundo lógico (en celdas). 5000x5000 = 25 M de celdas = 25 MB en un Uint8Array.
    mundo: { ancho: 5000, alto: 5000 },

    materiales: {
        porcentajeLlenado: 0.5,
        celdasPorPaso: 131072,
        // Tope de tiempo por frame para simular arena/agua. Si hay más bloques activos de los que entran, los que
        // quedan esperan en la cola y se simulan en los frames siguientes (la arena va más lenta, pero el juego no se traba).
        presupuestoMs: 6
    },

    // velocidadTeclado: píxeles de pantalla por segundo al mover la cámara con WASD/flechas (modo editor).
    // zoomMinJuego / zoomMaxJuego: rango de zoom permitido mientras se juega (deben ser niveles de Camara.NIVELES_ZOOM).
    // suavizadoSeguimiento: qué tan rápido la cámara alcanza al jugador (más alto = más pegada).
    camara: { zoomInicial: 8, zoomMinJuego: 4, zoomMaxJuego: 8, velocidadTeclado: 700, suavizadoSeguimiento: 10 },

    // Todo en CELDAS y SEGUNDOS (velocidad = celdas/s, gravedad = celdas/s²).
    // Con 1 píxel de sprite = 1 celda, el día que haya spritesheet el cuerpo debería medir ~8-12 x 14-20.
    jugador: {
        ancho: 10,
        alto: 16,
        color: 0xffd23f,            // recuadro provisorio (sin spritesheet por ahora)
        pasoFisicaHz: 60,           // paso fijo de la física
        velocidad: 60,
        aceleracionSuelo: 600,
        aceleracionAire: 300,
        gravedad: 420,
        velocidadCaidaMax: 260,
        velocidadSalto: 140,        // altura del salto = v² / (2g) = unas 23 celdas
        velocidadCorteSalto: 55,    // soltar Espacio en el aire recorta el salto
        escalonMaximo: 2,           // desniveles que sube sin saltar (arena en pendiente)
        empujeMaximo: 40,           // si cae arena sobre el jugador, cuánto se lo empuja hacia arriba como máximo
        agua: { factorVelocidad: 0.55, factorGravedad: 0.3, velocidadCaidaMax: 50, velocidadNado: 70 },
        // zona: lado (en celdas) del cuadrado de la esquina que se inicializa y se barre buscando dónde aparecer.
        spawn: { zona: 96, margenLateral: 4, margenSuperior: 4 }
    },

    // Picar: se apunta con la mirada del jugador (no con el mouse).
    // dureza = multiplicador del tiempo entre mordiscos; un material que no está acá no se puede picar (agua).
    picar: {
        tasaHz: 20,
        alcance: 12,                // celdas, medidas desde el borde del cuerpo
        radio: 2,                   // radio del disco que se vacía en cada mordisco
        dureza: { [MATERIALES.ARENA]: 1, [MATERIALES.PIEDRA]: 4 }
    },

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
