#!/usr/bin/env python3
"""Genera los sprites SVG provisionales del prototipo.

Direccion de arte: medieval sombrio (referencia: Warhammer Fantasy). Colores terrosos y
apagados, sombreado con degradados, textura de grano y contornos finos en vez de lineas
gruesas de dibujo animado.

Uso:  python3 tools/gen_sprites.py
Salida: public/assets/sprites/*.svg

Convenciones:
- Baldosa isometrica 2:1 de 128x64 px (rombo con el vertice superior en (64, 0)).
- Los objetos que se apoyan sobre una baldosa tienen el rombo de suelo pegado al borde
  inferior de la imagen; en el juego se colocan con origen (0.5, 1) en el vertice
  inferior de la baldosa.
- Para cambiar a arte definitivo basta con sustituir estos archivos manteniendo nombres
  y anclajes.
"""
from __future__ import annotations

import math
import os
import random

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "sprites")
TW, TH = 128, 64

PAL = {
    "grass": "#56663a", "grass_dark": "#3f4c29", "grass_light": "#6c7a45", "grass_dry": "#7b7446",
    "soil": "#4b3524", "soil_dark": "#2f2117", "soil_light": "#644631",
    "stone": "#77715f", "stone_light": "#8f8873", "stone_dark": "#4f4a3e", "mortar": "#35322a",
    "plaster": "#bfa983", "plaster_shade": "#9a8562", "timber": "#2a1b11",
    "thatch": "#86652f", "thatch_shade": "#634a20", "thatch_line": "#463313",
    "wood": "#6a4a2c", "wood_shade": "#4c331d", "wood_dark": "#24170e",
    "shingle": "#4e3326", "shingle_shade": "#3a251b",
    "oxblood": "#6e1f17", "oxblood_dark": "#4a130e", "ochre": "#b48a3c",
    "leaf": "#3d552a", "leaf_light": "#506b36", "leaf_dark": "#28391b", "pine": "#2c4129", "pine_dark": "#1d2c1b",
    "trunk": "#3b281a", "trunk_dark": "#22170f",
    "wheat_green": "#5f7a32", "wheat_green_dark": "#435a22", "wheat_gold": "#c8973b", "wheat_gold_dark": "#7f5a1f",
    "hide": "#6a4127", "hide_dark": "#432918", "cream": "#d6c4a1", "ink": "#1c140d",
    "hen": "#87583a", "hen_dark": "#5a3a24", "comb": "#8c2a1d", "beak": "#c08a35",
    "gold": "#d7ad4a", "gold_light": "#f0d27f", "gold_dark": "#7d5b1b",
    "clay": "#8f5534", "clay_dark": "#5c331d", "milk": "#e8e0cc",
    "iron": "#2b2a27", "iron_light": "#4a4843", "parch": "#d8c39a", "parch_dark": "#a88c5c",
    "shadow": "rgba(10,8,4,0.35)",
}


def svg(w: int, h: int, body: str, defs: str = "") -> str:
    d = f"<defs>{defs}</defs>" if defs else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}">{d}{body}</svg>\n')


def poly(points, fill, stroke=None, sw=1.0, extra=""):
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    s = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
    return f'<polygon points="{pts}" fill="{fill}"{s}{extra}/>'


def line(a, b, stroke, sw=1.0, cap="round", op=1.0):
    o = f' stroke-opacity="{op}"' if op < 1 else ""
    return (f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" '
            f'stroke="{stroke}" stroke-width="{sw}" stroke-linecap="{cap}"{o}/>')


def ellipse(cx, cy, rx, ry, fill, stroke=None, sw=1.0, op=1.0):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    o = f' opacity="{op}"' if op < 1 else ""
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}"{s}{o}/>'


