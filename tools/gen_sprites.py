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

import json
import math
import os
import random
import re

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
    "carrot": "#c8692a", "carrot_dark": "#8a4318", "leafy": "#4f7a2e", "leafy_dark": "#33521d",
    "cab": "#7d9a5c", "cab_light": "#a5b98a", "cab_dark": "#4d6a3a", "cab_vein": "#c9d4b0",
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


def crop_points(rnd, oy, n=4, jitter=0.08):
    pts = []
    for i in range(n):
        for j in range(n):
            u = (i + 0.5 + rnd.uniform(-jitter, jitter)) / n
            v = (j + 0.5 + rnd.uniform(-jitter, jitter)) / n
            pts.append(tile_point(u, v, oy))
    pts.sort(key=lambda p: p[1])
    return pts


def seeds(rnd, oy):
    body = ""
    for (x, y) in crop_points(rnd, oy):
        body += ellipse(x, y, 3.4, 1.7, PAL["soil_dark"])
        body += ellipse(x - 0.8, y - 0.8, 1, 0.7, PAL["leafy"], op=0.8)
    return body


def carrot(stage: int) -> str:
    """Zanahorias: hojas plumosas que crecen y, al final, asoma la raiz naranja."""
    oy = 32
    rnd = random.Random(60 + stage)
    if stage == 0:
        return svg(TW, 96, seeds(rnd, oy))
    body = ""
    h = {1: 6, 2: 13, 3: 16}[stage]
    for (x, y) in crop_points(rnd, oy):
        if stage == 3:
            body += ellipse(x, y - 0.5, 3.2, 2.2, PAL["carrot_dark"])
            body += ellipse(x - 0.3, y - 1.2, 2.6, 1.7, PAL["carrot"])
        for k, dx in enumerate((-4, -2, 0, 2, 4)):
            tip = (x + dx * (h / 10) + rnd.uniform(-1, 1), y - h + abs(dx) * 0.6)
            col = PAL["leafy_dark"] if k % 2 else PAL["leafy"]
            body += line((x, y - 1), tip, col, 1.1)
            if stage >= 2:
                for f in (0.45, 0.75):
                    q = (x + (tip[0] - x) * f, y - 1 + (tip[1] - y + 1) * f)
                    body += ellipse(q[0] + (1.4 if dx >= 0 else -1.4), q[1], 1.6, 0.8, col, op=0.9)
    return svg(TW, 96, body)


def cabbage(stage: int) -> str:
    """Coles: rosetas de hoja ancha que se cierran en un cogollo azulado."""
    oy = 32
    rnd = random.Random(80 + stage)
    if stage == 0:
        return svg(TW, 96, seeds(rnd, oy))
    body = ""
    r = {1: 4.0, 2: 7.0, 3: 9.5}[stage]
    for (x, y) in crop_points(rnd, oy, n=3, jitter=0.04):
        # hojas exteriores
        for ang in (200, 250, 290, 340, 20):
            a = math.radians(ang)
            lx, ly = x + math.cos(a) * r * 0.9, y - r * 0.6 + math.sin(a) * r * 0.45
            body += ellipse(lx, ly, r * 0.75, r * 0.42, PAL["cab_dark"])
        body += ellipse(x, y - r * 0.55, r, r * 0.68, PAL["cab"])
        if stage >= 2:
            body += ellipse(x - r * 0.15, y - r * 0.75, r * 0.62, r * 0.45, PAL["cab_light"])
            body += line((x, y - r * 0.3), (x - r * 0.4, y - r * 1.05), PAL["cab_vein"], 0.6, op=0.8)
            body += line((x, y - r * 0.3), (x + r * 0.45, y - r * 0.95), PAL["cab_vein"], 0.6, op=0.8)
    return svg(TW, 96, body)


def icon_carrot() -> str:
    b = '<path d="M9 13 L24 9 C26 9 27 11 26 12.5 L12 27 C10 29 7 27 7.5 25 Z" fill="#c8692a" stroke="#5c2a0c" stroke-width="1"/>'
    for (a, c) in (((12, 15), (16, 14)), ((10, 19), (14, 18)), ((10, 23), (13, 22.5))):
        b += line(a, c, "#8a4318", 0.9)
    for (x2, y2) in ((26, 2), (30, 5), (31, 10)):
        b += line((25, 10), (x2, y2), PAL["leafy"], 2)
    return svg(32, 32, b)


def icon_cabbage() -> str:
    b = ellipse(16, 18, 13, 11, PAL["cab_dark"], PAL["ink"], 0.8)
    b += ellipse(16, 17, 10, 9, PAL["cab"])
    b += ellipse(14.5, 14.5, 6, 5, PAL["cab_light"])
    for (x2, y2) in ((8, 10), (24, 10), (9, 24), (23, 24)):
        b += line((16, 17), (x2, y2), PAL["cab_vein"], 0.8, op=0.8)
    return svg(32, 32, b)


def icon_worker() -> str:
    """Silueta de jornalero con capucha y azada."""
    b = line((24, 4), (26, 29), PAL["wood_dark"], 2)
    b += poly([(23, 4), (29, 3), (29, 6), (24, 7)], PAL["iron_light"], PAL["iron"], 0.8)
    b += '<path d="M8 29 C8 20 10 16 15 16 C20 16 22 20 22 29 Z" fill="#6a5236" stroke="#2a1b11" stroke-width="1"/>'
    b += '<path d="M10 14 C10 6 20 6 20 14 C20 17 17 18 15 18 C13 18 10 17 10 14 Z" fill="#5a4228" stroke="#2a1b11" stroke-width="1"/>'
    b += ellipse(15, 13.5, 3.2, 3.4, "#d8b48a")
    return svg(32, 32, b)


def icon_banner() -> str:
    """Estandarte heraldico del baron: rojo sangre con torre dorada."""
    b = line((7, 2), (7, 30), PAL["wood_dark"], 2)
    b += ellipse(7, 2.5, 1.8, 1.8, PAL["gold"])
    b += '<path d="M8 5 H26 V22 L17 27 L8 22 Z" fill="#7a1d14" stroke="#c9a14a" stroke-width="1.2"/>'
    b += poly([(13, 20), (13, 12), (14.5, 12), (14.5, 10), (16, 10), (16, 12), (18, 12), (18, 10), (19.5, 10), (19.5, 12), (21, 12), (21, 20)], PAL["gold"])
    b += poly([(16, 20), (16, 16.5), (18, 16.5), (18, 20)], "#7a1d14")
    return svg(32, 32, b)


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



# ---------------------------------------------------------------- fase 2: edificios por etapas

def iso_box_c(cx, by, hw, hh, wall, left_fill, right_fill, outline, sw=1.0):
    """Como iso_box, pero con el vertice inferior en (cx, by)."""
    return iso_box(2 * cx, by, hw, hh, wall, left_fill, right_fill, outline, sw)


def timber_frame(p, low, high, sw=3.0):
    """Entramado de madera oscura entre las alturas `low` y `high` de las dos paredes visibles."""
    out = ""
    for a, c in ((p["l"], p["b"]), (p["b"], p["r"])):
        for f in (0.0, 0.5, 1.0):
            q = lerp(a, c, f)
            out += line((q[0], q[1] - low), (q[0], q[1] - high), PAL["timber"], sw)
        mid = (low + high) / 2
        out += line((a[0], a[1] - mid), (c[0], c[1] - mid), PAL["timber"], sw - 0.4)
        for f0, f1 in ((0.0, 0.5), (0.5, 1.0)):
            q0, q1 = lerp(a, c, f0), lerp(a, c, f1)
            out += line((q0[0], q0[1] - mid), (q1[0], q1[1] - high), PAL["timber"], sw - 1)
        out += line((a[0], a[1] - high), (c[0], c[1] - high), PAL["timber"], sw)
    return out


def door_on(a, c, f0, f1, height, fill=None):
    d0, d1 = lerp(a, c, f0), lerp(a, c, f1)
    door = [d0, d1, (d1[0], d1[1] - height), (d0[0], d0[1] - height)]
    out = poly(door, fill or PAL["wood_shade"], PAL["timber"], 1.4)
    for f in (0.33, 0.66):
        out += line(lerp(door[0], door[1], f), lerp(door[3], door[2], f), PAL["timber"], 0.8)
    out += line(lerp(door[0], door[3], 0.3), lerp(door[1], door[2], 0.3), PAL["iron"], 1.4)
    out += line(lerp(door[0], door[3], 0.75), lerp(door[1], door[2], 0.75), PAL["iron"], 1.4)
    return out


def window_on(a, c, f, low, size=11, lit=True):
    w0 = lerp(a, c, f)
    slope = (c[1] - a[1]) / max(1e-6, (c[0] - a[0]))
    dx = size if c[0] > a[0] else -size
    win = [(w0[0], w0[1] - low), (w0[0] + dx, w0[1] - low + dx * slope),
           (w0[0] + dx, w0[1] - low - 10.5 + dx * slope), (w0[0], w0[1] - low - 10.5)]
    out = poly(win, "#e2a54b" if lit else PAL["ink"], PAL["timber"], 1.6)
    out += line(lerp(win[0], win[1], 0.5), lerp(win[3], win[2], 0.5), PAL["timber"], 1.2)
    return out


def chimney(base, k=1.0):
    c = base
    out = poly([c, (c[0] + 8 * k, c[1] + 4 * k), (c[0] + 8 * k, c[1] - 16 * k), (c[0], c[1] - 20 * k)], PAL["stone"], PAL["mortar"], 1)
    out += poly([(c[0] + 8 * k, c[1] + 4 * k), (c[0] + 14 * k, c[1] + 1 * k), (c[0] + 14 * k, c[1] - 19 * k), (c[0] + 8 * k, c[1] - 16 * k)],
                PAL["stone_dark"], PAL["mortar"], 1)
    out += poly([(c[0], c[1] - 20 * k), (c[0] + 8 * k, c[1] - 16 * k), (c[0] + 14 * k, c[1] - 19 * k), (c[0] + 6 * k, c[1] - 23 * k)], PAL["mortar"])
    return out


