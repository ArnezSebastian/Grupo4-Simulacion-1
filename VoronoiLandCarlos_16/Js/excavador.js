// Picar: mientras se mantiene el click, vacía un área junto al jugador en la dirección que mira.
// El área mide lo mismo que la caja del personaje; el material y los muros conservan su dureza.
// La dureza de cada material sale de la configuración; con dureza 0 (agua, lava y vapor) no se puede picar,
// y el aire (NADA) tampoco se excava.
class Excavador {
    // Objetivo y área de excavación reutilizados, sin crear objetos por frame.
    objetivo = {
        hayImpacto: false, celdaX: 0, celdaY: 0,
        centroX: 0, centroY: 0, radio: 0,
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
        this.durezaBarrera = config.durezaBarrera;
        this.dureza = config.dureza;
        this.progresoMs = 0;
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

    // Sigue el cursor dentro del alcance y mantiene el círculo fuera de la caja del jugador.
    _apuntar(jugador) {
        const o = this.objetivo;
        const direccion = jugador.direccionMirada;
        const haciaX = Math.sign(direccion.x);
        const haciaY = Math.sign(direccion.y);
        const radioMaximo = this.radioMaximo;
        const soporte = Math.abs(direccion.x) * jugador.ancho / 2
            + Math.abs(direccion.y) * jugador.alto / 2;
        const distanciaCentroMinima = soporte + radioMaximo;
        const alcanceMaximo = soporte + radioMaximo * 2;
        const distancia = Math.max(distanciaCentroMinima, Math.min(alcanceMaximo, jugador.alcancePicar));
        o.centroX = jugador.centroX + direccion.x * distancia;
        o.centroY = jugador.centroY + direccion.y * distancia;
        o.radio = radioMaximo;
        this._actualizarLimitesArea(o);
        o.hayImpacto = false;
        o.tipoImpacto = MATERIALES.NADA;

        let distanciaMinima = Infinity;
        const radioMaximoCuadrado = radioMaximo * radioMaximo;
        for (let y = o.areaY; y < o.areaY + o.areaAlto; y++) {
            for (let x = o.areaX; x < o.areaX + o.areaAncho; x++) {
                if (!this.mundo.estaDentro(x, y)) continue;
                const dx = x + 0.5 - o.centroX;
                const dy = y + 0.5 - o.centroY;
                const distancia = dx * dx + dy * dy;
                if (distancia > radioMaximoCuadrado) continue;

                const tipo = this._tipoDeImpacto(x, y);
                if (tipo === MATERIALES.NADA) continue;

                const radioMaterial = this.radioPorMaterial[tipo] || 0;
                if (distancia > radioMaterial * radioMaterial) continue;
                if (distancia >= distanciaMinima) continue;

                distanciaMinima = distancia;
                o.hayImpacto = true;
                o.celdaX = x;
                o.celdaY = y;
                o.tipoImpacto = tipo;
            }
        }

        if (o.hayImpacto) {
            o.radio = this.radioPorMaterial[o.tipoImpacto];
            this._actualizarLimitesArea(o);
        }
    }

    _actualizarLimitesArea(objetivo) {
        objetivo.areaX = Math.floor(objetivo.centroX - objetivo.radio);
        objetivo.areaY = Math.floor(objetivo.centroY - objetivo.radio);
        objetivo.areaAncho = Math.ceil(objetivo.centroX + objetivo.radio) - objetivo.areaX;
        objetivo.areaAlto = Math.ceil(objetivo.centroY + objetivo.radio) - objetivo.areaY;
    }

    // Abre sólo la parte del muro dentro del área de picado; el aire del otro lado sigue siendo aire.
    _excavarBarrera() {
        let huboCambios = false;
        const regionesActivadas = new Set();
        const o = this.objetivo;
        const radioCuadrado = o.radio * o.radio;
        for (let y = o.areaY; y < o.areaY + o.areaAlto; y++) {
            for (let x = o.areaX; x < o.areaX + o.areaAncho; x++) {
                const dx = x + 0.5 - o.centroX;
                const dy = y + 0.5 - o.centroY;
                if (dx * dx + dy * dy > radioCuadrado) continue;
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
                const dx = x + 0.5 - o.centroX;
                const dy = y + 0.5 - o.centroY;
                if (dx * dx + dy * dy > o.radio * o.radio) continue;

                const indice = mundo.indiceDe(x, y);
                const dureza = this.dureza[mundo.estado[indice]] || 0;
                if (dureza === 0 || dureza > durezaMaxima) continue;
                if (this.regiones.regionEnIndice(indice, x, y) !== regionObjetivo && !mundo.esPasaje(indice)) continue;
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
        return tipo === MATERIALES.MURO ? this.durezaBarrera : (this.dureza[tipo] || 0);
    }
}
