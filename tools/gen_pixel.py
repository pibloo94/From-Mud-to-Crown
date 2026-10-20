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


def stone_texture(s: Spr, cx, by, a, h, rnd, left="r2", right="r1"):
    """Sillares: juntas cortas alternas (no rayas seguidas) y piedras de otro tono."""
    for side in ("l", "r"):
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


def finish(s: Spr, ground: "Spr | None" = None):
    """Contorno del objeto; si hay capa de suelo (tierra, hierba pisada), va debajo y sin contorno."""
    s.outline()
    if ground is not None:
        ground.paste(s, 0, 0)
        return ground
    return s


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
    return finish(s)


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
    """Puesto propio: mostrador pequeno con toldo a cuatro aguas verde y ocre."""
    s = Spr(TW, 36)
    by = 34
    cx = 16
    a = 11
    ground_shadow(s, cx, by, 12, 4)
    post_h = 11
    s.rect(cx, by - a - post_h, cx, by - a, "w1")
    s.box(cx, by - 2, 9, 5, "w3", "w2", "w4")
    for (x, y, c) in ((cx - 4, by - 11, "gold"), (cx, by - 10, "cream"), (cx + 3, by - 11, "carrot")):
        s.rect(x, y, x + 1, y + 1, c)
    for (x, y) in ((cx - a + 1, by - a // 2), (cx, by - 1), (cx + a - 2, by - a // 2)):
        s.rect(x, y - post_h, x, y, "w1")
    tent_awning(s, cx, by - 1 - post_h, a, 6, ("l3", "st3"), ("l1", "st1"), 4)
    return finish(s)


def cart() -> Spr:
    """Carreta de dos ruedas con sacos bajo una lona."""
    s = Spr(TW, 22)
    by = 20
    ground_shadow(s, 15, by, 11, 3)
    s.line((22, by - 6), (31, by - 10), "w1")
    s.line((21, by - 5), (30, by - 9), "w1")
    s.poly([(4, by - 9), (22, by - 4), (22, by - 9), (4, by - 14)], "w3")
    s.poly([(22, by - 4), (25, by - 6), (25, by - 11), (22, by - 9)], "w2")
    s.poly([(4, by - 14), (8, by - 18), (20, by - 17), (25, by - 11), (22, by - 9)], "cream0")
    s.line((8, by - 16), (22, by - 10), "cream")
    s.ellipse(12, by - 4, 4, 4, "w1")
    s.ellipse(12, by - 4, 2, 2, "w3")
    s.px(12, by - 4, "w0")
    return finish(s)


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
    """Horno: casa de piedra con horno abombado al lado y humo."""
    rnd = random.Random(61)
    s = Spr(TW, 42)
    by = 40
    cx = 15
    ground_shadow(s, 16, by, 12, 4)
    b = s.box(cx, by - 1, 10, 10, "r2", "r1")
    stone_texture(s, cx, by - 1, 10, 10, rnd)
    door(s, b, "r", 0.3, 3, 5, "w1")
    window(s, b, "l", 0.5, 5)
    s.gable_roof(b, 7, "st2", "st1", "r2", 1, straw_texture, rnd)
    # horno abombado a la derecha, delante
    s.ellipse(26, by - 6, 5, 4, "r3")
    s.ellipse(25, by - 7, 3, 2, "r4")
    s.ellipse(27, by - 4, 2, 2, "#e07a2a")
    s.px(27, by - 4, "glow")
    # humo
    for k, (x, y) in enumerate(((22, 4), (21, 2), (23, 0))):
        s.px(x, y + 6, "r4")
        s.px(x + 1, y + 6, "r3")
    # panes
    s.rect(4, by - 4, 5, by - 3, "st1")
    s.rect(7, by - 3, 8, by - 2, "st2")
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
        crenel_wall(s, (cx - 30, by - 16), (cx, by - 31), 7, "r2", rnd)
        crenel_wall(s, (cx, by - 31), (cx + 30, by - 16), 7, "r1", rnd)
        for (x, y) in ((cx - 30, by - 16), (cx, by - 31), (cx + 30, by - 16)):
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


def hamlet(material: str, stage: int) -> Spr:
    """Aldea vasalla: 0 abandonada; 1-3 con mas casas. Cada una lleva lo suyo (troncos, piedra, mina)."""
    rnd = random.Random(80 + stage * 7 + len(material))
    s = Spr(TW, 36)
    g = Spr(TW, 36)
    by = 34
    huts = [(12, by - 8), (22, by - 6), (15, by - 1), (26, by - 2)][: {0: 2, 1: 2, 2: 3, 3: 4}[stage]]
    for (x, y) in tile_cells(by - 16):
        if rnd.random() < 0.3:
            g.px(x, y, rnd.choice(["s2", "s3"]))
    # lo propio de cada aldea, al fondo
    if stage > 0:
        if material == "wood":
            for k in range(3):
                s.rect(3, by - 10 - k * 2, 8, by - 9 - k * 2, "w3")
                s.px(8, by - 10 - k * 2, "w4")
        elif material == "stone":
            s.rect(2, by - 12, 6, by - 9, "r3")
            s.rect(5, by - 14, 8, by - 11, "r2")
        else:
            s.ellipse(5, by - 10, 5, 4, "s1")
            s.rect(4, by - 11, 6, by - 8, "#141612")
            s.rect(3, by - 12, 7, by - 12, "w2")
    for i, (x, y) in enumerate(sorted(huts, key=lambda p: p[1])):
        if stage == 0:
            h = s.box(x, y, 6, 3, "pl0", "w2")
            s.line((h["L"][0], h["L"][1]), (h["F"][0] + 2, h["F"][1] - 3), "w1")
            s.line((h["F"][0], h["F"][1]), (h["R"][0] - 1, h["R"][1] - 3), "w1")
            continue
        stone = stage == 3 and i == len(huts) - 1
        h = s.box(x, y, 6, 5, "r3" if stone else "pl2", "r1" if stone else "pl0")
        door(s, h, "r", 0.4, 2, 3, "w1")
        s.gable_roof(h, 5, "sh2" if stone else "st2", "sh0" if stone else "st1", "w2", 1)
    if stage > 0:
        banner(s, 28, by - 12, 8)
    return finish(s, g)


# ================================================================== personas y animales

def villager(job: str) -> Spr:
    cloth = {"farmer": ("w3", "w2"), "herder": ("l2", "l1"), "carter": ("red0", "#431812"), "artisan": ("r1", "r0"), "soldier": ("red1", "red0")}[job]
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
    else:  # soldado
        s.rect(2, 2, 6, 3, "iron1")
        s.rect(1, 3, 7, 3, "iron1")
        s.px(4, 8, "gold")
        s.rect(8, 0, 8, 13, "w2")
        s.px(8, 0, "r4")
        s.rect(0, 7, 1, 10, "w3")
    return finish(s)


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
    return finish(s)


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

def icon(draw) -> Spr:
    s = Spr(12, 12)
    draw(s)
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
    s.poly([(2, 4), (8, 4), (5, 11)], "carrot")
    s.px(3, 5, "st4")
    s.rect(4, 1, 4, 3, "l3")
    s.rect(6, 0, 6, 3, "l4")
    s.px(5, 2, "l3")


def _cabbage(s):
    s.ellipse(5.5, 6, 4.5, 4, "cab0")
    s.ellipse(5, 5.5, 3, 3, "cab")
    s.ellipse(4.5, 5, 1.5, 1.5, "cab1")
    s.px(5, 9, "cab1")


def _egg(s):
    s.ellipse(5.5, 6, 3.5, 4.5, "cream")
    s.rect(3, 3, 3, 4, "#f2e8d0")
    s.px(7, 8, "cream0")


def _milk(s):
    s.rect(3, 4, 8, 10, "clay" if "clay" in P else "#8f5534")
    s.rect(2, 3, 9, 3, "#5c331d")
    s.rect(3, 4, 8, 4, "milk")
    s.rect(9, 5, 10, 8, "#5c331d")
    s.px(4, 6, "#b06a40")


def _flour(s):
    s.poly([(2, 3), (9, 3), (10, 10), (1, 10)], "cream")
    s.rect(3, 2, 8, 2, "cream0")
    s.rect(5, 5, 6, 8, "red1")
    s.rect(4, 6, 7, 7, "red1")


def _bread(s):
    s.ellipse(5.5, 7, 5, 3.5, "st1")
    s.ellipse(5, 6, 4, 2.5, "st2")
    for x in (3, 6, 9):
        s.px(x, 6, "w2")
        s.px(x - 1, 7, "w2")


def _cheese(s):
    s.poly([(1, 8), (10, 4), (10, 10), (1, 10)], "gold")
    s.poly([(1, 8), (6, 3), (10, 4)], "glow")
    s.px(6, 8, "#8d6c2c")
    s.px(8, 6, "#8d6c2c")
    s.px(3, 9, "#8d6c2c")


def _wood(s):
    for (x, y) in ((3, 7), (8, 7), (5, 3)):
        s.ellipse(x, y, 2.5, 2.5, "w3")
        s.ellipse(x, y, 1.5, 1.5, "w4")
        s.px(x, y, "w2")


def _stone(s):
    s.rect(1, 6, 5, 10, "r2")
    s.rect(6, 6, 10, 10, "r3")
    s.rect(3, 2, 8, 5, "r3")
    s.rect(3, 2, 8, 2, "r4")
    s.rect(1, 6, 5, 6, "r3")


def _iron(s):
    s.poly([(1, 9), (3, 5), (10, 5), (10, 9)], "iron1")
    s.rect(3, 5, 9, 5, "#7c7a72")
    s.rect(1, 9, 10, 10, "iron")


def _worker(s):
    s.rect(4, 1, 7, 4, "skin")
    s.rect(3, 0, 8, 1, "st2")
    s.rect(2, 5, 9, 10, "w3")
    s.rect(7, 5, 9, 10, "w2")


def _banner(s):
    s.rect(2, 0, 2, 11, "w2")
    s.poly([(3, 1), (10, 1), (8, 4), (10, 7), (3, 7)], "red1")
    s.rect(4, 3, 7, 3, "gold")


def _hammer(s):
    s.line((2, 10), (7, 5), "w3")
    s.line((3, 10), (8, 5), "w2")
    s.poly([(5, 3), (8, 0), (11, 3), (8, 6)], "iron1")


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
    s.rect(1, 3, 8, 6, "w3")
    s.rect(1, 3, 8, 3, "w4")
    s.line((8, 6), (11, 5), "w1")
    s.ellipse(4, 8, 2.5, 2.5, "w1")
    s.px(4, 8, "w4")


def _charter(s):
    _scroll(s)
    s.ellipse(7, 8, 2, 2, "red1")
    s.px(7, 8, "gold")


def _prestige(s):
    s.poly([(1, 1), (10, 1), (10, 6), (5.5, 11), (1, 6)], "red1")
    s.line((2, 2), (9, 8), "gold")
    s.px(5, 4, "glow")


def _soldier(s):
    s.ellipse(5.5, 6, 5, 1.5, "iron1")
    s.ellipse(5.5, 4, 3.5, 3, "iron1")
    s.rect(5, 1, 6, 6, "#7c7a72")
    s.line((9, 1), (2, 11), "w2")


def _manor(s):
    s.rect(3, 3, 8, 10, "r3")
    s.rect(6, 3, 8, 10, "r1")
    for x in (3, 5, 7):
        s.px(x, 2, "r3")
    s.rect(5, 7, 6, 10, "w0")
    s.rect(5, 0, 5, 2, "w1")
    s.rect(6, 0, 7, 1, "red1")


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


ICONS = {
    "icon_coin": _coin, "icon_wheat": _wheat, "icon_carrot": _carrot, "icon_cabbage": _cabbage,
    "icon_egg": _egg, "icon_milk": _milk, "icon_flour": _flour, "icon_bread": _bread, "icon_cheese": _cheese,
    "icon_wood": _wood, "icon_stone": _stone, "icon_iron": _iron, "icon_worker": _worker, "icon_banner": _banner,
    "icon_hammer": _hammer, "icon_granary": _granary, "icon_house": _house, "icon_scroll": _scroll,
    "icon_crown": _crown, "icon_cart": _cart, "icon_charter": _charter, "icon_prestige": _prestige,
    "icon_soldier": _soldier, "icon_manor": _manor, "icon_pause": _pause, "icon_play": _play, "icon_menu": _menu,
    "icon_check": _check, "icon_up": _up, "icon_down": _down,
}


def bubble() -> Spr:
    """Placa que flota sobre gallinero y corral con lo que hay para recoger (icono y numero encima)."""
    s = Spr(30, 20)
    s.rect(1, 1, 28, 16, "w1")
    s.rect(2, 2, 27, 15, "w0")
    s.rect(1, 1, 28, 1, "#8d6c2c")
    s.rect(1, 16, 28, 16, "#8d6c2c")
    s.poly([(12, 17), (15, 19), (18, 17)], "#8d6c2c")
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
        **{name: icon(fn) for name, fn in ICONS.items()},
    }


# ================================================================== salida

def generate() -> dict:
    return {
        "grass_a": grass(1), "grass_b": grass(2), "grass_c": grass(3),
        "soil": soil(), "path": path(), "wild": wild(),
        "cliff_l": cliff("l"), "cliff_r": cliff("r"),
        "boundary": boundary(), "site": site(), "tenant": tenant(),
        **{f"{k}_{i}": crop(k, i) for k in ("wheat", "carrot", "cabbage") for i in range(4)},
        "tree_a": oak(), "tree_b": pine(), "rocks": rocks(), "well": well(),
        **{f"house_{i}": house(i) for i in (1, 2, 3)},
        "market": market(),
        **{f"granary_{i}": granary(i) for i in (1, 2, 3)},
        **{f"coop_{i}": coop(i) for i in (1, 2, 3)},
        "pen_shed": pen_shed(), "stall": stall(), "cart": cart(),
        "mill": windmill(), "bakery": bakery(), "cheesery": cheesery(),
        **{f"manor_{i}": manor(i) for i in range(4)},
        **{f"hamlet_{m}_{i}": hamlet(m, i) for m in ("wood", "stone", "iron") for i in range(4)},
        **{f"villager_{j}": villager(j) for j in ("farmer", "herder", "carter", "artisan", "soldier")},
        "cow": cow(), "chicken": chicken(),
    }


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