def stone_wall_face(a, c, height, rnd, rows=4):
    """Pared entera de sillares."""
    out = poly([a, c, (c[0], c[1] - height), (a[0], a[1] - height)], PAL["mortar"])
    rh = height / rows
    for r in range(rows):
        k = -rnd.uniform(0.0, 0.08) if r % 2 else 0.0
        while k < 1:
            k2 = min(1, k + rnd.uniform(0.13, 0.2))
            p0, p1 = lerp(a, c, max(0, k)), lerp(a, c, k2)
            y0 = r * rh
            quad = [(p0[0] + 0.7, p0[1] - y0 - 0.7), (p1[0] - 0.7, p1[1] - y0 - 0.7),
                    (p1[0] - 0.7, p1[1] - y0 - rh + 0.7), (p0[0] + 0.7, p0[1] - y0 - rh + 0.7)]
            out += poly(quad, rnd.choice([PAL["stone"], PAL["stone_light"], "#6a6455", "#827b67"]))
            k = k2
    return out


def annex(cx, by, hw, hh, wall, stone, rnd):
    """Anexo bajo con tejado a cuatro aguas (cobertizo o ampliacion)."""
    fills = (PAL["stone"], PAL["stone_dark"]) if stone else ("url(#wl)", "url(#wr)")
    box, p = iso_box_c(cx, by, hw, hh, wall, fills[0], fills[1], PAL["timber"], 1.1)
    out = box
    if stone:
        out += stone_wall_face(p["l"], p["b"], wall, rnd, 3) + stone_wall_face(p["b"], p["r"], wall, rnd, 3)
    else:
        out += stone_band(p["l"], p["b"], 8, rnd) + stone_band(p["b"], p["r"], 8, rnd)
        out += timber_frame(p, 8, wall, 2.4)
    if stone:
        roof, _, _ = hip_roof(p, 0.2, 22, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], PAL["wood_dark"], 6)
    else:
        roof, _, _ = hip_roof(p, 0.2, 22, "url(#rl)", "url(#rr)", PAL["thatch_line"], PAL["thatch_line"], 6)
    return out + roof, p


def house_stage(stage: int) -> str:
    """Casa en tres etapas: choza de entramado, casa ampliada y casa de piedra con piso alto."""
    if stage == 1:
        return house()
    rnd = random.Random(3 + stage)
    w, h = (180, 196) if stage == 2 else (190, 222)
    cx, by = w / 2, h - 4
    defs = lin_grad("wl", PAL["plaster"], PAL["plaster_shade"]) + lin_grad("wr", PAL["plaster_shade"], "#7d6a4b")
    defs += lin_grad("rl", PAL["thatch"], PAL["thatch_shade"]) + lin_grad("rr", PAL["thatch_shade"], "#4f3a18")
    defs += lin_grad("sl", "#5a3b2b", PAL["shingle"]) + lin_grad("sr", PAL["shingle_shade"], "#2c1c14")
    body = ellipse(cx - 12, h - 28, 80, 26, PAL["shadow"])
    # ampliacion a la izquierda, detras de la casa
    ann, _ = annex(cx - 50, by - 20, 30, 15, 34 if stage == 2 else 40, stage == 3, rnd)
    body += ann
    wall = 52 if stage == 2 else 74
    box, p = iso_box_c(cx, by, 52, 26, wall, "url(#wl)", "url(#wr)", PAL["timber"], 1.2)
    body += box
    if stage == 2:
        body += stone_band(p["l"], p["b"], 12, rnd) + stone_band(p["b"], p["r"], 12, rnd)
        body += timber_frame(p, 12, wall)
        body += door_on(p["b"], p["r"], 0.18, 0.42, 28)
        body += window_on(p["l"], p["b"], 0.22, 34)
        body += window_on(p["l"], p["b"], 0.62, 34)
        body += window_on(p["b"], p["r"], 0.66, 34)
        roof, apex, (L, B, R) = hip_roof(p, 0.18, 48, "url(#rl)", "url(#rr)", PAL["thatch_line"], PAL["thatch_line"], 10)
        body += roof + line(L, B, PAL["thatch_shade"], 3) + line(B, R, "#4f3a18", 3)
        # buhardilla del altillo
        d = lerp(B, apex, 0.42)
        body += poly([(d[0] - 10, d[1] + 6), (d[0] + 10, d[1] + 1), (d[0] + 10, d[1] - 12), (d[0], d[1] - 20), (d[0] - 10, d[1] - 7)],
                     PAL["plaster_shade"], PAL["timber"], 1.2)
        body += poly([(d[0] - 5, d[1] + 1), (d[0] + 5, d[1] - 1.5), (d[0] + 5, d[1] - 10), (d[0] - 5, d[1] - 7.5)], "#e2a54b", PAL["timber"], 1.2)
        body += poly([(d[0] - 13, d[1] - 5), (d[0], d[1] - 23), (d[0] + 13, d[1] - 11), (d[0], d[1] - 19)], PAL["thatch_shade"], PAL["thatch_line"], 1)
        body += chimney((apex[0] + 20, apex[1] + 22))
    else:
        # planta baja de piedra y piso alto de entramado
        body += stone_wall_face(p["l"], p["b"], 32, rnd) + stone_wall_face(p["b"], p["r"], 32, rnd)
        body += timber_frame(p, 34, wall)
        body += line((p["l"][0], p["l"][1] - 33), (p["b"][0], p["b"][1] - 33), PAL["wood_dark"], 4)
        body += line((p["b"][0], p["b"][1] - 33), (p["r"][0], p["r"][1] - 33), PAL["wood_dark"], 4)
        body += door_on(p["b"], p["r"], 0.2, 0.44, 28, PAL["oxblood_dark"])
        body += window_on(p["l"], p["b"], 0.3, 12, 9, False)
        body += window_on(p["l"], p["b"], 0.22, 50)
        body += window_on(p["l"], p["b"], 0.62, 50)
        body += window_on(p["b"], p["r"], 0.3, 50)
        body += window_on(p["b"], p["r"], 0.7, 50)
        roof, apex, (L, B, R) = hip_roof(p, 0.16, 52, "url(#sl)", "url(#sr)", PAL["wood_dark"], "#24170e", 11)
        body += roof + line(L, B, "#2c1c14", 2.6) + line(B, R, "#24170e", 2.6)
        body += chimney((apex[0] + 18, apex[1] + 24), 1.25)
        body += chimney((apex[0] - 30, apex[1] + 34), 0.9)
        # estandarte familiar
        pole = (apex[0], apex[1] + 2)
        body += line(pole, (pole[0], pole[1] - 30), PAL["wood_dark"], 2)
        body += poly([(pole[0], pole[1] - 30), (pole[0] + 16, pole[1] - 26), (pole[0], pole[1] - 20)], PAL["oxblood"], PAL["oxblood_dark"], 1)
    return svg(w, h, body, defs)


def staddle(x, y):
    """Seta de piedra sobre la que se apoya un granero para que no entren ratas."""
    out = poly([(x - 2.5, y), (x + 2.5, y), (x + 2, y - 8), (x - 2, y - 8)], PAL["stone_dark"], PAL["mortar"], 0.8)
    out += ellipse(x, y - 9, 6, 2.6, PAL["stone"], PAL["mortar"], 0.8)
    return out


def granary(stage: int) -> str:
    rnd = random.Random(40 + stage)
    w, h = (128, 150) if stage == 1 else (140, 164) if stage == 2 else (150, 184)
    cx, by = w / 2, h - 4
    defs = lin_grad("gl", PAL["wood"], PAL["wood_shade"]) + lin_grad("gr", PAL["wood_shade"], "#3a2716")
    defs += lin_grad("rl", PAL["thatch"], PAL["thatch_shade"]) + lin_grad("rr", PAL["thatch_shade"], "#4f3a18")
    body = ellipse(cx, h - 24, 54, 20, PAL["shadow"])
    if stage < 3:
        hw, wall, lift = (38, 30, 10) if stage == 1 else (44, 36, 10)
        _, p0 = iso_box_c(cx, by, hw, hw / 2, 0, "none", "none", "none")
        for q in (p0["l"], lerp(p0["l"], p0["b"], 0.5), p0["b"], lerp(p0["b"], p0["r"], 0.5), p0["r"]):
            body += staddle(q[0], q[1] - 2)
        box, p = iso_box_c(cx, by - lift, hw, hw / 2, wall, "url(#gl)", "url(#gr)", PAL["wood_dark"], 1.2)
        body += box
        for a, c in ((p["l"], p["b"]), (p["b"], p["r"])):
            for k in range(1, 4):
                y = wall * k / 4
                body += line((a[0], a[1] - y), (c[0], c[1] - y), PAL["wood_dark"], 0.8, op=0.8)
            for f in (0.0, 0.5, 1.0):
                q = lerp(a, c, f)
                body += line(q, (q[0], q[1] - wall), PAL["wood_dark"], 2.4)
        body += door_on(p["b"], p["r"], 0.3, 0.62 if stage == 2 else 0.55, wall - 6)
        roof, apex, (L, B, R) = hip_roof(p, 0.22, 30 if stage == 1 else 34, "url(#rl)", "url(#rr)", PAL["thatch_line"], PAL["thatch_line"], 8)
        body += roof + line(L, B, PAL["thatch_shade"], 3) + line(B, R, "#4f3a18", 3)
        if stage == 2:
            # sacos apilados junto a la pared
            s0 = lerp(p0["l"], p0["b"], 0.55)
            for dx, dy in ((0, 0), (9, 3), (4, -6)):
                body += ellipse(s0[0] + dx, s0[1] + dy - 6, 6, 7, "#a68a5a", PAL["wood_dark"], 0.9)
                body += line((s0[0] + dx - 2, s0[1] + dy - 12), (s0[0] + dx + 2, s0[1] + dy - 12), PAL["wood_dark"], 1.2)
    else:
        box, p = iso_box_c(cx, by, 50, 25, 50, PAL["stone"], PAL["stone_dark"], PAL["mortar"], 1.2)
        body += box
        body += stone_wall_face(p["l"], p["b"], 50, rnd, 5) + stone_wall_face(p["b"], p["r"], 50, rnd, 5)
        # puerta grande en arco
        d0, d1 = lerp(p["b"], p["r"], 0.25), lerp(p["b"], p["r"], 0.6)
        mx, my = (d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2
        body += (f'<path d="M{d0[0]:.1f},{d0[1]:.1f} L{d1[0]:.1f},{d1[1]:.1f} L{d1[0]:.1f},{d1[1] - 26:.1f} '
                 f'Q{mx:.1f},{my - 42:.1f} {d0[0]:.1f},{d0[1] - 26:.1f} Z" fill="{PAL["wood_shade"]}" '
                 f'stroke="{PAL["timber"]}" stroke-width="1.6"/>')
        body += line((mx, my), (mx, my - 33), PAL["timber"], 1.2)
        body += window_on(p["l"], p["b"], 0.4, 32, 8, False)
        roof, apex, (L, B, R) = hip_roof(p, 0.16, 44, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], "#24170e", 10)
        body += roof
        # pescante con polea y saco colgando
        tip = lerp(B, apex, 0.25)
        body += line(tip, (tip[0] + 22, tip[1] + 8), PAL["wood_dark"], 3)
        body += line((tip[0] + 20, tip[1] + 8), (tip[0] + 20, tip[1] + 30), "#8a7a5a", 1)
        body += ellipse(tip[0] + 20, tip[1] + 36, 5, 6.5, "#a68a5a", PAL["wood_dark"], 0.9)
    return svg(w, h, body, defs)


