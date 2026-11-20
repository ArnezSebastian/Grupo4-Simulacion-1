// Dispara una vez en cuanto se activa y después cada `intervaloSeg` mientras siga activo.
// Si se desactiva, se reinicia: la próxima vez que se active vuelve a disparar enseguida.
class GatilloPeriodico {
    constructor(intervaloSeg) {
        this.configurarIntervalo(intervaloSeg);
    }

    configurarIntervalo(intervaloSeg) {
        if (!Number.isFinite(intervaloSeg) || intervaloSeg <= 0) {
            throw new RangeError("El intervalo del gatillo debe ser un número positivo.");
        }

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

        this.transcurrido += Math.max(0, deltaSeg);
        const dispara = this.transcurrido >= this.intervalo;
        if (dispara) this.transcurrido %= this.intervalo;       // un frame larguísimo dispara una vez, no varias
        return dispara;
    }
}
