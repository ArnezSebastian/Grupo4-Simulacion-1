import json, random, sys
from PIL import Image, ImageDraw, ImageFont
from pj import PIVOTE, W, H
SAL = sys.argv[1] if len(sys.argv) > 1 else 'salida'
sheet = Image.open(f'{SAL}/jugador_spritesheet.png').convert('RGBA'); atlas = json.load(open(f'{SAL}/jugador_atlas.json', encoding='utf8'))
fr = atlas['frames']
ARENA, PIEDRA, FONDO = (220, 190, 110), (90, 90, 98), (2, 2, 2)
def frame(n):
    f = fr[n]['frame']; return sheet.crop((f['x'], f['y'], f['x'] + W, f['y'] + H))
def ruido(c, a): return tuple(max(0, min(255, v + random.randint(-a, a))) for v in c)

def escena(zoom, nombre):
    """La vista real del juego: el canvas de 800x600 px a este zoom (x8 = 100x75 celdas, x4 = 200x150)."""
    CW, CH = 800 // zoom, 600 // zoom
    random.seed(3)
    suelo = int(CH * 0.66)
    cel = Image.new('RGB', (CW, CH), FONDO); px = cel.load()
    for y in range(suelo, CH):
        for x in range(CW):
            px[x, y] = ruido(PIEDRA if (x // (CW // 8) + y // 6) % 5 == 0 else ARENA, 14)
    for y in range(suelo - int(CH * 0.2), suelo):                         # bloque de piedra a la derecha
        for x in range(int(CW * 0.6), CW): px[x, y] = ruido(PIEDRA, 10)
    img = cel.resize((CW * zoom, CH * zoom), Image.NEAREST).convert('RGBA'); d = ImageDraw.Draw(img)
    def poner(n, cx, base_y):                                              # el pivote del sprite va en (cx, base_y) en celdas
        img.alpha_composite(frame(n).resize((W * zoom, H * zoom), Image.NEAREST), (int(round((cx - PIVOTE[0]) * zoom)), int(round((base_y - PIVOTE[1]) * zoom))))
        bx, by = int(round((cx - 3.5) * zoom)), int(round((base_y - 12) * zoom))
        d.rectangle([bx, by, bx + 7 * zoom - 1, by + 12 * zoom - 1], outline=(255, 90, 130, 255))
    k = CW / 100                                                           # posiciones relativas a la vista x8
    poner('idle_0', 12.5 * k, suelo)
    poner('saltar_1', 26.5 * k, suelo - 9 * k)
    poner('correr_2', 38.5 * k, suelo)
    poner('picar_3', 52.5 * k, suelo)
    d.text((8, 6), f"{nombre}: vista real del juego ({CW}x{CH} celdas). Rosa = caja de colisión 7x12", fill=(255, 235, 120, 255), font=ImageFont.load_default())
    return img
escena(8, 'zoom x8').save(f'{SAL}/vista_escala_x8.png'); escena(4, 'zoom x4').save(f'{SAL}/vista_escala_x4.png')
print('ok')
