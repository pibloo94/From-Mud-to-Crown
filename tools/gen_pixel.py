#!/usr/bin/env python3
"""Genera el arte del mapa en pixel art (estilo D: paleta limitada, tonos apagados).

Uso:  python3 tools/gen_pixel.py
Salida: public/assets/pixel/*.png y public/assets/pixel/manifest.json

Convenciones:
- Resolucion nativa: una casilla isometrica mide 32x16 px. En el juego todo se dibuja a x4
  (casilla de 128x64 unidades de mundo) con filtrado nitido, asi que cada pixel se ve.
- Los objetos se apoyan en el vertice inferior de su casilla (origen 0.5, 1). Un objeto de una
  casilla mide como mucho 32 px de ancho; la casa solariega (2x2), 64. Asi nada invade lo de al lado.
- Luz desde arriba a la izquierda: caras izquierdas claras, derechas oscuras. Contorno oscuro de 1 px.
"""
from __future__ import annotations

import json
import math
import os
import random

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "pixel")
TW, TH = 32, 16

# ------------------------------------------------------------------ paleta limitada (estilo D)
P = {
    "out": "#1b1611",
    # hierba
    "g0": "#3d4729", "g1": "#4b5631", "g2": "#59663a", "g3": "#677443", "g4": "#78834e", "gdry": "#8a8656",
    # tierra y caminos
    "s0": "#2e2218", "s1": "#3d2d1f", "s2": "#4e3a28", "s3": "#614a33",
    "p0": "#5e5646", "p1": "#7a705b", "p2": "#8f846b", "p3": "#a3987c",
    # paja y trigo
    "st0": "#6b5226", "st1": "#876a32", "st2": "#a6863f", "st3": "#c2a352", "st4": "#d6bc6c",
    # madera
    "w0": "#2a1c12", "w1": "#3e2a1a", "w2": "#553a23", "w3": "#6d4d2e", "w4": "#86633d",
    # piedra
    "r0": "#3a3832", "r1": "#4d4a42", "r2": "#625e54", "r3": "#7a7568", "r4": "#928c7c",
    # enlucido
    "pl0": "#8c7c5f", "pl1": "#a69574", "pl2": "#bcab88",
    # tejas y pizarra
    "sh0": "#3a2a24", "sh1": "#4c3830", "sh2": "#5e463b",
    "sl0": "#2b2f35", "sl1": "#3a3f47", "sl2": "#4b515a",
    # hojas
    "l0": "#26321f", "l1": "#334227", "l2": "#425433", "l3": "#53663d", "l4": "#667a4a",
    "pi0": "#1f2b24", "pi1": "#2b3b31", "pi2": "#394d3f", "pi3": "#4a604f",
    # acentos
    "red0": "#5a1f18", "red1": "#7c2c22", "red2": "#9a3e2e",
    "cream": "#d2c39c", "cream0": "#b3a37f",
    "gold": "#c9a24a", "glow": "#e0b45a",
    "skin": "#c69c74", "skin0": "#a37b58",
    "cow": "#6b4630", "cow0": "#4d3121", "cowl": "#d9ccae",
    "hen": "#8a5b3a", "hen0": "#5f3d26", "comb": "#8c2a1d", "beak": "#c08a35",
    "carrot": "#b8652c", "cab": "#6f8a52", "cab1": "#8aa36a", "cab0": "#4e6a3c",
    "iron": "#2f2e2b", "iron1": "#4a4843", "milk": "#e4dcc8",
    # nieve (fria y apagada, no blanca pura) y barro cocido del horno
    "sn0": "#7f8a8e", "sn1": "#a3abac", "sn2": "#c3c8c4", "sn3": "#dcdfd8",
    "cl0": "#5c3424", "cl1": "#7e4a31", "cl2": "#9c613d", "fire": "#d0702a",
    # agua del caz del aserradero (apagada, como el resto)
    "wa0": "#2f4a52", "wa1": "#3f5f66", "wa2": "#6f8f92",
}


def rgba(c, a=255):
    c = P.get(c, c)
    return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), a)


