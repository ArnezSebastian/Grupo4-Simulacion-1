class TextoFPS {
    texto;
    pixapp;

    fpsInterval = 250;
    fpsInitialTime = 0;

    constructor(app) {
        this.initializeDOMBindsWith_(app);
    }

    initializeDOMBindsWith_(app) {
        this.texto = document.getElementById("texto-fps");

        this.pixapp = app;
    }

    actualizarTextoCadaCuartoDeSegundo() {

        const now = performance.now();

        if(now > this.fpsInterval) {

            if (this.texto) {

                this.texto.textContent = Math.round(this.pixapp.ticker.FPS) + " FPS."; //valor redondeado al entero más alto

            }

            this.lastFpsUpdate = now; //el último tiempo de actualización del texto es el actual.

        }

    }

    tick() {
        this.actualizarTextoCadaCuartoDeSegundo();
    }
}