def coop_stage(stage: int) -> str:
    if stage == 1:
        return coop()
    rnd = random.Random(60 + stage)
    w, h = (150, 132) if stage == 2 else (156, 146)
    cx, by = w / 2, h - 4
    defs = lin_grad("cl", PAL["wood"], PAL["wood_shade"]) + lin_grad("cr", PAL["wood_shade"], "#3a2716")
    body = ellipse(cx, h - 22, 60, 20, PAL["shadow"])
    if stage == 2:
        box_by = by - 10
        for dx in (-30, 0, 30):
            body += line((cx + dx, by - abs(dx) * 0.5), (cx + dx, box_by - abs(dx) * 0.5), PAL["wood_dark"], 3)
        box, p = iso_box_c(cx, box_by, 38, 19, 30, "url(#cl)", "url(#cr)", PAL["wood_dark"], 1.2)
    else:
        base, pb = iso_box_c(cx, by, 40, 20, 14, PAL["stone"], PAL["stone_dark"], PAL["mortar"], 1.1)
        body += base + stone_wall_face(pb["l"], pb["b"], 14, rnd, 2) + stone_wall_face(pb["b"], pb["r"], 14, rnd, 2)
        box, p = iso_box_c(cx, by - 14, 40, 20, 30, "url(#cl)", "url(#cr)", PAL["wood_dark"], 1.2)
    body += box
    for a, c in ((p["l"], p["b"]), (p["b"], p["r"])):
        for f in (0.2, 0.4, 0.6, 0.8):
            q = lerp(a, c, f)
            body += line(q, (q[0], q[1] - 30), PAL["wood_dark"], 0.8, op=0.8)
    hole = lerp(p["b"], p["r"], 0.3)
    body += ellipse(hole[0], hole[1] - 15, 4, 6, PAL["ink"])
    ramp0 = (hole[0], hole[1] - 6)
    body += poly([ramp0, (ramp0[0] + 8, ramp0[1] - 3), (ramp0[0] + 24, ramp0[1] + 16), (ramp0[0] + 16, ramp0[1] + 19)], PAL["wood"], PAL["wood_dark"], 1)
    # nidales: cajon con tapa inclinada en el lado derecho
    n0, n1 = lerp(p["b"], p["r"], 0.58), lerp(p["b"], p["r"], 0.95)
    lo, hi = 6, 18
    front = [(n0[0], n0[1] - lo + 5), (n1[0], n1[1] - lo + 5), (n1[0], n1[1] - hi), (n0[0], n0[1] - hi)]
    body += poly(front, PAL["wood_shade"], PAL["wood_dark"], 1)
    for f in (0.33, 0.66):
        q = lerp(front[0], front[1], f)
        body += line(q, (q[0], q[1] - (hi - lo + 5)), PAL["wood_dark"], 0.9)
    body += poly([(n0[0] - 2, n0[1] - hi - 1), (n1[0] + 2, n1[1] - hi - 2), (n1[0] - 2, n1[1] - hi - 9), (n0[0] - 6, n0[1] - hi - 8)], PAL["shingle"], PAL["wood_dark"], 1)
    roof, apex, _ = hip_roof(p, 0.24, 26, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], PAL["wood_dark"], 8)
    body += roof
    # cercado de zarzo delante a la izquierda
    f0, f1 = (cx - 70, by - 26), (cx - 36, by - 9)
    for k in range(6):
        q = lerp(f0, f1, k / 5)
        body += line((q[0], q[1] + 2), (q[0], q[1] - 14), PAL["wood_dark"], 2)
    for y in (4, 8, 12):
        body += line((f0[0], f0[1] - y), (f1[0], f1[1] - y), "#7a6038", 1.8)
    if stage == 3:
        body += chimney((apex[0] - 4, apex[1] + 16), 0.6)
    return svg(w, h, body, defs)


def pen_shed() -> str:
    """Cobertizo de establo con heno para la esquina trasera del corral."""
    w, h = 120, 110
    cx, by = w / 2, h - 6
    body = ellipse(cx, h - 18, 44, 14, PAL["shadow"])
    body += poly([(cx - 40, by - 20), (cx, by - 40), (cx + 40, by - 20), (cx + 40, by - 60), (cx, by - 80), (cx - 40, by - 60)],
                 PAL["wood_shade"], PAL["wood_dark"], 1)
    for k in range(1, 4):
        body += line((cx - 40, by - 20 - k * 10), (cx, by - 40 - k * 10), PAL["wood_dark"], 0.8, op=0.7)
        body += line((cx, by - 40 - k * 10), (cx + 40, by - 20 - k * 10), PAL["wood_dark"], 0.8, op=0.7)
    for k in range(5):
        x = cx - 22 + k * 11
        body += ellipse(x, by - 26 - abs(k - 2) * 2, 12, 7, PAL["thatch"], PAL["thatch_shade"], 0.8)
    for q in ((cx - 40, by - 20), (cx + 40, by - 20), (cx, by)):
        body += line(q, (q[0], q[1] - 46), PAL["wood_dark"], 3)
    body += poly([(cx - 52, by - 50), (cx, by - 78), (cx + 52, by - 50), (cx, by - 24)], PAL["shingle"], PAL["wood_dark"], 1.2)
    body += poly([(cx, by - 24), (cx + 52, by - 50), (cx + 50, by - 45), (cx, by - 19)], PAL["shingle_shade"], PAL["wood_dark"], 1)
    return svg(w, h, body)


# ---------------------------------------------------------------- aldeanos

def villager(job: str) -> str:
    w, h = 28, 46
    cloth = {"farmer": ("#6a5236", "#4b3a26"), "herder": ("#55603a", "#3c4428"), "carter": ("#6e3a26", "#4a2618")}[job]
    b = ellipse(14, 43, 8, 2.4, PAL["shadow"])
    b += line((11, 34), (11, 42), PAL["ink"], 2.6) + line((17, 34), (17, 42), PAL["ink"], 2.6)
    b += f'<path d="M6 36 C6 24 8 19 14 19 C20 19 22 24 22 36 Z" fill="{cloth[0]}" stroke="{PAL["timber"]}" stroke-width="1"/>'
    b += line((7, 29), (21, 29), cloth[1], 2)
    b += ellipse(14, 14, 4.6, 5, "#d8b48a", PAL["timber"], 0.8)
    if job == "farmer":
        b += ellipse(14, 10.5, 9, 2.4, "#c8a250", PAL["wheat_gold_dark"], 0.8)
        b += ellipse(14, 9, 4.6, 3, "#c8a250", PAL["wheat_gold_dark"], 0.8)
        b += line((22, 12), (19, 40), PAL["wood_dark"], 1.8)
        b += poly([(19.5, 10), (26, 11.5), (25, 14), (21, 13)], PAL["iron_light"], PAL["iron"], 0.7)
    elif job == "herder":
        b += f'<path d="M8 13 C8 5 20 5 20 13 C20 16 18 17 14 17 C10 17 8 16 8 13 Z" fill="{cloth[1]}" stroke="{PAL["timber"]}" stroke-width="0.9"/>'
        b += ellipse(14, 14, 3.4, 3.6, "#d8b48a")
        b += line((23, 8), (22, 42), PAL["wood"], 1.8)
        b += '<path d="M23 8 C23 3 28 3 27.5 7" fill="none" stroke="#6a4a2c" stroke-width="1.8" stroke-linecap="round"/>'
    else:
        b += ellipse(14, 9.5, 5, 2.6, "#3b281a")
        b += ellipse(5.5, 26, 5.5, 7, "#a68a5a", PAL["wood_dark"], 0.9)
        b += line((3, 20), (8, 20), PAL["wood_dark"], 1.2)
    return svg(w, h, b)


# ---------------------------------------------------------------- tierras del este

def wild() -> str:
    """Tierra del baron sin roturar: hierba oscura y alta con matorral."""
    rnd = random.Random(77)
    body = poly(diamond(), "#36402a")
    body += grain(rnd, 90, ["#26301c", "#46512f", "#4f5134"], margin=0.0)
    for _ in range(26):
        x, y = tile_point(rnd.uniform(0.06, 0.94), rnd.uniform(0.06, 0.94))
        col = rnd.choice(["#242d19", "#2f3a20", "#4a4a2c"])
        for dx in (-2.5, -1, 0.5, 2):
            body += line((x + dx * 0.4, y), (x + dx, y - rnd.uniform(4, 8)), col, 1.1, op=0.9)
    for _ in range(4):
        x, y = tile_point(rnd.uniform(0.2, 0.8), rnd.uniform(0.2, 0.8))
        body += ellipse(x, y - 2, 7, 3.6, "#2a3320", op=0.9)
        body += ellipse(x + 1, y - 4, 1.1, 1.1, "#5a1e1a", op=0.8)
    return svg(TW, TH, body)


