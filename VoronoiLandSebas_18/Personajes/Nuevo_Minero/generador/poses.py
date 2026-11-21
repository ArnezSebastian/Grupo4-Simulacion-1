# Las 10 animaciones del jugador. Cada pose es un dict para pj.render(): ver los parámetros en pj.py.
import math
from pj import r

def llevar(dy=0, ang=-82):
    """Picota llevada vertical al costado (la pose de reposo)."""
    return dict(grip=(4, -5 + dy), ang=ang)

def idle(k):
    dy = [0, 0, 1, 1][k]                                   # respiración: el torso baja 1 px
    return dict(dy=dy, **llevar(dy))

def correr(k):
    f = 2 * math.pi * k / 6
    def pierna(fase, hx):
        lift = max(0, math.cos(fase))
        return dict(hx=hx, ax=r(3 * math.sin(fase)) - 1, ay=-1 - r(2 * lift), k=(1 if lift > 0.3 else 0))
    dy = 1 if abs(math.cos(f)) < 0.5 else 0                # el cuerpo baja en los contactos
    return dict(dy=dy, inc=1, pb=pierna(f + math.pi, -2), pf=pierna(f, 1),
                mano_b=(-3 + r(2 * math.sin(f)), -3 + dy), **llevar(dy, -82 + 6 * math.sin(f)))

SALTAR = [
    dict(pb=dict(ax=-3, ay=-2, k=-1), pf=dict(ax=2, ay=-3, k=1), mano_b=(-4, -8), grip=(5, -8), ang=-98),
    dict(pb=dict(ax=-3, ay=-3, k=-1), pf=dict(ax=2, ay=-4, k=1), mano_b=(-4, -9), grip=(4, -9), ang=-100),
    dict(pb=dict(ax=-2, ay=-3, k=-1), pf=dict(ax=1, ay=-3, k=1), mano_b=(-4, -9), grip=(4, -9), ang=-95),
]
CAER = [
    dict(pb=dict(ax=-3, ay=-1), pf=dict(ax=2, ay=-1), mano_b=(-4, -8), grip=(4, -9), ang=-85, sombrero_extra=-1),
    dict(pb=dict(ax=-3, ay=-1), pf=dict(ax=3, ay=-1), mano_b=(-5, -7), grip=(5, -8), ang=-75, sombrero_extra=-1),
]
ATERRIZAR = [
    dict(dy=1, inc=1, pb=dict(ax=-3, ay=-1, k=-1), pf=dict(ax=2, ay=-1, k=1), mano_b=(-4, -3), **llevar(1, -70)),
    dict(dy=1, inc=0, **llevar(1)),
]
MIRAR_ARRIBA = [dict(mira=1, inc=-1, dy=d, **llevar(d, -86)) for d in (0, 1)]
MIRAR_ABAJO = [dict(mira=-1, inc=1, **llevar(0, a)) for a in (-78, -70)]        # la cabeza ya está baja: sólo se mece la picota

P2 = dict(dos_manos=True, picota_orden='delante')
PICAR = [                                                  # golpe horizontal: preparación, arriba, bajada, impacto, apoyo, vuelta
    dict(inc=-1, grip=(3, -8), ang=-160, pb=dict(ax=-3), dos_manos=True, picota_orden='medio'),   # el mango pasa por detrás de la cabeza
    dict(inc=-1, grip=(2, -10), ang=-115, pb=dict(ax=-3), **P2),
    dict(inc=0, grip=(4, -9), ang=-55, pb=dict(ax=-3), pf=dict(ax=2), **P2),
    dict(dy=1, inc=1, grip=(6, -5), ang=15, pb=dict(ax=-3), pf=dict(ax=2), chispas=True, **P2),
    dict(dy=1, inc=1, grip=(6, -4), ang=25, pb=dict(ax=-3), pf=dict(ax=2), **P2),
    dict(inc=0, grip=(5, -7), ang=-45, **P2),
]
PICAR_ARRIBA = [
    dict(mira=1, inc=-1, grip=(4, -6), ang=-100, **P2),
    dict(mira=1, inc=-1, grip=(3, -8), ang=-95, **P2),
    dict(mira=1, inc=-1, dy=-1, grip=(3, -10), ang=-90, pb=dict(ay=-2), pf=dict(ay=-2), chispas=True, **P2),
    dict(mira=1, inc=-1, grip=(3, -9), ang=-92, **P2),
    dict(mira=1, inc=-1, grip=(4, -7), ang=-100, **P2),
]
PICAR_ABAJO = [
    dict(mira=-1, inc=1, grip=(4, -9), ang=70, **P2),
    dict(mira=-1, inc=1, grip=(5, -7), ang=75, **P2),
    dict(mira=-1, inc=1, dy=1, grip=(5, -4), ang=80, chispas=True, **P2),
    dict(mira=-1, inc=1, dy=1, grip=(5, -5), ang=78, **P2),
    dict(mira=-1, inc=1, grip=(4, -8), ang=72, **P2),
]

# nombre, cuadros por segundo, ¿en bucle?, poses
ANIMACIONES = [
    ("idle",          6, True,  [idle(k) for k in range(4)]),
    ("correr",       12, True,  [correr(k) for k in range(6)]),
    ("saltar",       10, False, SALTAR),
    ("caer",          8, True,  CAER),
    ("aterrizar",    12, False, ATERRIZAR),
    ("mirar_arriba",  4, True,  MIRAR_ARRIBA),
    ("mirar_abajo",   4, True,  MIRAR_ABAJO),
    ("picar",        14, True,  PICAR),
    ("picar_arriba", 14, True,  PICAR_ARRIBA),
    ("picar_abajo",  14, True,  PICAR_ABAJO),
]
