// Constantes globales del simulador. Todo número "mágico" vive acá y no repartido por las clases.

// Materiales: ids numéricos (es lo que se guarda en los Uint8Array). Los nombres sólo sirven para mostrar.
const MATERIALES = Object.freeze({
    NADA: 0, MURO: 1, ARENA: 2, PIEDRA: 3, AGUA: 4, TIERRA: 5, LAVA: 6,
    ROCA: 7, VAPOR: 8, CRISTAL: 9
});
const NOMBRES_MATERIAL = Object.freeze({
    0: "nada", 1: "muro", 2: "arena", 3: "piedra", 4: "agua", 5: "tierra", 6: "lava",
    7: "roca", 8: "vapor", 9: "cristal"
});
const COLORES_MATERIAL = Object.freeze({
    1: [107, 107, 107],
    2: [220, 190, 110],
    3: [90, 90, 98],
    4: [40, 110, 220],
    5: [139, 90, 43],
    6: [242, 83, 24],
    7: [42, 68, 88],
    8: [205, 215, 225],
    9: [130, 225, 235]
});

// Modos de la aplicación: el editor es el simulador original (puntos de Voronoi, borrador, pan de cámara);
// en el juego se controla un personaje.
const MODOS = Object.freeze({ EDITOR: "editor", JUEGO: "juego" });