def boundary_stone() -> str:
    """Mojon del baron que marca el limite de sus tierras."""
    w, h = 40, 56
    b = ellipse(20, 50, 13, 4, PAL["shadow"])
    b += '<path d="M11 50 L11 18 Q20 8 29 18 L29 50 Z" fill="#6a6455" stroke="#35322a" stroke-width="1.2"/>'
    b += '<path d="M23 50 L23 15 Q27 14 29 18 L29 50 Z" fill="#4f4a3e"/>'
    b += poly([(15, 26), (15, 21), (17, 21), (17, 19), (19, 19), (19, 21), (21, 21), (21, 26)], "#3a3529")
    b += ellipse(16, 44, 4, 2, "#4d5a2e", op=0.8)
    return svg(w, h, b)


def tenant() -> str:
    """Parcela de un aparcero: cebada crecida y una estaca con la cinta del arriendo."""
    rnd = random.Random(88)
    w, h = TW, 96
    oy = h - TH
    body = ""
    pts = []
    for i in range(5):
        for j in range(5):
            pts.append(tile_point((i + 0.5) / 5 + rnd.uniform(-0.03, 0.03), (j + 0.5) / 5 + rnd.uniform(-0.03, 0.03), oy))
    pts.sort(key=lambda p: p[1])
    for (x, y) in pts:
        for dx in (-3, 0, 3):
            top = (x + dx * 1.4, y - rnd.uniform(14, 19))
            body += line((x + dx * 0.5, y), top, "#8a7a3a", 1.1)
            body += ellipse(top[0], top[1], 1.6, 3.2, "#b89a48", "#6f5a24", 0.5)
    sx, sy = tile_point(0.86, 0.14, oy)
    body += line((sx, sy), (sx, sy - 36), PAL["wood_dark"], 2.4)
    body += poly([(sx, sy - 35), (sx + 14, sy - 31), (sx, sy - 27)], PAL["oxblood"], PAL["oxblood_dark"], 0.8)
    return svg(w, h, body)


# ---------------------------------------------------------------- iconos de la fase 2

def icon_hammer() -> str:
    b = line((9, 27), (21, 11), PAL["wood"], 3.2) + line((9, 27), (21, 11), PAL["wood_dark"], 1)
    b += poly([(15, 6), (25, 3), (29, 12), (19, 15)], PAL["iron_light"], PAL["iron"], 1)
    b += poly([(25, 3), (28, 2), (31, 10), (29, 12)], PAL["iron"], PAL["iron"], 0.8)
    return svg(32, 32, b)


def icon_granary() -> str:
    b = poly([(4, 15), (16, 4), (28, 15)], PAL["thatch"], PAL["thatch_line"], 1.2)
    b += poly([(7, 15), (25, 15), (25, 27), (7, 27)], PAL["wood"], PAL["wood_dark"], 1.2)
    b += poly([(13, 27), (13, 19), (19, 19), (19, 27)], PAL["wood_dark"])
    for x in (8, 24):
        b += line((x, 27), (x, 30), PAL["stone_dark"], 2.4)
    return svg(32, 32, b)


def icon_house() -> str:
    b = poly([(3, 16), (16, 4), (29, 16)], PAL["thatch"], PAL["thatch_line"], 1.2)
    b += poly([(7, 15), (25, 15), (25, 28), (7, 28)], PAL["plaster"], PAL["timber"], 1.2)
    b += line((7, 21), (25, 21), PAL["timber"], 1.4) + line((16, 15), (16, 28), PAL["timber"], 1.4)
    b += poly([(18.5, 28), (18.5, 22), (23, 22), (23, 28)], PAL["wood_shade"], PAL["timber"], 0.8)
    b += poly([(9, 19.5), (13.5, 19.5), (13.5, 16.5), (9, 16.5)], "#e2a54b", PAL["timber"], 0.8)
    return svg(32, 32, b)


def icon_scroll() -> str:
    b = poly([(7, 6), (25, 6), (25, 26), (7, 26)], PAL["parch"], PAL["parch_dark"], 1)
    b += ellipse(7, 6, 3, 3, PAL["parch_dark"]) + ellipse(25, 26, 3, 3, PAL["parch_dark"])
    for y in (11, 15, 19):
        b += line((10, y), (22, y), PAL["clay_dark"], 1.2, op=0.8)
    b += ellipse(19, 22.5, 3, 3, PAL["oxblood"], PAL["oxblood_dark"], 0.8)
    return svg(32, 32, b)


def icon_crown() -> str:
    b = poly([(5, 24), (4, 10), (10, 16), (16, 6), (22, 16), (28, 10), (27, 24)], PAL["gold"], PAL["gold_dark"], 1.2)
    b += poly([(5, 24), (27, 24), (27, 28), (5, 28)], PAL["gold_dark"])
    for x, col in ((10, PAL["oxblood"]), (16, "#3b5a7a"), (22, PAL["oxblood"])):
        b += ellipse(x, 21, 1.8, 1.8, col)
    return svg(32, 32, b)


def icon_wood() -> str:
    """Haz de troncos atado con cuerda."""
    b = ""
    for (cx, cy) in ((10, 20), (21, 20), (15.5, 11.5)):
        b += poly([(cx - 9, cy - 4), (cx + 2, cy - 4), (cx + 2, cy + 4), (cx - 9, cy + 4)], PAL["wood"], PAL["wood_dark"], 0.8)
        b += ellipse(cx + 2, cy, 4.2, 4.2, "#b08a5a", PAL["wood_dark"], 0.8)
        b += ellipse(cx + 2, cy, 2.2, 2.2, "none", "#7a5a36", 0.7)
    b += line((6, 26), (6, 6), "#c9a14a", 1.4, op=0.9)
    return svg(32, 32, b)


def icon_stone() -> str:
    """Sillares de piedra apilados."""
    b = poly([(4, 27), (16, 27), (16, 19), (4, 19)], PAL["stone"], PAL["mortar"], 1)
    b += poly([(16, 27), (28, 27), (28, 19), (16, 19)], PAL["stone_light"], PAL["mortar"], 1)
    b += poly([(9, 19), (23, 19), (23, 11), (9, 11)], "#827b67", PAL["mortar"], 1)
    b += poly([(4, 19), (9, 16), (9, 11)], PAL["stone_dark"])
    for (x, y) in ((8, 23), (21, 24), (14, 15)):
        b += ellipse(x, y, 1.6, 0.9, PAL["stone_dark"], op=0.7)
    return svg(32, 32, b)


def icon_iron() -> str:
    """Lingote de hierro forjado."""
    b = poly([(4, 22), (24, 22), (28, 16), (8, 16)], PAL["iron_light"], PAL["iron"], 1)
    b += poly([(4, 22), (24, 22), (24, 27), (4, 27)], "#3a3833", PAL["iron"], 1)
    b += poly([(24, 22), (28, 16), (28, 21), (24, 27)], PAL["iron"], PAL["iron"], 0.8)
    b += line((10, 18.5), (22, 18.5), "#7c7a72", 1, op=0.8)
    b += poly([(6, 12), (20, 12), (23, 8), (9, 8)], PAL["iron_light"], PAL["iron"], 1)
    b += poly([(6, 12), (20, 12), (20, 15), (6, 15)], "#3a3833", PAL["iron"], 0.8)
    return svg(32, 32, b)


# ---------------------------------------------------------------- fase 3a: talleres

def site_marker() -> str:
    """Solar: estacas con cuerda, tablones apilados y una piedra marcada."""
    rnd = random.Random(91)
    w, h = TW, 92
    oy = h - TH
    body = poly(diamond(oy=oy), "#6b5a3a", None, extra=' opacity="0.35"')
    corners = [tile_point(0.18, 0.18, oy), tile_point(0.82, 0.18, oy), tile_point(0.82, 0.82, oy), tile_point(0.18, 0.82, oy)]
    for i in range(4):
        a, c = corners[i], corners[(i + 1) % 4]
        body += line((a[0], a[1] - 12), (c[0], c[1] - 12), "#c2a676", 1.1, op=0.9)
    for (x, y) in corners:
        body += line((x, y), (x, y - 16), PAL["wood_dark"], 2.6)
        body += line((x - 1, y - 16), (x + 1, y - 18), PAL["wood"], 2)
    # tablones y sillares esperando
    px, py = tile_point(0.42, 0.55, oy)
    for k in range(3):
        body += poly([(px - 16, py - k * 4), (px + 10, py + 9 - k * 4), (px + 14, py + 7 - k * 4), (px - 12, py - 2 - k * 4)], rnd.choice([PAL["wood"], "#7a5a36"]), PAL["wood_dark"], 0.8)
    sx, sy = tile_point(0.62, 0.38, oy)
    body += poly([(sx - 8, sy), (sx + 6, sy + 5), (sx + 6, sy - 5), (sx - 8, sy - 10)], PAL["stone"], PAL["mortar"], 0.8)
    body += poly([(sx + 6, sy + 5), (sx + 12, sy + 2), (sx + 12, sy - 8), (sx + 6, sy - 5)], PAL["stone_dark"], PAL["mortar"], 0.8)
    return svg(w, h, body)


