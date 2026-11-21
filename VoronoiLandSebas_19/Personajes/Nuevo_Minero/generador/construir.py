import json, os, sys
from PIL import Image, ImageDraw, ImageFont
from pj import *
from poses import ANIMACIONES

SALIDA = sys.argv[1] if len(sys.argv) > 1 else 'salida'
os.makedirs(SALIDA, exist_ok=True)
COLS = 8

def damero(w, h, t=8, c1=(70, 70, 82, 255), c2=(92, 92, 106, 255)):
    im = Image.new("RGBA", (w, h), c1); d = ImageDraw.Draw(im)
    for y in range(0, h, t):
        for x in range(0, w, t):
            if (x // t + y // t) % 2: d.rectangle([x, y, x + t - 1, y + t - 1], fill=c2)
    return im

# ---------- frames ----------
frames = []                                   # (nombre, imagen)
orden = {}
for nombre, fps, bucle, poses in ANIMACIONES:
    orden[nombre] = []
    for i, p in enumerate(poses):
        n = f"{nombre}_{i}"
        frames.append((n, a_imagen(render(p)))); orden[nombre].append(n)

filas = (len(frames) + COLS - 1) // COLS
hoja = Image.new("RGBA", (COLS * W, filas * H), (0, 0, 0, 0))
atlas_frames = {}
for i, (n, im) in enumerate(frames):
    x, y = (i % COLS) * W, (i // COLS) * H
    hoja.paste(im, (x, y))
    atlas_frames[n] = {"frame": {"x": x, "y": y, "w": W, "h": H}, "rotated": False, "trimmed": False,
                       "spriteSourceSize": {"x": 0, "y": 0, "w": W, "h": H}, "sourceSize": {"w": W, "h": H}}
hoja.save(os.path.join(SALIDA, "jugador_spritesheet.png"))

# ---------- atlas (formato de PIXI.Spritesheet; las claves extra de meta las ignora Pixi) ----------
atlas = {
    "frames": atlas_frames,
    "animations": orden,
    "meta": {
        "app": "generador propio (pj.py)", "version": "1.0", "image": "jugador_spritesheet.png", "format": "RGBA8888",
        "size": {"w": hoja.width, "h": hoja.height}, "scale": "1",
        # --- datos propios para el juego ---
        "frameSize": {"w": W, "h": H},
        "mira": "derecha (para mirar a la izquierda: scale.x = -1 con el ancla en el pivote)",
        "escala": "1 píxel del sprite = 1 celda del mundo",
        "pivote": {"x": PIVOTE[0], "y": PIVOTE[1], "nota": "centro de los pies; ahí va la posición (x + ancho/2, y + alto) de la caja del jugador"},
        "ancla": {"x": PIVOTE[0] / W, "y": PIVOTE[1] / H},
        "cajaDeColision": {"ancho": 7, "alto": 12},
        "animaciones": {n: {"fps": fps, "bucle": b} for n, fps, b, _ in ANIMACIONES},
    },
}
json.dump(atlas, open(os.path.join(SALIDA, "jugador_atlas.json"), "w", encoding="utf8"), indent=2, ensure_ascii=False)

# ---------- vista previa estática (por animación, ampliada, con la caja de colisión y el pivote) ----------
fuente = ImageFont.load_default()
Z = 6
margen = 70
ancho_max = max(len(p) for _, _, _, p in ANIMACIONES)
vista = damero(margen + ancho_max * W * Z, len(ANIMACIONES) * (H * Z + 6))
d = ImageDraw.Draw(vista)
for fila, (nombre, fps, bucle, poses) in enumerate(ANIMACIONES):
    y0 = fila * (H * Z + 6)
    d.text((4, y0 + 4), nombre, fill=(255, 235, 120, 255), font=fuente)
    d.text((4, y0 + 18), f"{len(poses)} cuadros", fill=(200, 200, 210, 255), font=fuente)
    d.text((4, y0 + 32), f"{fps} fps{'' if bucle else ' (1 vez)'}", fill=(200, 200, 210, 255), font=fuente)
    for i, n in enumerate(orden[nombre]):
        im = frames[[f[0] for f in frames].index(n)][1].resize((W * Z, H * Z), Image.NEAREST)
        x0 = margen + i * W * Z
        vista.alpha_composite(im, (x0, y0))
        bx = x0 + int((PIVOTE[0] - 3.5) * Z); by = y0 + int((PIVOTE[1] - 12) * Z)
        d.rectangle([bx, by, bx + 7 * Z - 1, by + 12 * Z - 1], outline=(255, 90, 130, 200))
        d.line([x0 + int(PIVOTE[0] * Z) - 4, y0 + int(PIVOTE[1] * Z), x0 + int(PIVOTE[0] * Z) + 4, y0 + int(PIVOTE[1] * Z)], fill=(120, 255, 160, 255))
vista.save(os.path.join(SALIDA, "vista_previa_hoja.png"))

# ---------- vista previa animada (GIF): cada animación, con su ritmo ----------
ZG = 7
fondo_gif = damero(W * ZG + 0, H * ZG + 22, 14, (52, 54, 66, 255), (62, 64, 78, 255)).convert("RGB")
secuencia, duraciones = [], []
for nombre, fps, bucle, poses in ANIMACIONES:
    repeticiones = max(1, round(1.8 * fps / len(poses))) if bucle else 2
    lista = []
    for _ in range(repeticiones):
        for i, n in enumerate(orden[nombre]):
            lista.append(n)
        if not bucle: lista += [orden[nombre][-1]] * 2        # las que se hacen una vez se quedan en el último cuadro
    for n in lista:
        im = frames[[f[0] for f in frames].index(n)][1].resize((W * ZG, H * ZG), Image.NEAREST)
        cuadro = fondo_gif.copy(); cuadro.paste(im, (0, 22), im)
        dd = ImageDraw.Draw(cuadro); dd.text((6, 5), f"{nombre}   ({fps} fps)", fill=(255, 235, 120), font=fuente)
        bx = int((PIVOTE[0] - 3.5) * ZG); by = 22 + int((PIVOTE[1] - 12) * ZG)
        dd.rectangle([bx, by, bx + 7 * ZG - 1, by + 12 * ZG - 1], outline=(255, 90, 130))
        secuencia.append(cuadro); duraciones.append(int(1000 / fps))
secuencia[0].save(os.path.join(SALIDA, "vista_previa_animada.gif"), save_all=True, append_images=secuencia[1:], duration=duraciones, loop=0)
print(len(frames), "frames |", hoja.size, "| vista", vista.size, "| gif", len(secuencia), "cuadros")
