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
    }

*/