def windmill() -> str:
    """Molino de viento de torre de piedra con aspas de lona."""
    rnd = random.Random(101)
    w, h = 170, 230
    cx, by = w / 2, h - 6
    body = ellipse(cx, h - 26, 54, 20, PAL["shadow"])
    # torre troncoconica de piedra
    bw, tw_, th = 34, 22, 110
    tower = f'M{cx - bw},{by - 18} L{cx - tw_},{by - 18 - th} L{cx + tw_},{by - 18 - th} L{cx + bw},{by - 18} Q{cx},{by + 2} {cx - bw},{by - 18} Z'
    body += f'<path d="{tower}" fill="{PAL["stone"]}" stroke="{PAL["mortar"]}" stroke-width="1.2"/>'
    body += f'<path d="M{cx + 4},{by - 8} L{cx + tw_ * 0.4},{by - 18 - th} L{cx + tw_},{by - 18 - th} L{cx + bw},{by - 18} Q{cx + 20},{by - 6} {cx + 4},{by - 8} Z" fill="{PAL["stone_dark"]}" opacity="0.8"/>'
    for r in range(7):
        y = by - 26 - r * 15
        f = r / 7
        half = bw - (bw - tw_) * f
        body += line((cx - half + 2, y), (cx + half - 2, y + 3), PAL["mortar"], 0.8, op=0.6)
        for k in range(3):
            x = cx - half + 6 + k * half * 0.6 + rnd.uniform(-2, 2)
            body += line((x, y), (x, y - 13), PAL["mortar"], 0.6, op=0.4)
    body += poly([(cx - 6, by - 10), (cx + 8, by - 8), (cx + 8, by - 34), (cx - 6, by - 36)], PAL["wood_shade"], PAL["timber"], 1.2)
    body += poly([(cx - 14, by - 74), (cx - 4, by - 73), (cx - 4, by - 86), (cx - 14, by - 87)], "#e2a54b", PAL["timber"], 1)
    # caperuza de tablillas
    top = by - 18 - th
    body += f'<path d="M{cx - tw_ - 6},{top + 4} Q{cx},{top - 44} {cx + tw_ + 6},{top + 4} Z" fill="{PAL["shingle"]}" stroke="{PAL["wood_dark"]}" stroke-width="1.2"/>'
    body += f'<path d="M{cx + 2},{top - 18} Q{cx + 16},{top - 14} {cx + tw_ + 6},{top + 4} L{cx + 4},{top + 4} Z" fill="{PAL["shingle_shade"]}" opacity="0.9"/>'
    # aspas en aspa, de madera con lona
    hub = (cx - 2, top - 6)
    for ang in (35, 125, 215, 305):
        a = math.radians(ang)
        tip = (hub[0] + math.cos(a) * 74, hub[1] + math.sin(a) * 74 * 0.92)
        body += line(hub, tip, PAL["wood_dark"], 3)
        # lona a un lado del brazo
        n = (-math.sin(a) * 11, math.cos(a) * 11)
        p0 = (hub[0] + math.cos(a) * 16, hub[1] + math.sin(a) * 16 * 0.92)
        sail = [p0, tip, (tip[0] + n[0], tip[1] + n[1]), (p0[0] + n[0], p0[1] + n[1])]
        body += poly(sail, "#d8c39a", PAL["wood_dark"], 0.9, ' opacity="0.92"')
        for k in range(1, 5):
            q0 = lerp(p0, tip, k / 5)
            body += line(q0, (q0[0] + n[0], q0[1] + n[1]), PAL["wood_shade"], 0.7, op=0.8)
    body += ellipse(hub[0], hub[1], 5, 5, PAL["iron"], PAL["iron_light"], 1)
    return svg(w, h, body)


def bakery() -> str:
    """Horno del pueblo: casa de piedra con horno abombado y humo."""
    rnd = random.Random(111)
    w, h = 160, 170
    cx, by = w / 2, h - 4
    defs = lin_grad("rl", PAL["thatch"], PAL["thatch_shade"]) + lin_grad("rr", PAL["thatch_shade"], "#4f3a18")
    body = ellipse(cx, h - 26, 60, 22, PAL["shadow"])
    box, p = iso_box(2 * cx, by, 46, 23, 40, PAL["stone"], PAL["stone_dark"], PAL["mortar"], 1.2)
    body += box
    body += stone_wall_face(p["l"], p["b"], 40, rnd, 4) + stone_wall_face(p["b"], p["r"], 40, rnd, 4)
    # boca del horno con brasas
    m = lerp(p["l"], p["b"], 0.5)
    body += f'<path d="M{m[0] - 12},{m[1] - 4} L{m[0] - 12},{m[1] - 16} Q{m[0]},{m[1] - 30} {m[0] + 10},{m[1] - 10} L{m[0] + 10},{m[1] + 2} Z" fill="#1a110a" stroke="{PAL["mortar"]}" stroke-width="1.4"/>'
    body += ellipse(m[0] - 1, m[1] - 6, 7, 3.5, "#d9622b", op=0.9)
    body += ellipse(m[0] - 1, m[1] - 7, 4, 2, "#f2b347")
    body += door_on(p["b"], p["r"], 0.25, 0.5, 26)
    body += window_on(p["b"], p["r"], 0.7, 24, 8)
    roof, apex, (L, B, R) = hip_roof(p, 0.2, 36, "url(#rl)", "url(#rr)", PAL["thatch_line"], PAL["thatch_line"], 8)
    body += roof + line(L, B, PAL["thatch_shade"], 3) + line(B, R, "#4f3a18", 3)
    # chimenea gruesa con humo
    c = (apex[0] + 14, apex[1] + 18)
    body += chimney(c, 1.3)
    for k, (dx, r) in enumerate(((2, 6), (8, 8), (4, 10))):
        body += ellipse(c[0] + 9 + dx, c[1] - 34 - k * 13, r, r * 0.8, "#8f8a80", op=0.35 - k * 0.08)
    # panes en una tabla junto a la puerta
    t0 = lerp(p["b"], p["r"], 0.55)
    body += poly([(t0[0] + 4, t0[1] + 6), (t0[0] + 30, t0[1] - 7), (t0[0] + 30, t0[1] - 3), (t0[0] + 4, t0[1] + 10)], PAL["wood"], PAL["wood_dark"], 0.8)
    for k in range(3):
        bx, bym = t0[0] + 9 + k * 8, t0[1] + 3 - k * 4
        body += ellipse(bx, bym, 5, 3, "#b0702f", PAL["clay_dark"], 0.7)
    return svg(w, h, body, defs)


def cheesery() -> str:
    """Queseria: casa de entramado con quesos curandose bajo un porche."""
    rnd = random.Random(121)
    w, h = 160, 168
    cx, by = w / 2, h - 4
    defs = lin_grad("wl", PAL["plaster"], PAL["plaster_shade"]) + lin_grad("wr", PAL["plaster_shade"], "#7d6a4b")
    body = ellipse(cx, h - 26, 60, 22, PAL["shadow"])
    box, p = iso_box(2 * cx, by, 46, 23, 44, "url(#wl)", "url(#wr)", PAL["timber"], 1.2)
    body += box
    body += stone_band(p["l"], p["b"], 12, rnd) + stone_band(p["b"], p["r"], 12, rnd)
    body += timber_frame(p, 12, 44, 2.6)
    body += door_on(p["b"], p["r"], 0.15, 0.38, 26)
    body += window_on(p["l"], p["b"], 0.35, 28, 9)
    roof, apex, (L, B, R) = hip_roof(p, 0.22, 34, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], PAL["wood_dark"], 8)
    body += roof
    # porche con estante de quesos
    q0, q1 = lerp(p["b"], p["r"], 0.5), lerp(p["b"], p["r"], 0.95)
    for q in (q0, q1):
        body += line((q[0] + 10, q[1] + 5), (q[0] + 10, q[1] - 30), PAL["wood_dark"], 2.4)
    body += poly([(q0[0] - 2, q0[1] - 32), (q1[0] + 4, q1[1] - 32), (q1[0] + 16, q1[1] - 24), (q0[0] + 10, q0[1] - 24)], PAL["shingle_shade"], PAL["wood_dark"], 1)
    for shelf in (6, 18):
        s0, s1 = (q0[0] + 4, q0[1] - shelf + 2), (q1[0] + 10, q1[1] - shelf + 2)
        body += line(s0, s1, PAL["wood"], 2)
        for k in range(3):
            c = lerp(s0, s1, 0.2 + k * 0.3)
            body += ellipse(c[0], c[1] - 3, 5, 3, "#e0b54e", "#9a6a1e", 0.8)
            body += ellipse(c[0], c[1] - 4.5, 5, 1.6, "#efd27a")
    return svg(w, h, body, defs)


def villager_artisan() -> str:
    w, h = 28, 46
    b = ellipse(14, 43, 8, 2.4, PAL["shadow"])
    b += line((11, 34), (11, 42), PAL["ink"], 2.6) + line((17, 34), (17, 42), PAL["ink"], 2.6)
    b += f'<path d="M6 36 C6 24 8 19 14 19 C20 19 22 24 22 36 Z" fill="#4c4f5a" stroke="{PAL["timber"]}" stroke-width="1"/>'
    b += f'<path d="M9 23 L19 23 L19 37 L9 37 Z" fill="#c9b48a" stroke="{PAL["timber"]}" stroke-width="0.8"/>'
    b += ellipse(14, 14, 4.6, 5, "#d8b48a", PAL["timber"], 0.8)
    b += f'<path d="M9 12 C9 7 19 7 19 12 Z" fill="#7a1d14"/>'
    b += line((22, 28), (25, 18), PAL["wood_dark"], 1.8)
    b += poly([(22.5, 15), (28, 17), (27, 20.5), (21.5, 18.5)], PAL["iron_light"], PAL["iron"], 0.7)
    return svg(w, h, b)


def icon_flour() -> str:
    b = '<path d="M9 9 C7 14 6 22 8 28 L24 28 C26 22 25 14 23 9 Z" fill="#e3d7bd" stroke="#8a7350" stroke-width="1.1"/>'
    b += '<path d="M9 9 C12 6 20 6 23 9 C20 11 12 11 9 9 Z" fill="#cdbf9f" stroke="#8a7350" stroke-width="1"/>'
    b += line((10, 11), (22, 11), PAL["clay_dark"], 1.6)
    b += f'<path d="M13 17 L19 17 M16 14 L16 22" stroke="{PAL["oxblood"]}" stroke-width="1.6"/>'
    return svg(32, 32, b)


def icon_bread() -> str:
    b = '<path d="M4 20 C4 11 12 8 16 8 C20 8 28 11 28 20 C28 24 24 25 16 25 C8 25 4 24 4 20 Z" fill="#b8742f" stroke="#5c331d" stroke-width="1.2"/>'
    b += '<path d="M6 19 C8 13 13 11 16 11 C19 11 24 13 26 19" fill="none" stroke="#d99a4e" stroke-width="2" opacity="0.7"/>'
    for x in (11, 16, 21):
        b += line((x - 2, 13), (x + 2, 18), "#5c331d", 1.4)
    return svg(32, 32, b)


