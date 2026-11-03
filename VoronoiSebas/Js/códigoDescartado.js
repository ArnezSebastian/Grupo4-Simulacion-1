/*

    en InitPIXI() {
        this.containerPrincipal = new PIXI.Container;

        this.containerPrincipal.name = this.constructor.name;

        this.pixiApp.stage.addChild(this.containerPrincipal);
    }

    actualizarPosicionDelMouse() {
        this.pixiApp.canvas.onmousemove = (event) => {
            this.mouse.position.x = this.convertirCoordenadasDelMouse(event.x, event.y);
            this.mouse.position.y = this.convertirCoordenadasDelMouse(event.x, event.y);
        }
    }

    convertirCoordenadasDelMouse(mouseX, mouseY) {
        return (mouseX - this.containerPrincipal.x) / this.canvasScaler
            &&
            (mouseY - this.containerPrincipal.y) / this.canvasScaler;
    }

    convertirCoordenadasDelMouse(mouseX, mouseY, rectangle) {
        return (Math.floor(mouseX - rectangle.left) / this.canvasScaler)
            
        &&
            
            (Math.floor(mouseY - rectangle.top) / this.canvasScaler);
    }

    convertirCoordenadaDelMouseCorrespondiente(mousePosAxis, rectPos) { //Función parametrizada de las versiones originales divididas en x e y.
        return (Math.floor(mousePosAxis - rectPos) / this.canvasScaler);
    }


    actualizarPosicionDelMouseAlClickear() {
        this.pixiApp.canvas.onmousedown = (event) => {
            this.mouse.down = this.convertirCoordenadasDelMouse(event.x, event.y);
            this.mouse.pres = true;

            this.dibujarPuntoEnBaseAlMouse();
        };
    }

    actualizarPosicionDelMouseAlSoltar() {
        this.pixiApp.canvas.onmouseup = (event) => {
            this.mouse.up = this.convertirCoordenadasDelMouse(event.x, event.y);
            this.mouse.pres = false;
        }
    }


    //Funciones parametrizadas:

    convertirCoordenadaXDelMouse(mouseX, rectangle) {
        return (Math.floor(mouseX - rectangle.left) / this.canvasScaler);
    }

    convertirCoordenadaYDelMouse(mouseY, rectangle) {
        return (Math.floor(mouseY - rectangle.top) / this.canvasScaler);
    }

    //actualizarDiagramaVoronoi() {

        if (!this.puntos || this.puntos.length === 0) return;

        // Recorrido de celdas utilizando indexación lineal O(1) por píxel
        for (let y = 0; y < this.canvasHeight; y++) {
            for (let x = 0; x < this.canvasWidth; x++) {
                let minDist = Infinity;
                let puntoCercano = null;

                // Evaluación de cercanía a cada semilla de Voronoi
                for (let i = 0; i < this.puntos.length; i++) {
                    const p = this.puntos[i];
                    const dx = x - p.x;
                    const dy = y - p.y;
                    const distSq = dx * dx + dy * dy; // Distancia euclidiana al cuadrado (optimización)

                    if (distSq < minDist) {
                        minDist = distSq;
                        puntoCercano = p;
                    }
                }

                if (puntoCercano) {
                    this.setearPixel(x, y, puntoCercano.color[0], puntoCercano.color[1], puntoCercano.color[2]);
                }
            }
        }

        // Actualizamos la textura del buffer en Pixi.js de forma eficiente
        if (this.textureBuffer) {
            this.textureBuffer.update();
        }

        dibujarPuntoEnBaseAPosicionDelMouse() {
            if (this.mouse.pres) {
                const rx = Math.floor(Math.random() * 200 + 55);
                const rg = Math.floor(Math.random() * 200 + 55);
                const rb = Math.floor(Math.random() * 200 + 55);

                this.puntos.push({
                    x: this.mouse.position.x,
                    y: this.mouse.position.y,
                    color: [rx, rg, rb],
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2
                });
            }

        
        }

        //Lógicas tratadas de implementar para evitar la selección de los primeros 2 items de un diccionario de una forma diferente:

        //1.Crear un diccionarion que se convierta momentáneamente en una lista con los primeros 2 items recortados:

        //Materiales capaces de ser guardados y elegidos por los puntos 
        // (función que corta los primeros dos elementos innecesarios para dibujar haciendo del diccionario una lista, y 
        // luego pasando a ser de nuevo un "objeto" - diccionario - ):
        //NO TOMA BIEN LOS ELEMENTOS, SIGUE EXISTIENDO DE FORMA "FANTASMA" LOS PRIMEROS ELEMENTOS DE LA LISTA.
        //materialesAElegir = Object.fromEntries(Object.entries(this.materialesNuevos).slice(2));

        //Luego, en base a la nueva lista, buscar entre todos los elementos,  y devolver el valor de la misma, para luego aplicar el material con ese valor como material seleccionado del punto.
        const indexMaterialActualizado = elegirValorAleatorioEntre(0, Object.keys(this.materialesAElegir).length - 1);
        const materialActualizado = Object.entries(this.materialesAElegir).find(([clave, valor]) => valor === indexMaterialActualizado);
        //const [claveEncontrada] = encontrado || []; 

        this.puntos.push({
            ...
            materialActual = this.materiales[claveEncontrada]
        })


        Diccionario original de elementos:
        
        materiales = {
        nada: 0,
        muro: 1, 
        arena: 2,
        piedra: 3,
        agua: 4 
        }

        //Forma de dibujar puntos en el canvas (sin parametrizar):
        // Se dibuja un punto central blanco de radio 3 píxeles 
            for (let dy = -2; dy <= 2; dy++) { //Desde el extremo -2 y 2 en el eje y(que será luego seteado para que sea en base al punto)
                for (let dx = -2; dx <= 2; dx++) { //y en el eje x
                    this.setearPixel(sx + dx, sy + dy, this.valorRPunto, this.valorGPunto, this.valorBPunto); //Se dibuja el punto.
            }
        }

        //Forma de dibujar los muros (sin parametrizar):
        // Pintamos pared gris gruesa usando el material muro
        for (let ky = -Math.floor(grosorMuro/2); ky <= Math.floor(grosorMuro/2); ky++) {
            for (let kx = -Math.floor(grosorMuro/2); kx <= Math.floor(grosorMuro/2); kx++) {
                this.setearPixel(x + kx, y + ky, this.valorRPiedra, this.valorGPiedra, this.valorBPiedra);
            }
        }


        //Forma de calcular la escala actual del canvas (guardaba datos erroneos al escalar):
        // Calculamos el factor de escala real entre el DOM y la resolución interna del buffer
            const scaleX = this.canvasWidth / rect.width;
            const scaleY = this.canvasHeight / rect.height;

            this.mouse.position.x = this.convertirCoordenadaDelMouseCorrespondiente(e.clientX, rect.left, scaleX);
            this.mouse.position.y = this.convertirCoordenadaDelMouseCorrespondiente(e.clientY, rect.top, scaleY);

    }

*/