const CONFIG = Object.freeze({
    // Tamaño del canvas en la pantalla de inicio. Al jugar o editar, el canvas toma el tamaño de la ventana
    // (o del recuadro del editor): con el mismo zoom se ve más o menos mundo, sin estirar nada.
    canvas: { ancho: 800, alto: 600, colorFondo: "#020202" },

    // Mundo lógico (en celdas). 2500x2500 = 6.25 M de celdas = 6.25 MB en un Uint8Array.
    mundo: { ancho: 2500, alto: 2500 },

    materiales: {
        porcentajeLlenadoMin: 0.25, // proporción vertical mínima de cada región ocupada por terreno
        porcentajeLlenadoMax: 0.5,  // proporción vertical máxima de cada región ocupada por terreno
        variacionSuperficie: 40,     // amplitud máxima de las ondulaciones en celdas
        probabilidadLava: 0.08,
        probabilidadLavaSubsuelo: 0.10,
        caidaMaximaCeldas: 3,
        probabilidadCaidaTierra: 1, // posibilidad por actualización; la tierra solo baja una celda
        probabilidadCaidaDiagonalTierra: 0.05,
        probabilidadFlujoHorizontalAgua: 1,
        alcanceFlujoHorizontalAgua: 6,
        probabilidadFlujoHorizontalLava: 0.55,
        alcanceFlujoHorizontalLava: 3,
        probabilidadDisipacionVapor: 0.01,
        pixelesVaporPorPixelAgua: 10,
        probabilidadRodarPiedra: 0.01,
        margenPrecargaPx: 500,
        margenSimulacionChunks: 1,
        celdasPorPaso: 1048576,
        // Tope de tiempo por frame para simular arena/agua. Si hay más bloques activos de los que entran, los que
        // quedan esperan en la cola y se simulan en los frames siguientes (la arena va más lenta, pero el juego no se traba).
        presupuestoMs: 10
    },
    optimizacion: {
        claveProcesamientoDirtyChunks: "voronoiland.optimizacion.dirtyChunks",
        procesamientoDirtyChunksInicial: false
    },

    // velocidadTeclado: píxeles de pantalla por segundo al mover la cámara con WASD/flechas (modo editor).
    // zoomMinJuego / zoomMaxJuego: rango de zoom permitido mientras se juega (deben ser niveles de Camara.NIVELES_ZOOM).
    // suavizadoSeguimiento: qué tan rápido la cámara alcanza al jugador (más alto = más pegada).
    camara: {
        zoomInicial: 8,
        zoomMinJuego: 4,
        zoomMaxJuego: 8,
        velocidadTeclado: 700,
        suavizadoSeguimiento: 10,
        demoraMiradaMs: 450,
        desplazamientoMiradaCeldas: 28,
        suavizadoMiradaEntrada: 3,
        suavizadoMiradaSalida: 14
    },

    // Todo en CELDAS y SEGUNDOS (velocidad = celdas/s, gravedad = celdas/s²).
    // Con 1 píxel de sprite = 1 celda, el día que haya spritesheet el cuerpo debería medir ~8-12 x 14-20.
    jugador: {
        ancho: 7,
        alto: 12,
        pasoFisicaHz: 60,           // paso fijo de la física
        velocidad: 60,
        distanciaPaso: 18,          // distancia horizontal recorrida entre pasos (en celdas)
        aceleracionSuelo: 600,
        aceleracionAire: 300,
        gravedad: 420,
        velocidadCaidaMax: 260,
        velocidadSalto: 140,        // altura del salto = v² / (2g) = unas 23 celdas
        velocidadCorteSalto: 55,    // soltar Espacio en el aire recorta el salto
        escalonMaximo: 2,           // desniveles que sube sin saltar (arena en pendiente)
        empujeMaximo: 40,           // distancia máxima para encontrar espacio libre si un material lo empotra
        histeresisCaidaMs: 500,     // tiempo sin apoyo para cambiar a la animación de caída
        liquido: { factorVelocidad: 0.55, factorGravedad: 0.3, velocidadCaidaMax: 50, velocidadNado: 70 },
        // zona: lado (en celdas) del cuadrado de la esquina que se inicializa y se barre buscando dónde aparecer.
        spawn: { zona: 96, margenLateral: 4, margenSuperior: 4 }
    },

    // Picar: radios del área circular según el material; se coloca junto al jugador hacia donde mira.
    // dureza = multiplicador del tiempo entre mordiscos (0 = no se puede picar).
    picar: {
        tasaHz: 20,
        // Forma ovalada del golpe. El radio longitudinal sigue la dirección del cursor y el transversal la atraviesa.
        factorRadioTransversal: 0.65,
        radioPorMaterial: {
            [MATERIALES.ARENA]: 3.5,
            [MATERIALES.TIERRA]: 3.5,
            [MATERIALES.PIEDRA]: 1.5,
            [MATERIALES.ROCA]: 1.5,
            [MATERIALES.CRISTAL]: 3.5,
            [MATERIALES.MURO]: 3.5
        },
        durezaBarrera: 4,
        grosorBaseBarreraPx: 5,
        dureza: {
            [MATERIALES.ARENA]: 1,
            [MATERIALES.TIERRA]: 1,
            [MATERIALES.PIEDRA]: 4,
            [MATERIALES.ROCA]: 4,
            [MATERIALES.CRISTAL]: 0.5,
            [MATERIALES.AGUA]: 0,       // los líquidos y el vapor no se pican
            [MATERIALES.LAVA]: 0
        }
    },

    puntos: {
        max: 300,               // los ids de región van en un Uint16Array: no hay tope de 255 como antes.
        distMinima: 35,         // distancia mínima entre puntos (en celdas).
        aleatorios: 120,        // cantidad que genera el botón "Generar puntos random".
        intervaloCreacionMs: 1000, // espera mínima entre puntos colocados manualmente.
        radioSemilla: 3         // radio del cuadradito blanco de cada semilla (en píxeles de pantalla).
    },

    muro: { grosorInicial: 5, color: [107, 107, 107] },

    colores: {
        semilla: [255, 255, 255],
        vacio: [2, 2, 2],               // dentro del mundo, sin puntos.
        fueraDelMundo: [30, 30, 38]     // fuera de los límites del mundo (cámara alejada).
    },

    hud: { intervaloMs: 100 },          // cada cuánto se refresca el texto del HUD.

    // Sonido (Web Audio API). Los efectos se sintetizan al momento (ver definicionesSonido.js): no hay archivos de audio.
    audio: {
        volumenMaestro: 0.5,            // 0..1
        maxVoces: 12,                   // efectos simultáneos como máximo
        sonidoEnBotones: true,          // click suave al presionar cualquier botón de la interfaz
        claveSilencio: "voronoiland.audio.silenciado",  // dónde se recuerda si el usuario silenció el sonido
        musica: 28,                     // volumen inicial de la música de inicio y del editor (0..100)
        ambiente: 28,                   // volumen inicial del ambiente del juego (0..100)
        intervaloAmbienteMs: 250        // frecuencia máxima de actualización de región para el ambiente
    }
});