def icon_cheese() -> str:
    b = '<path d="M3 21 L18 9 L29 15 L29 23 L14 27 L3 23 Z" fill="#e0b54e" stroke="#7d5b1b" stroke-width="1.1"/>'
    b += '<path d="M3 21 L14 25 L29 15 L18 9 Z" fill="#efd27a" stroke="#7d5b1b" stroke-width="0.9"/>'
    b += '<path d="M14 25 L14 27" stroke="#7d5b1b" stroke-width="1"/>'
    for (x, y, r) in ((19, 21, 1.6), (24, 20, 1.2), (9, 22, 1.1), (20, 14, 1.2)):
        b += ellipse(x, y, r, r * 0.7, "#b8892e")
    return svg(32, 32, b)


# ---------------------------------------------------------------- fase 3b: comercio

def cart_sprite() -> str:
    """Carreta de dos ruedas cargada de sacos, con lona y varas."""
    w, h = 110, 84
    b = ellipse(56, 76, 40, 8, PAL["shadow"])
    # varas
    b += line((70, 58), (104, 44), PAL["wood_dark"], 3) + line((62, 62), (98, 48), PAL["wood_dark"], 3)
    # caja
    b += poly([(18, 52), (74, 66), (74, 50), (18, 36)], PAL["wood"], PAL["wood_dark"], 1.2)
    b += poly([(74, 66), (86, 58), (86, 42), (74, 50)], PAL["wood_shade"], PAL["wood_dark"], 1.2)
    for k in range(1, 4):
        b += line((18, 36 + k * 4), (74, 50 + k * 4), PAL["wood_dark"], 0.8, op=0.7)
    # carga con lona
    b += '<path d="M20 38 C24 18 70 24 84 42 L74 50 L18 36 Z" fill="#c2a676" stroke="#5c4228" stroke-width="1.1"/>'
    b += '<path d="M40 30 C44 24 60 26 66 34" fill="none" stroke="#8a7350" stroke-width="1" opacity="0.8"/>'
    b += ellipse(30, 30, 7, 6, "#a68a5a", PAL["wood_dark"], 0.9)
    b += line((26, 38), (78, 48), PAL["clay_dark"], 1.4)
    # rueda
    b += ellipse(50, 64, 13, 13, "none", PAL["wood_dark"], 3.2)
    b += ellipse(50, 64, 13, 13, "none", PAL["iron"], 1)
    for a in range(0, 180, 45):
        r = math.radians(a)
        b += line((50 - math.cos(r) * 12, 64 - math.sin(r) * 12), (50 + math.cos(r) * 12, 64 + math.sin(r) * 12), PAL["wood_dark"], 1.6)
    b += ellipse(50, 64, 2.5, 2.5, PAL["iron"])
    return svg(w, h, b)


def stall_sprite() -> str:
    """Puesto propio: mostrador con toldo verde y ocre y un pendon."""
    w, h = 110, 110
    b = ellipse(55, 96, 40, 12, PAL["shadow"])
    b += poly([(18, 78), (55, 96), (92, 78), (92, 66), (55, 84), (18, 66)], PAL["wood"], PAL["wood_dark"], 1.2)
    b += poly([(18, 66), (55, 84), (92, 66), (55, 50)], "#5a3e24", PAL["wood_dark"], 1)
    for (x, y, c) in ((38, 66, "#e0b54e"), (52, 70, "#b8742f"), (66, 66, "#e3d7bd"), (48, 62, "#7d9a5c")):
        b += ellipse(x, y, 6, 3.6, c, PAL["wood_dark"], 0.8)
    for x in (20, 90):
        b += line((x, 70), (x, 30), PAL["wood_dark"], 2.4)
    b += poly([(12, 34), (55, 18), (98, 34), (55, 50)], "#3d5a2a", PAL["wood_dark"], 1.2)
    for k in range(4):
        f = (k + 0.5) / 4
        b += line((12 + 43 * f, 34 - 16 * f), (12 + 43 * f + 43 * 0.0, 34 - 16 * f + 16), "#b48a3c", 5, "butt", op=0.85)
    b += line((55, 18), (55, 4), PAL["wood_dark"], 1.8)
    b += poly([(55, 5), (70, 9), (55, 14)], PAL["oxblood"], PAL["oxblood_dark"], 0.8)
    return svg(w, h, b)


def icon_cart() -> str:
    b = poly([(3, 18), (22, 18), (22, 10), (3, 10)], PAL["wood"], PAL["wood_dark"], 1)
    b += '<path d="M4 11 C6 4 18 4 21 11 Z" fill="#c2a676" stroke="#5c4228" stroke-width="1"/>'
    b += line((22, 16), (30, 13), PAL["wood_dark"], 2)
    b += ellipse(12, 22, 6, 6, "none", PAL["wood_dark"], 2.4)
    b += line((6, 22), (18, 22), PAL["wood_dark"], 1.2) + line((12, 16), (12, 28), PAL["wood_dark"], 1.2)
    return svg(32, 32, b)


# ---------------------------------------------------------------- fase 3c: nobleza

def crenels(a, c, height, n, depth=7, fill=None, outline=None):
    """Almenas a lo largo de la arista a-c a la altura `height`."""
    fill = fill or PAL["stone"]
    outline = outline or PAL["mortar"]
    out = ""
    for k in range(n):
        if k % 2:
            continue
        p0, p1 = lerp(a, c, k / n), lerp(a, c, (k + 1) / n)
        out += poly([(p0[0], p0[1] - height), (p1[0], p1[1] - height), (p1[0], p1[1] - height - depth), (p0[0], p0[1] - height - depth)], fill, outline, 0.8)
    return out


def banner(base, h=34, flip=False, col=None):
    col = col or PAL["oxblood"]
    x, y = base
    d = -1 if flip else 1
    out = line((x, y), (x, y - h), PAL["wood_dark"], 2.2)
    out += poly([(x, y - h + 1), (x + 18 * d, y - h + 4), (x + 15 * d, y - h + 9), (x + 18 * d, y - h + 14), (x, y - h + 13)], col, PAL["oxblood_dark"], 0.9)
    out += line((x + 3 * d, y - h + 7.5), (x + 11 * d, y - h + 8.5), PAL["gold"], 1.4, op=0.9)
    return out


def stone_box(cx, by, hw, hh, wall, rnd, rows=5):
    box, p = iso_box_c(cx, by, hw, hh, wall, PAL["stone"], PAL["stone_dark"], PAL["mortar"], 1.1)
    out = box + stone_wall_face(p["l"], p["b"], wall, rnd, rows) + stone_wall_face(p["b"], p["r"], wall, rnd, rows)
    # sombra en la cara derecha
    out += poly([p["b"], p["r"], p["R"], p["B"]], "rgba(20,16,10,0.28)")
    return out, p


def keep_tower(cx, by, rnd):
    """Torre del homenaje cuadrada con almenas y estandarte."""
    out, p = stone_box(cx, by, 26, 13, 150, rnd, 11)
    for f in (0.35, 0.65):
        out += window_on(p["l"], p["b"], f, 100, 6, False)
    out += window_on(p["b"], p["r"], 0.5, 112, 6, True)
    # plataforma superior y almenas
    out += poly([p["L"], p["B"], p["R"], p["T"]], PAL["stone_dark"], PAL["mortar"], 1)
    out += crenels(p["l"], p["b"], 150, 7) + crenels(p["b"], p["r"], 150, 7)
    out += banner((p["T"][0] + 2, p["T"][1] + 10), 40)
    return out, p


def chapel(cx, by, rnd):
    """Capilla de piedra con espadana y campana."""
    out, p = stone_box(cx, by, 26, 13, 46, rnd, 4)
    out += door_on(p["b"], p["r"], 0.35, 0.65, 24, PAL["wood_dark"])
    out += window_on(p["l"], p["b"], 0.5, 22, 7, True)
    roof, apex, _ = hip_roof(p, 0.12, 40, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], None)
    out += roof
    # espadana con campana
    bx, byy = apex[0], apex[1] + 8
    out += poly([(bx - 8, byy), (bx + 8, byy), (bx + 8, byy - 22), (bx, byy - 30), (bx - 8, byy - 22)], PAL["stone_light"], PAL["mortar"], 1)
    out += poly([(bx - 4, byy - 6), (bx + 4, byy - 6), (bx + 4, byy - 16), (bx - 4, byy - 16)], PAL["ink"])
    out += ellipse(bx, byy - 9, 3, 3.4, PAL["gold_dark"], PAL["gold"], 0.6)
    out += line((bx, byy - 30), (bx, byy - 40), PAL["iron"], 1.6) + line((bx - 4, byy - 36), (bx + 4, byy - 36), PAL["iron"], 1.6)
    return out, p


def manor_hall(cx, by, rnd, big=False):
    """Casa solariega de piedra de dos plantas con tejado de pizarra."""
    hw, hh, wall = (60, 30, 84) if big else (56, 28, 78)
    out, p = stone_box(cx, by, hw, hh, wall, rnd, 7)
    out += line((p["l"][0], p["l"][1] - 40), (p["b"][0], p["b"][1] - 40), PAL["stone_dark"], 3)
    out += line((p["b"][0], p["b"][1] - 40), (p["r"][0], p["r"][1] - 40), PAL["stone_dark"], 3)
    out += door_on(p["b"], p["r"], 0.18, 0.4, 32, PAL["oxblood_dark"])
    # escudo sobre la puerta
    d = lerp(p["b"], p["r"], 0.29)
    out += f'<path d="M{d[0] - 6},{d[1] - 44} h12 v6 c0 5 -6 8 -6 8 c0 0 -6 -3 -6 -8 Z" fill="{PAL["oxblood"]}" stroke="{PAL["gold"]}" stroke-width="1.2"/>'
    for f in (0.2, 0.5, 0.8):
        out += window_on(p["l"], p["b"], f, 54, 9, True)
    out += window_on(p["l"], p["b"], 0.5, 14, 8, False)
    for f in (0.6, 0.85):
        out += window_on(p["b"], p["r"], f, 54, 9, True)
    out += window_on(p["b"], p["r"], 0.7, 14, 8, False)
    roof, apex, (L, B, R) = hip_roof(p, 0.14, 56, "url(#ml)", "url(#mr)", PAL["ink"], "#1a1d22", 12)
    out += roof + line(L, B, "#2b2f36", 2.6) + line(B, R, "#15171b", 2.6)
    out += chimney((apex[0] + 24, apex[1] + 26), 1.2) + chimney((apex[0] - 34, apex[1] + 34), 1.0)
    out += banner((apex[0], apex[1] + 3), 36)
    return out, p