def lin_grad(gid, c1, c2, x1=0, y1=0, x2=0, y2=1):
    return (f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>')


def rad_grad(gid, c1, c2, op2=1.0):
    return (f'<radialGradient id="{gid}" cx="0.5" cy="0.5" r="0.5">'
            f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}" stop-opacity="{op2}"/></radialGradient>')


def diamond(ox=0.0, oy=0.0, hw=64.0, hh=32.0):
    cx = ox + hw
    return [(cx, oy), (cx + hw, oy + hh), (cx, oy + 2 * hh), (cx - hw, oy + hh)]


def tile_point(u, v, oy=0.0):
    return (64 + (u - v) * 64, oy + (u + v) * 32)


def grain(rnd, n, colors, oy=0.0, size=(0.6, 1.4), margin=0.04):
    out = ""
    for _ in range(n):
        x, y = tile_point(rnd.uniform(margin, 1 - margin), rnd.uniform(margin, 1 - margin), oy)
        r = rnd.uniform(*size)
        out += ellipse(x, y, r, r * 0.6, rnd.choice(colors), op=rnd.uniform(0.35, 0.8))
    return out


# ---------------------------------------------------------------- suelos

def grass(seed: int, variant: int) -> str:
    rnd = random.Random(seed)
    defs = rad_grad("g", "#5b6b3c", PAL["grass"])
    body = poly(diamond(), "url(#g)")
    body += grain(rnd, 70, [PAL["grass_dark"], PAL["grass_light"], PAL["grass_dry"]])
    for _ in range(14):
        x, y = tile_point(rnd.uniform(0.12, 0.88), rnd.uniform(0.12, 0.88))
        col = rnd.choice([PAL["grass_dark"], PAL["grass_dry"], PAL["leaf_dark"]])
        body += line((x, y), (x - 1.5, y - rnd.uniform(3, 6)), col, 1, op=0.8)
        body += line((x + 1, y), (x + 2.5, y - rnd.uniform(3, 5)), col, 1, op=0.8)
    if variant == 1:  # flores silvestres apagadas
        for _ in range(5):
            x, y = tile_point(rnd.uniform(0.2, 0.8), rnd.uniform(0.2, 0.8))
            body += ellipse(x, y, 1.3, 1, rnd.choice(["#b9a86a", "#8c6d8f", "#c7bfa0"]))
    if variant == 2:  # calvas de tierra
        x, y = tile_point(rnd.uniform(0.3, 0.7), rnd.uniform(0.3, 0.7))
        body += ellipse(x, y, 10, 5, PAL["soil_light"], op=0.45)
        body += grain(rnd, 10, [PAL["soil_dark"]], size=(0.5, 1))
    return svg(TW, TH, body, defs)


def soil() -> str:
    rnd = random.Random(5)
    defs = lin_grad("s", PAL["soil_light"], PAL["soil"])
    body = poly(diamond(), "url(#s)")
    # surcos paralelos a un lado del rombo
    for t in (0.14, 0.29, 0.44, 0.59, 0.74, 0.89):
        a = (64 * t, 32 + 32 * t)
        b = (64 + 64 * t, 32 * t)
        a2, b2 = (a[0] + 5, a[1] - 2.5), (b[0] - 5, b[1] + 2.5)
        body += line(a2, b2, PAL["soil_dark"], 3.6)
        body += line((a2[0] + 1, a2[1] + 2.4), (b2[0] + 1, b2[1] + 2.4), PAL["soil_light"], 1.1, op=0.7)
    body += grain(rnd, 50, [PAL["soil_dark"], PAL["soil_light"], PAL["stone_dark"]])
    body += poly(diamond(), "none", PAL["soil_dark"], 1.2, ' stroke-opacity="0.6"')
    return svg(TW, TH, body, defs)


def path() -> str:
    """Camino empedrado de cantos rodados."""
    rnd = random.Random(7)
    body = poly(diamond(), PAL["mortar"])
    stones = []
    for i in range(7):
        for j in range(7):
            u = (i + 0.5 + rnd.uniform(-0.18, 0.18)) / 7
            v = (j + 0.5 + rnd.uniform(-0.18, 0.18)) / 7
            stones.append(tile_point(u, v))
    stones.sort(key=lambda p: p[1])
    for (x, y) in stones:
        rx, ry = rnd.uniform(5.2, 6.6), rnd.uniform(2.6, 3.4)
        body += ellipse(x, y + 0.8, rx, ry, PAL["stone_dark"])
        body += ellipse(x, y, rx - 0.6, ry - 0.5, rnd.choice([PAL["stone"], PAL["stone_light"], "#6d6858"]))
        body += ellipse(x - 1.5, y - 0.8, rx * 0.4, ry * 0.35, PAL["stone_light"], op=0.5)
    return svg(TW, TH, body)


# ---------------------------------------------------------------- cultivos

def wheat(stage: int) -> str:
    oy = 32
    rnd = random.Random(40 + stage)
    pts = []
    n = 4
    for i in range(n):
        for j in range(n):
            u = (i + 0.5 + rnd.uniform(-0.08, 0.08)) / n
            v = (j + 0.5 + rnd.uniform(-0.08, 0.08)) / n
            pts.append(tile_point(u, v, oy))
    pts.sort(key=lambda p: p[1])
    body = ""
    for (x, y) in pts:
        if stage == 0:
            body += ellipse(x, y, 3.4, 1.7, PAL["soil_dark"])
            body += ellipse(x - 0.8, y - 0.8, 1, 0.7, PAL["wheat_green"], op=0.8)
        elif stage == 1:
            body += line((x, y), (x - 2.5, y - 6), PAL["wheat_green"], 1.5)
            body += line((x, y), (x + 2.5, y - 7), PAL["wheat_green_dark"], 1.5)
            body += line((x, y), (x, y - 5), PAL["wheat_green"], 1.2)
        elif stage == 2:
            for dx in (-3, -1, 1, 3):
                body += line((x + dx * 0.3, y), (x + dx, y - rnd.uniform(14, 18)),
                             PAL["wheat_green_dark"] if dx < 0 else PAL["wheat_green"], 1.5)
        else:
            for dx in (-4, -1.5, 1.5, 4):
                top = (x + dx + rnd.uniform(-1, 1), y - rnd.uniform(19, 23))
                body += line((x + dx * 0.3, y), top, PAL["wheat_gold_dark"], 1.3)
                body += ellipse(top[0] + 0.6, top[1] - 3, 2, 4.6, PAL["wheat_gold_dark"])
                body += ellipse(top[0], top[1] - 3.4, 1.7, 4.2, PAL["wheat_gold"])
                body += line((top[0], top[1] - 7), (top[0] + 1.5, top[1] - 11), PAL["wheat_gold"], 0.6, op=0.8)
    return svg(TW, 96, body)


# ---------------------------------------------------------------- edificios

def iso_box(w, h, hw, hh, wall, left_fill, right_fill, outline, sw=1.0):
    cx, by = w / 2, h
    b = (cx, by)
    r = (cx + hw, by - hh)
    t = (cx, by - 2 * hh)
    l = (cx - hw, by - hh)
    up = lambda p, k=wall: (p[0], p[1] - k)
    body = poly([l, b, up(b), up(l)], left_fill, outline, sw)
    body += poly([b, r, up(r), up(b)], right_fill, outline, sw)
    return body, {"b": b, "r": r, "t": t, "l": l, "B": up(b), "R": up(r), "T": up(t), "L": up(l)}


def lerp(a, c, f):
    return (a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f)


def hip_roof(p, over, rise, fill_l, fill_r, outline, lines_col=None, n_lines=6, sw=1.0):
    cx = (p["L"][0] + p["R"][0]) / 2
    cy = (p["T"][1] + p["B"][1]) / 2

    def ext(q):
        return (q[0] + (q[0] - cx) * over, q[1] + (q[1] - cy) * over + 3)
    L, B, R = ext(p["L"]), ext(p["B"]), ext(p["R"])
    apex = (cx, cy - rise)
    body = poly([L, B, apex], fill_l, outline, sw)
    body += poly([B, R, apex], fill_r, outline, sw)
    if lines_col:
        for k in range(1, n_lines):
            f = k / n_lines
            body += line(lerp(L, B, f), lerp(apex, B, 0.0) if False else apex, lines_col, 0.7, op=0.7)
            body += line(lerp(B, R, f), apex, lines_col, 0.7, op=0.7)
    return body, apex, (L, B, R)


def stone_band(a, b, height, rnd):
    """Zocalo de piedra a lo largo de la arista inferior a-b de una pared."""
    out = poly([a, b, (b[0], b[1] - height), (a[0], a[1] - height)], PAL["stone_dark"])
    rows = 2
    for r in range(rows):
        y0 = r * height / rows
        k = 0.0
        while k < 1:
            step = rnd.uniform(0.14, 0.22)
            k2 = min(1, k + step)
            p0, p1 = lerp(a, b, k), lerp(a, b, k2)
            quad = [(p0[0] + 0.6, p0[1] - y0 - 0.6), (p1[0] - 0.6, p1[1] - y0 - 0.6),
                    (p1[0] - 0.6, p1[1] - y0 - height / rows + 0.6), (p0[0] + 0.6, p0[1] - y0 - height / rows + 0.6)]
            out += poly(quad, rnd.choice([PAL["stone"], PAL["stone_light"], "#6a6455"]))
            k = k2 + (0.08 if r % 2 else 0)
    return out


def house() -> str:
    rnd = random.Random(3)
    w, h = 132, 176
    defs = lin_grad("wl", PAL["plaster"], PAL["plaster_shade"]) + lin_grad("wr", PAL["plaster_shade"], "#7d6a4b")
    defs += lin_grad("rl", PAL["thatch"], PAL["thatch_shade"]) + lin_grad("rr", PAL["thatch_shade"], "#4f3a18")
    body = ellipse(w / 2, h - 26, 58, 22, PAL["shadow"])
    box, p = iso_box(w, h - 4, 50, 25, 50, "url(#wl)", "url(#wr)", PAL["timber"], 1.2)
    body += box
    body += stone_band(p["l"], p["b"], 12, rnd) + stone_band(p["b"], p["r"], 12, rnd)
    # entramado oscuro: postes, travesano y riostras en aspa
    for a, c in ((p["l"], p["b"]), (p["b"], p["r"])):
        for f in (0.0, 0.5, 1.0):
            q = lerp(a, c, f)
            body += line((q[0], q[1] - 12), (q[0], q[1] - 50), PAL["timber"], 3)
        mid0, mid1 = (a[0], a[1] - 31), (c[0], c[1] - 31)
        body += line(mid0, mid1, PAL["timber"], 2.6)
        for f0, f1 in ((0.0, 0.5), (0.5, 1.0)):
            q0, q1 = lerp(a, c, f0), lerp(a, c, f1)
            body += line((q0[0], q0[1] - 31), (q1[0], q1[1] - 50), PAL["timber"], 2)
        body += line((a[0], a[1] - 50), (c[0], c[1] - 50), PAL["timber"], 3)
    # puerta de tablas con herrajes
    d0 = lerp(p["b"], p["r"], 0.18)
    door = [d0, lerp(p["b"], p["r"], 0.42), (lerp(p["b"], p["r"], 0.42)[0], lerp(p["b"], p["r"], 0.42)[1] - 28), (d0[0], d0[1] - 28)]
    body += poly(door, PAL["wood_shade"], PAL["timber"], 1.4)
    for f in (0.33, 0.66):
        a, c = lerp(door[0], door[1], f), lerp(door[3], door[2], f)
        body += line(a, c, PAL["timber"], 0.8)
    body += line(lerp(door[0], door[3], 0.3), lerp(door[1], door[2], 0.3), PAL["iron"], 1.4)
    body += line(lerp(door[0], door[3], 0.75), lerp(door[1], door[2], 0.75), PAL["iron"], 1.4)
    # ventanuco con luz calida
    w0 = lerp(p["l"], p["b"], 0.25)
    win = [(w0[0], w0[1] - 34), (w0[0] + 11, w0[1] - 28.5), (w0[0] + 11, w0[1] - 39), (w0[0], w0[1] - 44.5)]
    body += poly(win, "#e2a54b", PAL["timber"], 1.6)
    body += line(lerp(win[0], win[1], 0.5), lerp(win[3], win[2], 0.5), PAL["timber"], 1.2)
    roof, apex, (L, B, R) = hip_roof(p, 0.18, 44, "url(#rl)", "url(#rr)", PAL["thatch_line"], PAL["thatch_line"], 9)
    body += roof
    # borde de paja grueso en el alero
    body += line(L, B, PAL["thatch_shade"], 3) + line(B, R, "#4f3a18", 3)
    # chimenea de piedra
    c = (apex[0] + 18, apex[1] + 20)
    body += poly([c, (c[0] + 8, c[1] + 4), (c[0] + 8, c[1] - 16), (c[0], c[1] - 20)], PAL["stone"], PAL["mortar"], 1)
    body += poly([(c[0] + 8, c[1] + 4), (c[0] + 14, c[1] + 1), (c[0] + 14, c[1] - 19), (c[0] + 8, c[1] - 16)], PAL["stone_dark"], PAL["mortar"], 1)
    body += poly([(c[0], c[1] - 20), (c[0] + 8, c[1] - 16), (c[0] + 14, c[1] - 19), (c[0] + 6, c[1] - 23)], PAL["mortar"])
    return svg(w, h, body, defs)


def coop() -> str:
    rnd = random.Random(9)
    w, h = 128, 124
    defs = lin_grad("cl", PAL["wood"], PAL["wood_shade"]) + lin_grad("cr", PAL["wood_shade"], "#3a2716")
    body = ellipse(w / 2, h - 22, 50, 18, PAL["shadow"])
    body += grain(rnd, 30, ["#8a7a4a", "#6f6238"], oy=h - 64)
    # zancos
    box_h = h - 14
    for dx in (-30, 0, 30):
        body += line((w / 2 + dx, h - 4 - abs(dx) * 0.5), (w / 2 + dx, box_h - abs(dx) * 0.5), PAL["wood_dark"], 3)
    box, p = iso_box(w, box_h, 36, 18, 28, "url(#cl)", "url(#cr)", PAL["wood_dark"], 1.2)
    body += box
    for a, c in ((p["l"], p["b"]), (p["b"], p["r"])):
        for f in (0.2, 0.4, 0.6, 0.8):
            q = lerp(a, c, f)
            body += line(q, (q[0], q[1] - 28), PAL["wood_dark"], 0.8, op=0.8)
    hole = lerp(p["b"], p["r"], 0.4)
    body += ellipse(hole[0], hole[1] - 14, 4, 6, PAL["ink"])
    ramp0 = (hole[0], hole[1] - 6)
    body += poly([ramp0, (ramp0[0] + 8, ramp0[1] - 3), (ramp0[0] + 24, ramp0[1] + 14), (ramp0[0] + 16, ramp0[1] + 17)], PAL["wood"], PAL["wood_dark"], 1)
    roof, _, _ = hip_roof(p, 0.24, 24, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], PAL["wood_dark"], 7)
    body += roof
    return svg(w, h, body, defs)


