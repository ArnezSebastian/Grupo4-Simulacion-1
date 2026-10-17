class SimuladorVoronoi {
    //Aplicación:
    pixiApp;

    //Canvas y configuraciones:
    canvas;


    //(Descartado) contexto del diagrama (para especificar que es una grilla 2d en caso de 
    // usar bibliotecas)
    ctx;

    //Configuraciones del canvas:
    canvasWidth = 300;
    canvasHeight = 300;

    //Indicadores de escala (plantearlos al mismo nivel que los valores default en html):
    canvasScaler = 2;
    muroGrosor = 1;
    
    //Botones y sliders:
    btnReset;
    btnRandom;
    btnDinamic;
    sliderCanvas;
    sliderPencil;
    sliderMuro;

    //lista de puntos.
    puntos= [];

    //propiedades del mouse:
    mouse;

    containerPrincipal;

    //Texto de fps actualizable.
    textoFPS;


    //Materiales:
    materiales = {
        nada: 0,
        muro: 1
    }


    //Buffer para recorridos y actualización de color/materiales:
    bufferPixeles;

    //Textura del buffer:
    textureBuffer;

    //Sprite del buffer total:
    spriteDrawer;

    //Grilla de estados de materiales (falling sand):
    gridState;

    //Grilla de areas según puntos (voronoi):
    gridVoronoi;

    //valor de material de piedra:
    valorRPiedra = 107;
    valorGPiedra = 107;
    valorBPiedra = 107;
    
    valorRPunto = 255;
    valorGPunto = 255;
    valorBPunto = 255;

    dinamismoActivado = false;

    constructor () {
        this.initializeDOMBinds();

        this.initPIXI();
    }

    initializeDOMBinds() {
        //Sliders:
        this.sliderMuro = document.getElementById("scaleWall");
        this.sliderCanvas = document.getElementById("scaleCanvas");
        //this.sliderPencil = document.getElementById("scalePencil");
        
        //Botones:
        this.btnReset = document.getElementById("reset-canvas");
        this.btnRandom = document.getElementById("random-points");
        this.btnDinamic = document.getElementById("dinamic-points");
    }

    async initPIXI() {

        this.pixiApp = new PIXI.Application();

        //this.agregarInteractividadGeneral();

        await this.pixiApp.init(
            {
                width: this.canvasWidth * this.canvasScaler,
                height: this.canvasHeight * this.canvasScaler,
                backgroundColor: "#020202"
            }
        );

        document.body.appendChild(this.pixiApp.canvas);

        this.ctx = this.pixiApp.canvas.getContext("2d");

        this.pixiApp.stage.eventMode = 'static';

        this.agregarInteractividadGeneral();

        this.mouse = {
            position: {
                x: 0,
                y: 0
            },
            pres: false
        }

        //Planteo todas las grillas necesarias:

        this.plantearBufferDeCanvas();

        this.plantearGrillaDeEstados();

        this.plantearGrillaDeAreas();

        this.agregarInteractividadAlMouse();

        this.generarTextoFPS();

        //Activo el gameloop:

        this.pixiApp.ticker.add(this.gameLoop.bind(this));

    }

    gameLoop(time) {
        
        this.actualizarTextoFPS();

        this.agregarDinamismoSiCorresponde();

        this.actualizarDiagramaGeneral();

    }

    //Funciones de interactividad:

    agregarInteractividadGeneral() {
        this.agregarInteractividadDeBotones();
        this.agregarInteractividadDeSliders();
    }

    agregarInteractividadDeBotones() {
        this.resetearCanvasAlClickear();
        this.generarPuntosAleatoriamenteAlClickear();
        this.agregarDinamismoAlClickear();
    }

    agregarInteractividadDeSliders() {
        this.actualizarTamanioCanvasConSlider();
        this.actualizarTamanioPincelConSlider();
    }

    resetearCanvasAlClickear() {
        this.btnReset.addEventListener("click", (e) => {
            this.resetearCanvas();
        })

    }

    resetearCanvas() {

        //Vacío lo relacionado a los puntos del diagrama de voronoi:
        this.eliminarPuntosDelCanvas();
        this.vaciarGrillaDeAreas(); //a chequear porqué no funciona completamente.

        //Vacío y actualizo el diagrama general.
        this.vaciarGrillaDeEstados();
        this.pintarCanvasDeVacíoSiCorresponde();
        
    }

    eliminarPuntosDelCanvas() {
        // Vacía la lista de puntos.
        this.puntos = [];
    }

    actualizarTamanioCanvasConSlider() {
        this.sliderCanvas.addEventListener('input', (e) => {
            this.canvasScaler = e.target.value; 

            this.escalarCanvas();
        })
    }

    actualizarTamanioPincelConSlider() { //no se debería actualizar el punto central ya que siempre será el mismo de donde partirá
        this.sliderMuro.addEventListener('input', (e) => {
            this.muroGrosor = e.target.value;
        } )
    }

    agregarDinamismoAlClickear() {
        this.btnDinamic.addEventListener("click", (e) => {
            this.dinamismoActivado = !this.dinamismoActivado;
        })
    }

    //Funciones Generales:

    agregarDinamismoSiCorresponde() {
        if(!this.dinamismoActivado) return;

        this.activarDinamismoDePuntos();
    }

    activarDinamismoDePuntos() {
        // Hace que los puntos de la lista de puntos se muevan en pantalla en 
        // direcciones diagonales. Estos deben ser capaces de rebotar con los límites del canvas.
        if (!this.puntos || this.puntos.length === 0) return;

        // Recorrido O(N) optimizado para actualizar posiciones y rebotar en bordes
        for (let i = 0; i < this.puntos.length; i++) {
            let p = this.puntos[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x <= 2 || p.x >= this.canvasWidth - 2) {
                p.vx *= -1;
                p.x = Math.max(2, Math.min(this.canvasWidth - 3, p.x));
            }
            if (p.y <= 2 || p.y >= this.canvasHeight - 2) {
                p.vy *= -1;
                p.y = Math.max(2, Math.min(this.canvasHeight - 3, p.y));
            }
        }
    }

    generarPuntosAleatoriamenteAlClickear () {
        this.btnRandom.addEventListener("click", (e) => {

            this.resetearCanvas();

            this.generarPuntosAleatoriamente();

            this.actualizarDiagramaVoronoi();
            
        })
    }

    generarPuntosAleatoriamente() {
        // Añade puntos en posiciones aleatorias del canvas y los guarda en la lista de puntos.

        this.puntos = [];
        const cantidadPuntos = 10; // Semillas de Voronoi

        for (let i = 0; i < cantidadPuntos; i++) {
            const x = Math.floor(Math.random() * this.canvasWidth);
            const y = Math.floor(Math.random() * this.canvasHeight);
            
            // Colores aleatorios distintivos por región
            const r = Math.floor(Math.random() * 200 + 55);
            const g = Math.floor(Math.random() * 200 + 55);
            const b = Math.floor(Math.random() * 200 + 55);

            this.puntos.push({
                x: x,
                y: y,
                color: [r, g, b],
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3
            });
        }
    }

    agregarInteractividadAlMouse() {

        this.actualizarPosicionDelMouseAlMover();

        this.agregarInteractividadDeMousePresionado();
        this.agregarInteractividadDeMouseAlSoltar();

        /*

        //Funciones potencialmente útiles a futuro:
        this.actualizarPosicionDelMouseAlClickear();
        this.actualizarPosicionDelMouseAlSoltar();
        */

    }

    actualizarPosicionDelMouseAlMover() {
        this.pixiApp.canvas.onmousemove = (e) => {
            //getBoundingClientRect = obtener el rectángulo delimitador del elemento.
            const rect = this.pixiApp.canvas.getBoundingClientRect(); //método que devuelve valores de posición y tamaño de un DOM html.

            this.mouse.position.x = this.convertirCoordenadaXDelMouse(e.clientX, rect);

            this.mouse.position.y = this.convertirCoordenadaYDelMouse(e.clientY, rect);
        }
    }

    agregarInteractividadDeMousePresionado() {
        this.pixiApp.canvas.onmousedown = (e) => {
            this.mouse.pres = true;
            this.dibujarPuntoEnBaseAlMouse();
        };
    }

    agregarInteractividadDeMouseAlSoltar() {
        this.pixiApp.canvas.onmouseup = (e) => {
            this.mouse.pres = false;
        }
    }

    convertirCoordenadaXDelMouse(mouseX, rectangle) {
        return (Math.floor(mouseX - rectangle.left) / this.canvasScaler);
    }

    convertirCoordenadaYDelMouse(mouseY, rectangle) {
        return (Math.floor(mouseY - rectangle.top) / this.canvasScaler);
    }


    actualizarDiagramaGeneral() {
        // Actualizo lógicamente los datos (genero dirty flags en todo lo que se necesite):
        
        this.actualizarDiagramaVoronoi();
        this.actualizarMuros();

        // Para luego actualizar el diagrama visible:
        if (this.textureBuffer) {
            this.textureBuffer.update();
        }

    }



    actualizarDiagramaVoronoi() {
        // Actualiza el diagrama de voronoi (canvas) en base a los puntos que sean agregados 
        // al canvas.

        if (!this.puntos || this.puntos.length === 0) return;

        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const numPuntos = this.puntos.length;

        // Caché local de coordenadas para evitar accesos repetitivos a objetos en el loop intensivo
        let px = new Float32Array(numPuntos);
        let py = new Float32Array(numPuntos);
        
        for (let i = 0; i < numPuntos; i++) {
            px[i] = this.puntos[i].x;
            py[i] = this.puntos[i].y;
        }

        // Primer pasada: Calcular regiones de Voronoi y almacenar el índice del punto más cercano en gridState
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let minDist = Infinity; //número infinito.
                let closestIndex = 0;

                for (let i = 0; i < numPuntos; i++) {
                    const dx = x - px[i];
                    const dy = y - py[i];
                    const distSq = dx * dx + dy * dy; // Distancia euclidiana al cuadrado O(1)

                    if (distSq < minDist) {
                        minDist = distSq;
                        closestIndex = i;
                    }
                }

                const stateIndex = y * w + x;
                this.gridVoronoi[stateIndex] = closestIndex + 1; // Guardamos el ID del punto (1 a N)

                //Guardamos el valor del color del espacio:
                const col = this.puntos[closestIndex].color;
                this.setearPixel(x, y, col[0], col[1], col[2]);
            }
        }

        // Se dibujan las semillas visibles sobre el canvas para identificarlas claramente
        for (let i = 0; i < this.puntos.length; i++) {
            const p = this.puntos[i];
            const sx = Math.floor(p.x);
            const sy = Math.floor(p.y);
            
            // Se dibuja un punto central blanco de radio 3 píxeles 
            for (let dy = -2; dy <= 2; dy++) { //se genera un recorrido en 1d en base a la posición 
                for (let dx = -2; dx <= 2; dx++) {
                    this.setearPixel(sx + dx, sy + dy, this.valorRPunto, this.valorGPunto, this.valorBPunto);
                }
            }
        }
    }

    actualizarMuros() {
        //Actualiza el diagrama y las líneas en base a donde se muevan los puntos.

        if (!this.puntos || this.puntos.length == 0) return;

        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const grosorMuro = Number(this.muroGrosor) || 1;

        // Segunda pasada: Detección de fronteras (bordes entre distintas regiones de Voronoi) para pintar muros
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const currentRegion = this.gridVoronoi[idx];

                // Comparamos con vecinos (derecha y abajo) para identificar cambios de región (fronteras)
                if (
                    currentRegion !== this.gridVoronoi[idx + 1] ||
                    currentRegion !== this.gridVoronoi[idx + w]
                ) {
                    // Pintamos pared gris gruesa usando el material muro
                    for (let ky = -Math.floor(grosorMuro/2); ky <= Math.floor(grosorMuro/2); ky++) {
                        for (let kx = -Math.floor(grosorMuro/2); kx <= Math.floor(grosorMuro/2); kx++) {
                            this.setearPixel(x + kx, y + ky, this.valorRPiedra, this.valorGPiedra, this.valorBPiedra);
                        }
                    }
                }
            }
        }
    }

    dibujarPuntoEnBaseAlMouse () {
        // genera un punto en base a la posición del mouse (usar click izquierdo al soltar).

        if (this.mouse.position.x >= 0 && this.mouse.position.x < this.canvasWidth &&
            this.mouse.position.y >= 0 && this.mouse.position.y < this.canvasHeight) {
            
            const rx = Math.floor(Math.random() * 180 + 50);
            const rg = Math.floor(Math.random() * 180 + 50);
            const rb = Math.floor(Math.random() * 180 + 50);

            this.puntos.push({
                x: this.mouse.position.x, //posicion x del punto
                y: this.mouse.position.y, //posicion y del punto
                color: [rx, rg, rb], //color RGB
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2
            });

            this.actualizarDiagramaVoronoi();
        }
    }

    generarTextoFPS()  {
        this.textoFPS = new TextoFPS(this.pixiApp);
    }

    actualizarTextoFPS() {
        if(this.textoFPS == null) return;
        
        this.textoFPS.tick();
    }

    plantearBufferDeCanvas() {
        //En este espacio se planteará el diagrama lógico para el dibujado y recorrido en una grilla 1d
        //En vez de una 2d, que plantearía un recorrido anidado y más complejo de leer para la máquina.

        const tamanioBuffer = this.canvasWidth * this.canvasHeight * 4; 

        this.bufferPixeles = new Uint8ClampedArray(tamanioBuffer);

        for(let i = 0; i < tamanioBuffer; i += 4) {
            this.bufferPixeles[i] = 0; 
            this.bufferPixeles[i + 1] = 0;
            this.bufferPixeles[i + 2] = 0;
            this.bufferPixeles[i + 3] = 0;
        }

        this.textureBuffer = PIXI.BufferImageSource.from(
            {
                resource: this.bufferPixeles, //el recurso de donde esta sacando la información para configurarse
                width: this.canvasWidth, //el ancho de la textura
                height: this.canvasHeight, //el alto de la textura
                scaleMode: 'nearest' //evita la difuminación de pixeles al escalar.
            }
        )

        const textura = new PIXI.Texture(
            {
                source: this.textureBuffer
            }
        )

        //Genero el sprite único con la textura que contiene todo el canvas y lo escalo:

        this.spriteDrawer = new PIXI.Sprite(textura);
        this.spriteDrawer.width = this.canvasWidth * this.canvasScaler;
        this.spriteDrawer.height = this.canvasHeight * this.canvasScaler;

        this.pixiApp.stage.addChild(this.spriteDrawer);

    }


    plantearGrillaDeEstados() {
        //Planteo la grilla lógica que almacenará los valores de cada pixel de la grilla y 
        // la actualizo al valor del material.

        this.gridState = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight);

        this.vaciarGrillaDeEstados();

    }

    plantearGrillaDeAreas() {
        //Planteo la grilla que almacenará en cada pixel la id en base al espacio que tiene/tendrá cada 
        //punto en el diagrama de voronoi.
        
        this.gridVoronoi = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight);

        this.vaciarGrillaDeAreas();
    }

    vaciarGrillaDeEstados() {
        for (let y = this.canvasHeight; y > 0; y--) {
            for (let x = 0; x < this.canvasWidth; x++) {
                this.gridState[y * this.canvasWidth + x] = this.materiales.nada;
            }
        }
        
    }

    vaciarGrillaDeAreas() {
        //Vacía la grilla de ids de area de voronoi.

        for(let y = this.canvasHeight; y > 0; y--) {
            for (let x = 0; x < this.canvasWidth; x++) {
                this.gridVoronoi[y * this.canvasWidth + x] = 0;
            }
        }
    }

    // Método para cambiar el color de un píxel específico en la memoria (x, y)
    setearPixel(x, y, r, g, b, a = 255) {
        //En caso de que el valor brindado sea negativo, o mayor al ancho/alto de la grilla, no hará nada:
        if (x < 0 || x >= this.canvasWidth || y < 0 || y >= this.canvasHeight) return;

        // Fórmula de mapeo 2D a memoria 1D: (y * ancho + x) * 4 canales (O, fórmula de indexación)
        //ULTRA IMPORTANTE: Permite ubicar cualquier coordenada cartesiana 
        // dentro del arreglo unidimensional contiguo (los pixeles del canvas convertido ahora en un array de datos)
        //Esta es la columna vertebral del código:
        const index = (y * this.canvasWidth + x) * 4;

        this.bufferPixeles[index]     = r;
        this.bufferPixeles[index + 1] = g;
        this.bufferPixeles[index + 2] = b;
        this.bufferPixeles[index + 3] = a;

    }

    setearCelda(posX, posY, materialACambiar) {
        if((posX < 0 || posX > this.canvasWidth) || (posY < 0 || posY > this.canvasHeight)) return; //si supera los límites, no hará nada.

        const stateIndexActual = posY * this.canvasWidth + posX;
        
        this.gridState[stateIndexActual] = materialACambiar //se le pasa un valor de material por parámetro.

        //En base al material a cambiar, se actualiza la celda:
        switch(materialACambiar) {
            case this.materiales.nada:
                this.setearPixel(posX, posY, 0, 0, 0);
            case this.materiales.muro:
                this.setearPixel(posX, posY, this.valorRPiedra, this.valorGPiedra, this.valorBPiedra)
                break;
        }

    }

    pintarCanvasDeVacíoSiCorresponde() {
        // Actualiza todas los pixeles para que luego se actualicen (dirty flag).
        for(let x = 0; x < this.canvasWidth; x++) {
            for(let y = 0; y < this.canvasHeight; y++) {
                this.setearPixel(x, y, this.materiales.nada);
            }
        }

        //Luego, las dibuja en el canvas.
        if (this.textureBuffer) {
            this.textureBuffer.update();
        }
    }


    escalarCanvas() {
        // Seccion en donde, en base al slider de escala de canvas, actualiza todo el espacio del canvas,
        //tanto lógico como visualmente, sin borrar la información que ya se encontraba en el espacio.

        if (!this.pixiApp || !this.spriteDrawer) return;

        // Escalado del renderer y del sprite principal sin perder los datos del buffer contiguo
        this.pixiApp.renderer.resize( //función encargada de escalar y cambiar el tamaño del canvas.
            this.canvasWidth * this.canvasScaler,
            this.canvasHeight * this.canvasScaler
        );
        

        //Se escala el espacio físico en donde se está dibujando 
        // (en caso de no escalarlo, lo dibujado permanece del mismo tamaño)

        this.spriteDrawer.width = this.canvasWidth * this.canvasScaler;
        this.spriteDrawer.height = this.canvasHeight * this.canvasScaler;
    }

}