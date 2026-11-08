// Interfaz (HUD): muestra el estado del simulador en el DOM y dibuja el minimapa.
// Sólo LEE datos que le pasa el simulador; no modifica la simulación (salvo pedir centrar la cámara desde el minimapa).
class HUD {
    // clave del snapshot -> id del elemento HTML donde se escribe
    static IDS_TEXTO = {
        voronoi: "hud-voronoi",
        composicion: "hud-composicion",
        frame: "hud-frame",
        posicion: "hud-pos",
        material: "text-actual-mat",
        modo: "hud-modo",
        zoom: "hud-zoom",
        camara: "hud-camara",
        vista: "hud-vista",
        puntos: "text-cant-points",
        celdas: "hud-celdas",
        dinamismo: "hud-dinamismo",
        rebotes: "hud-rebotes",
        fisica: "hud-fisica",
        simulacion: "hud-simulacion",
        bloques: "hud-bloques",
        jugador: "hud-jugador"
    };

    constructor(config, camara, mundoVoronoi, alClickearMinimapa) {
        this.config = config;
        this.camara = camara;
        this.mundoVoronoi = mundoVoronoi;
        this.intervaloMs = config.hud.intervaloMs;

        this.ultimaActualizacion = 0;
        this.cache = {};                        // último texto escrito: evita tocar el DOM si no cambió
        this.versionCamaraDibujada = -1;
        this.versionPuntosDibujada = -1;
        this.jugadorDibujado = "";              // posición del jugador en el minimapa (en píxeles del minimapa)

        this._enlazarElementos();
        this._escribirDatosEstaticos();
        this._registrarClickEnMinimapa(alClickearMinimapa);
    }

    // Se llama en cada frame, pero sólo trabaja cada `intervaloMs`.
    actualizarSiCorresponde(obtenerSnapshot, ahoraMs) {
        if (ahoraMs - this.ultimaActualizacion < this.intervaloMs) return;
        this.ultimaActualizacion = ahoraMs;

        const s = obtenerSnapshot();
        this._actualizarTextos(s);
        this._actualizarControles(s);
        this._actualizarMinimapa(s);
    }

    // --- Enlaces al DOM ---

    _enlazarElementos() {
        this.elementos = {};
        for (const clave in HUD.IDS_TEXTO) this.elementos[clave] = document.getElementById(HUD.IDS_TEXTO[clave]);

        this.sliderZoom = document.getElementById("zoom-slider");
        this.textoValorZoom = document.getElementById("valor-zoom");
        this.btnBorrador = document.getElementById("delete-points-mode");
        this.btnDinamismo = document.getElementById("dinamic-points");
        this.visor = document.getElementById("lienzo");
        this.minimapa = document.getElementById("minimapa");
        this.ctxMinimapa = this.minimapa.getContext("2d");
    }

    _escribirDatosEstaticos() {
        const c = this.config;
        this._escribirPorId("hud-mundo-titulo", `${c.mundo.ancho}×${c.mundo.alto}`);
        this._escribirPorId("hud-vista-titulo", `${c.canvas.ancho}×${c.canvas.alto} px`);
        this._escribirPorId("hud-mundo", `${c.mundo.ancho} × ${c.mundo.alto} celdas`);
        this._escribirPorId("hud-dist-min", c.puntos.distMinima);

        this.sliderZoom.max = Camara.NIVELES_ZOOM.length - 1;
    }

    // Ajusta el slider de zoom al rango que permite la cámara (en juego sólo ×4 a ×8).
    configurarRangoZoom() {
        this.sliderZoom.min = this.camara.indiceZoomMin;
        this.sliderZoom.max = this.camara.indiceZoomMax;
    }