def market() -> str:
    rnd = random.Random(12)
    w, h = 132, 150
    body = ellipse(w / 2, h - 24, 54, 20, PAL["shadow"])
    box, p = iso_box(w, h - 6, 42, 21, 22, PAL["wood"], PAL["wood_shade"], PAL["wood_dark"], 1.2)
    body += box
    body += poly([p["L"], p["B"], p["R"], p["T"]], "#5a3e24", PAL["wood_dark"], 1)
    # mercancia: sacos, quesos y cestas
    goods = [("#a68a5a", 7, 5), ("#c8973b", 6, 4), ("#7a5a36", 6, 4.5), ("#d6c4a1", 5, 4)]
    for k, (col, rx, ry) in enumerate(goods):
        x, y = lerp(p["L"], p["R"], 0.2 + k * 0.2)
        y += 2 + rnd.uniform(-1, 1)
        body += ellipse(x, y + 1, rx, ry, PAL["wood_dark"])
        body += ellipse(x, y, rx - 0.5, ry - 0.5, col)
    # postes y toldo a rayas granate y ocre
    for q in (p["L"], p["B"], p["R"]):
        body += line(q, (q[0], q[1] - 44), PAL["wood_dark"], 3)
    top = {k: (v[0], v[1] - 44) for k, v in p.items() if k in ("L", "B", "R", "T")}
    roof, apex, (L, B, R) = hip_roof(top, 0.2, 18, PAL["oxblood"], PAL["oxblood_dark"], PAL["wood_dark"])
    body += roof
    for a, c, col in ((L, B, PAL["ochre"]), (B, R, "#8a6a2e")):
        for f in (0.2, 0.5, 0.8):
            e = lerp(a, c, f)
            body += line(e, lerp(e, apex, 0.85), col, 5, "butt", op=0.9)
    # faldon festoneado
    for a, c in ((L, B), (B, R)):
        for k in range(6):
            q = lerp(a, c, (k + 0.5) / 6)
            body += ellipse(q[0], q[1] + 1, 4, 3, PAL["oxblood_dark"])
    # estandarte en el poste del fondo
    pole = (top["T"][0] + 2, top["T"][1] - 4)
    body += line((pole[0], pole[1] + 20), (pole[0], pole[1] - 32), PAL["wood_dark"], 2)
    flag = [(pole[0], pole[1] - 30), (pole[0] + 18, pole[1] - 26), (pole[0] + 14, pole[1] - 18), (pole[0] + 18, pole[1] - 10), (pole[0], pole[1] - 14)]
    body += poly(flag, PAL["oxblood"], PAL["oxblood_dark"], 1)
    body += ellipse(pole[0] + 8, pole[1] - 21, 3, 3, PAL["gold"])
    return svg(w, h, body)


