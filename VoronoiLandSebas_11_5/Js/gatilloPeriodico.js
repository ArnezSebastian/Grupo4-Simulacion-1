// Dispara una vez en cuanto se activa y después cada `intervaloSeg` mientras siga activo.
// Si se desactiva, se reinicia: la próxima vez que se active vuelve a disparar enseguida.
// (Por ejemplo: un golpe de pico al empezar a picar y otro cada 2 s mientras se mantiene el click.)
class GatilloPeriodico {
    constructor(intervaloSeg) {
        this.intervalo = intervaloSeg;
        this.reiniciar();
    }

    reiniciar() {
        this.transcurrido = this.intervalo;     // "listo": dispara en el primer frame activo
    }

    // Llamar una vez por frame. Devuelve true si en este frame toca disparar.
    avanzar(activo, deltaSeg) {
        if (!activo) {
            this.reiniciar();
            return false;
        }

        const dispara = this.transcurrido >= this.intervalo;
        if (dispara) this.transcurrido %= this.intervalo;       // un frame larguísimo dispara una vez, no varias
        this.transcurrido += deltaSeg;
        return dispara;
    }
}
