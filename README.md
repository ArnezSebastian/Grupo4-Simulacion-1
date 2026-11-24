# Proyecto "VoronoiLand"


## ¿Qué es "VoronoiLand"?

Es un proyecto académico de Juego web de exploración que usa sistemas de Falling sand seccionado con voronoi configurable para la materia de **Simulación 1**.

## ¿Qué sistemas usamos?

Los principales sistemas de simulación web son los siguientes:
- ``Falling Sand``: Sistema de Autómata Celular usado para la implementación, organización y reacciones de los materiales en nuestro juego.
- ``Diagramas de Voronoi``: Uso de un diagramado de Voronoi para que el software pueda generar mapas de forma procedural.

## ¿Quienes somos?

Somos un grupo académico de la **Universidad Nacional de Hurlingham** conformado por:
- **Arnez Sebastian**: Coder.
- **Genisetto Carlos**: Coder.

## Lenguajes

| Lenguaje | Función |
|---|---|
| HTML | Estructuración de la página web |
| CSS | Estilizado general |
| JavaScript | Funcionalidad y Responsividad |

## Técnicas de optimización usadas

- **SoA**: Uso de arrays tipados (como ``UInt8ClampedArray`` y ``UInt32array``) para el manejo de recorridos en grillas unidimensionales paralelas.
- **Notación Big(O) con tendencia a O(1)**: Uso de una notación que va a tender a valores continuos y controlados, en casos de no ser completamente controlados por los usuarios.
- **Falling Sand** optimizado a través de areas activas (se renderiza **donde se encuentra el jugador**).
- **Falling Sand** optimizado a través de la interacción con los materiales.
- **Dirty Chunks por Celdas Activable**: Uso de un sistema de dirty chuncks refinado por celdas de 32x32 (``ÙInt16array``) activable a través del modo Editor o del menú de Pausa.
- **Seeeding procedural y determinista**: Uso de un sistema PRNG (Pseudo-Random Number Generator) a través de ``Math.Random()`` ``Mulberry32`` y funciones criptográficas de Javascript.
- **Labels para escribir las semillas manualmente**: con conversor a través de ``regExp`` para validar su estructura y rango.
- **Sonido procedural a traves de WAA**: Uso de un sistema de Web Audio API de Js para generar contextos de sonidos procedurales y livianos de procesar (características predefinidas en objetos inmutables, con ``Object.Freeze()``).
- **Limitación de pixeles de falling sand**: Uso de un sistema que limita la cantidad de pixeles a procesar en base a un límite máximo de tiempo de respuesta en milisegundos (``10 ms``). Pasado ese tiempo, se pasa a un array de pixeles próximos a procesar.
- **Memorización**: Memorización de mapas y configuraciones del usuario a través de ``LocalStorage`` y ``Snapshot``.
- **Fondos Codificados**: Fondos generados a través de código (objetos inmutables) para optimizar su generación in-game.
- **Finite State Machine global y controlada**: Uso de una máquina de estados global que actualiza la animación del personaje/objeto usando ``histéresis`` para que el sistema cambia de estados de manera sutíl.
- **Lazy Initalizations**: Uso de inicializaciones perezosas para los sistemas de Voronoi y llenado de secciones con material adecuado.

## Controles:

| Control específico | Modo Editor | Modo Juego |
|---|---|---|
| ``Cilck`` | Agregar/Sustraer puntos | Picar (Manteniendo al material) |
| ``WASD`` / ``← ↑ ↓ →`` | Mover cámara | Mover personaje y mirar Arriba/abajo |
| Tecla ``0`` | Centrar cámara | NO |
| Tecla ``Esc`` | NO | Pausar juego |
| ``Rueda del Mouse`` | Zoom In/Out (hasta x0.5) | Zoom In/Out (Hasta x4) | 
| ``Click Der`` / ``Space`` + ``Arrastrar Click`` | Arrastrar cámara | NO |