def well() -> str:
    rnd = random.Random(21)
    w, h = 96, 112
    body = ellipse(w / 2, h - 18, 36, 14, PAL["shadow"])
    cx, by = w / 2, h - 14
    # brocal cilindrico de piedra
    body += f'<path d="M{cx-26},{by-14} L{cx-26},{by-30} A26,11 0 0,1 {cx+26},{by-30} L{cx+26},{by-14} A26,11 0 0,1 {cx-26},{by-14} Z" fill="{PAL["stone_dark"]}"/>'
    for r in range(2):
        for k in range(7):
            ang0 = math.pi * (k / 7)
            x = cx - 26 * math.cos(ang0 + 0.2)
            y = by - 16 - r * 8 + 11 * math.sin(ang0 + 0.2) * 0.9
            body += ellipse(x, y, 4.2, 3.2, rnd.choice([PAL["stone"], PAL["stone_light"], "#6a6455"]))
    body += ellipse(cx, by - 30, 26, 11, PAL["stone_light"])
    body += ellipse(cx, by - 30, 20, 8, "#1a1712")
    # tejadillo y torno
    for dx in (-22, 22):
        body += line((cx + dx, by - 30), (cx + dx, by - 74), PAL["wood_dark"], 3)
    body += line((cx - 22, by - 58), (cx + 22, by - 58), PAL["wood_shade"], 3)
    body += line((cx, by - 58), (cx, by - 42), "#8a7a5a", 1)
    body += poly([(cx - 8, by - 42), (cx + 8, by - 42), (cx + 6, by - 34), (cx - 6, by - 34)], PAL["wood"], PAL["wood_dark"], 1)
    body += poly([(cx - 32, by - 70), (cx, by - 90), (cx + 32, by - 70), (cx, by - 62)], PAL["shingle"], PAL["wood_dark"], 1.2)
    body += poly([(cx, by - 62), (cx + 32, by - 70), (cx + 30, by - 66), (cx, by - 57)], PAL["shingle_shade"], PAL["wood_dark"], 1)
    return svg(w, h, body)


