// Picar: mientras se mantiene el click, vacía un área junto al jugador en la dirección que mira.
// El área mide lo mismo que la caja del personaje; el material y los muros conservan su dureza.
// La dureza de cada material sale de la configuración; con dureza 0 (agua, lava y vapor) no se puede picar,
// y el aire (NADA) tampoco se excava.
class Excavador {
    // Objetivo y área de excavación reutilizados, sin crear objetos por frame.
    objetivo = {
        hayImpacto: false, celdaX: 0, celdaY: 0,
        centroX: 0, centroY: 0, radio: 0,
        radioLongitudinal: 0, radioTransversal: 0,
        direccionX: 1, direccionY: 0,
        origenX: 0, origenY: 0,
        areaX: 0, areaY: 0, areaAncho: 0, areaAlto: 0,
        tipoImpacto: MATERIALES.NADA
    };
    celdasExcavadas = 0;

    constructor(mundoCeldas, regiones, config) {
        this.mundo = mundoCeldas;
        this.regiones = regiones;
        this.periodoBaseMs = 1000 / config.tasaHz;
        this.radioPorMaterial = config.radioPorMaterial;
        this.radioMaximo = Math.max(...Object.values(this.radioPorMaterial));
        this.factorRadioTransversal = config.factorRadioTransversal;
        this.durezaBarrera = config.durezaBarrera;
        this.grosorBarrera = config.grosorBaseBarreraPx;
        this.grosorBaseBarrera = config.grosorBaseBarreraPx;
        this.dureza = config.dureza;
        this.progresoMs = 0;
    }

    configurarGrosorMuro(grosorPx) {
        this.grosorBarrera = Math.max(1, Number(grosorPx) || this.grosorBaseBarrera);
    }

    actualizar(deltaMs, jugador, intencion, mordiscoHabilitado = null) {
        this._apuntar(jugador);

        if (!intencion.picar || !this.objetivo.hayImpacto) {
            this.progresoMs = 0;
            return;
        }

        this.progresoMs += deltaMs;
        if (mordiscoHabilitado === false) return;

        if (mordiscoHabilitado === true) {
            const dureza = this._durezaDelObjetivo();
            const periodo = this.periodoBaseMs * dureza;
            if (dureza === 0 || this.progresoMs < periodo) return;

            this.progresoMs = 0;
            if (this.objetivo.tipoImpacto === MATERIALES.MURO) {
                this._excavarBarrera();
            } else {
                this._excavarArea(dureza);
            }
            this._apuntar(jugador);
            return;
        }

        for (let mordiscos = 0; mordiscos < 3; mordiscos++) {
            const dureza = this._durezaDelObjetivo();
            const periodo = this.periodoBaseMs * dureza;
            if (dureza === 0 || this.progresoMs < periodo) return;

            this.progresoMs -= periodo;
            if (this.objetivo.tipoImpacto === MATERIALES.MURO) {
                if (!this._excavarBarrera()) {
                    this.progresoMs = 0;
                    return;
                }
            } else {
                this._excavarArea(dureza);
            }
            this._apuntar(jugador);     // el área ya no está: se busca el siguiente impacto
            if (!this.objetivo.hayImpacto) {
                this.progresoMs = 0;
                return;
            }
        }
        this.progresoMs = 0;            // frame muy largo: se descarta el exceso en vez de acumular mordiscos
    }

    // Sigue el cursor dentro del alcance y mantiene el área ovalada fuera de la caja del jugador.
    _apuntar(jugador) {
        const o = this.objetivo;
        const direccion = jugador.direccionMirada;
        const radioMaximo = this.radioMaximo;
        const radioTransversalMaximo = Math.max(1.25, radioMaximo * this.factorRadioTransversal);
        const soporte = Math.abs(direccion.x) * jugador.ancho / 2
            + Math.abs(direccion.y) * jugador.alto / 2;
        const alcanceMaximo = soporte + radioMaximo * 2;
        const alcanceSolicitado = jugador.alcancePicar > 0
            ? jugador.alcancePicar
            : alcanceMaximo;
        const alcanceEfectivo = Math.max(soporte, Math.min(alcanceMaximo, alcanceSolicitado));
        const distanciaCentral = (soporte + alcanceEfectivo) / 2;
        o.centroX = jugador.centroX + direccion.x * distanciaCentral;
        o.centroY = jugador.centroY + direccion.y * distanciaCentral;
        o.radio = radioMaximo;
        o.radioLongitudinal = Math.max(0.5, (alcanceEfectivo - soporte) / 2);
        o.radioTransversal = radioTransversalMaximo;
        o.direccionX = direccion.x;
        o.direccionY = direccion.y;
        o.origenX = jugador.centroX;
        o.origenY = jugador.centroY;
        o.distanciaInicio = soporte;
        o.distanciaFin = alcanceEfectivo;
        this._actualizarLimitesArea(o);
        o.hayImpacto = false;
        o.tipoImpacto = MATERIALES.NADA;

        let distanciaMinima = Infinity;
        for (let y = o.areaY; y < o.areaY + o.areaAlto; y++) {
            for (let x = o.areaX; x < o.areaX + o.areaAncho; x++) {
                if (!this.mundo.estaDentro(x, y)) continue;
                if (!this._perteneceAreaPicar(x + 0.5, y + 0.5, o)) continue;

                const tipo = this._tipoDeImpacto(x, y);
                if (tipo === MATERIALES.NADA) continue;

                const dx = x + 0.5 - o.origenX;
                const dy = y + 0.5 - o.origenY;
                const distanciaAlJugador = dx * dx + dy * dy;
                if (distanciaAlJugador >= distanciaMinima) continue;

                distanciaMinima = distanciaAlJugador;
                o.hayImpacto = true;
                o.celdaX = x;
                o.celdaY = y;
                o.tipoImpacto = tipo;
            }
        }

        if (o.hayImpacto) {
            // El óvalo de picado permanece estable mientras se golpea el mismo área.
            // Así un mordisco vacía toda la zona ovalada, igual que el recorrido antiguo,
            // pero sin usar una forma circular.
            this._actualizarLimitesArea(o);
        }
    }