def curtain_wall(cx, by, hw, hh, rnd, height=30):
    """Muralla baja almenada en las dos aristas traseras del recinto."""
    l = (cx - hw, by - hh)
    t = (cx, by - 2 * hh)
    r = (cx + hw, by - hh)
    out = stone_wall_face(l, t, height, rnd, 3) + stone_wall_face(t, r, height, rnd, 3)
    out += poly([(t[0], t[1]), (r[0], r[1]), (r[0], r[1] - height), (t[0], t[1] - height)], "rgba(20,16,10,0.25)")
    out += crenels(l, t, height, 13) + crenels(t, r, height, 13)
    # torrecillas en las esquinas
    for q in (l, t, r):
        out += poly([(q[0] - 8, q[1] + 4), (q[0] + 8, q[1] + 4), (q[0] + 8, q[1] - height - 12), (q[0] - 8, q[1] - height - 12)], PAL["stone"], PAL["mortar"], 1)
        out += poly([(q[0], q[1] + 4), (q[0] + 8, q[1] + 4), (q[0] + 8, q[1] - height - 12), (q[0], q[1] - height - 12)], PAL["stone_dark"], None)
        for dx in (-8, 2):
            out += poly([(q[0] + dx, q[1] - height - 12), (q[0] + dx + 6, q[1] - height - 12), (q[0] + dx + 6, q[1] - height - 18), (q[0] + dx, q[1] - height - 18)], PAL["stone_light"], PAL["mortar"], 0.8)
    return out


def manor_stage(stage: int) -> str:
    """Casa solariega: 0 solar con ruinas, 1 casa, 2 con muralla y capilla, 3 con torre del homenaje."""
    rnd = random.Random(300 + stage)
    if stage == 0:
        w, h = TW + 20, 120
        oy = h - TH
        cx = w / 2
        body = poly([(cx + x - TW / 2, y) for x, y in diamond(oy=oy)], "#4c4a36", None, ' opacity="0.45"')
        # restos de muros viejos y un estandarte del nuevo senor
        for (u0, v0, u1, v1, hgt) in ((0.15, 0.2, 0.15, 0.7, 16), (0.15, 0.2, 0.6, 0.2, 22), (0.6, 0.2, 0.75, 0.2, 9)):
            a = tile_point(u0, v0, oy)
            c = tile_point(u1, v1, oy)
            a, c = (a[0] + 10, a[1]), (c[0] + 10, c[1])
            body += stone_wall_face(a, c, hgt, rnd, 2)
        for _ in range(18):
            x, y = tile_point(rnd.uniform(0.1, 0.9), rnd.uniform(0.1, 0.9), oy)
            for dx in (-2, 0, 2):
                body += line((x + 10 + dx * 0.4, y), (x + 10 + dx, y - rnd.uniform(4, 9)), rnd.choice(["#3e4a26", "#56663a", "#6c7a45"]), 1.1)
        bx, byy = tile_point(0.62, 0.62, oy)
        body += banner((bx + 10, byy), 52)
        return svg(int(w), h, body)
    w, h = {1: (210, 236), 2: (260, 262), 3: (270, 300)}[stage]
    cx, by = w / 2, h - 6
    defs = lin_grad("ml", "#4a4f57", "#30343a") + lin_grad("mr", "#2a2d33", "#1b1d21")
    body = ellipse(cx, h - 30, w * 0.42, 26, PAL["shadow"])
    if stage >= 2:
        body += curtain_wall(cx, by + 4, w * 0.46, w * 0.23, rnd)
    if stage >= 3:
        k, _ = keep_tower(cx + 54, by - 70, rnd)
        body += k
    if stage >= 2:
        c, _ = chapel(cx - 62, by - 30, rnd)
        body += c
    hall, _ = manor_hall(cx + (6 if stage >= 2 else 0), by, rnd, big=stage >= 3)
    body += hall
    if stage >= 2:
        # tramos delanteros de la muralla, bajos para no tapar la casa
        l = (cx - w * 0.46, by + 4 - w * 0.23)
        b = (cx, by + 4)
        r = (cx + w * 0.46, by + 4 - w * 0.23)
        for (a0, a1) in ((lerp(l, b, 0.0), lerp(l, b, 0.42)), (lerp(b, r, 0.58), lerp(b, r, 1.0))):
            body += stone_wall_face(a0, a1, 16, rnd, 2) + crenels(a0, a1, 16, 5, 5)
    return svg(w, h, body, defs)


def hut(cx, by, rnd, kind="thatch", ruined=False, size=1.0):
    hw, hh, wall = 20 * size, 10 * size, 18 * size
    if ruined:
        box, p = iso_box_c(cx, by, hw, hh, wall * 0.7, "#6b604a", "#4f4636", PAL["timber"], 1)
        out = box
        out += poly([p["L"], (lerp(p["L"], p["B"], 0.5)[0], lerp(p["L"], p["B"], 0.5)[1] - 10), p["B"]], "#3a2d1c", PAL["timber"], 0.8)
        out += line(p["B"], (p["B"][0] + 8, p["B"][1] - 14), PAL["wood_dark"], 2)
        out += line(p["L"], (p["L"][0] + 14, p["L"][1] - 18), PAL["wood_dark"], 2)
        return out
    fills = ("url(#wl)", "url(#wr)") if kind == "thatch" else (PAL["stone"], PAL["stone_dark"])
    box, p = iso_box_c(cx, by, hw, hh, wall, fills[0], fills[1], PAL["timber"], 1)
    out = box
    if kind == "thatch":
        out += timber_frame(p, 0, wall, 1.6)
        roof, _, _ = hip_roof(p, 0.22, 20 * size, "url(#rl)", "url(#rr)", PAL["thatch_line"], PAL["thatch_line"], 5)
    else:
        out += stone_wall_face(p["l"], p["b"], wall, rnd, 2) + stone_wall_face(p["b"], p["r"], wall, rnd, 2)
        roof, _, _ = hip_roof(p, 0.18, 20 * size, PAL["shingle"], PAL["shingle_shade"], PAL["wood_dark"], None)
    out += door_on(p["b"], p["r"], 0.35, 0.65, 11 * size)
    return out + roof


def hamlet_prop(kind, x, y, rnd):
    out = ""
    if kind == "wood":
        # troncos apilados y tocon con hacha
        for k, (dx, dy) in enumerate(((0, 0), (9, 3), (4.5, -5))):
            out += poly([(x + dx - 14, y + dy - 4), (x + dx, y + dy + 2), (x + dx, y + dy + 8), (x + dx - 14, y + dy + 2)], PAL["wood"], PAL["wood_dark"], 0.8)
            out += ellipse(x + dx, y + dy + 5, 3.4, 3.4, "#b08a5a", PAL["wood_dark"], 0.8)
        out += ellipse(x + 22, y + 8, 6, 3, "#8a6a44", PAL["wood_dark"], 0.8)
        out += line((x + 20, y + 6), (x + 27, y - 6), PAL["wood_dark"], 1.6)
        out += poly([(x + 25, y - 8), (x + 31, y - 7), (x + 29, y - 3)], PAL["iron_light"], PAL["iron"], 0.6)
    elif kind == "stone":
        for (dx, dy, s) in ((0, 0, 1.0), (12, 4, 0.8), (6, -6, 0.7), (-10, 5, 0.6)):
            out += poly([(x + dx - 8 * s, y + dy), (x + dx + 6 * s, y + dy + 5 * s), (x + dx + 6 * s, y + dy - 5 * s), (x + dx - 8 * s, y + dy - 10 * s)], PAL["stone_light"], PAL["mortar"], 0.8)
            out += poly([(x + dx + 6 * s, y + dy + 5 * s), (x + dx + 11 * s, y + dy + 2 * s), (x + dx + 11 * s, y + dy - 8 * s), (x + dx + 6 * s, y + dy - 5 * s)], PAL["stone_dark"], PAL["mortar"], 0.8)
        out += line((x - 16, y + 10), (x - 6, y - 10), PAL["wood_dark"], 1.6)
    else:
        # bocamina en un monticulo y vagoneta con mineral
        out += f'<path d="M{x - 26},{y + 8} Q{x - 6},{y - 30} {x + 18},{y + 8} Z" fill="#4a4434" stroke="#2c281e" stroke-width="1"/>'
        out += poly([(x - 10, y + 6), (x + 2, y + 6), (x + 2, y - 10), (x - 10, y - 10)], PAL["ink"])
        out += line((x - 12, y + 6), (x - 12, y - 12), PAL["wood"], 2.4) + line((x + 4, y + 6), (x + 4, y - 12), PAL["wood"], 2.4)
        out += line((x - 14, y - 12), (x + 6, y - 12), PAL["wood"], 2.6)
        out += poly([(x + 14, y + 10), (x + 28, y + 14), (x + 30, y + 6), (x + 16, y + 2)], PAL["iron_light"], PAL["iron"], 0.8)
        for (dx, dy) in ((19, 3), (24, 5), (21, 0)):
            out += ellipse(x + dx, y + dy, 2.6, 2, "#3a3833", PAL["iron"], 0.5)
    return out