def rocks() -> str:
    rnd = random.Random(31)
    w, h = 112, 80
    body = ellipse(w / 2, h - 16, 40, 13, PAL["shadow"])
    for (x, y, r) in sorted([(42, 56, 14), (64, 52, 18), (78, 62, 10), (54, 66, 9)], key=lambda t: t[1]):
        pts = [(x + r * math.cos(a) * rnd.uniform(0.8, 1.05), y + r * 0.7 * math.sin(a) * rnd.uniform(0.8, 1.05) - (r * 0.35 if math.sin(a) < 0 else 0))
               for a in [i * math.pi / 4 for i in range(8)]]
        body += poly(pts, PAL["stone_dark"], PAL["mortar"], 1)
        body += poly([(px * 0.55 + x * 0.45 - 2, py * 0.55 + y * 0.45 - 3) for px, py in pts], PAL["stone"], None)
        body += ellipse(x - r * 0.3, y - r * 0.5, r * 0.25, r * 0.15, PAL["stone_light"], op=0.7)
        body += ellipse(x + r * 0.2, y + r * 0.1, r * 0.3, r * 0.12, "#4d5a2e", op=0.7)  # musgo
    return svg(w, h, body)


def tree(seed: int, kind: str) -> str:
    rnd = random.Random(seed)
    w, h = 116, 168
    cx, by = w / 2, h - 18
    body = ellipse(cx, by + 2, 34, 13, PAL["shadow"])
    if kind == "pine":
        body += poly([(cx - 4, by), (cx + 4, by), (cx + 3, by - 30), (cx - 3, by - 30)], PAL["trunk"], PAL["trunk_dark"], 1)
        for k in range(5):
            y = by - 24 - k * 22
            half = 34 - k * 6
            body += poly([(cx - half, y), (cx, y - 34), (cx + half, y)], PAL["pine_dark"])
            body += poly([(cx - half + 3, y - 2), (cx, y - 34), (cx + 2, y - 3)], PAL["pine"])
        return svg(w, h, body)
    body += poly([(cx - 6, by), (cx + 7, by), (cx + 4, by - 52), (cx - 3, by - 52)], PAL["trunk"], PAL["trunk_dark"], 1)
    body += line((cx, by - 40), (cx - 14, by - 62), PAL["trunk"], 3) + line((cx + 2, by - 44), (cx + 16, by - 66), PAL["trunk"], 3)
    blobs = [(cx + rnd.uniform(-30, 30), by - 78 + rnd.uniform(-36, 24), rnd.uniform(15, 24)) for _ in range(11)]
    blobs.sort(key=lambda b: b[1])
    for (x, y, r) in blobs:
        body += f'<circle cx="{x:.1f}" cy="{y + 2:.1f}" r="{r:.1f}" fill="{PAL["leaf_dark"]}"/>'
        body += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r - 1.5:.1f}" fill="{PAL["leaf"]}"/>'
        body += f'<circle cx="{x - r * 0.3:.1f}" cy="{y - r * 0.35:.1f}" r="{r * 0.45:.1f}" fill="{PAL["leaf_light"]}" opacity="0.7"/>'
    return svg(w, h, body)


