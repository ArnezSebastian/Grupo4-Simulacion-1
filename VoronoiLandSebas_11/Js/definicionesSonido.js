// Catálogo de efectos de sonido. Cada efecto es DATOS (qué voces suenan y cómo evolucionan), no código:
// SintetizadorSonidos los convierte en nodos de Web Audio en el momento de reproducirlos, así que no hay archivos
// de audio. Para cambiar cómo suena algo, o agregar un efecto nuevo (por ejemplo un picado distinto según el
// material), sólo hay que tocar este archivo.
//
// Un efecto:
//   minIntervaloMs: tiempo mínimo entre dos reproducciones del mismo efecto (evita que se apilen)
//   variacionTono:  0..1, cuánto varía el tono al azar en cada reproducción (0.05 = ±5%): suena menos repetitivo
//   voces:          lista de voces que suenan a la vez (ver abajo)
//
// Una voz:
//   tipo:       "oscilador" (un tono) | "ruido" (ruido blanco: golpes, roces)
//   onda:       "sine" | "triangle" | "square" | "sawtooth"            (sólo osciladores)
//   frecuencia: Hz fijos, o una curva [[segundos, Hz], ...] que se recorre de forma exponencial
//               (sólo osciladores: es el tono)
//   filtro:     { tipo: "bandpass" | "lowpass" | "highpass", frecuencia: Hz o curva, q }   (obligatorio en el ruido)
//   inicio:     segundos de retraso respecto del comienzo del efecto (por defecto 0)
//   duracion:   segundos que dura la voz
//   ataque:     segundos que tarda en llegar al volumen máximo (por defecto 0.003)
//   volumen:    0..1 (el volumen general se regula aparte, en CONFIG.audio.volumenMaestro)
const DEFINICIONES_SONIDO = Object.freeze({

    // Click suave de interfaz.
    boton: {
        minIntervaloMs: 40,
        variacionTono: 0.02,
        voces: [
            { tipo: "oscilador", onda: "triangle", frecuencia: [[0, 1100], [0.05, 820]], duracion: 0.07, ataque: 0.003, volumen: 0.35 }
        ]
    },

    // Salto: un "boing" corto que sube de tono.
    salto: {
        minIntervaloMs: 80,
        variacionTono: 0.05,
        voces: [
            {
                tipo: "oscilador", onda: "square", frecuencia: [[0, 230], [0.14, 560]],
                filtro: { tipo: "lowpass", frecuencia: 1400, q: 0.7 },
                duracion: 0.17, ataque: 0.006, volumen: 0.22
            },
            { tipo: "oscilador", onda: "sine", frecuencia: [[0, 460], [0.14, 1120]], duracion: 0.14, ataque: 0.006, volumen: 0.12 }
        ]
    },

    // Golpe de pico: un "tac" (ruido filtrado) con un golpe grave abajo. Igual para todos los materiales.
    picar: {
        minIntervaloMs: 120,
        variacionTono: 0.06,
        voces: [
            {
                tipo: "ruido", filtro: { tipo: "bandpass", frecuencia: [[0, 2200], [0.09, 700]], q: 1.4 },
                duracion: 0.1, ataque: 0.002, volumen: 0.5
            },
            { tipo: "oscilador", onda: "sine", frecuencia: [[0, 190], [0.09, 70]], duracion: 0.11, ataque: 0.002, volumen: 0.5 },
            { tipo: "oscilador", onda: "square", frecuencia: [[0, 950], [0.02, 600]], duracion: 0.03, ataque: 0.001, volumen: 0.1 }
        ]
    },

    // Se crea un punto (o varios): dos notas rápidas que suben.
    puntoCreado: {
        minIntervaloMs: 60,
        variacionTono: 0,
        voces: [
            { tipo: "oscilador", onda: "sine", frecuencia: 660, duracion: 0.09, ataque: 0.004, volumen: 0.3 },
            { tipo: "oscilador", onda: "sine", frecuencia: 990, inicio: 0.07, duracion: 0.14, ataque: 0.004, volumen: 0.3 }
        ]
    },

    // Se borra un punto (o todos): un tono que cae, con un soplido corto.
    puntoBorrado: {
        minIntervaloMs: 60,
        variacionTono: 0,
        voces: [
            { tipo: "oscilador", onda: "triangle", frecuencia: [[0, 520], [0.16, 170]], duracion: 0.18, ataque: 0.004, volumen: 0.33 },
            {
                tipo: "ruido", filtro: { tipo: "bandpass", frecuencia: [[0, 900], [0.08, 300]], q: 0.9 },
                duracion: 0.08, ataque: 0.002, volumen: 0.12
            }
        ]
    }
});