def hamlet_stage(material: str, stage: int) -> str:
    """Aldea vasalla: 0 abandonada, 1-3 cada vez con mas casas."""
    rnd = random.Random(400 + stage * 7 + len(material))
    w, h = TW + 24, 130
    oy = h - TH
    ox = 12
    defs = lin_grad("wl", PAL["plaster"], PAL["plaster_shade"]) + lin_grad("wr", PAL["plaster_shade"], "#7d6a4b")
    defs += lin_grad("rl", PAL["thatch"], PAL["thatch_shade"]) + lin_grad("rr", PAL["thatch_shade"], "#4f3a18")
    tp = lambda u, v: (tile_point(u, v, oy)[0] + ox, tile_point(u, v, oy)[1])
    body = poly([(x + ox, y) for x, y in diamond(oy=oy)], "#5b4a30", None, ' opacity="0.35"')
    spots = [(0.28, 0.3, "thatch"), (0.72, 0.32, "thatch"), (0.3, 0.72, "thatch"), (0.7, 0.7, "stone")]
    n = {0: 2, 1: 2, 2: 3, 3: 4}[stage]
    items = []
    for (u, v, kind) in spots[:n]:
        x, y = tp(u, v)
        items.append((y, hut(x, y + 9, rnd, kind if stage == 3 else "thatch", ruined=stage == 0, size=0.9 if stage < 3 else 1.0)))
    px, py = tp(0.55, 0.52)
    items.append((py, hamlet_prop(material, px, py, rnd) if stage > 0 else ""))
    if stage >= 2:
        # cerca de estacas
        a, c = tp(0.05, 0.95), tp(0.95, 0.95)
        fence = line((a[0], a[1] - 8), (c[0], c[1] - 8), PAL["wood_dark"], 1.6)
        for k in range(9):
            q = lerp(a, c, k / 8)
            fence += line(q, (q[0], q[1] - 12), PAL["wood_dark"], 2)
        items.append((c[1] + 1, fence))
    if stage >= 1:
        bx, byy = tp(0.12, 0.5)
        items.append((byy, banner((bx, byy), 30)))
    if stage == 0:
        for _ in range(16):
            x, y = tp(rnd.uniform(0.1, 0.9), rnd.uniform(0.1, 0.9))
            items.append((y, line((x, y), (x + rnd.uniform(-2, 2), y - rnd.uniform(5, 10)), rnd.choice(["#3e4a26", "#56663a"]), 1.2)))
    for _, frag in sorted(items, key=lambda it: it[0]):
        body += frag
    return svg(w, h, body, defs)


def villager_soldier() -> str:
    w, h = 30, 50
    b = ellipse(15, 47, 8, 2.4, PAL["shadow"])
    b += line((12, 37), (12, 46), PAL["ink"], 2.6) + line((18, 37), (18, 46), PAL["ink"], 2.6)
    b += f'<path d="M7 39 C7 26 9 21 15 21 C21 21 23 26 23 39 Z" fill="#5d5f63" stroke="{PAL["timber"]}" stroke-width="1"/>'
    b += f'<path d="M10 23 L20 23 L20 40 L15 42 L10 40 Z" fill="{PAL["oxblood"]}" stroke="{PAL["oxblood_dark"]}" stroke-width="0.8"/>'
    b += line((12, 30), (18, 30), PAL["gold"], 1.2)
    b += ellipse(15, 16, 4.4, 4.8, "#d8b48a", PAL["timber"], 0.8)
    b += ellipse(15, 12, 8, 2.2, PAL["iron_light"], PAL["iron"], 0.8)
    b += f'<path d="M10 12 C10 6 20 6 20 12 Z" fill="{PAL["iron_light"]}" stroke="{PAL["iron"]}" stroke-width="0.8"/>'
    b += line((25, 4), (24, 46), PAL["wood_dark"], 1.8)
    b += poly([(23.5, 0.5), (26.5, 0.8), (25, 6)], PAL["iron_light"], PAL["iron"], 0.6)
    b += ellipse(6.5, 31, 5.4, 6.4, "#6a4a2c", PAL["iron"], 1.2)
    b += ellipse(6.5, 31, 1.6, 1.6, PAL["iron_light"])
    return svg(w, h, b)


def icon_prestige() -> str:
    """Escudo de armas granate con banda dorada."""
    b = f'<path d="M5 4 H27 V15 C27 23 21 27 16 30 C11 27 5 23 5 15 Z" fill="{PAL["oxblood"]}" stroke="{PAL["gold"]}" stroke-width="1.8" stroke-linejoin="round"/>'
    b += f'<path d="M6 8 L26 20 L26 24 L6 12 Z" fill="{PAL["gold"]}" opacity="0.95"/>'
    b += poly([(16, 6.5), (17.4, 9.6), (20.6, 9.8), (18.1, 11.8), (19, 15), (16, 13.2), (13, 15), (13.9, 11.8), (11.4, 9.8), (14.6, 9.6)], PAL["gold_light"])
    return svg(32, 32, b)


def icon_soldier() -> str:
    """Capacete de hierro con lanza."""
    b = line((24, 3), (8, 29), PAL["wood_dark"], 2)
    b += poly([(23, 2), (28, 1), (26, 6)], PAL["iron_light"], PAL["iron"], 0.8)
    b += ellipse(15, 21, 12, 3.4, PAL["iron_light"], PAL["iron"], 1)
    b += f'<path d="M7 20 C7 10 23 10 23 20 Z" fill="{PAL["iron_light"]}" stroke="{PAL["iron"]}" stroke-width="1.1"/>'
    b += line((15, 11.5), (15, 20), "#7c7a72", 1.4)
    b += ellipse(11, 15, 2, 1.4, "#8a8880", op=0.7)
    return svg(32, 32, b)


def icon_charter() -> str:
    """Carta de nobleza con sello de lacre y cintas."""
    b = poly([(5, 5), (25, 5), (25, 22), (5, 22)], PAL["parch"], PAL["parch_dark"], 1)
    b += ellipse(5, 5, 3, 3, PAL["parch_dark"]) + ellipse(25, 22, 3, 3, PAL["parch_dark"])
    for y in (9, 12.5, 16):
        b += line((8.5, y), (21.5, y), PAL["clay_dark"], 1.1, op=0.8)
    b += line((14, 22), (11, 30), PAL["oxblood"], 2) + line((18, 22), (21, 30), PAL["oxblood"], 2)
    b += ellipse(16, 22, 5, 5, PAL["oxblood"], PAL["oxblood_dark"], 1)
    b += poly([(16, 19), (17, 21.5), (19.5, 21.6), (17.5, 23), (18.2, 25.4), (16, 24), (13.8, 25.4), (14.5, 23), (12.5, 21.6), (15, 21.5)], PAL["gold"])
    return svg(32, 32, b)


def icon_manor() -> str:
    """Torre almenada con estandarte."""
    b = poly([(9, 29), (23, 29), (23, 10), (9, 10)], PAL["stone"], PAL["mortar"], 1)
    b += poly([(16, 29), (23, 29), (23, 10), (16, 10)], PAL["stone_dark"])
    for x in (8, 13.5, 19):
        b += poly([(x, 10), (x + 5, 10), (x + 5, 6), (x, 6)], PAL["stone_light"], PAL["mortar"], 0.8)
    b += poly([(13, 29), (19, 29), (19, 21), (16, 18), (13, 21)], PAL["ink"])
    b += line((16, 6), (16, 0.5), PAL["wood_dark"], 1.4)
    b += poly([(16, 1), (24, 2.6), (16, 5)], PAL["oxblood"])
    return svg(32, 32, b)


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
        **{f"carrot_{i}.svg": carrot(i) for i in range(4)},
        **{f"cabbage_{i}.svg": cabbage(i) for i in range(4)},
        **{f"house_{i}.svg": house_stage(i) for i in (1, 2, 3)},
        **{f"granary_{i}.svg": granary(i) for i in (1, 2, 3)},
        **{f"coop_{i}.svg": coop_stage(i) for i in (1, 2, 3)},
        "pen_shed.svg": pen_shed(),
        **{f"villager_{j}.svg": villager(j) for j in ("farmer", "herder", "carter")},
        "wild.svg": wild(),
        "boundary.svg": boundary_stone(),
        "tenant.svg": tenant(),
        "site.svg": site_marker(),
        "cart.svg": cart_sprite(),
        "stall.svg": stall_sprite(),
        "icon_cart.svg": icon_cart(),
        "mill.svg": windmill(),
        "bakery.svg": bakery(),
        "cheesery.svg": cheesery(),
        "villager_artisan.svg": villager_artisan(),
        "icon_flour.svg": icon_flour(),
        "icon_bread.svg": icon_bread(),
        "icon_cheese.svg": icon_cheese(),
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
        "icon_carrot.svg": icon_carrot(),
        "icon_cabbage.svg": icon_cabbage(),
        "icon_worker.svg": icon_worker(),
        "icon_banner.svg": icon_banner(),
        "icon_hammer.svg": icon_hammer(),
        "icon_granary.svg": icon_granary(),
        "icon_house.svg": icon_house(),
        "icon_scroll.svg": icon_scroll(),
        "icon_crown.svg": icon_crown(),
        "icon_wood.svg": icon_wood(),
        "icon_stone.svg": icon_stone(),
        "icon_iron.svg": icon_iron(),
        "bubble.svg": bubble(),
        **{f"manor_{i}.svg": manor_stage(i) for i in range(4)},
        **{f"hamlet_{m}_{i}.svg": hamlet_stage(m, i) for m in ("wood", "stone", "iron") for i in range(4)},
        "villager_soldier.svg": villager_soldier(),
        "icon_prestige.svg": icon_prestige(),
        "icon_soldier.svg": icon_soldier(),
        "icon_charter.svg": icon_charter(),
        "icon_manor.svg": icon_manor(),
    }
    manifest = {}
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
            fh.write(content)
        m = re.search(r'width="([\d.]+)" height="([\d.]+)"', content)
        manifest[name[:-4]] = [float(m.group(1)), float(m.group(2))]
    # Tamano de cada dibujo: lo usan los tests para comprobar que nada se sale de sus casillas.
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(dict(sorted(manifest.items())), fh, indent=1)
        fh.write("\n")
    print(f"{len(files)} sprites escritos en {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
