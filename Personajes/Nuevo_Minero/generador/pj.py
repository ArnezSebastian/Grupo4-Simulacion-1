#!/usr/bin/env python3
# Generador del spritesheet del jugador: el minero "Pablo" en pixel art.
# Mira siempre hacia la DERECHA (en el juego se espeja con scale.x = -1).
# Escala: 1 píxel del sprite = 1 celda del mundo. El cuerpo mide 7 x 12 celdas (la caja actual del jugador).
#
# Se arma con un "rig" (torso, cabeza, brazos, piernas, picota) y un contorno exterior automático.
# Coordenadas locales: x=0 es la columna central del cuerpo, y=0 es la fila de las suelas (negativo = arriba).
import math, json, os
from PIL import Image, ImageDraw

W = H = 32                  # tamaño de cada frame
CX, BASE = 12, 22           # columna central y fila de las suelas dentro del frame (margen para el pico y las chispas)
PIVOTE = (CX + 0.5, BASE + 1.0)     # centro de los pies (borde inferior de la fila de suelas)

PAL = {
    'out':   (32, 20, 31),    'skin':  (240, 176, 124), 'skin_s': (192, 120, 84),
    'hat':   (230, 188, 92),  'hat_s': (172, 124, 54),  'band':   (200, 60, 54),
    'hair':  (92, 58, 34),
    'shirt': (60, 128, 216),  'shirt_l': (104, 166, 244), 'shirt_s': (38, 84, 156),
    'pants': (130, 124, 54),  'pants_s': (90, 84, 40),
    'boot':  (110, 54, 48),   'boot_s': (68, 36, 36),   'belt': (72, 46, 32),
    'wood':  (158, 104, 56),  'wood_s': (112, 72, 40),
    'steel': (200, 212, 222), 'steel_s': (124, 140, 154), 'steel_h': (244, 248, 252),
}

def r(v): return int(math.floor(v + 0.5))

def put(cv, x, y, c): cv[(CX + r(x), BASE + r(y))] = c

def rect(cv, x0, y0, x1, y1, c):
    for y in range(r(y0), r(y1) + 1):
        for x in range(r(x0), r(x1) + 1): put(cv, x, y, c)

def line(cv, x0, y0, x1, y1, c, grosor=1):
    x0, y0, x1, y1 = r(x0), r(y0), r(x1), r(y1)
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx - dy
    while True:
        put(cv, x0, y0, c)
        if grosor == 2: put(cv, x0 + 1, y0, c)
        if x0 == x1 and y0 == y1: break
        e2 = 2 * err
        if e2 > -dy: err -= dy; x0 += sx
        if e2 < dx:  err += dx; y0 += sy

def limitar(origen, destino, maximo):
    """Acorta el vector origen->destino a `maximo` píxeles (los brazos no se estiran sin límite)."""
    dx, dy = destino[0] - origen[0], destino[1] - origen[1]
    d = math.hypot(dx, dy)
    if d <= maximo or d == 0: return destino
    return (origen[0] + dx * maximo / d, origen[1] + dy * maximo / d)

# ---------------- partes del cuerpo ----------------
def pierna(cv, hx, hip_y, ax, ay, kdx, atras):
    """Pierna de 2 px de ancho: cadera -> rodilla -> tobillo. La bota (3x2) tiene la punta a la derecha."""
    pc, bc = ('pants_s', 'boot_s') if atras else ('pants', 'boot')
    ty = ay - 1
    kx, ky = (hx + ax) / 2 + kdx, (hip_y + ty) / 2
    line(cv, hx, hip_y, kx, ky, pc, 2)
    line(cv, kx, ky, ax, ty, pc, 2)
    rect(cv, ax, ay, ax + 2, ay + 1, bc)

def torso(cv, dy, inclina):
    for t in range(4):                                  # filas -7..-4 (+dy)
        y = -7 + dy + t
        desp = r(inclina * (3 - t) / 3)
        for x in range(-2, 3):
            c = 'belt' if t == 3 else ('shirt_s' if x == -2 else 'shirt')
            put(cv, x + desp, y, c)