# ---------------------------------------------------------------- animales

def cow() -> str:
    w, h = 84, 64
    body = ellipse(42, 58, 28, 5, PAL["shadow"])
    for x, col in ((26, PAL["hide_dark"]), (54, PAL["hide_dark"]), (32, PAL["hide"]), (60, PAL["hide"])):
        body += line((x, 40), (x, 56), col, 4)
        body += line((x, 55), (x, 57), PAL["ink"], 4)
    body += ellipse(42, 34, 25, 14, PAL["hide"], PAL["hide_dark"], 1.2)
    body += ellipse(46, 38, 9, 6, PAL["cream"], op=0.85)
    body += ellipse(36, 27, 10, 4, "#8a5a38", op=0.6)
    body += ellipse(68, 27, 9.5, 8.5, PAL["hide"], PAL["hide_dark"], 1.2)
    body += ellipse(74, 31, 5.5, 4.2, "#b08470", PAL["hide_dark"], 0.8)
    body += ellipse(67, 23, 1.4, 1.4, PAL["ink"])
    body += '<path d="M62,19 Q57,13 60,9" fill="none" stroke="#cbb88e" stroke-width="2.2" stroke-linecap="round"/>'
    body += '<path d="M71,19 Q76,13 73,9" fill="none" stroke="#cbb88e" stroke-width="2.2" stroke-linecap="round"/>'
    body += '<path d="M17,30 Q11,38 13,46" fill="none" stroke="#432918" stroke-width="2" stroke-linecap="round"/>'
    return svg(w, h, body)


