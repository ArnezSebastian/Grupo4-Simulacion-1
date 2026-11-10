class TextoFPS {
    texto;
    pixapp;

    fpsInterval = 250; //ms entre actualizaciones del texto.
    ultimaActualizacion = 0;

    constructor(app) {
        this.initializeDOMBindsWith_(app);
    }

    initializeDOMBindsWith_(app) {
        this.texto = document.getElementById("texto-fps");

        this.pixapp = app;
    }

    actualizarTextoCadaCuartoDeSegundo() {
        const ahora = performance.now();

        //Antes comparaba el tiempo absoluto contra el intervalo (siempre verdadero): ahora compara la diferencia.
        if (ahora - this.ultimaActualizacion < this.fpsInterval) return;

        this.ultimaActualizacion = ahora;

        if (this.texto) {
            this.texto.textContent = Math.round(this.pixapp.ticker.FPS) + " FPS";
        }
    }

    tick() {
        this.actualizarTextoCadaCuartoDeSegundo();
    }
}