def cabeza(cv, dy, inclina, mira, sombrero_extra=0):
    base = dy + (1 if mira < 0 else 0)
    x0, x1 = -2 + inclina, 2 + inclina
    if mira > 0:                                        # mirando arriba: se ve la frente, el sombrero sube
        rect(cv, x0, -10 + base, x1, -8 + base, 'skin'); ojo_y, sombrero = -9 + base, -1
    elif mira < 0:                                      # mirando abajo: el ala tapa los ojos
        rect(cv, x0, -9 + base, x1, -8 + base, 'skin'); ojo_y, sombrero = -8 + base, 0     # asiente: la cabeza baja con el sombrero y los ojos miran abajo
    else:
        rect(cv, x0, -9 + base, x1, -8 + base, 'skin'); ojo_y, sombrero = -9 + base, 0
    put(cv, x0, -8 + base, 'hair')
    put(cv, x1 + 1, ojo_y, 'skin')                      # nariz
    put(cv, x1 - 1, ojo_y, 'out')                       # ojo
    hb = base + sombrero + sombrero_extra
    cara_arriba = -10 + base if mira > 0 else -9 + base
    if cara_arriba - (-10 + hb) > 1:                    # si el sombrero se levantó, la frente rellena el hueco
        rect(cv, x0, -10 + hb + 1, x1, cara_arriba - 1, 'skin')
    rect(cv, x0 + 1, -12 + hb, x1 - 1, -12 + hb, 'hat')                 # copa
    rect(cv, x0, -11 + hb, x1, -11 + hb, 'band')                        # cinta roja
    rect(cv, x0 - 1, -10 + hb, x1 + 1, -10 + hb, 'hat')                 # ala
    put(cv, x0 - 1, -10 + hb, 'hat_s'); put(cv, x0, -10 + hb, 'hat_s')  # sombra del ala atrás

def brazo(cv, hombro, mano, atras):
    line(cv, hombro[0], hombro[1], mano[0], mano[1], 'shirt_s' if atras else 'shirt_l')
    put(cv, mano[0], mano[1], 'skin_s' if atras else 'skin')

def picota(cv, gx, gy, ang, largo=7, culata=2, mitad=2):
    a = math.radians(ang); dx, dy = math.cos(a), math.sin(a)
    tx, ty = gx + largo * dx, gy + largo * dy
    line(cv, gx - culata * dx, gy - culata * dy, tx, ty, 'wood')
    px, py = -dy, dx
    e1 = (tx + mitad * px, ty + mitad * py); e2 = (tx - mitad * px, ty - mitad * py)
    line(cv, e1[0], e1[1], e2[0], e2[1], 'steel')
    for e in (e1, e2): put(cv, e[0] - dx, e[1] - dy, 'steel_s')      # puntas curvadas hacia el mango
    put(cv, tx, ty, 'steel_h')

# ---------------- una pose completa ----------------
PIE_ATRAS = dict(hx=-2, ax=-2, ay=-1, k=0)
PIE_FRENTE = dict(hx=1, ax=1, ay=-1, k=0)

def render(p):
    cv = {}
    dy, inc, mira = p.get('dy', 0), p.get('inc', 0), p.get('mira', 0)
    pb, pf = {**PIE_ATRAS, **p.get('pb', {})}, {**PIE_FRENTE, **p.get('pf', {})}
    cadera = -3 + dy
    hombro_b = (-3 + r(inc * 0.5), -6 + dy)
    hombro_f = (3 + r(inc * 0.5), -6 + dy)
    grip = p.get('grip')

    pierna(cv, pb['hx'], cadera, pb['ax'], pb['ay'], pb['k'], True)
    mano_b = p.get('mano_b', (-3, -3 + dy))
    if p.get('dos_manos') and grip:
        a = math.radians(p['ang'])
        mano_b = limitar(hombro_b, (grip[0] + 2.5 * math.cos(a), grip[1] + 2.5 * math.sin(a)), 4.5)
    brazo(cv, hombro_b, mano_b, True)
    if grip and p.get('picota_orden') == 'atras': picota(cv, grip[0], grip[1], p['ang'])
    torso(cv, dy, inc)
    pierna(cv, pf['hx'], cadera, pf['ax'], pf['ay'], pf['k'], False)
    if grip and p.get('picota_orden', 'medio') == 'medio': picota(cv, grip[0], grip[1], p['ang'])
    cabeza(cv, dy, inc, mira, p.get('sombrero_extra', 0))
    if grip and p.get('picota_orden') == 'delante': picota(cv, grip[0], grip[1], p['ang'])
    mano_f = limitar(hombro_f, grip, 4.5) if grip else (4, -3 + dy)
    brazo(cv, hombro_f, mano_f, False)
    if p.get('chispas') and grip:
        a = math.radians(p['ang']); dx, dy2 = math.cos(a), math.sin(a)
        tx, ty = grip[0] + 7 * dx, grip[1] + 7 * dy2
        for k, (ad, lat, c) in enumerate([(2.2, 0, 'steel_h'), (1.6, 2, 'hat'), (1.6, -2, 'hat'), (3.2, 1, 'steel_h')]):
            put(cv, tx + dx * ad - dy2 * lat, ty + dy2 * ad + dx * lat, c)
    return cv

def a_imagen(cv):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); px = im.load()
    for (x, y), c in cv.items():
        if 0 <= x < W and 0 <= y < H: px[x, y] = PAL[c] + (255,)
    base = im.copy(); b = base.load()
    for y in range(H):
        for x in range(W):
            if b[x, y][3] == 0:
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and b[nx, ny][3] > 0:
                        px[x, y] = PAL['out'] + (255,); break
    return im