    _actualizarLimitesArea(objetivo) {
        const origenX = objetivo.origenX;
        const origenY = objetivo.origenY;
        const distanciaFin = objetivo.distanciaFin || 0;
        const radio = objetivo.radioTransversal || objetivo.radio || 1;
        const finX = origenX + objetivo.direccionX * distanciaFin;
        const finY = origenY + objetivo.direccionY * distanciaFin;
        const inicioX = origenX + objetivo.direccionX * (objetivo.distanciaInicio || 0);
        const inicioY = origenY + objetivo.direccionY * (objetivo.distanciaInicio || 0);
        const minimoX = Math.min(inicioX, finX) - radio;
        const maximoX = Math.max(inicioX, finX) + radio;
        const minimoY = Math.min(inicioY, finY) - radio;
        const maximoY = Math.max(inicioY, finY) + radio;
        objetivo.areaX = Math.floor(minimoX);
        objetivo.areaY = Math.floor(minimoY);
        objetivo.areaAncho = Math.ceil(maximoX) - objetivo.areaX;
        objetivo.areaAlto = Math.ceil(maximoY) - objetivo.areaY;
    }

    _perteneceAreaPicar(puntoX, puntoY, area) {
        const dx = puntoX - area.origenX;
        const dy = puntoY - area.origenY;
        const longitudinal = dx * area.direccionX + dy * area.direccionY;
        const transversal = dx * -area.direccionY + dy * area.direccionX;
        if (transversal * transversal > area.radioTransversal * area.radioTransversal) return false;
        if (longitudinal < area.distanciaInicio || longitudinal > area.distanciaFin) return false;
        return true;
    }

    // Abre sólo la parte del muro dentro del área de picado; el aire del otro lado sigue siendo aire.
    _excavarBarrera() {
        let huboCambios = false;
        const regionesActivadas = new Set();
        const o = this.objetivo;
        for (let y = o.areaY; y < o.areaY + o.areaAlto; y++) {
            for (let x = o.areaX; x < o.areaX + o.areaAncho; x++) {
                if (!this._perteneceAreaPicar(x + 0.5, y + 0.5, o)) continue;
                if (!this.mundo.estaDentro(x, y) || !this.regiones.celdaTocaMuro(x, y)) continue;
                if (this.mundo.abrirPasaje(x, y)) {
                    this.celdasExcavadas++;
                    huboCambios = true;
                    regionesActivadas.add(this.regiones.regionEn(x, y));
                    if (x > 0) regionesActivadas.add(this.regiones.regionEn(x - 1, y));
                    if (x + 1 < this.mundo.ancho) regionesActivadas.add(this.regiones.regionEn(x + 1, y));
                    if (y > 0) regionesActivadas.add(this.regiones.regionEn(x, y - 1));
                    if (y + 1 < this.mundo.alto) regionesActivadas.add(this.regiones.regionEn(x, y + 1));
                }
            }
        }
        for (const regionId of regionesActivadas) this.mundo.activarMaterialesDeRegion(regionId);
        return huboCambios;
    }

    // Vacía el área de picado sin romper materiales más duros que el objetivo.
    // No atraviesa muros cerrados: sólo se excavan las celdas
    // de la misma región que la picada, o los pasajes ya abiertos.
    _excavarArea(durezaMaxima) {
        const mundo = this.mundo;
        const o = this.objetivo;
        const cx = o.celdaX;
        const cy = o.celdaY;
        const regionObjetivo = this.regiones.regionEn(cx, cy);
        for (let y = o.areaY; y < o.areaY + o.areaAlto; y++) {
            for (let x = o.areaX; x < o.areaX + o.areaAncho; x++) {
                if (!mundo.estaDentro(x, y)) continue;
                if (!this._perteneceAreaPicar(x + 0.5, y + 0.5, o)) continue;

                const indice = mundo.indiceDe(x, y);
                const dureza = this.dureza[mundo.estado[indice]] || 0;
                if (dureza === 0 || dureza > durezaMaxima) continue;
                if (this.regiones.regionEnIndice(indice, x, y) !== regionObjetivo && !mundo.esPasaje(indice)) continue;
                if (mundo.estado[indice] === MATERIALES.CRISTAL) {
                    mundo.golpearCristal(x, y);
                    continue;
                }
                if (mundo.excavar(x, y)) this.celdasExcavadas++;
            }
        }
    }

    // MURO si la celda toca un muro cerrado; si no, el material picable o NADA.
    _tipoDeImpacto(x, y) {
        const mundo = this.mundo;
        if (!mundo.estaDentro(x, y)) return MATERIALES.NADA;
        if (this.regiones.celdaTocaMuro(x, y)) return MATERIALES.MURO;

        const material = mundo.estado[mundo.indiceDe(x, y)];
        return this.dureza[material] > 0 ? material : MATERIALES.NADA;
    }

    _durezaDelObjetivo() {
        const tipo = this.objetivo.tipoImpacto;
        if (tipo === MATERIALES.MURO) {
            const factorGrosor = this.grosorBarrera / this.grosorBaseBarrera;
            return this.durezaBarrera * factorGrosor;
        }
        return this.dureza[tipo] || 0;
    }
}