class Spr:
    """Lienzo de pixel art con utilidades isometricas."""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    # -- primitivas
    def px(self, x, y, c, a=255):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), rgba(c, a))

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.im.getpixel((x, y))
        return (0, 0, 0, 0)

    def poly(self, pts, c):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=rgba(c))

    def rect(self, x0, y0, x1, y1, c):
        self.d.rectangle([x0, y0, x1, y1], fill=rgba(c))

    def line(self, a, b, c):
        self.d.line([(round(a[0]), round(a[1])), (round(b[0]), round(b[1]))], fill=rgba(c))

    def ellipse(self, cx, cy, rx, ry, c):
        self.d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=rgba(c))

    def outline(self, c="out"):
        """Contorno de 1 px por fuera de lo pintado (4 vecinos)."""
        src = self.im.copy()
        col = rgba(c)
        for y in range(self.h):
            for x in range(self.w):
                if src.getpixel((x, y))[3] >= 128:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src.getpixel((nx, ny))[3] >= 128:
                        self.im.putpixel((x, y), col)
                        break

    def paste(self, other: "Spr", ox, oy):
        self.im.alpha_composite(other.im, (int(ox), int(oy)))

    # -- isometrico
    def diamond(self, oy, c, cx=None, hw=16):
        """Rombo de casilla (32x16) con el vertice superior en (cx, oy)."""
        cx = self.w // 2 if cx is None else cx
        for r in range(hw):
            half = 2 * (r if r < hw // 2 else hw - 1 - r) + 2
            self.rect(cx - half, oy + r, cx + half - 1, oy + r, c)

    def box(self, cx, by, a, h, left, right, top=None):
        """Caja isometrica: base con vertice inferior (cx, by), semiancho a (par), altura h."""
        hb = a // 2
        self.poly([(cx - a, by - hb), (cx - 1, by), (cx - 1, by - h), (cx - a, by - hb - h)], left)
        self.poly([(cx, by), (cx + a - 1, by - hb), (cx + a - 1, by - hb - h), (cx, by - h)], right)
        if top:
            self.poly([(cx - a, by - hb - h), (cx, by - h), (cx + a - 1, by - hb - h), (cx, by - a - h)], top)
        return {"L": (cx - a, by - hb - h), "F": (cx, by - h), "R": (cx + a - 1, by - hb - h), "B": (cx, by - a - h), "h": h, "a": a, "cx": cx, "by": by}

    def box2(self, cx, by, al, ar, h, left, right, top=None):
        """Caja de planta rectangular: pared izquierda de al px de ancho y derecha de ar (pares)."""
        self.poly([(cx - al, by - al // 2), (cx - 1, by), (cx - 1, by - h), (cx - al, by - al // 2 - h)], left)
        self.poly([(cx, by), (cx + ar - 1, by - ar // 2), (cx + ar - 1, by - ar // 2 - h), (cx, by - h)], right)
        B = (cx - al + ar, by - al // 2 - ar // 2 - h)
        if top:
            self.poly([(cx - al, by - al // 2 - h), (cx, by - h), (cx + ar - 1, by - ar // 2 - h), B], top)
        return {"L": (cx - al, by - al // 2 - h), "F": (cx, by - h), "R": (cx + ar - 1, by - ar // 2 - h), "B": B,
                "h": h, "a": al, "al": al, "ar": ar, "cx": cx, "by": by}

    def wall(self, cx, by, a, side, x0, x1, z0, z1, c):
        """Rellena en una pared (side 'l' o 'r') entre las columnas x0..x1 y alturas z0..z1."""
        for x in range(int(x0), int(x1) + 1):
            if side == "l":
                if not (cx - a <= x <= cx - 1):
                    continue
                base = by - (cx - 1 - x) // 2
            else:
                if not (cx <= x <= cx + a - 1):
                    continue
                base = by - (x - cx) // 2
            for z in range(int(z0), int(z1)):
                self.px(x, base - z, c)

    def gable_roof(self, b, rise, front, back, gable, over=1, texture=None, rnd=None):
        """Tejado a dos aguas con la cumbrera paralela a la pared izquierda."""
        L, F, R, B = b["L"], b["F"], b["R"], b["B"]
        L = (L[0] - over, L[1] + over / 2)
        F = (F[0], F[1] + over)
        m1 = ((L[0] + B[0]) / 2, (L[1] + B[1]) / 2 - rise)
        m2 = ((F[0] + R[0]) / 2 + over / 2, (F[1] + R[1]) / 2 - rise)
        self.poly([m1, (B[0], B[1]), (R[0] + over, R[1]), m2], back)
        self.poly([F, (R[0] + over, R[1]), m2], gable)
        self.poly([L, F, m2, m1], front)
        if texture and rnd:
            texture(self, L, F, m2, m1, rnd)
        return m1, m2


def straw_texture(s: Spr, L, F, m2, m1, rnd):
    """Vetas de paja paralelas al alero y algun pixel suelto."""
    for k in range(1, 9):
        f = k / 9
        a = (L[0] + (m1[0] - L[0]) * f, L[1] + (m1[1] - L[1]) * f)
        c = (F[0] + (m2[0] - F[0]) * f, F[1] + (m2[1] - F[1]) * f)
        if k % 2:
            s.line(a, c, "st1")
    for _ in range(10):
        f, g = rnd.random(), rnd.random()
        x = L[0] + (F[0] - L[0]) * f + (m1[0] - L[0]) * g
        y = L[1] + (F[1] - L[1]) * f + (m1[1] - L[1]) * g
        if s.get(int(x), int(y))[3]:
            s.px(x, y, rnd.choice(["st3", "st1"]))
    s.line(m1, m2, "st3")


def shingle_texture(dark, light):
    def tex(s: Spr, L, F, m2, m1, rnd):
        for k in range(1, 8):
            f = k / 8
            a = (L[0] + (m1[0] - L[0]) * f, L[1] + (m1[1] - L[1]) * f)
            c = (F[0] + (m2[0] - F[0]) * f, F[1] + (m2[1] - F[1]) * f)
            s.line(a, c, dark if k % 2 else light)
        s.line(m1, m2, light)
    return tex


def stone_texture(s: Spr, cx, by, a, h, rnd, left="r2", right="r1", ar=None):
    """Sillares: juntas cortas alternas (no rayas seguidas) y piedras de otro tono.
    Con ar, la pared derecha tiene otro ancho (cajas de planta rectangular, box2)."""
    al = a
    for side in ("l", "r"):
        a = al if side == "l" else (ar or al)
        x0, x1 = (cx - a, cx - 1) if side == "l" else (cx, cx + a - 1)
        joint = "r1" if side == "l" else "r0"
        for row, z in enumerate(range(0, h, 3)):
            off = 0 if row % 2 else 2
            for x in range(x0 + off, x1 + 1, 4):
                s.wall(cx, by, a, side, x, x, z, min(h, z + 3), joint)
                if z + 3 < h:
                    s.wall(cx, by, a, side, x, min(x1, x + 3), z + 2, z + 3, joint)
        for _ in range(a // 2):
            x = rnd.randint(x0, x1)
            z = rnd.randint(0, h - 1)
            s.wall(cx, by, a, side, x, x, z, z + 1, rnd.choice(["r4", "r2"]) if side == "l" else rnd.choice(["r2", "r0"]))


def timber_texture(s: Spr, cx, by, a, h, low=0):
    """Entramado de madera: postes en las esquinas y el centro, viga a media altura."""
    for side in ("l", "r"):
        for x in ((cx - a, cx - a // 2, cx - 1) if side == "l" else (cx, cx + a // 2, cx + a - 1)):
            s.wall(cx, by, a, side, x, x, low, h, "w1")
        x0, x1 = (cx - a, cx - 1) if side == "l" else (cx, cx + a - 1)
        s.wall(cx, by, a, side, x0, x1, (low + h) // 2, (low + h) // 2 + 1, "w1")
        s.wall(cx, by, a, side, x0, x1, h - 1, h, "w1")


def side_width(b, side):
    """Ancho en pixeles de una pared de la caja (las cajas cuadradas solo traen `a`)."""
    return b.get("al" if side == "l" else "ar", b["a"])


def door(s: Spr, b, side, f, w=3, hgt=5, c="w1"):
    a, cx, by = side_width(b, side), b["cx"], b["by"]
    if side == "l":
        x0 = cx - a + int((a - w) * f)
    else:
        x0 = cx + int((a - w) * f)
    s.wall(cx, by, a, side, x0, x0 + w - 1, 0, hgt, c)
    s.wall(cx, by, a, side, x0, x0 + w - 1, hgt - 1, hgt, "w0")


def window(s: Spr, b, side, f, z, lit=True, w=2, hgt=2):
    a, cx, by = side_width(b, side), b["cx"], b["by"]
    x0 = (cx - a + int((a - w) * f)) if side == "l" else (cx + int((a - w) * f))
    s.wall(cx, by, a, side, x0, x0 + w - 1, z, z + hgt, "glow" if lit else "w0")


def chimney(s: Spr, x, y, h=5):
    s.rect(x, y - h, x + 1, y, "r2")
    s.rect(x + 2, y - h + 1, x + 2, y, "r1")
    s.px(x, y - h, "r3")


def banner(s: Spr, x, y, h=9, flip=False):
    s.rect(x, y - h, x, y, "w1")
    d = -1 if flip else 1
    for k in range(4):
        s.px(x + d * (k + 1), y - h + 1, "red1")
        s.px(x + d * (k + 1), y - h + 2, "red2" if k < 3 else "red1")
        if k < 3:
            s.px(x + d * (k + 1), y - h + 3, "red0")


def touching_border(s: Spr):
    """Pixeles pintados en el borde del lienzo: ahi no cabe el contorno y el dibujo se ve cortado."""
    out = []
    for y in range(s.h):
        for x in range(s.w):
            if (x in (0, s.w - 1) or y in (0, s.h - 1)) and s.im.getpixel((x, y))[3] >= 128:
                out.append((x, y))
    return out


def finish(s: Spr, ground: "Spr | None" = None):
    """Contorno del objeto; si hay capa de suelo (tierra, hierba pisada), va debajo y sin contorno.
    Anota en `cut` lo del objeto que toca el borde (la capa de suelo no lleva contorno: no cuenta)."""
    cut = touching_border(s)
    s.outline()
    if ground is not None:
        ground.paste(s, 0, 0)
        s = ground
    s.cut = cut
    return s


def pad(s: Spr, l=1, t=1, r=1, b=1) -> Spr:
    """El mismo dibujo en un lienzo mayor, para que quepa el contorno."""
    out = Spr(s.w + l + r, s.h + t + b)
    out.paste(s, l, t)
    return out


def make_symmetric(s: Spr):
    """Silueta simetrica respecto al centro de lo pintado: lo que falte en un lado se copia del otro
    (con su color, asi las luces y sombras siguen donde estaban)."""
    src = s.im.copy()
    xs = [x for y in range(s.h) for x in range(s.w) if src.getpixel((x, y))[3] >= 128]
    if not xs:
        return
    x0, x1 = min(xs), max(xs)
    for y in range(s.h):
        for x in range(x0, x1 + 1):
            c = src.getpixel((x, y))
            m = x0 + x1 - x
            if c[3] >= 128 and src.getpixel((m, y))[3] < 128:
                s.im.putpixel((m, y), c)


def pattern(s: Spr, rows, pal, ox=0, oy=0):
    """Dibujo pixel a pixel: una cadena por fila; cada letra es un color de `pal` y el punto, vacio."""
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                s.px(ox + x, oy + y, pal[ch])


def ground_shadow(s: Spr, cx, by, rx, ry=None):
    """Sombra suave en el suelo, al pie de un objeto."""
    ry = ry or max(2, rx // 2)
    for y in range(-ry, ry + 1):
        for x in range(-rx, rx + 1):
            if (x / rx) ** 2 + (y / ry) ** 2 <= 1:
                s.px(cx + x, by - ry + y, "#000000", 70)


# ================================================================== suelo

def tile_cells(oy=0, cx=16):
    """Pixeles del rombo de una casilla."""
    out = []
    for r in range(16):
        half = 2 * (r if r < 8 else 15 - r) + 2
        for x in range(cx - half, cx + half):
            out.append((x, oy + r))
    return out


def grass(seed: int) -> Spr:
    rnd = random.Random(seed)
    s = Spr(TW, TH)
    s.diamond(0, "g2")
    cells = tile_cells()
    # manchas suaves de tono (en vez de ruido pixel a pixel)
    for _ in range(4):
        x0, y0 = rnd.choice(cells)
        c = rnd.choice(["g1", "g3"])
        for (x, y) in cells:
            if abs(x - x0) + 2 * abs(y - y0) < rnd.randint(4, 7) and rnd.random() < 0.7:
                s.px(x, y, c)
    for (x, y) in cells:
        if rnd.random() < 0.04:
            s.px(x, y, "g0")
    # matas de hierba: dos pixeles verticales claros con base oscura
    for _ in range(6):
        x, y = rnd.choice(cells)
        if y > 2 and s.get(x, y - 1)[3]:
            s.px(x, y, "g1")
            s.px(x, y - 1, "g4")
    # alguna flor apagada
    if seed % 3 == 0:
        x, y = rnd.choice(cells)
        s.px(x, y, "cream0")
    if seed % 3 == 1:
        x, y = rnd.choice(cells)
        s.px(x, y, "gdry")
    return s


def soil() -> Spr:
    rnd = random.Random(5)
    s = Spr(TW, TH)
    s.diamond(0, "s2")
    # surcos paralelos a un lado (pendiente 2:1)
    for (x, y) in tile_cells():
        k = (x + 2 * y) // 3
        if k % 2 == 0:
            s.px(x, y, "s1")
        elif rnd.random() < 0.15:
            s.px(x, y, "s3")
    return s


def soil_tired() -> Spr:
    """Capa sobre la tierra cansada: terrones claros y resecos y alguna grieta (el resto, transparente)."""
    rnd = random.Random(6)
    s = Spr(TW, TH)
    for (x, y) in tile_cells():
        r = rnd.random()
        if r < 0.22:
            s.px(x, y, "p1")
        elif r < 0.3:
            s.px(x, y, "p2")
    for (x0, y0, dx) in ((9, 6, 1), (19, 9, -1), (14, 11, 1)):
        for k in range(4):
            s.px(x0 + k * dx, y0 + (k // 2), "s0")
    return s


def path() -> Spr:
    rnd = random.Random(6)
    s = Spr(TW, TH)
    s.diamond(0, "p1")
    cells = set(tile_cells())
    # adoquines: grupos de 2x1 claros con junta oscura
    for (x, y) in tile_cells():
        if (x // 3 + y) % 2 == 0 and (x + y) % 3 == 0:
            s.px(x, y, "p0")
        elif rnd.random() < 0.2:
            s.px(x, y, "p2")
    for _ in range(14):
        x, y = rnd.choice(list(cells))
        if (x + 1, y) in cells:
            s.px(x, y, "p3")
            s.px(x + 1, y, "p2")
    return s


def wild() -> Spr:
    """Tierras del baron: hierba alta y oscura con matorral."""
    rnd = random.Random(7)
    s = Spr(TW, TH)
    s.diamond(0, "g1")
    cells = tile_cells()
    for (x, y) in cells:
        if rnd.random() < 0.3:
            s.px(x, y, rnd.choice(["g0", "g2"]))
    for _ in range(4):
        x, y = rnd.choice(cells)
        for dx in range(-2, 3):
            s.px(x + dx, y, "l1")
        s.px(x, y - 1, "l2")
        s.px(x - 1, y - 1, "l1")
        s.px(x + 1, y - 1, "l1")
    return s


def cliff(side: str) -> Spr:
    """Corte de tierra bajo el borde de la isla (lado izquierdo o derecho de la casilla)."""
    rnd = random.Random(8 if side == "l" else 9)
    depth = 11
    s = Spr(TW, TH + depth)
    for x in range(TW):
        if side == "l" and x >= 16:
            continue
        if side == "r" and x < 16:
            continue
        # borde inferior del rombo en esa columna
        edge = 8 + (x // 2) if side == "l" else 8 + ((31 - x) // 2)
        for z in range(depth):
            y = edge + z
            c = "g1" if z == 0 else ("s2" if z < 4 else ("s1" if z < 8 else "s0"))
            if side == "r" and z > 0:
                c = "s1" if z < 4 else ("s0" if z < 8 else "#241a12")
            if z > 1 and rnd.random() < 0.10:
                c = "r1" if side == "l" else "r0"
            if z == 1 and rnd.random() < 0.3:
                c = "g0"
            s.px(x, y, c)
    return s


def boundary() -> Spr:
    s = Spr(8, 12)
    s.rect(2, 3, 5, 11, "r2")
    s.rect(4, 3, 5, 11, "r1")
    s.px(2, 2, "r3")
    s.px(3, 2, "r3")
    s.px(4, 2, "r2")
    s.px(3, 6, "r0")
    s.px(3, 7, "r0")
    return finish(pad(s, 0, 0, 0, 1))


def site() -> Spr:
    """Solar: tierra removida, estacas con cuerda y unos tablones."""
    rnd = random.Random(10)
    s = Spr(TW, 24)
    oy = 8
    for (x, y) in tile_cells(oy):
        if rnd.random() < 0.55:
            s.px(x, y, rnd.choice(["s2", "s3", "g1"]))
    corners = [(16, oy + 2), (29, oy + 8), (16, oy + 14), (3, oy + 8)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        s.line((a[0], a[1] - 3), (b[0], b[1] - 3), "cream0")
    for (x, y) in corners:
        s.rect(x, y - 5, x, y, "w2")
        s.px(x, y - 5, "w4")
    s.rect(11, oy + 9, 18, oy + 10, "w3")
    s.rect(12, oy + 8, 19, oy + 8, "w4")
    s.rect(19, oy + 5, 21, oy + 7, "r2")
    return s


# ================================================================== cultivos (encima de la tierra)

def crop_points(rows=3):
    pts = []
    for i in range(rows):
        for j in range(rows):
            u = (i + 0.5) / rows
            v = (j + 0.5) / rows
            x = 16 + (u - v) * 14
            y = (u + v) * 7 + 1
            pts.append((round(x), round(y)))
    return sorted(pts, key=lambda p: p[1])


def crop(kind: str, stage: int) -> Spr:
    s = Spr(TW, TH + 10)
    oy = 10
    rnd = random.Random(hash((kind, stage)) & 0xFFFF)
    for (x, y) in crop_points():
        y += oy
        if stage == 0:
            s.px(x, y, "s3")
            s.px(x + 1, y, "s0")
            continue
        if kind == "wheat":
            hgt = {1: 2, 2: 5, 3: 7}[stage]
            body = "l3" if stage < 3 else "st2"
            for dx in (-1, 1):
                for z in range(hgt):
                    s.px(x + dx, y - z, body if z < hgt - 1 or stage < 3 else "st4")
            s.px(x, y - 1, "l2" if stage < 3 else "st1")
            if stage == 3:
                s.px(x - 1, y - hgt, "st3")
                s.px(x + 1, y - hgt, "st3")
        elif kind == "barley":
            hgt = {1: 2, 2: 4, 3: 6}[stage]
            body = "l4" if stage < 3 else "st3"
            for dx in (-1, 0, 1):
                for z in range(hgt - (1 if dx == 0 else 0)):
                    s.px(x + dx, y - z, body)
            if stage == 3:
                # espigas caidas hacia un lado, con barbas
                s.px(x - 2, y - hgt + 1, "st4")
                s.px(x + 2, y - hgt + 1, "st4")
                s.px(x, y - hgt, "st4")
                s.px(x - 2, y - hgt, "cream")
                s.px(x + 2, y - hgt, "cream")
        elif kind == "carrot":
            hgt = {1: 2, 2: 3, 3: 4}[stage]
            for dx in (-1, 0, 1):
                for z in range(hgt - abs(dx)):
                    s.px(x + dx, y - 1 - z, "l3" if z % 2 else "l4")
            if stage == 3:
                s.px(x, y, "carrot")
                s.px(x + 1, y, "carrot")
        else:  # cabbage
            r = {1: 1, 2: 2, 3: 3}[stage]
            s.ellipse(x, y - r, r, r * 0.8, "cab0")
            s.ellipse(x - 0.5, y - r - 0.5, max(1, r - 1), max(1, r - 1) * 0.8, "cab" if stage < 3 else "cab1")
            if stage == 3:
                s.px(x, y - r - 1, "cab1")
    return s


def tenant() -> Spr:
    """Parcela de aparcero: cebada madura y una estaca con cinta."""
    s = soil()
    t = Spr(TW, TH + 10)
    t.paste(s, 0, 10)
    t.paste(crop("wheat", 3), 0, 0)
    t.rect(27, 6, 27, 16, "w1")
    t.px(28, 7, "red1")
    t.px(29, 7, "red1")
    t.px(28, 8, "red0")
    return t


# ================================================================== naturaleza

def oak() -> Spr:
    rnd = random.Random(21)
    s = Spr(TW, 44)
    by = 43
    ground_shadow(s, 16, by - 2, 9, 3)
    s.rect(15, by - 14, 17, by - 3, "w2")
    s.rect(17, by - 14, 17, by - 3, "w1")
    s.px(14, by - 3, "w1")
    s.px(18, by - 3, "w1")
    blobs = [(16, 18, 11), (9, 22, 7), (23, 22, 7), (12, 13, 7), (20, 13, 7), (16, 9, 6)]
    for (x, y, r) in blobs:
        s.ellipse(x, y, r, r * 0.85, "l1")
    for (x, y, r) in blobs:
        s.ellipse(x - 1, y - 1, r - 2, (r - 2) * 0.85, "l2")
    for (x, y, r) in blobs[3:]:
        s.ellipse(x - 2, y - 2, r - 4, (r - 4) * 0.85, "l3")
    for _ in range(40):
        x, y = rnd.randint(4, 28), rnd.randint(3, 30)
        if s.get(x, y)[3] and s.get(x, y)[:3] != rgba("w2")[:3]:
            s.px(x, y, rnd.choice(["l4", "l0", "l3"]))
    return finish(s)


def pine() -> Spr:
    rnd = random.Random(22)
    s = Spr(TW, 46)
    by = 45
    ground_shadow(s, 16, by - 2, 8, 3)
    s.rect(15, by - 7, 16, by - 2, "w1")
    layers = [(by - 6, 11), (by - 13, 9), (by - 20, 7), (by - 27, 5), (by - 33, 3)]
    for (y, half) in layers:
        h = half + 3
        s.poly([(16 - half, y), (16, y - h), (16 + half - 1, y)], "pi1")
        s.poly([(16 - half, y), (16, y - h), (15, y)], "pi2")
        s.line((16 - half, y), (16 + half - 1, y), "pi0")
    for _ in range(25):
        x, y = rnd.randint(5, 27), rnd.randint(8, 40)
        if s.get(x, y)[3]:
            s.px(x, y, rnd.choice(["pi3", "pi0"]))
    s.px(16, 9, "pi3")
    return finish(s)


def rocks() -> Spr:
    s = Spr(TW, 22)
    by = 20
    ground_shadow(s, 16, by, 10, 3)
    for (x, y, r, c, c2) in ((11, by - 5, 5, "r2", "r3"), (20, by - 4, 4, "r1", "r2"), (16, by - 7, 4, "r2", "r4")):
        s.ellipse(x, y, r, r * 0.8, c)
        s.ellipse(x - 1, y - 1, r - 2, (r - 2) * 0.8, c2)
    s.px(10, by - 5, "r0")
    s.px(21, by - 3, "r0")
    return finish(s)


def well() -> Spr:
    s = Spr(TW, 28)
    by = 26
    ground_shadow(s, 16, by - 2, 7, 3)
    # brocal de piedra redondo
    s.ellipse(16, by - 6, 6, 3, "r1")
    s.rect(10, by - 9, 22, by - 6, "r2")
    s.ellipse(16, by - 9, 6, 3, "r3")
    s.ellipse(16, by - 9, 4, 1.6, "#141612")
    for x in range(11, 22, 3):
        s.px(x, by - 7, "r0")
    # postes y tejadillo
    s.rect(11, by - 18, 11, by - 9, "w1")
    s.rect(21, by - 18, 21, by - 9, "w1")
    s.poly([(8, by - 17), (16, by - 22), (24, by - 17), (16, by - 14)], "sh1")
    s.poly([(8, by - 17), (16, by - 14), (16, by - 12), (8, by - 15)], "sh0")
    s.line((16, by - 22), (16, by - 14), "sh2")
    s.line((12, by - 14), (20, by - 14), "w2")
    s.rect(15, by - 13, 17, by - 11, "w3")
    return finish(s)


# ================================================================== edificios de la granja

def frame_walls(s: Spr, b, z0, z1, c="w1"):
    """Entramado en una caja rectangular: postes en esquinas y cada ~6 px, solera y viga alta."""
    cx, by = b["cx"], b["by"]
    for side in ("l", "r"):
        a = side_width(b, side)
        x0, x1 = (cx - a, cx - 1) if side == "l" else (cx, cx + a - 1)
        n = max(1, round(a / 6))
        for k in range(n + 1):
            x = round(x0 + (x1 - x0) * k / n)
            s.wall(cx, by, a, side, x, x, z0, z1, c)
        s.wall(cx, by, a, side, x0, x1, z0, z0 + 1, c)
        s.wall(cx, by, a, side, x0, x1, z1 - 1, z1, c)


def shutters(s: Spr, b, side, f, z, w=2, hgt=3):
    """Ventana iluminada con dos postigos abiertos y alfeizar."""
    a, cx, by = side_width(b, side), b["cx"], b["by"]
    x0 = (cx - a + int((a - w) * f)) if side == "l" else (cx + int((a - w) * f))
    s.wall(cx, by, a, side, x0, x0 + w - 1, z, z + hgt, "glow")
    s.wall(cx, by, a, side, x0 - 1, x0 - 1, z, z + hgt, "w2")
    s.wall(cx, by, a, side, x0 + w, x0 + w, z, z + hgt, "w2")
    s.wall(cx, by, a, side, x0 - 1, x0 + w, z - 1, z, "w1")


def smoke(s: Spr, x, y):
    """Penacho de humo sobre una chimenea."""
    for (dx, dy, c) in ((0, 0, "r3"), (1, -1, "r4"), (0, -2, "r3"), (1, -3, "r4"), (2, -4, "r3")):
        s.px(x + dx, y + dy, c, 200)


def house(stage: int) -> Spr:
    """Vivienda de planta alargada, mas grande que el gallinero y con fachada de enlucido.

    1 casa de entramado con paja; 2 mas larga y alta, con chimenea y banco; 3 planta baja de
    piedra, piso de entramado y tejado de tejas."""
    rnd = random.Random(30 + stage)
    s = Spr(TW, 54)
    by = 51
    al, ar, h, rise = {1: (14, 10, 10, 10), 2: (16, 10, 12, 11), 3: (16, 12, 17, 11)}[stage]
    cx = 16 + (al - ar) // 2
    ground_shadow(s, 16, by + 1, 14, 4)
    if stage < 3:
        b = s.box2(cx, by, al, ar, h, "pl2", "pl0")
        frame_walls(s, b, 0, h)
        # diagonales de refuerzo en el hastial
        s.line((cx + 1, by - 1 - 2), (cx + ar - 2, by - ar // 2 - h + 2), "w1")
        door(s, b, "l", 0.62, 3, 6, "w2")
        shutters(s, b, "l", 0.22, 4)
        if stage == 2:
            shutters(s, b, "l", 0.92, 5)
        shutters(s, b, "r", 0.5, h - 5)
        m1, m2 = s.gable_roof(b, rise, "st2", "st1", "pl1", 1, straw_texture, rnd)
        if stage == 2:
            cxh = int(m1[0] + (m2[0] - m1[0]) * 0.3)
            cyh = int(m1[1] + (m2[1] - m1[1]) * 0.3) + 1
            chimney(s, cxh, cyh, 5)
            smoke(s, cxh + 1, cyh - 7)
            # banco junto a la puerta
            s.line((cx - 6, by - 1), (cx - 3, by + 0), "w3")
        else:
            # leña apilada en el hastial
            for k in range(3):
                s.ellipse(cx + ar - 4 - k * 2, by - ar // 2 + 3 + k, 1, 1, "w3")
    else:
        b = s.box2(cx, by, al, ar, h, "r2", "r1")
        stone_low = 7
        for side in ("l", "r"):
            a = side_width(b, side)
            x0, x1 = (cx - a, cx - 1) if side == "l" else (cx, cx + a - 1)
            for row, z in enumerate(range(0, stone_low, 3)):
                off = 0 if row % 2 else 2
                for x in range(x0 + off, x1 + 1, 4):
                    s.wall(cx, by, a, side, x, x, z, min(stone_low, z + 3), "r1" if side == "l" else "r0")
            s.wall(cx, by, a, side, x0, x1, stone_low, h, "pl2" if side == "l" else "pl0")
        frame_walls(s, b, stone_low, h)
        door(s, b, "l", 0.6, 3, 6, "red0")
        shutters(s, b, "l", 0.2, 3)
        shutters(s, b, "l", 0.2, 10)
        shutters(s, b, "l", 0.9, 10)
        shutters(s, b, "r", 0.5, 10)
        m1, m2 = s.gable_roof(b, rise, "sh2", "sh0", "pl1", 1, shingle_texture("sh1", "sh2"), rnd)
        cxh = int(m1[0] + (m2[0] - m1[0]) * 0.3)
        cyh = int(m1[1] + (m2[1] - m1[1]) * 0.3) + 1
        chimney(s, cxh, cyh, 6)
        smoke(s, cxh + 1, cyh - 8)
        banner(s, int(m2[0]), int(m2[1]) + 1, 8)
    return finish(s)


def tent_awning(s: Spr, cx, ey, a, rise, light, dark, n=6, valance=True):
    """Toldo a cuatro aguas visto en isometrico: faldones delanteros a rayas que bajan del vertice
    a los aleros y un faldon festoneado colgando del borde. `light` y `dark` son pares de colores
    (cara iluminada, cara en sombra)."""
    L = (cx - a, ey - a / 2)
    F = (cx, ey)
    R = (cx + a - 1, ey - a / 2)
    B = (cx, ey - a)
    top = (cx, ey - a / 2 - rise)
    s.poly([L, B, top], dark[1])
    s.poly([B, R, top], dark[1])

    def lerp(p, q, f):
        return (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)

    for k in range(n):
        s.poly([lerp(L, F, k / n), lerp(L, F, (k + 1) / n), top], light[k % 2])
        s.poly([lerp(F, R, k / n), lerp(F, R, (k + 1) / n), top], dark[k % 2])
    if valance:
        for k in range(n):
            for (p, q, cols) in ((L, F, light), (F, R, dark)):
                p0, p1 = lerp(p, q, k / n), lerp(p, q, (k + 1) / n)
                mid = lerp(p, q, (k + 0.5) / n)
                s.poly([p0, p1, (p1[0], p1[1] + 2), (mid[0], mid[1] + 3), (p0[0], p0[1] + 2)], cols[k % 2])
    return top


def market() -> Spr:
    """Mercado de la villa: mostrador con generos bajo un toldo a cuatro aguas granate y crema."""
    s = Spr(TW, 44)
    by = 42
    cx = 16
    a = 14
    ground_shadow(s, cx, by, 14, 4)
    post_h = 14
    # poste trasero (detras del mostrador)
    s.rect(cx, by - a - post_h, cx, by - a, "w1")
    # mostrador
    s.box(cx, by - 2, 11, 6, "w3", "w2", "w4")
    for x in range(cx - 10, cx, 3):
        s.wall(cx, by - 2, 11, "l", x, x, 0, 6, "w2")
    # generos sobre el mostrador: cestas de trigo, zanahorias, coles, quesos y una jarra
    goods = ((cx - 6, by - 13, "st3"), (cx - 3, by - 12, "carrot"), (cx, by - 11, "cab"),
             (cx + 3, by - 12, "cream"), (cx + 5, by - 14, "milk"), (cx - 1, by - 15, "st2"))
    for (x, y, c) in goods:
        s.rect(x, y, x + 1, y + 1, c)
        s.px(x, y + 2, "w1")
    # postes delanteros
    for (x, y) in ((cx - a + 1, by - a // 2), (cx, by - 1), (cx + a - 2, by - a // 2)):
        s.rect(x, y - post_h, x, y, "w1")
    top = tent_awning(s, cx, by - 1 - post_h, a, 8, ("red1", "cream"), ("red0", "cream0"))
    banner(s, cx, int(top[1]), 6)
    return finish(s)


def granary(stage: int) -> Spr:
    """Granero de tablas sobre setas de piedra; crece y gana un altillo con portalon."""
    rnd = random.Random(40 + stage)
    s = Spr(TW, 46)
    by = 44
    cx = 16
    ground_shadow(s, cx, by, 12, 4)
    a = {1: 8, 2: 10, 3: 12}[stage]
    h = {1: 9, 2: 11, 3: 14}[stage]
    lift = 3
    # setas de piedra
    for (x, y) in ((cx - a + 1, by - a // 2 - 1), (cx, by - 1), (cx + a - 2, by - a // 2 - 1)):
        s.rect(x, y - lift, x + 1, y, "r2")
    b = s.box(cx, by - lift, a, h, "w3", "w2")
    # tablas verticales
    for side in ("l", "r"):
        rng = range(cx - a, cx, 2) if side == "l" else range(cx + 1, cx + a, 2)
        for x in rng:
            s.wall(cx, by - lift, a, side, x, x, 0, h, "w2" if side == "l" else "w1")
    door(s, b, "r", 0.35, 4, 6, "w1")
    s.wall(cx, by - lift, a, "r", cx + 1, cx + a - 2, 2, 3, "w4")
    if stage == 3:
        window(s, b, "l", 0.5, h - 4, False, 3, 3)
    m1, m2 = s.gable_roof(b, {1: 6, 2: 7, 3: 9}[stage], "sh2" if stage > 1 else "st2", "sh0" if stage > 1 else "st1", "w3", 1,
                          shingle_texture("sh1", "sh2") if stage > 1 else straw_texture, rnd)
    if stage >= 2:
        # sacos junto a la puerta
        s.ellipse(cx + a - 3, by - 3, 2, 2, "cream0")
        s.ellipse(cx + a - 6, by - 2, 2, 2, "cream")
    return finish(s)


def shed_roof(s: Spr, b, rise, top, side, over=1, texture=None):
    """Tejado de una sola agua que sube hacia atras (cobertizos y gallineros)."""
    L, F, R, B = b["L"], b["F"], b["R"], b["B"]
    Lr = (L[0] - over, L[1] - rise / 2)
    Rr = (R[0] + over, R[1] - rise / 2)
    Br = (B[0], B[1] - rise)
    Fo = (F[0], F[1] + over)
    s.poly([L, F, Lr], side)
    s.poly([F, R, Rr], side)
    s.poly([Fo, Rr, Br, Lr], top)
    if texture:
        for k in range(1, 4):
            f = k / 4
            p = (Lr[0] + (Fo[0] - Lr[0]) * f, Lr[1] + (Fo[1] - Lr[1]) * f)
            q = (Br[0] + (Rr[0] - Br[0]) * f, Br[1] + (Rr[1] - Br[1]) * f)
            s.line(p, q, texture)
    return Br


def coop(stage: int) -> Spr:
    """Gallinero: caseta baja de tablas sobre patas, con tejado de una sola agua, trampilla y
    rampa con travesanos. Crece con nidales y un corralito de estacas."""
    s = Spr(TW, 34)
    by = 32
    cx = 16
    ground_shadow(s, cx, by, 11, 3)
    a = {1: 8, 2: 8, 3: 10}[stage]
    h = {1: 5, 2: 6, 3: 6}[stage]
    lift = 4
    for (x, y) in ((cx - a + 1, by - a // 2), (cx, by), (cx + a - 2, by - a // 2)):
        s.rect(x, y - lift, x, y, "w1")
    b = s.box(cx, by - lift, a, h, "w3", "w2")
    for x in range(cx - a + 1, cx, 2):
        s.wall(cx, by - lift, a, "l", x, x, 0, h, "w2")
    for x in range(cx + 1, cx + a, 2):
        s.wall(cx, by - lift, a, "r", x, x, 0, h, "w1")
    # trampilla y rampa con travesanos hasta el suelo
    door(s, b, "r", 0.35, 2, 3, "w0")
    x0, y0 = cx + 3, by - lift - 1
    s.line((x0, y0), (x0 + 5, y0 + 5), "w4")
    s.line((x0 + 1, y0), (x0 + 6, y0 + 5), "w3")
    for k in (1, 3):
        s.px(x0 + k + 1, y0 + k, "w1")
    shed_roof(s, b, 5, "st2" if stage < 3 else "sh2", "w3", 1, "st1" if stage < 3 else "sh1")
    if stage >= 2:
        # nidales con paja asomando en el lateral
        s.wall(cx, by - lift, a, "l", cx - a, cx - a + 3, 1, 4, "w4")
        s.wall(cx, by - lift, a, "l", cx - a + 1, cx - a + 2, 2, 3, "st3")
    if stage == 3:
        # corralito de estacas delante, a la izquierda
        for k in range(0, 12, 3):
            s.rect(1 + k, by - 7 + k // 2, 1 + k, by - 4 + k // 2, "w2")
        s.line((1, by - 6), (10, by - 1), "w3")
    return finish(s)


def pen_shed() -> Spr:
    """Cobertizo abierto del corral: cuatro postes, tejado y heno."""
    s = Spr(TW, 30)
    by = 28
    cx = 16
    b = {"L": (cx - 12, by - 6 - 10), "F": (cx, by - 10), "R": (cx + 11, by - 6 - 10), "B": (cx, by - 12 - 10), "a": 12, "h": 10, "cx": cx, "by": by}
    for (x, y) in ((cx - 11, by - 6), (cx, by), (cx + 10, by - 6), (cx, by - 12)):
        s.rect(x, y - 10, x, y, "w1")
    s.ellipse(cx, by - 5, 7, 3, "st2")
    s.ellipse(cx - 1, by - 6, 5, 2, "st3")
    s.gable_roof(b, 6, "sh2", "sh0", "w2", 1, shingle_texture("sh1", "sh2"), random.Random(5))
    return finish(s)


def stall() -> Spr:
    """Puesto propio: mostrador con genero bajo un toldo a cuatro aguas verde y ocre, con un tonel,
    una caja de fruta y ristras colgando del alero."""
    s = Spr(TW, 36)
    by = 34
    cx = 16
    a = 11
    ground_shadow(s, cx, by, 13, 4)
    post_h = 11
    s.rect(cx, by - a - post_h, cx, by - a, "w1")
    s.box(cx, by - 2, 9, 5, "w3", "w2", "w4")
    for x in range(cx - 8, cx, 3):
        s.wall(cx, by - 2, 9, "l", x, x, 0, 5, "w2")
    for (x, y, c) in ((cx - 5, by - 11, "gold"), (cx - 2, by - 10, "cream"), (cx + 1, by - 11, "carrot"),
                      (cx + 3, by - 12, "cab"), (cx - 1, by - 13, "milk")):
        s.rect(x, y, x + 1, y + 1, c)
    for (x, y) in ((cx - a + 1, by - a // 2), (cx, by - 1), (cx + a - 2, by - a // 2)):
        s.rect(x, y - post_h, x, y, "w1")
    ey = by - 1 - post_h
    tent_awning(s, cx, ey, a, 6, ("l3", "st3"), ("l1", "st1"), 4)
    # ristras de ajos y cebollas colgando del alero
    for x in (cx - 6, cx + 5):
        y0 = ey - abs(x - cx) // 2 + 3
        s.rect(x, y0, x, y0 + 3, "cream0" if x < cx else "st3")
    # tonel a la izquierda y caja de fruta a la derecha, delante
    s.rect(2, by - 10, 6, by - 4, "w3")
    s.rect(2, by - 8, 6, by - 8, "iron")
    s.rect(2, by - 5, 6, by - 5, "iron")
    s.rect(3, by - 10, 5, by - 10, "w4")
    s.box(26, by - 2, 4, 3, "w4", "w3", "carrot")
    return finish(s)


def cart() -> Spr:
    """Carretilla de mano pequena y abierta, de lado (como los aldeanos), cargada de fruta y verdura."""
    s = Spr(16, 12)
    by = 11
    ground_shadow(s, 7, by, 6, 1)
    # varal hacia la derecha
    s.line((11, by - 4), (15, by - 5), "w1")
    # caja de tablas
    s.rect(1, by - 7, 11, by - 3, "w4")
    s.rect(1, by - 5, 11, by - 5, "w3")
    s.rect(1, by - 3, 11, by - 3, "w2")
    s.rect(1, by - 7, 1, by - 3, "w3")
    s.rect(11, by - 7, 11, by - 3, "w3")
    # carga: manzanas, coles y zanahorias asomando
    load = {2: "red2", 3: "red1", 4: "cab", 5: "cab1", 6: "carrot", 7: "red2", 8: "cab", 9: "carrot", 10: "red1"}
    for x, c in load.items():
        s.px(x, by - 8, c)
        if 3 <= x <= 9:
            s.px(x, by - 9, load[x + 1] if x % 2 else c)
    s.px(5, by - 10, "cab1")
    s.px(7, by - 10, "red2")
    # rueda
    s.ellipse(6, by - 2, 2.2, 2.2, "w1")
    s.px(6, by - 2, "w4")
    return finish(pad(s))


def windmill() -> Spr:
    """Molino de torre de piedra con aspas de lona (todo dentro de su casilla)."""
    rnd = random.Random(60)
    s = Spr(TW, 56)
    by = 54
    cx = 16
    ground_shadow(s, cx, by, 10, 3)
    # torre troncoconica
    for y in range(by - 30, by - 1):
        f = (y - (by - 30)) / 29
        half = int(4 + f * 4)
        s.rect(cx - half, y, cx - 1, y, "r3")
        s.rect(cx, y, cx + half - 1, y, "r1")
    for y in range(by - 27, by - 2, 4):
        s.line((cx - 6, y), (cx + 5, y + 1), "r0")
    s.rect(cx - 1, by - 7, cx + 1, by - 2, "w1")
    s.rect(cx - 4, by - 17, cx - 3, by - 15, "glow")
    # caperuza
    s.ellipse(cx, by - 31, 6, 4, "sh1")
    s.ellipse(cx - 1, by - 32, 4, 2, "sh2")
    # aspas
    hub = (cx + 1, by - 31)
    for ang in (40, 130, 220, 310):
        a = math.radians(ang)
        tip = (hub[0] + math.cos(a) * 14, hub[1] + math.sin(a) * 13)
        s.line(hub, tip, "w1")
        n = (-math.sin(a) * 2.5, math.cos(a) * 2.5)
        for k in range(4, 14):
            p0 = (hub[0] + math.cos(a) * k, hub[1] + math.sin(a) * k * 0.93)
            s.line(p0, (p0[0] + n[0], p0[1] + n[1]), "cream0" if k % 3 else "cream")
    s.px(hub[0], hub[1], "iron")
    return finish(s)


def bakery() -> Spr:
    """Horno de pan: obrador de piedra con tejado de paja, gran horno de barro abombado con la boca
    encendida, chimenea con humo, muestra con una hogaza, sacos de harina y lena."""
    rnd = random.Random(61)
    s = Spr(TW, 46)
    by = 43
    al, ar, h = 12, 8, 9
    cx = 14
    ground_shadow(s, 16, by + 1, 14, 4)
    # lena apilada contra la pared del fondo, a la izquierda
    for k in range(3):
        for j in range(3 - k):
            s.ellipse(3 + j * 2 + k, by - 11 - k * 2, 1, 1, "w3")
            s.px(3 + j * 2 + k, by - 11 - k * 2, "w4")
    b = s.box2(cx, by, al, ar, h, "r2", "r1")
    stone_texture(s, cx, by, al, h, rnd, ar=ar)
    door(s, b, "l", 0.62, 3, 6, "w2")
    shutters(s, b, "l", 0.18, 4)
    m1, m2 = s.gable_roof(b, 9, "st2", "st1", "r2", 1, straw_texture, rnd)
    xh, yh = int(m1[0] + (m2[0] - m1[0]) * 0.35), int(m1[1] + (m2[1] - m1[1]) * 0.35) + 1
    chimney(s, xh, yh, 5)
    smoke(s, xh + 1, yh - 7)
    # muestra colgada de un brazo de hierro con una hogaza
    sx, sy = cx - 4, by - h - 1
    s.line((sx, sy), (sx - 4, sy - 2), "iron")
    s.rect(sx - 5, sy - 1, sx - 3, sy + 2, "w3")
    s.rect(sx - 5, sy, sx - 3, sy + 1, "st3")
    # horno de barro delante a la derecha: base de piedra y cupula con la boca encendida
    ox, oy = 25, by - 3
    s.ellipse(ox, oy - 1, 5, 3, "r2")
    s.rect(ox - 5, oy - 4, ox + 5, oy - 1, "r2")
    s.ellipse(ox, oy - 4, 5, 3, "r3")
    s.ellipse(ox, oy - 8, 5, 5, "cl1")
    s.ellipse(ox - 1, oy - 10, 3, 3, "cl2")
    s.px(ox - 2, oy - 11, "pl1")
    s.rect(ox - 1, oy - 7, ox + 2, oy - 4, "w0")
    s.rect(ox, oy - 6, ox + 1, oy - 4, "fire")
    s.px(ox, oy - 5, "glow")
    s.rect(ox + 3, oy - 14, ox + 4, oy - 11, "cl0")
    # sacos de harina y una pala de horno
    s.ellipse(cx + 3, by - 2, 2, 2, "cream")
    s.ellipse(cx + 6, by - 3, 2, 2, "cream0")
    s.line((ox + 5, oy - 2), (ox + 3, oy - 12), "w3")
    return finish(s)


def cheesery() -> Spr:
    """Queseria: casa de entramado con estante de quesos a la sombra."""
    rnd = random.Random(62)
    s = Spr(TW, 42)
    by = 40
    cx = 14
    ground_shadow(s, 16, by, 12, 4)
    b = s.box(cx, by - 1, 10, 10, "pl2", "pl0")
    timber_texture(s, cx, by - 1, 10, 10)
    door(s, b, "r", 0.3, 3, 5, "w1")
    window(s, b, "l", 0.4, 5)
    s.gable_roof(b, 7, "sh2", "sh0", "pl1", 1, shingle_texture("sh1", "sh2"), rnd)
    # estante con ruedas de queso
    s.rect(23, by - 11, 23, by - 2, "w1")
    s.rect(29, by - 13, 29, by - 4, "w1")
    for k, y in enumerate((by - 9, by - 5)):
        s.line((23, y), (29, y - 2), "w2")
        for x in (24, 27):
            s.rect(x, y - 2 - (x - 23) // 3, x + 1, y - 1 - (x - 23) // 3, "gold")
    return finish(s)


def brewery() -> Spr:
    """Cerveceria: nave de piedra y entramado con tejado de tejas, chimenea de la caldera, cubas de
    roble apiladas delante y una muestra con una jarra."""
    rnd = random.Random(63)
    s = Spr(TW, 46)
    by = 43
    al, ar, h = 12, 8, 7
    cx = 14
    ground_shadow(s, 16, by + 1, 14, 4)
    b = s.box2(cx, by, al, ar, h, "r2", "r1")
    stone_texture(s, cx, by, al, h, rnd, ar=ar)
    up = s.box2(cx, by - h, al, ar, 5, "pl2", "pl0")
    frame_walls(s, up, 0, 5)
    door(s, b, "l", 0.6, 3, 5, "w2")
    window(s, up, "l", 0.25, 2, True, 2, 2)
    m1, m2 = s.gable_roof(up, 8, "sh2", "sh0", "pl1", 1, shingle_texture("sh1", "sh2"), rnd)
    xh, yh = int(m1[0] + (m2[0] - m1[0]) * 0.7), int(m1[1] + (m2[1] - m1[1]) * 0.7) + 1
    chimney(s, xh, yh, 6)
    smoke(s, xh + 1, yh - 8)
    # muestra con una jarra de cerveza
    sx, sy = cx - 3, by - h - 2
    s.line((sx, sy), (sx - 4, sy - 2), "iron")
    s.rect(sx - 5, sy - 1, sx - 3, sy + 2, "w3")
    s.rect(sx - 5, sy, sx - 3, sy + 1, "st3")
    s.px(sx - 5, sy - 1, "cream")
    # cubas de roble delante, a la derecha: dos abajo y una encima
    for (x, y) in ((22, by - 2), (27, by - 4), (24, by - 7)):
        s.ellipse(x, y - 2, 2, 3, "w3")
        s.rect(x - 2, y - 3, x + 2, y - 3, "iron1")
        s.rect(x - 2, y - 1, x + 2, y - 1, "iron1")
        s.ellipse(x + 1, y - 2, 1, 2, "w2")
    return finish(s)


def loom() -> Spr:
    """Telar: casa de entramado con tejado de paja y, al lado, un bastidor con el pano tendido
    (rojo arriba, crudo abajo) y un cesto de lana."""
    rnd = random.Random(64)
    s = Spr(TW, 44)
    by = 41
    al, ar, h = 11, 8, 9
    cx = 13
    ground_shadow(s, 16, by + 1, 14, 4)
    b = s.box2(cx, by, al, ar, h, "pl2", "pl0")
    frame_walls(s, b, 0, h)
    door(s, b, "l", 0.65, 3, 5, "w2")
    window(s, b, "l", 0.25, 5, True, 2, 2)
    window(s, b, "r", 0.5, 5, True, 2, 2)
    s.gable_roof(b, 8, "st2", "st0", "pl1", 1, straw_texture, rnd)
    # bastidor (rama de tender): dos postes, travesano y el pano estirado
    p1, p2 = (21, by - 1), (29, by - 5)
    for (x, y) in (p1, p2):
        s.rect(x, y - 12, x, y, "w1")
    s.line((p1[0], p1[1] - 12), (p2[0], p2[1] - 12), "w2")
    for k in range(p2[0] - p1[0] - 1):
        x = p1[0] + 1 + k
        y = p1[1] + (p2[1] - p1[1]) * (k + 1) / (p2[0] - p1[0])
        s.rect(x, y - 11, x, y - 7, "red2" if k % 3 else "red1")
        s.rect(x, y - 6, x, y - 3, "cream" if k % 3 else "cream0")
    # cesto de lana al pie
    s.ellipse(18, by - 1, 2, 1, "w3")
    s.ellipse(18, by - 3, 2, 1, "milk")
    s.px(19, by - 4, "cream")
    return finish(s)


# ================================================================== nobleza

def crenel_wall(s: Spr, a, b, h, c_face, rnd):
    """Muro almenado entre los puntos de suelo a y b (pendiente 2:1)."""
    steps = int(abs(b[0] - a[0]))
    for k in range(steps + 1):
        x = a[0] + (k if b[0] > a[0] else -k)
        y = a[1] + (b[1] - a[1]) * k / max(1, steps)
        s.rect(x, y - h, x, y, c_face)
        if k % 4 < 2:
            s.rect(x, y - h - 2, x, y - h - 1, c_face)
        if rnd.random() < 0.15:
            s.px(x, y - rnd.randint(1, h - 1), "r0")


def manor(stage: int) -> Spr:
    """Casa solariega (2x2): 0 solar con ruinas, 1 casa de piedra, 2 con muralla y capilla, 3 con torre del homenaje."""
    rnd = random.Random(70 + stage)
    W = 64
    s = Spr(W, 80)
    g = Spr(W, 80)
    by = 78
    cx = 32
    if stage == 0:
        for (x, y) in tile_cells(by - 32, cx) + tile_cells(by - 24, cx - 16) + tile_cells(by - 24, cx + 16) + tile_cells(by - 16, cx):
            if rnd.random() < 0.35:
                g.px(x, y, rnd.choice(["s2", "g1", "s3"]))
        # restos de muros
        crenel_wall(s, (cx - 22, by - 13), (cx - 6, by - 21), 4, "r2", rnd)
        crenel_wall(s, (cx + 4, by - 26), (cx + 18, by - 19), 3, "r1", rnd)
        s.rect(cx - 2, by - 14, cx + 3, by - 10, "r2")
        banner(s, cx + 8, by - 8, 18)
        return finish(s, g)
    ground_shadow(g, cx, by, 28, 8)
    if stage >= 2:
        # muralla en las aristas traseras del recinto, con torrecillas
        crenel_wall(s, (cx - 28, by - 16), (cx, by - 31), 7, "r2", rnd)
        crenel_wall(s, (cx, by - 31), (cx + 28, by - 16), 7, "r1", rnd)
        for (x, y) in ((cx - 28, by - 16), (cx, by - 31), (cx + 28, by - 16)):
            s.rect(x - 2, y - 11, x + 2, y, "r2")
            s.rect(x + 1, y - 11, x + 2, y, "r1")
            s.px(x - 2, y - 12, "r3")
            s.px(x + 2, y - 12, "r3")
    if stage >= 3:
        # torre del homenaje detras, a la derecha
        t = s.box(cx + 14, by - 18, 6, 34, "r3", "r1", "r2")
        stone_texture(s, cx + 14, by - 18, 6, 34, rnd, "r3", "r1")
        for k in range(0, 12, 3):
            s.rect(t["L"][0] + k, t["L"][1] - 2 + k // 2 - 1, t["L"][0] + k + 1, t["L"][1] + k // 2 - 1, "r3")
        window(s, t, "l", 0.5, 24, True)
        window(s, t, "r", 0.5, 18, False)
        banner(s, cx + 14, t["B"][1] + 2, 9)
    if stage >= 2:
        # capilla a la izquierda, con espadana
        c = s.box(cx - 17, by - 12, 7, 11, "r3", "r1")
        stone_texture(s, cx - 17, by - 12, 7, 11, rnd, "r3", "r1")
        door(s, c, "r", 0.4, 2, 4, "w1")
        m1, m2 = s.gable_roof(c, 7, "sh2", "sh0", "r2", 1, shingle_texture("sh1", "sh2"), rnd)
        bx, byy = int(m1[0]), int(m1[1])
        s.rect(bx - 1, byy - 5, bx + 1, byy, "r3")
        s.px(bx, byy - 3, "gold")
        s.px(bx, byy - 7, "iron")
        s.px(bx - 1, byy - 6, "iron")
        s.px(bx + 1, byy - 6, "iron")
    # casa principal de piedra, dos plantas, pizarra
    a = 16 if stage < 3 else 18
    h = 16 if stage < 3 else 19
    b = s.box(cx, by - 2, a, h, "r3", "r1")
    stone_texture(s, cx, by - 2, a, h, rnd, "r3", "r1")
    s.wall(cx, by - 2, a, "l", cx - a, cx - 1, 8, 9, "r0")
    s.wall(cx, by - 2, a, "r", cx, cx + a - 1, 8, 9, "r0")
    door(s, b, "r", 0.2, 3, 6, "red0")
    for f in (0.2, 0.55, 0.85):
        window(s, b, "l", f, 11)
    window(s, b, "l", 0.5, 3, False)
    for f in (0.6, 0.85):
        window(s, b, "r", f, 11)
    # escudo sobre la puerta
    dx = cx + int((a - 3) * 0.2) + 1
    dy = by - 2 - (dx - cx) // 2 - 9
    s.rect(dx, dy - 2, dx + 2, dy, "red1")
    s.px(dx + 1, dy - 1, "gold")
    m1, m2 = s.gable_roof(b, 14 if stage < 3 else 16, "sl2", "sl0", "r2", 2, shingle_texture("sl1", "sl2"), rnd)
    chimney(s, int(m2[0]) - 4, int(m2[1]) + 3, 6)
    chimney(s, int(m1[0]) + 2, int(m1[1]) + 3, 5)
    banner(s, int((m1[0] + m2[0]) / 2), int((m1[1] + m2[1]) / 2), 10)
    if stage >= 2:
        # tramos delanteros de la muralla, bajos
        crenel_wall(s, (cx - 30, by - 16), (cx - 18, by - 10), 4, "r2", rnd)
        crenel_wall(s, (cx + 19, by - 10), (cx + 30, by - 16), 4, "r1", rnd)
    return finish(s)


def cottage(s: Spr, cx, by, stone=False, ruined=False, rnd=None, al=6, ar=4, h=4):
    """Casita de aldea: planta alargada, paja (o pizarra si es de piedra). En ruinas, sin tejado."""
    walls = ("r3", "r1") if stone else ("pl2", "pl0")
    if ruined:
        # muros de piedra desmochados, con el hueco oscuro de dentro, escombro y una viga caida
        b = s.box2(cx, by, al, ar, 3, "r2", "r1", "s1")
        s.wall(cx, by, al, "l", cx - al, cx - al + 2, 3, 6, "r2")
        s.wall(cx, by, al, "l", cx - 4, cx - 3, 3, 5, "r2")
        s.wall(cx, by, ar, "r", cx + ar - 2, cx + ar - 1, 3, 5, "r1")
        s.line((cx - al + 2, by - al // 2 - 6), (cx + 2, by - 2), "w1")
        for (dx, dy) in ((-al - 2, -1), (ar, 1), (2, 1)):
            s.ellipse(cx + dx, by + dy - 1, 1, 1, "r3")
        return b
    b = s.box2(cx, by, al, ar, h, *walls)
    if not stone:
        frame_walls(s, b, 0, h)
    door(s, b, "l", 0.7, 2, 3, "w1")
    window(s, b, "l", 0.1, 2, True, 1, 1)
    s.gable_roof(b, 4, "sh2" if stone else "st2", "sh0" if stone else "st1", walls[1], 1,
                 shingle_texture("sh1", "sh2") if stone else straw_texture, rnd or random.Random(1))
    return b


def chapel(s: Spr, cx, by, rnd):
    """Capilla con espadana: nave pequena de piedra y torrecilla con campana."""
    b = s.box2(cx, by, 12, 6, 9, "r3", "r1")
    stone_texture(s, cx, by, 6, 9, rnd)
    door(s, b, "r", 0.3, 2, 5, "w1")
    window(s, b, "l", 0.5, 4, True, 1, 3)
    m1, m2 = s.gable_roof(b, 6, "sh2", "sh0", "r2", 1, shingle_texture("sh1", "sh2"), rnd)
    # espadana sobre el hastial con la campana
    x, y = int(m2[0]) - 1, int(m2[1])
    s.rect(x - 2, y - 7, x + 1, y, "r3")
    s.rect(x - 1, y - 5, x, y - 3, "#141612")
    s.px(x - 1, y - 4, "gold")
    s.px(x, y - 4, "gold")
    s.line((x - 2, y - 8), (x - 1, y - 9), "r2")
    s.line((x, y - 9), (x + 1, y - 8), "r2")
    return b


def block_cells(by, n=2, cx=None):
    """Pixeles del rombo de un bloque de n x n casillas con el vertice inferior en (cx, by)."""
    w, h = 16 * n, 8 * n
    cx = w if cx is None else cx
    out = []
    for y in range(by - 2 * h, by + 1):
        for x in range(cx - w, cx + w):
            if abs(x + 0.5 - cx) / w + abs(y - (by - h)) / h <= 1:
                out.append((x, y))
    return out


def log_pile(s: Spr, x0, y0, rows=(3, 2, 1), length=6, old=False):
    """Pila de troncos finos tumbados hacia el fondo a la derecha, con las testas claras al frente.
    Se pinta de atras adelante y cada tronco lleva su borde oscuro para que se lean sueltos."""
    logs = []
    for k, n in enumerate(rows):
        for j in range(n):
            logs.append((x0 + j * 3 + k * 2, y0 - k * 3))
    # primero la fila de abajo y, en cada fila, de izquierda a derecha: los de arriba se apoyan encima
    for (x, y) in sorted(logs, key=lambda p: (-p[1], p[0])):
        bark, top = ("w1", "w2") if old else ("w2", "w3")
        ex, ey = x + length, y - length // 2
        s.poly([(x, y - 1), (ex, ey - 1), (ex, ey + 1), (x, y + 1)], bark)
        s.line((x, y - 1), (ex, ey - 1), top)
        s.line((x, y + 1), (ex, ey + 1), "w0")
        s.rect(x - 1, y - 1, x + 1, y + 1, "w1")
        s.px(x, y, "w2" if old else "st3")


def resource_site(s: Spr, material: str, by, stage: int, rnd):
    """Lo que da cada aldea, al fondo a la izquierda del bloque y sin nada delante. A escala de las
    casas: ni el monte de la mina ni la cantera pasan de la altura de un tejado."""
    old = stage == 0
    if material == "wood":
        # aserradero medieval: caz de agua con rueda de paletas que mueve la sierra de un cobertizo
        # abierto (tronco sobre el carro de la sierra), con tablones apilados y troncos al lado
        cx0, by0 = 20, by - 14
        # caz: franja de agua que baja hacia el borde izquierdo
        s.poly([(3, by - 15), (6, by - 17), (16, by - 12), (13, by - 10)], "wa0" if old else "wa1")
        if not old:
            s.line((5, by - 15), (14, by - 11), "wa2")
        # cobertizo abierto: cuatro postes, techo de tablas a dos aguas
        b = {"L": (cx0 - 8, by0 - 4 - 8), "F": (cx0, by0 - 8), "R": (cx0 + 5, by0 - 3 - 8), "B": (cx0 - 3, by0 - 7 - 8),
             "a": 8, "al": 8, "ar": 6, "h": 8, "cx": cx0, "by": by0}
        if not old:
            # carro de la sierra con un tronco y el bastidor vertical de la sierra
            s.poly([(cx0 - 7, by0 - 4), (cx0 + 1, by0), (cx0 + 1, by0 - 2), (cx0 - 7, by0 - 6)], "w3")
            s.poly([(cx0 - 6, by0 - 6), (cx0, by0 - 3), (cx0, by0 - 5), (cx0 - 6, by0 - 8)], "w2")
            s.rect(cx0 - 6, by0 - 8, cx0 - 5, by0 - 6, "st3")
            s.rect(cx0 - 3, by0 - 12, cx0 - 3, by0 - 3, "w1")
            s.rect(cx0 - 1, by0 - 11, cx0 - 1, by0 - 2, "w1")
            s.line((cx0 - 3, by0 - 12), (cx0 - 1, by0 - 11), "w1")
            s.line((cx0 - 2, by0 - 11), (cx0 - 2, by0 - 3), "iron1")
        for (x, y) in ((cx0 - 7, by0 - 4), (cx0, by0), (cx0 + 5, by0 - 3)):
            s.rect(x, y - 8, x, y, "w1")
        if old:
            # techo hundido: medio tejado caido
            s.poly([b["L"], b["F"], (cx0 - 2, by0 - 4), (cx0 - 9, by0 - 7)], "w2")
        else:
            s.gable_roof(b, 4, "sh2", "sh0", "w2", 1, shingle_texture("sh1", "sh2"), rnd)
        # rueda de paletas en el costado izquierdo, metida en el caz
        wx, wy = 10, by - 16
        s.ellipse(wx, wy, 3, 5, "w1")
        s.ellipse(wx, wy, 2, 4, "w3" if not old else "w2")
        s.line((wx, wy - 4), (wx, wy + 4), "w1")
        s.line((wx - 2, wy), (wx + 2, wy), "w1")
        s.px(wx, wy, "iron")
        if old:
            s.line((wx - 2, wy - 3), (wx + 2, wy + 3), "w0")
            return
        # tablones apilados delante y troncos por serrar detras
        for k in range(3):
            s.poly([(26, by - 9 - k), (31, by - 11 - k), (31, by - 10 - k), (26, by - 8 - k)], "w4" if k % 2 else "st2")
        s.line((26, by - 8), (31, by - 10), "w1")
    elif material == "stone":
        # pena baja con musgo y, cortada en ella, una cara clara de sillares y su costado en sombra
        s.poly([(6, by - 13), (7, by - 23), (13, by - 29), (22, by - 29), (28, by - 23), (28, by - 13)], "r0")
        s.poly([(9, by - 23), (14, by - 27), (21, by - 27), (17, by - 24)], "r1")
        for x in range(10, 25, 3):
            s.px(x, by - 28 + abs(x - 17) // 3, "l2")
        s.poly([(9, by - 15), (19, by - 10), (19, by - 20), (9, by - 25)], "r3" if old else "r4")
        s.poly([(19, by - 10), (25, by - 13), (25, by - 23), (19, by - 20)], "r2")
        for k, z in enumerate((3, 6, 9)):
            s.line((9, by - 15 - z), (19, by - 10 - z), "r2")
            for x in range(11 + (k % 2) * 2, 19, 4):
                y0 = by - 15 - z + (x - 9) // 2
                s.line((x, y0), (x, y0 + 2), "r2")
        s.line((19, by - 10), (19, by - 20), "r1")
        if old:
            s.line((11, by - 22), (16, by - 14), "r1")
            s.ellipse(22, by - 7, 1, 1, "r2")
            return
        # sillares delante y una cabria pequena con su bloque colgando
        for (x, y) in ((22, by - 6), (25, by - 8)):
            s.box(x, y, 2, 2, "r3", "r2", "r4")
        s.line((26, by - 11), (28, by - 24), "w2")
        s.line((31, by - 12), (28, by - 24), "w2")
        s.line((28, by - 24), (22, by - 27), "w3")
        s.line((22, by - 27), (22, by - 23), "cream0")
        s.rect(21, by - 22, 23, by - 21, "r4")
    else:
        # mina medieval: pozo cuadrado entibado con un torno de madera encima (manivela, soga y cubo),
        # escombrera detras y monton de mineral al lado
        # escombrera, pequena y a la izquierda, para que el torno se recorte contra la hierba
        s.poly([(3, by - 13), (6, by - 19), (11, by - 21), (16, by - 18), (18, by - 13)], "r1")
        s.poly([(6, by - 18), (11, by - 20), (14, by - 18), (10, by - 17)], "r2")
        for (x, y) in ((6, by - 15), (10, by - 17), (14, by - 15)):
            s.px(x, y, "r3")
        s.px(12, by - 19, "cl1")
        # brocal del pozo: cuadro de maderos con el hueco negro
        px_, py_ = 25, by - 11
        s.box(px_, py_, 6, 2, "w3", "w2", "w4")
        s.poly([(px_ - 4, py_ - 4), (px_, py_ - 2), (px_ + 3, py_ - 4), (px_, py_ - 6)], "#141612")
        if old:
            # tapado con tablas y el torno caido
            for k in range(3):
                s.line((px_ - 4 + k * 3, py_ - 4 + k), (px_ + k * 2 - 1, py_ - 6 + k), "w3")
            s.line((px_ - 6, py_ - 1), (px_ + 4, py_ - 9), "w1")
            return
        # torno: dos caballetes, rodillo con manivela, soga y cubo
        for x in (px_ - 6, px_ + 5):
            s.line((x - 2, py_ - 2), (x, py_ - 13), "w2")
            s.line((x + 2, py_ - 2), (x, py_ - 13), "w2")
        s.rect(px_ - 6, py_ - 14, px_ + 5, py_ - 13, "w4")
        s.line((px_ - 6, py_ - 13), (px_ + 5, py_ - 13), "w2")
        s.line((px_ + 6, py_ - 13), (px_ + 8, py_ - 10), "iron1")
        s.px(px_ + 8, py_ - 10, "w4")
        s.line((px_ - 1, py_ - 12), (px_ - 1, py_ - 7), "cream")
        s.rect(px_ - 2, py_ - 7, px_, py_ - 6, "w4")
        # monton de mineral y un cesto junto al pozo
        s.ellipse(16, by - 9, 3, 1, "r0")
        for (x, y) in ((15, by - 10), (17, by - 10), (16, by - 11)):
            s.px(x, y, "cl1")
        s.rect(20, by - 8, 22, by - 6, "st1")
        s.rect(20, by - 8, 22, by - 8, "cl0")


def village_well(s: Spr, x, y):
    """Pozo de piedra con su tejadillo a dos aguas y el cubo colgando."""
    b = s.box(x, y, 4, 4, "r3", "r2", "r2")
    s.wall(x, y, 4, "l", x - 2, x - 2, 0, 4, "r2")
    s.wall(x, y, 4, "r", x + 2, x + 2, 0, 4, "r1")
    s.poly([(x - 2, y - 6), (x, y - 5), (x + 2, y - 6), (x, y - 7)], "#1d2a2e")
    s.rect(x - 4, y - 12, x - 4, y - 4, "w1")
    s.rect(x + 3, y - 13, x + 3, y - 5, "w1")
    s.poly([(x - 6, y - 11), (x - 1, y - 16), (x + 1, y - 15), (x - 4, y - 10)], "sh2")
    s.poly([(x - 1, y - 16), (x + 5, y - 13), (x + 4, y - 11), (x + 1, y - 15)], "sh0")
    s.line((x, y - 12), (x, y - 9), "cream0")
    s.rect(x - 1, y - 9, x + 1, y - 8, "w3")


def kitchen_garden(s: Spr, x, y, rnd):
    """Huerto con hileras de coles y una cerca baja."""
    for r in range(3):
        for k in range(4):
            px, py = x + k * 2 + r * 2, y - k + r
            s.px(px, py, rnd.choice(["cab", "cab1", "l3"]))
    s.line((x - 2, y + 4), (x + 8, y - 1), "w3")


def hamlet(material: str, stage: int) -> Spr:
    """Aldea vasalla en un bloque de 2x2 casillas.

    Al fondo a la izquierda, lo que produce (troncos, cantera o mina); a la derecha y delante, las
    casas. 0 abandonada (casas sin tejado, recurso echado a perder); 1 dos casas; 2 tres casas, pozo
    y huerto; 3 capilla con espadana y estandarte, y la casa de delante de piedra. Cada cosa tiene su
    sitio y se dibuja de atras adelante, asi que nada tapa a otra."""
    rnd = random.Random(80 + stage * 7 + len(material))
    W, H = 64, 66
    s = Spr(W, H)
    g = Spr(W, H)
    by = H - 2
    cx = 32
    # suelo pisado: plaza y sendas entre las casas
    for (x, y) in block_cells(by):
        d = abs(x - 38) / 22 + abs(y - (by - 12)) / 9
        if rnd.random() < (0.55 if stage else 0.25) * max(0.0, 1.2 - d):
            g.px(x, y, rnd.choice(["s2", "s3", "p1"] if stage else ["s2", "g1"]))
    if stage:
        ground_shadow(g, cx + 6, by, 24, 6)
    big = dict(al=10, ar=6, h=6)
    back, right, front = (44, by - 20), (56, by - 11), (36, by - 3)
    items = [("res", 0, by - 16)]
    if stage == 0:
        items += [("ruin", right[0] - 1, right[1]), ("ruin", *front)]
    else:
        items += [("c", *right), ("s" if stage == 3 else "c", *front)]
        if stage >= 2:
            # el huerto va entre las casas; delante del recurso no se pone nada
            items += [("k" if stage == 3 else "c", *back), ("garden", 40, by - 9)]
    top = None
    chimney_at = None
    for (kind, x, y) in sorted(items, key=lambda it: it[2]):
        if kind == "res":
            resource_site(s, material, by, stage, rnd)
        elif kind == "ruin":
            cottage(s, x, y, ruined=True, **big)
        elif kind in ("c", "s"):
            b = cottage(s, x, y, stone=kind == "s", rnd=rnd, **big)
            if kind == "c" and (x, y) == right:
                chimney_at = (b["cx"] - 5, b["by"] - b["h"] - 6)
        elif kind == "k":
            b = chapel(s, x, y, rnd)
            top = (int(b["B"][0]) + 1, int(b["B"][1]) - 4)
        elif kind == "well":
            village_well(s, x, y)
        else:
            kitchen_garden(s, x, y, rnd)
    if stage == 0:
        for (x, y) in ((30, by - 10), (52, by - 4), (22, by - 6), (46, by - 15)):
            s.px(x, y, "l2")
            s.px(x + 1, y - 1, "l3")
            s.px(x - 1, y - 1, "l1")
    if chimney_at and stage >= 2:
        chimney(s, chimney_at[0], chimney_at[1], 4)
        smoke(s, chimney_at[0] + 1, chimney_at[1] - 6)
    if top:
        banner(s, top[0], top[1], 8, flip=True)
    return finish(s, g)


# ================================================================== monumentos (2x2)

def tower(s: Spr, cx, by, a, h, rnd, roof="sl", cap=True):
    """Torre cuadrada de piedra con almenas o chapitel."""
    t = s.box(cx, by, a, h, "r3", "r1", "r2")
    stone_texture(s, cx, by, a, h, rnd, "r3", "r1")
    if cap:
        # chapitel conico de pizarra
        top = t["B"][1] + a // 2
        s.poly([(cx - a - 1, top + a // 4), (cx, top - a - 4), (cx + a, top + a // 4), (cx, top + a // 2 + 1)], f"{roof}1")
        s.poly([(cx, top - a - 4), (cx + a, top + a // 4), (cx, top + a // 2 + 1)], f"{roof}0")
        s.px(cx, top - a - 5, "gold")
    else:
        for k in range(-a, a, 3):
            s.rect(cx + k, t["F"][1] - a // 2 - 2 + abs(k) // 2, cx + k + 1, t["F"][1] - a // 2 + abs(k) // 2, "r3")
    return t


def monument_works(stage: int) -> Spr:
    """Obra de un monumento: 1 cimientos y estacas, 2 muros a medio alzar con andamios."""
    rnd = random.Random(300 + stage)
    s, g = Spr(64, 80), Spr(64, 80)
    by, cx = 78, 32
    for (x, y) in block_cells(by, 2, cx):
        if rnd.random() < 0.5:
            g.px(x, y, rnd.choice(["s1", "s2", "p0", "s3"]))
    ground_shadow(g, cx, by, 26, 7)
    if stage == 1:
        # zanja de cimientos de piedra y estacas con cuerda
        b = s.box(cx, by - 4, 22, 3, "r2", "r1", "s1")
        stone_texture(s, cx, by - 4, 22, 3, rnd, "r2", "r1")
        for (x, y) in ((cx - 24, by - 16), (cx, by - 3), (cx + 24, by - 16), (cx, by - 28)):
            s.rect(x, y - 6, x, y, "w3")
        s.line((cx - 24, by - 21), (cx, by - 8), "cream0")
        s.line((cx, by - 8), (cx + 24, by - 21), "cream0")
        # montones de piedra y madera
        for (x, y) in ((cx - 18, by - 2), (cx + 16, by)):
            s.ellipse(x, y - 2, 4, 2, "r3")
            s.ellipse(x - 1, y - 3, 2, 1, "r4")
        log_pile(s, cx + 6, by - 30, (3, 2), 7)
        return finish(s, g)
    # muros a media altura con andamios de madera
    b = s.box(cx, by - 4, 22, 14, "r3", "r1")
    stone_texture(s, cx, by - 4, 22, 14, rnd, "r3", "r1")
    for k in range(-22, 23, 2):
        if rnd.random() < 0.5:
            s.px(cx + k, b["F"][1] - (22 - abs(k)) // 2 - 1, "r2")
    for x in (cx - 24, cx - 12, cx + 12, cx + 24):
        y = by - 4 - (22 - abs(x - cx)) // 2 + 2
        s.rect(x, y - 24, x, y, "w2")
    for z in (8, 16, 23):
        s.line((cx - 24, by - 15 - z), (cx - 12, by - 9 - z), "w3")
        s.line((cx + 12, by - 9 - z), (cx + 24, by - 15 - z), "w3")
    # grua de madera
    s.rect(cx + 2, by - 50, cx + 3, by - 18, "w1")
    s.line((cx + 3, by - 50), (cx - 12, by - 44), "w2")
    s.rect(cx - 12, by - 44, cx - 12, by - 36, "iron1")
    s.rect(cx - 14, by - 36, cx - 10, by - 34, "r3")
    return finish(s, g)


def battlements(s: Spr, p, q, light, dark):
    """Almenas sobre el borde superior de un muro, de p a q (pendiente 2:1)."""
    steps = int(abs(q[0] - p[0]))
    for k in range(0, steps + 1):
        x = p[0] + (k if q[0] > p[0] else -k)
        y = round(p[1] + (q[1] - p[1]) * k / max(1, steps))
        if k % 4 < 2:
            s.rect(x, y - 3, x, y - 1, light if k % 4 == 0 else dark)


def round_tower(s: Spr, cx, by, a, h, rnd, roof=True):
    """Torre de esquina: caja estrecha de piedra con chapitel de pizarra o almenas."""
    t = s.box(cx, by, a, h, "r3", "r1", "r2")
    stone_texture(s, cx, by, a, h, rnd, "r3", "r1")
    window(s, t, "l", 0.5, h - 6, False, 1, 2)
    if roof:
        top = t["F"][1] - a // 2
        s.poly([(cx - a - 1, top + 1), (cx, top - a - 6), (cx + a, top + 1), (cx, top + a // 2 + 1)], "sl1")
        s.poly([(cx, top - a - 6), (cx + a, top + 1), (cx, top + a // 2 + 1)], "sl0")
        s.px(cx, top - a - 7, "gold")
    else:
        battlements(s, t["L"], t["F"], "r4", "r2")
        battlements(s, t["F"], t["R"], "r2", "r1")
    return t


def castle() -> Spr:
    """Castillo: recinto de muros almenados con patio, cuatro torres y torre del homenaje."""
    rnd = random.Random(310)
    s, g = Spr(64, 96), Spr(64, 96)
    by, cx = 94, 32
    ground_shadow(g, cx, by, 30, 8)
    al = ar = 24
    wb, h = by - 4, 12
    # torre trasera, detras de todo
    round_tower(s, cx, wb - al, 5, h + 10, rnd)
    # muros del recinto con el patio encima
    cur = s.box2(cx, wb, al, ar, h, "r3", "r1")
    stone_texture(s, cx, wb, al, h, rnd, "r3", "r1", ar)
    # patio enlosado, en sombra dentro de los muros
    s.poly([cur["L"], cur["F"], cur["R"], cur["B"]], "r1")
    for _ in range(24):
        x, y = rnd.randint(cx - 14, cx + 14), rnd.randint(cur["B"][1] + 4, cur["F"][1] - 4)
        s.px(x, y, rnd.choice(["r0", "r2"]))
    battlements(s, cur["L"], cur["B"], "r3", "r2")
    battlements(s, cur["B"], cur["R"], "r2", "r1")
    # torre del homenaje en medio del patio
    kb = cur["F"][1] - 10
    keep = s.box(cx, kb, 9, 28, "r3", "r1", "r2")
    stone_texture(s, cx, kb, 9, 28, rnd, "r3", "r1")
    battlements(s, keep["L"], keep["F"], "r4", "r2")
    battlements(s, keep["F"], keep["R"], "r2", "r1")
    window(s, keep, "l", 0.5, 20, True)
    window(s, keep, "r", 0.5, 20, False)
    window(s, keep, "l", 0.5, 11, True)
    banner(s, cx, keep["B"][1] + 4, 12)
    # almenas delanteras y torres laterales
    battlements(s, cur["L"], cur["F"], "r4", "r2")
    battlements(s, cur["F"], cur["R"], "r2", "r1")
    round_tower(s, cx - al, wb - al // 2, 5, h + 10, rnd)
    round_tower(s, cx + ar - 1, wb - ar // 2, 5, h + 10, rnd)
    # puerta con su arco en el muro derecho
    door(s, cur, "r", 0.45, 4, 7, "w1")
    return finish(s, g)


def great_church() -> Spr:
    """Gran iglesia: nave larga de piedra con contrafuertes, roseton y campanario alto."""
    rnd = random.Random(320)
    s, g = Spr(64, 96), Spr(64, 96)
    by, cx = 94, 30
    ground_shadow(g, cx, by, 30, 8)
    al, ar, h = 26, 12, 18
    nave = s.box2(cx, by - 2, al, ar, h, "r3", "r1")
    stone_texture(s, cx, by - 2, al, h, rnd, "r3", "r1", ar)
    # contrafuertes en la pared larga
    for f in (0.0, 0.33, 0.66):
        x = cx - 1 - int(al * f)
        s.wall(cx, by - 2, al, "l", x - 1, x, 0, h - 3, "r4")
    for f in (0.17, 0.5, 0.83):
        window(s, nave, "l", f, 7, True, 2, 7)
    door(s, nave, "r", 0.45, 4, 9, "w1")
    # roseton sobre la puerta
    rx, ry = cx + 5, by - 2 - 3 - 14
    s.ellipse(rx, ry, 2, 2, "glow")
    s.px(rx, ry, "red1")
    s.gable_roof(nave, 12, "sl2", "sl0", "r2", 1, shingle_texture("sl1", "sl2"), rnd)
    # campanario a la derecha
    tb = by - 14
    t = s.box(cx + 20, tb, 6, 40, "r3", "r1", "r2")
    stone_texture(s, cx + 20, tb, 6, 40, rnd, "r3", "r1")
    window(s, t, "l", 0.5, 32, False, 2, 4)
    window(s, t, "r", 0.5, 32, False, 2, 4)
    top = t["B"][1] + 3
    s.poly([(cx + 13, top + 3), (cx + 20, top - 16), (cx + 26, top + 3), (cx + 20, top + 6)], "sl1")
    s.poly([(cx + 20, top - 16), (cx + 26, top + 3), (cx + 20, top + 6)], "sl0")
    s.rect(cx + 20, top - 21, cx + 20, top - 16, "iron")
    s.rect(cx + 18, top - 19, cx + 22, top - 19, "iron")
    return finish(s, g)


def guild_hall() -> Spr:
    """Casa del gremio: tres plantas de entramado sobre soportales de piedra, con el emblema."""
    rnd = random.Random(330)
    s, g = Spr(64, 96), Spr(64, 96)
    by, cx = 94, 32
    ground_shadow(g, cx, by, 28, 8)
    al, ar = 24, 16
    base = s.box2(cx, by - 2, al, ar, 9, "r3", "r1")
    stone_texture(s, cx, by - 2, al, 9, rnd, "r3", "r1", ar)
    # arcos de los soportales
    for f in (0.15, 0.4, 0.65, 0.9):
        x = cx - int(al * f)
        s.wall(cx, by - 2, al, "l", x - 1, x + 1, 0, 6, "#141612")
    for f in (0.3, 0.75):
        x = cx + int(ar * f)
        s.wall(cx, by - 2, ar, "r", x - 1, x + 1, 0, 6, "#141612")
    up = s.box2(cx, by - 11, al, ar, 20, "pl2", "pl0")
    frame_walls(s, up, 0, 20)
    for f in (0.2, 0.5, 0.8):
        window(s, up, "l", f, 6, True)
        window(s, up, "l", f, 14, True)
    window(s, up, "r", 0.5, 6, True)
    window(s, up, "r", 0.5, 14, False)
    m1, m2 = s.gable_roof(up, 14, "sh2", "sh0", "w2", 2, shingle_texture("sh1", "sh2"), rnd)
    # emblema del gremio (martillo) colgado sobre la esquina
    ex, ey = cx + 2, by - 32
    s.rect(ex, ey - 6, ex + 5, ey, "red1")
    s.rect(ex + 2, ey - 5, ex + 3, ey - 1, "gold")
    s.rect(ex + 1, ey - 5, ex + 4, ey - 4, "gold")
    chimney(s, int(m2[0]) - 3, int(m2[1]) + 3, 6)
    banner(s, int((m1[0] + m2[0]) / 2), int((m1[1] + m2[1]) / 2), 10)
    return finish(s, g)


def exchange() -> Spr:
    """Lonja: gran sala gotica de piedra clara con ventanales, pinaculos, tejado alto y torre."""
    rnd = random.Random(340)
    s, g = Spr(64, 96), Spr(64, 96)
    by, cx = 94, 34
    ground_shadow(g, cx - 2, by, 30, 8)
    # torre de la lonja detras, a la izquierda
    tb = by - 22
    t = s.box(cx - 14, tb, 5, 36, "r4", "r2", "r3")
    stone_texture(s, cx - 14, tb, 5, 36, rnd, "r4", "r2")
    battlements(s, t["L"], t["F"], "r4", "r3")
    battlements(s, t["F"], t["R"], "r3", "r2")
    s.ellipse(cx - 16, tb - 28, 1, 1, "cream")
    banner(s, cx - 14, t["B"][1] + 3, 10)
    al, ar, h = 26, 14, 20
    hall = s.box2(cx, by - 2, al, ar, h, "r4", "r2")
    stone_texture(s, cx, by - 2, al, h, rnd, "r4", "r2", ar)
    # ventanales apuntados
    for f in (0.14, 0.38, 0.62, 0.86):
        x = cx - int(al * f)
        s.wall(cx, by - 2, al, "l", x - 1, x + 1, 3, 13, "#141612")
        s.wall(cx, by - 2, al, "l", x, x, 13, 15, "#141612")
        s.wall(cx, by - 2, al, "l", x, x, 7, 8, "r4")
    for f in (0.3, 0.75):
        x = cx + int(ar * f)
        s.wall(cx, by - 2, ar, "r", x - 1, x + 1, 0, 11, "#141612")
        s.wall(cx, by - 2, ar, "r", x, x, 11, 13, "#141612")
    s.gable_roof(hall, 13, "sl2", "sl0", "r3", 1, shingle_texture("sl1", "sl2"), rnd)
    # pinaculos en las esquinas
    for (x, y) in (hall["L"], hall["F"], hall["R"]):
        s.rect(x - 1, y - 6, x + 1, y + 1, "r4")
        s.rect(x + 1, y - 6, x + 1, y + 1, "r2")
        s.px(x, y - 7, "gold")
    banner(s, hall["F"][0] + 6, hall["F"][1] - 2, 8, True)
    return finish(s, g)


def council() -> Spr:
    """Concejo: casa de reuniones de piedra con tejado de paja, campana y el olmo del pueblo."""
    rnd = random.Random(350)
    s, g = Spr(64, 96), Spr(64, 96)
    by, cx = 94, 32
    ground_shadow(g, cx, by, 28, 8)
    # olmo detras a la izquierda
    s.rect(cx - 19, by - 38, cx - 17, by - 24, "w1")
    s.ellipse(cx - 18, by - 46, 11, 9, "l2")
    s.ellipse(cx - 20, by - 50, 7, 5, "l3")
    s.ellipse(cx - 13, by - 42, 6, 4, "l1")
    al, ar, h = 24, 16, 14
    hall = s.box2(cx, by - 2, al, ar, h, "r3", "r1")
    stone_texture(s, cx, by - 2, al, h, rnd, "r3", "r1", ar)
    for f in (0.2, 0.5, 0.8):
        window(s, hall, "l", f, 6, True, 2, 4)
    door(s, hall, "r", 0.5, 4, 8, "w1")
    m1, m2 = s.gable_roof(hall, 12, "st2", "st1", "w2", 2, straw_texture, rnd)
    # banco de piedra ante la puerta
    s.rect(cx + 2, by - 4, cx + 6, by - 3, "r4")
    # espadana con la campana del concejo
    bx, byy = int(m2[0]) - 2, int(m2[1])
    s.rect(bx - 2, byy - 8, bx + 2, byy, "r3")
    s.rect(bx - 1, byy - 6, bx + 1, byy - 3, "#141612")
    s.px(bx, byy - 4, "gold")
    banner(s, int(m1[0]) + 2, int(m1[1]) + 2, 9)
    return finish(s, g)


# ================================================================== invierno

def recolor(src: Spr, mapping, rnd) -> Spr:
    """Copia de un sprite cambiando cada color por uno de los dados con su peso (None = se queda)."""
    out = Spr(src.w, src.h)
    out.im = src.im.copy()
    lookup = {rgba(k)[:3]: v for k, v in mapping.items() if k != "*"}
    default = mapping.get("*")
    for y in range(src.h):
        for x in range(src.w):
            c = src.im.getpixel((x, y))
            if c[3] == 0:
                continue
            opts = lookup.get(c[:3], default)
            if not opts:
                continue
            r, acc = rnd.random(), 0.0
            for (target, w) in opts:
                acc += w
                if r <= acc:
                    if target:
                        out.im.putpixel((x, y), rgba(target, c[3]))
                    break
    return out


SNOW_GROUND = {
    # pocas briznas asomando: la nieve tiene que leerse como una capa uniforme
    "grass": {"g0": [("sn1", 1)], "g1": [("sn2", 0.7), ("sn1", 0.3)], "g3": [("sn3", 0.8), ("sn2", 0.2)],
              "g4": [(None, 0.35), ("sn3", 0.65)], "*": [("sn2", 0.95), ("sn3", 0.05)]},
    "soil": {"s1": [("sn0", 0.6), (None, 0.4)], "s3": [("sn3", 1)], "*": [("sn2", 0.92), ("sn1", 0.08)]},
    "path": {"p0": [("sn0", 0.5), (None, 0.5)], "p1": [("sn1", 1)], "*": [("sn1", 0.5), ("sn2", 0.4), (None, 0.1)]},
    "wild": {"l1": [(None, 0.5), ("sn1", 0.5)], "l2": [("sn3", 1)], "g0": [("sn1", 1)], "*": [("sn2", 0.92), ("sn1", 0.08)]},
}


def snow_ground(name: str, spr: Spr, seed: int) -> Spr:
    """Version nevada de un suelo: nieve con matices y lo de debajo asomando a ratos."""
    return recolor(spr, SNOW_GROUND[name.split("_")[0]], random.Random(seed))


def snow_tree(spr: Spr, seed: int) -> Spr:
    """Copia de un arbol con nieve sobre las copas: en cada pixel de hoja que da al cielo."""
    rnd = random.Random(seed)
    out = Spr(spr.w, spr.h)
    out.im = spr.im.copy()
    out_c = rgba("out")[:3]
    leaves = {rgba(k)[:3] for k in ("l1", "l2", "l3", "l4", "pi1", "pi2", "pi3")}
    edge = {out_c, rgba("l0")[:3], rgba("pi0")[:3]}
    for y in range(1, spr.h):
        for x in range(spr.w):
            c = spr.im.getpixel((x, y))
            if c[3] == 0 or c[:3] not in leaves:
                continue
            above = spr.im.getpixel((x, y - 1))
            # cielo encima, o el borde oscuro de la copa o del piso de pino de encima
            if above[3] == 0 or above[:3] in edge:
                out.im.putpixel((x, y), rgba("sn3"))
                for dy, p in ((1, 0.85), (2, 0.35)):
                    if y + dy < spr.h and spr.im.getpixel((x, y + dy))[:3] in leaves and rnd.random() < p:
                        out.im.putpixel((x, y + dy), rgba("sn2" if dy == 1 else "sn1"))
    return out


# ================================================================== personas y animales

def villager(job: str) -> Spr:
    cloth = {"farmer": ("w3", "w2"), "herder": ("l2", "l1"), "carter": ("red0", "#431812"), "artisan": ("r1", "r0"), "soldier": ("red1", "red0"), "bandit": ("pi2", "pi1")}[job]
    s = Spr(9, 14)
    # piernas
    s.px(3, 13, "w0")
    s.px(5, 13, "w0")
    s.px(3, 12, "w1")
    s.px(5, 12, "w1")
    # cuerpo
    s.rect(2, 6, 6, 11, cloth[0])
    s.rect(5, 6, 6, 11, cloth[1])
    s.rect(2, 9, 6, 9, cloth[1])
    # cabeza
    s.rect(3, 3, 5, 5, "skin")
    s.px(5, 5, "skin0")
    if job == "farmer":
        s.rect(1, 2, 7, 2, "st2")
        s.rect(3, 1, 5, 1, "st3")
        s.rect(8, 3, 8, 11, "w2")
    elif job == "herder":
        s.rect(2, 2, 6, 3, cloth[1])
        s.rect(0, 2, 0, 12, "w3")
        s.px(1, 1, "w3")
    elif job == "carter":
        s.rect(3, 2, 5, 2, "w1")
        s.rect(0, 7, 1, 10, "st1")
    elif job == "artisan":
        s.rect(3, 7, 5, 11, "cream0")
        s.rect(3, 2, 5, 2, "red1")
    elif job == "bandit":
        # capucha calada (la cara en sombra), panuelo y garrote
        s.rect(2, 2, 6, 5, cloth[1])
        s.rect(3, 4, 5, 5, "skin0")
        s.rect(3, 5, 5, 5, "out")
        s.px(4, 1, cloth[1])
        s.rect(8, 6, 8, 11, "w2")
        s.rect(7, 5, 8, 6, "w3")
    else:  # soldado
        s.rect(2, 2, 6, 3, "iron1")
        s.rect(1, 3, 7, 3, "iron1")
        s.px(4, 8, "gold")
        s.rect(8, 0, 8, 13, "w2")
        s.px(8, 0, "r4")
        s.rect(0, 7, 1, 10, "w3")
    # herramientas y pies llegan al borde del dibujo: un pixel mas alrededor para el contorno
    return finish(pad(s))


def cow() -> Spr:
    s = Spr(20, 14)
    s.rect(4, 4, 15, 9, "cow")
    s.rect(4, 8, 15, 9, "cow0")
    s.rect(8, 5, 11, 7, "cowl")
    s.px(13, 5, "cowl")
    for x in (5, 7, 12, 14):
        s.rect(x, 10, x, 12, "cow0")
    s.rect(15, 2, 18, 6, "cow")
    s.rect(17, 5, 18, 6, "skin")
    s.px(16, 3, "out")
    s.px(15, 1, "cream")
    s.px(18, 1, "cream")
    s.px(3, 5, "cow0")
    s.px(2, 6, "cow0")
    return finish(s)


def sheep() -> Spr:
    s = Spr(16, 12)
    # vellon con borde ondulado, sombra abajo
    s.ellipse(7, 6, 6, 3.5, "milk")
    for x in (3, 6, 9):
        s.ellipse(x, 3.5, 1.5, 1.2, "milk")
    s.rect(2, 8, 12, 8, "cream0")
    s.px(5, 5, "cream")
    s.px(8, 4, "cream")
    s.px(10, 6, "cream")
    # cabeza y patas oscuras
    s.rect(12, 3, 14, 6, "w1")
    s.px(15, 5, "w1")
    s.px(13, 4, "out")
    s.px(12, 2, "w2")
    for x in (4, 6, 9, 11):
        s.rect(x, 9, x, 11, "w1")
    return finish(pad(s))


def chicken() -> Spr:
    s = Spr(8, 8)
    s.rect(1, 3, 5, 6, "hen")
    s.rect(1, 5, 5, 6, "hen0")
    s.rect(5, 1, 6, 3, "hen")
    s.px(5, 0, "comb")
    s.px(7, 2, "beak")
    s.px(6, 2, "out")
    s.px(0, 3, "hen0")
    s.px(3, 7, "beak")
    return finish(pad(s))


# ================================================================== interfaz (mismo estilo que el mapa)
#
# Marcos para border-image (se amplian x3 en CSS), iconos de 12x12 (x2) y sellos. Todo con la
# paleta del mapa y contorno oscuro, para que barras y ventanas casen con el pixel art.

OUT_UI = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "ui")


def ring(s: Spr, k: int, c):
    """Anillo rectangular a k pixeles del borde."""
    s.rect(k, k, s.w - 1 - k, k, c)
    s.rect(k, s.h - 1 - k, s.w - 1 - k, s.h - 1 - k, c)
    s.rect(k, k, k, s.h - 1 - k, c)
    s.rect(s.w - 1 - k, k, s.w - 1 - k, s.h - 1 - k, c)


def frame_wood() -> Spr:
    """Madera oscura con filete de oro y remaches (barras de la interfaz). Corte: 4 px."""
    s = Spr(12, 12)
    s.rect(0, 0, 11, 11, "w1")
    for y in (5, 8):
        s.rect(4, y, 7, y, "w0")
    s.rect(4, 6, 7, 6, "w2")
    ring(s, 0, "out")
    ring(s, 1, "#8d6c2c")
    ring(s, 2, "w0")
    for (x, y) in ((1, 1), (10, 1), (1, 10), (10, 10)):
        s.px(x, y, "gold")
    return s


def frame_parch() -> Spr:
    """Pergamino con marco de madera, filete de oro y tachuelas (ventanas). Corte: 6 px."""
    rnd = random.Random(90)
    s = Spr(18, 18)
    s.rect(0, 0, 17, 17, "cream")
    # trama muy suave: el centro se repite a tamano de pixel por toda la ventana
    for _ in range(4):
        s.px(rnd.randint(6, 11), rnd.randint(6, 11), "#c9b991")
    ring(s, 0, "out")
    ring(s, 1, "w2")
    ring(s, 2, "w1")
    ring(s, 3, "#8d6c2c")
    ring(s, 4, "out")
    ring(s, 5, "#b9a77f")
    for (x, y) in ((1, 1), (15, 1), (1, 15), (15, 15)):
        s.rect(x, y, x + 1, y + 1, "gold")
        s.px(x, y, "glow")
    return s


def bevel_button(face, light, dark, rimc) -> Spr:
    """Boton con relieve: luz arriba a la izquierda y sombra abajo a la derecha. Corte: 4 px."""
    s = Spr(12, 12)
    s.rect(0, 0, 11, 11, face)
    ring(s, 0, "out")
    ring(s, 1, rimc)
    s.rect(2, 2, 9, 2, light)
    s.rect(2, 2, 2, 9, light)
    s.rect(2, 9, 9, 9, dark)
    s.rect(9, 2, 9, 9, dark)
    return s


def frame_inset(face="#14110d", rimc="#5a4228") -> Spr:
    """Hueco oscuro hundido (fichas de recursos, barras de progreso). Corte: 3 px."""
    s = Spr(8, 8)
    s.rect(0, 0, 7, 7, face)
    ring(s, 0, rimc)
    s.rect(1, 1, 6, 1, "#000000")
    s.rect(1, 1, 1, 6, "#000000")
    return s


def frame_bar() -> Spr:
    """Tira del pergamino para separar secciones (cabeceras). Corte: 2 px."""
    s = Spr(6, 6)
    s.rect(0, 0, 5, 5, "#b9a77f")
    s.rect(0, 2, 5, 3, "#8d6c2c")
    return s


def seal(big=False) -> Spr:
    """Sello de lacre con borde irregular (cabecera de ventanas y tarjetas)."""
    n = 22
    s = Spr(n, n)
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            ang = math.atan2(y - c, x - c)
            r = 9.6 + 0.9 * math.sin(ang * 7)
            d = math.hypot(x - c, y - c)
            if d <= r:
                s.px(x, y, "red1" if d < 7 else "red0")
    s.ellipse(c, c, 6, 6, "red1")
    s.ellipse(c - 1, c - 1, 4, 4, "red2")
    ring_pts = [(round(c + 7.2 * math.cos(a / 20 * 2 * math.pi)), round(c + 7.2 * math.sin(a / 20 * 2 * math.pi))) for a in range(20)]
    for (x, y) in ring_pts:
        s.px(x, y, "red0")
    return finish(s)


def level_shield() -> Spr:
    """Escudo del nivel: madera con filete de oro (el numero lo pone la interfaz encima)."""
    s = Spr(18, 21)
    for y in range(21):
        if y < 13:
            x0, x1 = 1, 16
        else:
            k = y - 12
            x0, x1 = 1 + k, 16 - k
        if x0 <= x1:
            s.rect(x0, y, x1, y, "#8d6c2c")
            if 1 <= y <= 19 and x1 - x0 >= 2:
                s.rect(x0 + 1, y, x1 - 1, y, "w1")
    s.rect(2, 1, 15, 1, "gold")
    s.rect(3, 2, 14, 2, "w2")
    return finish(s)


def thumb() -> Spr:
    """Tirador de las barras deslizantes."""
    s = Spr(8, 12)
    s.rect(1, 1, 6, 10, "#8d6c2c")
    s.rect(2, 2, 5, 9, "gold")
    s.rect(2, 2, 5, 2, "glow")
    s.rect(3, 4, 4, 7, "#8d6c2c")
    return finish(s)


# ------------------------------------------------------------------ iconos 12x12

# Iconos de silueta simetrica (se corrige lo que el redondeo de elipses y poligonos tuerce).
SYMMETRIC = {"icon_coin", "icon_egg", "icon_bread", "icon_cabbage", "icon_crown", "icon_fence", "icon_scarecrow",
             "icon_iron", "icon_prestige", "icon_up", "icon_down", "icon_stone", "icon_house", "icon_granary",
             "icon_worker", "icon_flour", "icon_wheat", "icon_manor", "icon_milk", "icon_carrot", "icon_wood"}


def icon(draw, name="") -> Spr:
    """Icono de 12x12. Lo pintado no puede tocar el borde: el contorno necesita ese pixel."""
    s = Spr(12, 12)
    draw(s)
    if name in SYMMETRIC:
        make_symmetric(s)
    bad = touching_border(s)
    if bad:
        raise ValueError(f"{name}: el dibujo toca el borde en {bad[:5]} y se veria cortado")
    return finish(s)


def _coin(s):
    s.ellipse(5.5, 5.5, 4.5, 4.5, "gold")
    s.ellipse(5.5, 5.5, 3, 3, "#8d6c2c")
    s.ellipse(5.5, 5.5, 2, 2, "gold")
    s.px(3, 2, "glow")
    s.px(2, 3, "glow")


def _wheat(s):
    for x, top in ((3, 2), (6, 1), (9, 2)):
        s.rect(x, top + 4, x, 10, "st1")
        for k in range(3):
            s.px(x - 1, top + k * 1 + 1, "st3")
            s.px(x + 1, top + k * 1 + 1, "st3")
        s.px(x, top, "st4")


def _carrot(s):
    s.poly([(2, 4), (9, 4), (5.5, 10)], "carrot")
    s.px(3, 5, "st4")
    s.px(5, 7, "#8e4a1f")
    s.px(7, 5, "#8e4a1f")
    s.rect(4, 1, 4, 3, "l3")
    s.rect(7, 1, 7, 3, "l3")
    s.rect(5, 2, 6, 3, "l4")


def _cabbage(s):
    # col con hojas abiertas y nervios claros
    s.ellipse(5.5, 6, 4.5, 4, "cab0")
    s.ellipse(5.5, 5.5, 3.5, 3, "cab")
    s.ellipse(5, 4.5, 1.8, 1.5, "cab1")
    s.line((5, 6), (3, 9), "cab1")
    s.line((6, 6), (8, 9), "cab1")


def _egg(s):
    s.ellipse(5.5, 6, 3.5, 4.5, "cream")
    s.rect(3, 3, 3, 4, "#f2e8d0")
    s.px(7, 8, "cream0")


def _milk(s):
    # cubo de madera lleno de leche, con aros y asa
    s.poly([(2, 4), (9, 4), (8, 10), (3, 10)], "w3")
    s.poly([(7, 4), (9, 4), (8, 10), (7, 10)], "w2")
    s.rect(2, 5, 9, 5, "iron1")
    s.rect(3, 9, 8, 9, "iron1")
    s.ellipse(5.5, 3.6, 3.6, 1.1, "milk")
    s.line((1, 4), (3, 1), "iron1")
    s.line((3, 1), (8, 1), "iron1")
    s.line((8, 1), (10, 4), "iron1")


def _flour(s):
    # saco atado arriba, con una espiga pintada
    s.poly([(2, 5), (9, 5), (10, 10), (1, 10)], "cream")
    s.poly([(3, 3), (8, 3), (9, 5), (2, 5)], "cream0")
    s.rect(4, 2, 7, 2, "w2")
    s.px(4, 1, "cream0")
    s.px(7, 1, "cream0")
    s.rect(5, 6, 5, 9, "st1")
    s.px(4, 7, "st1")
    s.px(6, 7, "st1")
    s.px(4, 6, "st1")
    s.px(6, 6, "st1")
    s.rect(8, 6, 9, 10, "cream0")


def _bread(s):
    s.ellipse(5.5, 7, 4.5, 3, "st1")
    s.ellipse(5.5, 6, 3.5, 2.2, "st2")
    for x in (3, 5, 7):
        s.px(x + 1, 5, "w2")
        s.px(x, 6, "w2")


def _barley(s):
    # cebada: una espiga gruesa que cabecea hacia un lado, con barbas (el trigo va derecho)
    for x, y in ((3, 10), (3, 9), (3, 8), (4, 7), (4, 6), (4, 5), (5, 4)):
        s.px(x, y, "l3")
    s.px(2, 7, "l4")
    s.px(1, 6, "l4")
    for t in range(5):
        s.px(5 + t, 2 + t, "st3")
        s.px(min(10, 6 + t), 2 + t, "st4")
        s.px(5 + t, 3 + t, "st1" if t < 4 else "st3")
    for t in range(4):
        s.px(7 + t, 1 + t, "st1")


def _beer(s):
    # jarra de madera con espuma
    s.rect(2, 4, 8, 10, "w3")
    s.rect(2, 4, 3, 10, "w4")
    s.rect(2, 6, 8, 6, "iron1")
    s.rect(2, 9, 8, 9, "iron1")
    s.rect(9, 5, 10, 8, "w2")
    s.rect(2, 2, 8, 3, "cream")
    s.px(4, 1, "cream")
    s.px(7, 1, "cream")


def _wool(s):
    # ovillo de lana: vueltas de hebra marcadas y el cabo suelto
    s.ellipse(5, 5, 4, 4, "cream")
    s.line((2, 3), (7, 8), "pl0")
    s.line((3, 2), (8, 7), "cream0")
    s.line((1, 5), (4, 8), "pl0")
    s.line((5, 1), (8, 4), "pl0")
    s.px(3, 4, "milk")
    s.px(4, 3, "milk")
    s.line((8, 8), (10, 10), "pl0")


def _cloth(s):
    # pieza de pano doblada, roja, con el canto claro
    s.rect(1, 5, 10, 10, "red1")
    s.rect(1, 5, 10, 6, "red2")
    s.rect(2, 2, 10, 4, "red2")
    s.rect(2, 2, 10, 2, "cream")
    s.rect(1, 8, 10, 8, "red0")


def _cheese(s):
    # cuna de queso vista de lado: el corte en triangulo con agujeros, el filo de arriba claro y la
    # corteza a la derecha
    pattern(s, [
        "..........",
        ".......gR.",
        "......gYRR",
        ".....gYYRR",
        "....gYDYRR",
        "...gYYYYRR",
        "..gYYYYDRR",
        ".gYDYYYYRR",
        "gYYYYDYYRR",
        "YYYYYYYYRR",
    ], {"g": "glow", "Y": "gold", "D": "#8d6c2c", "R": "#a8853a"}, 1, 1)


def _wood(s):
    # pila de troncos vistos por la punta: dos abajo y uno encima, corteza oscura y madera clara
    pattern(s, [
        "...aa...",
        "..abba..",
        "..abba..",
        ".aaaaaa.",
        "abbaabba",
        "abbaabba",
        ".aa..aa.",
        "dddddddd",
    ], {"a": "w2", "b": "st3", "d": "w1"}, 2, 2)


def _stone(s):
    s.rect(1, 6, 5, 10, "r2")
    s.rect(6, 6, 10, 10, "r3")
    s.rect(3, 2, 8, 5, "r3")
    s.rect(3, 2, 8, 2, "r4")
    s.rect(1, 6, 5, 6, "r3")


def _iron(s):
    s.poly([(1, 9), (3, 5), (8, 5), (10, 9)], "iron1")
    s.rect(3, 5, 8, 5, "#7c7a72")
    s.rect(1, 9, 10, 10, "iron")


def _worker(s):
    s.rect(4, 2, 7, 4, "skin")
    s.rect(3, 1, 8, 1, "st2")
    s.rect(2, 5, 9, 10, "w3")
    s.rect(7, 5, 9, 10, "w2")


def _banner(s):
    s.rect(2, 1, 2, 10, "w2")
    s.poly([(3, 1), (10, 1), (8, 4), (10, 7), (3, 7)], "red1")
    s.rect(4, 3, 7, 3, "gold")


def _hammer(s):
    s.line((2, 10), (6, 6), "w3")
    s.line((3, 10), (7, 6), "w2")
    s.poly([(4, 4), (7, 1), (10, 4), (7, 7)], "iron1")


def _granary(s):
    s.rect(2, 5, 9, 10, "w3")
    s.rect(6, 5, 9, 10, "w2")
    s.poly([(1, 5), (5, 1), (6, 1), (10, 5)], "sh2")
    s.rect(5, 7, 6, 10, "w1")


def _house(s):
    s.rect(2, 5, 9, 10, "pl2")
    s.rect(6, 5, 9, 10, "pl0")
    s.poly([(1, 5), (5, 1), (6, 1), (10, 5)], "st2")
    s.rect(4, 7, 5, 10, "w1")
    s.px(8, 7, "glow")


def _scroll(s):
    s.rect(2, 2, 9, 9, "cream")
    s.rect(1, 1, 10, 1, "cream0")
    s.rect(1, 10, 10, 10, "cream0")
    for y in (4, 6):
        s.rect(3, y, 8, y, "w2")
    s.px(7, 8, "red1")


def _crown(s):
    s.poly([(1, 9), (1, 3), (3, 6), (5.5, 2), (8, 6), (10, 3), (10, 9)], "gold")
    s.rect(1, 9, 10, 10, "#8d6c2c")
    s.px(5, 7, "red1")
    s.px(3, 8, "#3b5a7a")
    s.px(8, 8, "#3b5a7a")


def _cart(s):
    # carretilla de lado: caja abierta con fruta y verdura, una rueda y el varal
    s.rect(1, 4, 8, 7, "w3")
    s.rect(1, 4, 8, 4, "w4")
    s.rect(1, 7, 8, 7, "w2")
    for (x, y, c) in ((1, 3, "red2"), (2, 2, "red2"), (2, 3, "red1"), (3, 3, "cab"), (4, 2, "cab1"), (4, 3, "cab"),
                      (5, 2, "carrot"), (5, 3, "carrot"), (6, 3, "red2"), (7, 2, "cab1"), (7, 3, "cab"), (8, 3, "red1")):
        s.px(x, y, c)
    s.ellipse(4.5, 8.5, 1.8, 1.8, "w1")
    s.px(4, 8, "w4")
    s.line((8, 6), (10, 5), "w1")


def _charter(s):
    _scroll(s)
    s.ellipse(7, 8, 2, 2, "red1")
    s.px(7, 8, "gold")


def _prestige(s):
    s.poly([(1, 1), (10, 1), (10, 6), (5.5, 10), (1, 6)], "red1")
    s.line((2, 2), (9, 8), "gold")
    s.px(5, 4, "glow")


def _soldier(s):
    s.ellipse(5.5, 6, 4.5, 1.5, "iron1")
    s.ellipse(5.5, 4, 3.5, 3, "iron1")
    s.rect(5, 1, 6, 6, "#7c7a72")
    s.line((9, 1), (2, 10), "w2")


def _manor(s):
    s.rect(3, 4, 8, 10, "r3")
    s.rect(6, 4, 8, 10, "r1")
    for x in (3, 5, 6, 8):
        s.px(x, 3, "r3" if x < 6 else "r1")
    s.rect(5, 7, 6, 10, "w0")
    s.rect(5, 1, 5, 2, "w1")
    s.rect(6, 1, 7, 1, "red1")


def _check(s):
    for (x, y) in ((2, 6), (3, 7), (4, 8), (5, 7), (6, 6), (7, 5), (8, 4), (9, 3)):
        s.rect(x, y, x, y + 1, "l4")


def _up(s):
    s.poly([(5.5, 2), (10, 9), (1, 9)], "l4")


def _down(s):
    s.poly([(1, 2), (10, 2), (5.5, 9)], "red2")


def _pause(s):
    s.rect(3, 2, 4, 9, "cream")
    s.rect(7, 2, 8, 9, "cream")


def _play(s):
    s.poly([(3, 1), (9, 5.5), (3, 10)], "cream")


def _menu(s):
    for y in (2, 5, 8):
        s.rect(2, y, 9, y + 1, "cream")


def _scarecrow(s):
    # espantapajaros: sombrero de paja, cabeza de saco, brazos con paja en las manos, camisa y palo
    s.rect(4, 1, 7, 1, "st3")
    s.rect(3, 2, 8, 2, "st2")
    s.rect(4, 3, 7, 4, "cream")
    s.rect(5, 4, 6, 10, "w2")
    s.rect(2, 5, 9, 5, "w3")
    s.rect(3, 5, 8, 8, "red1")
    s.rect(3, 8, 8, 8, "red0")
    s.rect(1, 5, 1, 6, "st3")
    s.rect(10, 5, 10, 6, "st3")


def _fence(s):
    # cerca: tres estacas con dos travesanos
    for x in (1, 5, 9):
        s.rect(x, 2, x + 1, 10, "w4")
        s.rect(x + 1, 2, x + 1, 10, "w3")
        s.rect(x, 1, x + 1, 1, "w3")
    s.rect(1, 4, 10, 4, "w2")
    s.rect(1, 8, 10, 8, "w2")


ICONS = {
    "icon_coin": _coin, "icon_wheat": _wheat, "icon_carrot": _carrot, "icon_cabbage": _cabbage,
    "icon_egg": _egg, "icon_milk": _milk, "icon_flour": _flour, "icon_bread": _bread, "icon_cheese": _cheese,
    "icon_barley": _barley, "icon_beer": _beer, "icon_wool": _wool, "icon_cloth": _cloth,
    "icon_wood": _wood, "icon_stone": _stone, "icon_iron": _iron, "icon_worker": _worker, "icon_banner": _banner,
    "icon_hammer": _hammer, "icon_granary": _granary, "icon_house": _house, "icon_scroll": _scroll,
    "icon_crown": _crown, "icon_cart": _cart, "icon_charter": _charter, "icon_prestige": _prestige,
    "icon_soldier": _soldier, "icon_manor": _manor, "icon_pause": _pause, "icon_play": _play, "icon_menu": _menu,
    "icon_check": _check, "icon_up": _up, "icon_down": _down,
    "icon_scarecrow": _scarecrow, "icon_fence": _fence,
}


def bubble() -> Spr:
    """Placa que flota sobre gallinero y corral con lo que hay para recoger (icono y numero encima)."""
    s = Spr(30, 20)
    s.rect(1, 1, 28, 16, "w1")
    s.rect(2, 2, 27, 15, "w0")
    s.rect(1, 1, 28, 1, "#8d6c2c")
    s.rect(1, 16, 28, 16, "#8d6c2c")
    s.poly([(12, 17), (15, 18), (18, 17)], "#8d6c2c")
    return finish(s)


def generate_ui() -> dict:
    return {
        "frame_wood": frame_wood(), "frame_parch": frame_parch(),
        "btn": bevel_button("#2c2822", "#46403a", "#16130f", "#8d6c2c"),
        "btn_hover": bevel_button("#332e27", "#504940", "#16130f", "gold"),
        "btn_down": bevel_button("#211e19", "#16130f", "#3a352d", "#8d6c2c"),
        "btn_red": bevel_button("red1", "red2", "red0", "#8d6c2c"),
        "btn_red_hover": bevel_button("red1", "#b04a36", "red0", "gold"),
        "btn_red_down": bevel_button("red0", "#3a120c", "red1", "#8d6c2c"),
        "btn_ghost": bevel_button("#c4b48e", "#ddd0ac", "#9a8762", "w2"),
        "inset": frame_inset(), "inset_parch": frame_inset("#bba981", "w2"), "rule": frame_bar(),
        "seal": seal(), "shield": level_shield(), "thumb": thumb(), "bubble": bubble(),
        **{name: icon(fn, name) for name, fn in ICONS.items()},
    }


# ================================================================== salida

def generate() -> dict:
    out = {
        "grass_a": grass(1), "grass_b": grass(2), "grass_c": grass(3),
        "soil": soil(), "soil_tired": soil_tired(), "path": path(), "wild": wild(),
        "cliff_l": cliff("l"), "cliff_r": cliff("r"),
        "boundary": boundary(), "site": site(), "tenant": tenant(),
        **{f"{k}_{i}": crop(k, i) for k in ("wheat", "carrot", "cabbage", "barley") for i in range(4)},
        "tree_a": oak(), "tree_b": pine(), "rocks": rocks(), "well": well(),
        **{f"house_{i}": house(i) for i in (1, 2, 3)},
        "market": market(),
        **{f"granary_{i}": granary(i) for i in (1, 2, 3)},
        **{f"coop_{i}": coop(i) for i in (1, 2, 3)},
        "pen_shed": pen_shed(), "stall": stall(), "cart": cart(),
        "mill": windmill(), "bakery": bakery(), "cheesery": cheesery(), "brewery": brewery(), "loom": loom(),
        **{f"manor_{i}": manor(i) for i in range(4)},
        **{f"hamlet_{m}_{i}": hamlet(m, i) for m in ("wood", "stone", "iron") for i in range(4)},
        "monument_works_1": monument_works(1), "monument_works_2": monument_works(2),
        "monument_castle": castle(), "monument_greatChurch": great_church(), "monument_guildHall": guild_hall(),
        "monument_exchange": exchange(), "monument_council": council(),
        **{f"villager_{j}": villager(j) for j in ("farmer", "herder", "carter", "artisan", "soldier", "bandit")},
        "cow": cow(), "sheep": sheep(), "chicken": chicken(),
    }
    # variantes de invierno de lo que cambia con la estacion: suelos y arboles
    for i, k in enumerate(("grass_a", "grass_b", "grass_c", "soil", "path", "wild")):
        out[f"{k}_snow"] = snow_ground(k, out[k], 90 + i)
    out["tree_a_snow"] = snow_tree(out["tree_a"], 3)
    out["tree_b_snow"] = snow_tree(out["tree_b"], 4)
    # Nada con contorno puede tocar el borde del lienzo: se veria cortado
    cut = {k: v.cut for k, v in out.items() if getattr(v, "cut", None)}
    if cut:
        raise ValueError("Dibujos cortados por el borde: " + "; ".join(f"{k} {v[:4]}" for k, v in cut.items()))
    return out


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    sprites = generate()
    manifest = {}
    for name, spr in sprites.items():
        spr.im.save(os.path.join(OUT, f"{name}.png"))
        manifest[name] = [spr.w, spr.h]
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(dict(sorted(manifest.items())), fh, indent=1)
        fh.write("\n")
    print(f"{len(sprites)} sprites en {os.path.normpath(OUT)}")
    os.makedirs(OUT_UI, exist_ok=True)
    ui = generate_ui()
    for name, spr in ui.items():
        spr.im.save(os.path.join(OUT_UI, f"{name}.png"))
    print(f"{len(ui)} piezas de interfaz en {os.path.normpath(OUT_UI)}")


if __name__ == "__main__":
    main()