def chicken() -> str:
    w, h = 32, 32
    body = ellipse(16, 29, 8, 2.2, PAL["shadow"])
    body += line((13, 22), (13, 28), PAL["beak"], 1.4) + line((18, 22), (18, 28), PAL["beak"], 1.4)
    body += ellipse(15, 18, 9.5, 7, PAL["hen"], PAL["hen_dark"], 0.9)
    for (x, y) in ((11, 17), (14, 20), (17, 16), (9, 20)):
        body += ellipse(x, y, 1.1, 0.8, "#c9a77a", op=0.8)
    body += ellipse(22, 11, 4.5, 4.5, PAL["hen"], PAL["hen_dark"], 0.9)
    body += poly([(26, 11), (29.5, 12.5), (26, 13.8)], PAL["beak"])
    body += poly([(19.5, 7), (21.5, 4.2), (23.5, 7)], PAL["comb"])
    body += ellipse(23, 10, 0.9, 0.9, PAL["ink"])
    body += poly([(6, 14), (2, 8), (9, 12)], PAL["hen_dark"])
    return svg(w, h, body)


# ---------------------------------------------------------------- iconos (32x32) grabados

def icon_coin() -> str:
    defs = rad_grad("c", PAL["gold_light"], PAL["gold"]) + lin_grad("ce", PAL["gold"], PAL["gold_dark"])
    b = '<circle cx="16" cy="16" r="13.5" fill="url(#ce)"/>'
    b += '<circle cx="16" cy="16" r="11.5" fill="url(#c)"/>'
    b += f'<circle cx="16" cy="16" r="9" fill="none" stroke="{PAL["gold_dark"]}" stroke-width="0.8" stroke-dasharray="1.2 1.2"/>'
    b += f'<path d="M16 9.5 V22.5 M10.5 16 H21.5" stroke="{PAL["gold_dark"]}" stroke-width="2" stroke-linecap="square"/>'
    b += f'<circle cx="16" cy="16" r="2.2" fill="{PAL["gold_dark"]}"/>'
    return svg(32, 32, b, defs)


