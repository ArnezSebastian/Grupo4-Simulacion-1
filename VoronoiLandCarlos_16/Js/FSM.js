// FSM de animación: las transiciones consultan al jugador y la vista reproduce el clip del estado elegido.
class FSM {
    constructor(vista) {
        this.vista = vista;
        this.estados = new Map([
            ["reposo", new EstadoReposo(vista)],
            ["correr", new EstadoCorrer(vista)],
            ["saltar", new EstadoSaltar(vista)],
            ["caer", new EstadoCaer(vista)],
            ["aterrizar", new EstadoAterrizar(vista)],
            ["mirarArriba", new EstadoMirarArriba(vista)],
            ["mirarAbajo", new EstadoMirarAbajo(vista)],
            ["picar", new EstadoPicar(vista)],
            ["picarArriba", new EstadoPicarArriba(vista)],
            ["picarAbajo", new EstadoPicarAbajo(vista)]
        ]);
        this.estadoActual = null;
        this.contexto = { jugador: null, intencion: null, objetivo: null };
    }

    iniciar() {
        if (this.estadoActual) this.estadoActual.exit(this.contexto);
        this.estadoActual = null;
        this._cambiarEstado("reposo");
    }

    actualizar(jugador, intencion, objetivo, deltaMs) {
        this.contexto.jugador = jugador;
        this.contexto.intencion = intencion;
        this.contexto.objetivo = objetivo;

        const siguiente = this._elegirEstado();
        if (siguiente !== this.estadoActual.nombre) this._cambiarEstado(siguiente);
        else if (this.vista.animacionTerminada && siguiente.startsWith("picar")) {
            this.estadoActual.enter(this.contexto);
        }
        this.estadoActual.update(this.contexto, deltaMs);
    }

    _elegirEstado() {
        const jugador = this.contexto.jugador;
        const intencion = this.contexto.intencion;
        const objetivo = this.contexto.objetivo;
        const actual = this.estadoActual.nombre;

        if (intencion.picar && objetivo.hayImpacto && jugador.miradaVertical > 0) {
            return "picarAbajo";
        }

        // Salto y caída prevalecen sobre picar, también cuando el jugador está en un líquido.
        if (!jugador.enSuelo) return jugador.vy < 0 ? "saltar" : "caer";

        if (actual === "saltar" || actual === "caer") return "aterrizar";
        if (actual === "aterrizar" && !this.vista.animacionTerminada && !intencion.saltar) {
            return "aterrizar";
        }

        if (intencion.picar && objetivo.hayImpacto) {
            if (jugador.miradaVertical < 0) return "picarArriba";
            if (jugador.miradaVertical > 0) return "picarAbajo";
            return "picar";
        }

        if (Math.abs(jugador.vx) > 1) return "correr";
        if (jugador.miradaVertical < 0) return "mirarArriba";
        if (jugador.miradaVertical > 0) return "mirarAbajo";
        return "reposo";
    }

    _cambiarEstado(nombre) {
        const siguiente = this.estados.get(nombre);
        if (!siguiente) throw new Error(`No existe el estado de animación "${nombre}".`);

        if (this.estadoActual) this.estadoActual.exit(this.contexto);
        this.estadoActual = siguiente;
        this.estadoActual.enter(this.contexto);
    }
}