    _escribirPorId(id, texto) {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    _registrarClickEnMinimapa(callback) {
        this.minimapa.addEventListener("click", (e) => {
            const rect = this.minimapa.getBoundingClientRect();
            const mundoX = (e.clientX - rect.left) / rect.width * this.config.mundo.ancho;
            const mundoY = (e.clientY - rect.top) / rect.height * this.config.mundo.alto;
            callback(mundoX, mundoY);
        });
    }

    // --- Actualización ---

    _escribir(clave, texto) {
        if (this.cache[clave] === texto) return;
        this.cache[clave] = texto;
        this.elementos[clave].textContent = texto;
    }

    _actualizarTextos(s) {
        this._escribir("voronoi", `${s.voronoiMs.toFixed(2)} ms`);
        this._escribir("composicion", `${s.composicionMs.toFixed(2)} ms`);
        this._escribir("frame", `${s.frameMs.toFixed(1)} ms`);

        this._escribir("posicion", s.mundoX === null ? "—" : `${s.mundoX}, ${s.mundoY}`);
        this._escribir("material", s.materialNombre);
        this._escribir("modo", s.modo === MODOS.JUEGO ? "Juego" : s.borrador ? "Borrar" : "Dibujar");

        this._escribir("zoom", `×${s.zoom}`);
        this._escribir("camara", `${Math.round(s.camX)}, ${Math.round(s.camY)}`);
        this._escribir("vista", `${Math.round(s.anchoVisible)} × ${Math.round(s.altoVisible)} celdas`);

        this._escribir("puntos", `${s.puntosUsados} / ${s.puntosMax}`);
        this._escribir("celdas", String(s.celdasOcupadas));
        this._escribir("dinamismo", s.dinamismo ? "Activado" : "Desactivado");
        this._escribir("rebotes", String(s.rebotes));

        // Medición de rendimiento: la física sólo existe mientras se juega.
        this._escribir("fisica", s.fisicaMs === null ? "—" : `${s.fisicaMs.toFixed(3)} ms`);
        this._escribir("simulacion", `${s.simulacionMs.toFixed(2)} ms`);
        this._escribir("bloques", String(s.bloquesProcesados));
        this._escribir("jugador", s.jugadorX === null ? "—" : `${Math.round(s.jugadorX)}, ${Math.round(s.jugadorY)}`);
    }

    // Refleja en la interfaz los estados que también pueden cambiar con atajos o la rueda del mouse.
    _actualizarControles(s) {
        this.sliderZoom.value = s.indiceZoom;
        this.textoValorZoom.textContent = `×${s.zoom}`;

        this._marcarBoton(this.btnBorrador, s.borrador);
        this._marcarBoton(this.btnDinamismo, s.dinamismo);
        this.visor.dataset.modo = s.modo === MODOS.JUEGO ? "juego" : s.borrador ? "borrar" : "dibujar";
    }

    _marcarBoton(boton, activo) {
        boton.setAttribute("aria-pressed", String(activo));
        boton.classList.toggle("activo", activo);
    }

    // --- Minimapa (sólo semillas y rectángulo de la cámara: barato, no re-calcula el Voronoi) ---

    _actualizarMinimapa(s) {
        const w = this.minimapa.width, h = this.minimapa.height;
        const ex = w / this.config.mundo.ancho;
        const ey = h / this.config.mundo.alto;

        const jugador = s.jugadorX === null ? "" : `${Math.round(s.jugadorX * ex)},${Math.round(s.jugadorY * ey)}`;
        if (s.versionCamara === this.versionCamaraDibujada && s.versionPuntos === this.versionPuntosDibujada
            && jugador === this.jugadorDibujado) return;
        this.versionCamaraDibujada = s.versionCamara;
        this.versionPuntosDibujada = s.versionPuntos;
        this.jugadorDibujado = jugador;

        const ctx = this.ctxMinimapa;

        ctx.fillStyle = "#0b0b10";
        ctx.fillRect(0, 0, w, h);

        for (const p of this.mundoVoronoi.puntos) {
            ctx.fillStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`;
            ctx.fillRect(p.x * ex - 1, p.y * ey - 1, 3, 3);
        }

        if (s.jugadorX !== null) {
            ctx.fillStyle = "#ffd23f";
            ctx.fillRect(s.jugadorX * ex - 2, s.jugadorY * ey - 2, 4, 4);
        }

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(this.camara.x * ex + 0.5, this.camara.y * ey + 0.5, this.camara.anchoVisible * ex, this.camara.altoVisible * ey);
    }
}