def icon_wheat() -> str:
    b = ""
    for dx, ang in ((-6, -20), (-2, -7), (2, 7), (6, 20)):
        x2 = 16 + dx + math.sin(math.radians(ang)) * 3
        b += line((16, 29), (x2, 10), PAL["wheat_gold_dark"], 1.3)
        for k in range(4):
            y = 7 + k * 3.6
            b += ellipse(x2 - 1.8, y + 1, 1.6, 2.8, PAL["wheat_gold"], PAL["wheat_gold_dark"], 0.6)
            b += ellipse(x2 + 1.8, y + 1, 1.6, 2.8, PAL["wheat_gold"], PAL["wheat_gold_dark"], 0.6)
        b += line((x2, 6), (x2 + math.sin(math.radians(ang)) * 2, 2), PAL["wheat_gold"], 0.6)
    b += line((10.5, 22), (21.5, 22), PAL["oxblood"], 2.4)
    return svg(32, 32, b)


def icon_egg() -> str:
    defs = '<radialGradient id="e" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#f1e6cf"/><stop offset="1" stop-color="#b8996c"/></radialGradient>'
    b = ('<path d="M16 3.5 C 23.5 3.5 26.5 15 26.5 20 C 26.5 26 21.8 29.5 16 29.5 C 10.2 29.5 5.5 26 5.5 20 '
         f'C 5.5 15 8.5 3.5 16 3.5 Z" fill="url(#e)" stroke="{PAL["clay_dark"]}" stroke-width="1"/>')
    for (x, y) in ((12, 16), (19, 13), (20, 21), (13, 23), (16, 9)):
        b += ellipse(x, y, 0.9, 0.7, "#8a6a44", op=0.7)
    return svg(32, 32, b, defs)


def icon_milk() -> str:
    defs = lin_grad("j", PAL["clay"], PAL["clay_dark"], 0, 0, 1, 0)
    b = '<path d="M10 6 L22 6 L21 10 C 26 14 26 25 21 29 L11 29 C 6 25 6 14 11 10 Z" fill="url(#j)" ' \
        f'stroke="{PAL["ink"]}" stroke-width="1"/>'
    b += ellipse(16, 6.2, 6, 1.6, PAL["milk"], PAL["clay_dark"], 0.8)
    b += f'<path d="M22 12 C 29 12 29 22 23 23" fill="none" stroke="{PAL["clay_dark"]}" stroke-width="2.2"/>'
    b += line((9, 18), (23, 18), PAL["clay_dark"], 1, op=0.8)
    b += line((8.6, 21), (23.4, 21), PAL["clay_dark"], 1, op=0.8)
    return svg(32, 32, b, defs)


def bubble() -> str:
    """Escudo de hierro con borde dorado sobre el que se pinta el producto."""
    defs = lin_grad("b", PAL["iron_light"], PAL["iron"])
    b = (f'<path d="M4 4 H44 V24 C44 34 34 40 24 45 C14 40 4 34 4 24 Z" fill="url(#b)" '
         f'stroke="{PAL["gold"]}" stroke-width="2.2" stroke-linejoin="round"/>')
    b += (f'<path d="M7.5 7.5 H40.5 V24 C40.5 32 32.5 37 24 41 C15.5 37 7.5 32 7.5 24 Z" fill="none" '
          f'stroke="{PAL["gold_dark"]}" stroke-width="1"/>')
    return svg(48, 48, b, defs)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    files = {
        "grass_a.svg": grass(1, 0),
        "grass_b.svg": grass(2, 1),
        "grass_c.svg": grass(3, 2),
        "soil.svg": soil(),
        "path.svg": path(),
        "wheat_0.svg": wheat(0),
        "wheat_1.svg": wheat(1),
        "wheat_2.svg": wheat(2),
        "wheat_3.svg": wheat(3),
        "house.svg": house(),
        "coop.svg": coop(),
        "market.svg": market(),
        "well.svg": well(),
        "rocks.svg": rocks(),
        "tree_a.svg": tree(11, "oak"),
        "tree_b.svg": tree(23, "pine"),
        "cow.svg": cow(),
        "chicken.svg": chicken(),
        "icon_coin.svg": icon_coin(),
        "icon_wheat.svg": icon_wheat(),
        "icon_egg.svg": icon_egg(),
        "icon_milk.svg": icon_milk(),
        "bubble.svg": bubble(),
    }
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
            fh.write(content)
    print(f"{len(files)} sprites escritos en {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
