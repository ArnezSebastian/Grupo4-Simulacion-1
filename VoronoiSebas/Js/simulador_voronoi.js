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
    
    //Botones:
    btnReset;
    btnRandom;
    btnDinamic;
    btnDelete;

    //Sliders:
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
        0: "nada",
        1: "muro",
        2: "arena",
        3: "piedra",
        4: "agua"
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

    //Booleanos para condicionales:
    dinamismoActivado = false;

    //Valores de configuración para el agregado de puntos de voronoy:
    //Valor para cantidad máxima de puntos posibles en pantalla.
    cantPuntosMax = 30;
    //Valor de radio mínimo entre puntos:
    distMinimaPuntos = 35;

    //Agregados para interfaz:
    textoCantPuntosDisponibles;
    textoMaterialActual;
    cantPuntosDisponibles = this.cantPuntosMax;

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
        this.btnDelete = document.getElementById("delete-points-mode");

        //Textos referidos a los materiales y a los puntos disponibles.
        this.textoCantPuntosDisponibles = document.getElementById("text-cant-points");
        this.textoMaterialActual = document.getElementById("text-actual-mat");
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
            pres: false,
            areaActual: null,
            materialActual: this.materiales[0], 
            modoBorrador: false //Nueva propiedad para borrar puntos en base al area en la que se encuentre el mouse.
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
        
        this.actualizarTextos();

        this.agregarDinamismoSiCorresponde();

        this.actualizarDiagramaGeneral();

        this.actualizarAreaYMaterialDelMouseSiCorresponde();

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
        this.alternarModoBorradorAlClickear();
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

        //Vacío lo relacionado a los puntos del diagrama de voronoi y al pincel:
        this.eliminarPuntosDelCanvas();
        this.vaciarGrillaDeAreas(); //a chequear porqué no funciona completamente.
        this.resetearPincel(); // y resetea los valores del pincel.

        //Vacío y actualizo el diagrama general.
        this.vaciarGrillaDeEstados();
        this.pintarCanvasDeVacíoSiCorresponde();
        
    }

    eliminarPuntosDelCanvas() {
        // Vacía la lista de puntos.
        this.puntos = [];

        //Y actualiza la cantidad de puntos disponibles para que sea de nuevo la cantidad máxima:
        this.cantPuntosDisponibles = this.cantPuntosMax;
    }

    resetearPincel() {
        this.mouse.areaActual = null;
        this.mouse.materialActual = this.materiales[0];
    }

    actualizarTamanioCanvasConSlider() {
        this.sliderCanvas.addEventListener('input', (e) => {
            this.canvasScaler = Number(e.target.value);

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

    alternarModoBorradorAlClickear() {
        this.btnDelete.addEventListener("click", (e) => {
            this.mouse.modoBorrador = !this.mouse.modoBorrador;
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

            //El material no es un valor entero, pero a pesar de buscarlo de otra manera, no se logra encontrar y devuelve "undefined", se necesita seguir indagando.
            const indexMaterialActualizado = elegirValorAleatorioEntre(2, Object.keys(this.materiales).length - 1);

            //Agrega el punto dentro del arreglo:
            this.puntos.push({
                x: x,
                y: y,
                color: [r, g, b],
                materialActual: this.materiales[indexMaterialActualizado],
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3
            });
        }
    }

    eliminarPuntoDelAreaActualEnBaseAlMouse() {
        if(
            (this.mouse.areaActual == null)
            ||
            (this.mouse.areaActual == undefined)
            ||
            (this.puntos.length === 0)
        ) return;

        //Toma el índice en base al area actual menos 1.
        const indiceActual = this.mouse.areaActual - 1;

        // Validación de seguridad por si el índice está fuera de rango
        if (indiceActual < 0 || indiceActual >= this.puntos.length) return;

        //Elimina el elemento de ese índice:
        this.puntos.splice(indiceActual, 1);

        //Actualiza el area a un valor nulo:
        this.mouse.areaActual = null;

        //Suma 1 a la cantidad actual de puntos disponibles:
        this.cantPuntosDisponibles += 1;

        if(this.puntos.length >= 1) {
            //Y vacía la grilla para forzar una re-carga en el siguiente frame, así actualizar el diagrama de forma correcta
            this.vaciarGrillaDeAreas();
        } else {
            this.resetearCanvas()
        }
    }

    agregarInteractividadAlMouse() {

        this.actualizarPosicionDelMouseAlMover();

        this.agregarInteractividadDeMouseAlSalir();

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

            if (rect.width === 0 || rect.height === 0) return;

            // Obtenemos la posición relativa exacta (proporción de 0 a 1) dentro del canvas renderizado.
            // Esto elimina por completo cualquier desajuste de escala, CSS o zoom.
            const relX = (e.clientX - rect.left) / rect.width;
            const relY = (e.clientY - rect.top) / rect.height;

            // Mapeamos esa proporción directamente a la resolución lógica interna del simulador
            this.mouse.position.x = this.convertirCoordenadaDelMouseCorrespondiente(relX, this.canvasWidth);
            this.mouse.position.y = this.convertirCoordenadaDelMouseCorrespondiente(relY, this.canvasHeight);
        }
    }

    agregarInteractividadDeMousePresionado() {
        this.pixiApp.canvas.onmousedown = (e) => {
            this.mouse.pres = true;

            //Su accionar depende de la propiedad activada (no está dentro del gameloop
            // por lo que sólo consultará cuando se clickee):
            if(this.mouse.modoBorrador == true) {
                this.eliminarPuntoDelAreaActualEnBaseAlMouse();
            } else {
                this.dibujarPuntoEnBaseAlMouse();
            }
            
        };
    }

    agregarInteractividadDeMouseAlSoltar() {
        this.pixiApp.canvas.onmouseup = (e) => {
            this.mouse.pres = false;
        }
    }

    agregarInteractividadDeMouseAlSalir() {
        this.pixiApp.canvas.onmouseleave = (e) => {
            // Invalidamos las coordenadas al salir para que al reingresar no arrastre posiciones viejas.
            this.mouse.position.x = -1;
            this.mouse.position.y = -1;
            this.mouse.pres = false; //y soltamos el click.

            // Además, reseteamos las propiedades del mouse del area actual y material:
            this.resetearPincel();
        }
    }

    //Función parametrizada de las versiones originales divididas en x e y:

    /*
    
    convertirCoordenadaDelMouseCorrespondiente(mousePosAxis, rectPos, realScale) {
        return (Math.floor(mousePosAxis - rectPos) * realScale)
    }
    
    */

    convertirCoordenadaDelMouseCorrespondiente(mouseRelPosAxis, realScale) {
        return (Math.floor(mouseRelPosAxis * realScale));
    }

    actualizarDiagramaGeneral() {
        // Actualizo lógicamente los datos (genero dirty flags en todo lo que se necesite):
        this.actualizarDiagramaVoronoi();
        this.actualizarMuros();

        // Para luego actualizar el diagrama visible:
        this.actualizarBufferDeTextura();
    }

    actualizarDiagramaVoronoi() {
        // Actualiza el diagrama de voronoi (canvas) en base a los puntos que sean agregados al canvas.

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

        // Se calculan las regiones de Voronoi y almacenan el índice del punto 
        // más cercano en el buffer de gridVoronoi:
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

                const areaIndex = y * w + x; //calculamos el index del area
                this.gridVoronoi[areaIndex] = closestIndex + 1; // Y guardamos el ID del punto (1 a N, para no confundirlo con 0)

                //Guardamos el valor del color del espacio:
                const col = this.puntos[closestIndex].color;
                this.setearPixel(x, y, col[0], col[1], col[2]);
            }
        }

        // Se dibujan las semillas visibles sobre el canvas para identificarlas claramente
        for (let i = 0; i < this.puntos.length; i++) {
            const p = this.puntos[i]; //punto de la lista.
            const sx = Math.floor(p.x); //valor redondeado a entero del punto x.
            const sy = Math.floor(p.y); //lo mismo para y.
            const radioPunto = 2; //radio del punto (debe ser un entero positivo).

            // Se dibuja un punto central blanco de 2 píxeles de radio: 
            this.dibujarPuntoDeRadio_EnPosicion_y_DeColorConValorR_ValorG_ValorB_(radioPunto, sx, sy, this.valorRPunto, this.valorGPunto, this.valorBPunto);
        }
    }

    dibujarPuntoDeRadio_EnPosicion_y_DeColorConValorR_ValorG_ValorB_(r, posx, posy, valorR, valorG, valorB) {
        //Recorrido de dibujo desde el extremo -radio y radio en el eje x e y 
        // (que será luego seteado para que sea en base al punto):
        for(let ry = -r; ry <= r; ry++) { 
            for(let rx = -r; rx <= r; rx++) {
            this.setearPixel(posx + rx, posy + ry, valorR, valorG, valorB);
            }
        }
    }

    actualizarMuros() {
        //Actualiza las divisiones del  diagrama, la posición y ancho de los muros en base a donde se muevan los puntos: 

        if (!this.puntos || this.puntos.length == 0) return;

        //Tomamos el ancho y alto del canvas, y el grosor del muro:
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const grosorMuro = Number(this.muroGrosor) || 1; //El valor numérico flotante del grosor del muro del slider (o 1)
        const radioMuro = Math.floor(grosorMuro/2); 

        // Se detectan las fronteras entre las regiones regiones de Voronoi para pintar muros:
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
                    this.dibujarPuntoDeRadio_EnPosicion_y_DeColorConValorR_ValorG_ValorB_(radioMuro, x, y, this.valorRPiedra, this.valorGPiedra, this.valorBPiedra);
                }
            }
        }
    }

    dibujarPuntoEnBaseAlMouse () {
        // genera un punto en base a la posición del mouse (usar click izquierdo al soltar).

        //En caso de superar la cantidad máxima, no hace nada.
        if(this.puntos.length >= this.cantPuntosMax) return;

        if (this.mouse.position.x >= 0 && this.mouse.position.x < this.canvasWidth &&
            this.mouse.position.y >= 0 && this.mouse.position.y < this.canvasHeight) {

            // Se valida la distancia mínima en base al cuadrado de la misma (cálculo euclidiano sin raíz cuadrada que consumiría entre 15 a 30 ciclos de memoria)
            const minDistSq = this.distMinimaPuntos * this.distMinimaPuntos;

            //Por cada punto, calcula la distancia entre el mouse
            for (let i = 0; i < this.puntos.length; i++) {
                const p = this.puntos[i];
                const dx = this.mouse.position.x - p.x;
                const dy = this.mouse.position.y - p.y;
                const distSq = dx * dx + dy * dy; //devuelve un area en base a la distancia entre el mouse y cada punto de la lista.

                // Si el punto nuevo está demasiado cerca de uno existente, cancelamos la creación
                if (distSq < minDistSq) {
                    return; // Sale de la función sin crear el punto
                }
            }
            
            //Seteamos el color del area en RGB:
            const rx = Math.floor(Math.random() * 180 + 50); //valor r
            const rg = Math.floor(Math.random() * 180 + 50); //valor g
            const rb = Math.floor(Math.random() * 180 + 50); //valor b

            //Y su material (es aleatorio):
            const indexMaterialActualizado = elegirValorAleatorioEntre(2, Object.keys(this.materiales).length - 1);

            //Añadimos el punto a la lista con todas las propiedades referidas al mismo:
            this.puntos.push({
                x: this.mouse.position.x, //posicion x del punto
                y: this.mouse.position.y, //posicion y del punto
                color: [rx, rg, rb], //color RGB
                materialActual: this.materiales[indexMaterialActualizado], //material que se guarda en la memoria.
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2
            });
            
            //Agregado que muestra la cantidad actual de puntos para agregar.
            this.cantPuntosDisponibles -= 1;

            //Y actualizamos el buffer visual en base al dirty flag:
            this.actualizarDiagramaVoronoi();
        }
    }

    //Manejo de textos:
    actualizarTextos() {
        this.actualizarTextoFPS();
        this.actualizarTextoCantPuntos();
        this.actualizarTextoMatActual();
    }

    actualizarTextoCantPuntos() {
        this.textoCantPuntosDisponibles.textContent = this.cantPuntosDisponibles;
    }

    actualizarTextoMatActual() {
        this.textoMaterialActual.textContent = this.mouse.materialActual;
    }

    generarTextoFPS()  {
        this.textoFPS = new TextoFPS(this.pixiApp);
    }

    actualizarTextoFPS() {
        if(this.textoFPS == null) return;
        
        this.textoFPS.tick();
    }

    //Funciones de planteo de grillas y buffers:

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

    //Funciones vaciadoras de buffers:

    vaciarGrillaDeEstados() {
        for (let y = this.canvasHeight; y > 0; y--) {
            for (let x = 0; x < this.canvasWidth; x++) {
                this.gridState[y * this.canvasWidth + x] = 0;
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

    //Otras funciones:

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
            case this.materiales[0]:
                this.setearPixel(posX, posY, 0, 0, 0);
            case this.materiales[1]:
                this.setearPixel(posX, posY, this.valorRPiedra, this.valorGPiedra, this.valorBPiedra)
                break;
        }

    }

    pintarCanvasDeVacíoSiCorresponde() {
        // Actualiza todas los pixeles para que luego se actualicen (dirty flag).
        for(let x = 0; x < this.canvasWidth; x++) {
            for(let y = 0; y < this.canvasHeight; y++) {
                this.setearPixel(x, y, 0, 0, 0);
            }
        }

        //Luego, las dibuja en el canvas.
        this.actualizarBufferDeTextura();
    }

    actualizarBufferDeTextura() {
        if (this.textureBuffer) {
            this.textureBuffer.update();
        }
    }

    actualizarAreaYMaterialDelMouseSiCorresponde() {
        //Si supera los límites del canvas, no actualiza (0 hasta uno menos que el ancho para los arrays).
        if((
            (this.mouse.position.x < 0 || this.mouse.position.x >= this.canvasWidth) 
            || 
            (this.mouse.position.y < 0 || this.mouse.position.y >= this.canvasHeight)
            )
            ||
            (this.puntos.length === 0)
        ) return;

        //Aún a prueba (funciona sin escalar, al escalar, intermitentemente vuelve a ser undefined)
        const espacioActualizado = this.gridVoronoi[this.mouse.position.y * this.canvasWidth + this.mouse.position.x];

        // Si es 0 (vacío) o el valor no es válido, salimos de la función:
        if (espacioActualizado === 0 || espacioActualizado > this.puntos.length || espacioActualizado === undefined) return;
        
        //Si el estas parado en el mismo lugar, no hace nada más:
        if(espacioActualizado == this.mouse.areaActual) return;

        //Sino actualiza su area a la nueva:
        this.mouse.areaActual = espacioActualizado;

        //En base al area del punto que se encuentre en el area del mouse, es el material del mouse (-1 ya que almacenamos un índice +1 en la grilla para que no de nunca 0)
        this.mouse.materialActual = this.puntos[espacioActualizado - 1].materialActual;

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