#!/usr/bin/env python3
"""Genera los iconos SVG de la interfaz (y el escudo que flota sobre los animales).

El arte del mapa (pixel art) lo genera tools/gen_pixel.py.

Iconos pequenos (32x32) con colores terrosos y contorno fino, a juego con el pixel art del mapa.

Uso:  python3 tools/gen_sprites.py
Salida: public/assets/sprites/*.svg
"""
from __future__ import annotations

import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "sprites")

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


def icon_cart() -> str:
    b = poly([(3, 18), (22, 18), (22, 10), (3, 10)], PAL["wood"], PAL["wood_dark"], 1)
    b += '<path d="M4 11 C6 4 18 4 21 11 Z" fill="#c2a676" stroke="#5c4228" stroke-width="1"/>'
    b += line((22, 16), (30, 13), PAL["wood_dark"], 2)
    b += ellipse(12, 22, 6, 6, "none", PAL["wood_dark"], 2.4)
    b += line((6, 22), (18, 22), PAL["wood_dark"], 1.2) + line((12, 16), (12, 28), PAL["wood_dark"], 1.2)
    return svg(32, 32, b)


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
    # Solo iconos de la interfaz y el escudo de los animales: el arte del mapa sale de gen_pixel.py.
    files = {
        "icon_cart.svg": icon_cart(),
        "icon_flour.svg": icon_flour(),
        "icon_bread.svg": icon_bread(),
        "icon_cheese.svg": icon_cheese(),
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
        "icon_prestige.svg": icon_prestige(),
        "icon_soldier.svg": icon_soldier(),
        "icon_charter.svg": icon_charter(),
        "icon_manor.svg": icon_manor(),
    }
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
            fh.write(content)
    print(f"{len(files)} sprites escritos en {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
