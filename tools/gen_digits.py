"""
Genera la fuente de cifras del juego (public/assets/fonts/cifras-*.ttf).

Pixelify Sans es la fuente de toda la interfaz, pero sus numeros se confunden a tamano pequeno:
el 5 es casi una S, el 2 parece una S al reves y el 8 una B. Esta fuente solo trae las cifras
0-9, dibujadas en la misma rejilla de pixeles (5x7, el mismo alto y la misma medida que Pixelify)
con formas claras. En el CSS va delante de Pixelify con unicode-range, asi que cualquier numero
de la interfaz sale con estas cifras y las letras siguen siendo Pixelify.

Uso: python3 tools/gen_digits.py
"""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

OUT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'fonts'

# Rejilla de Pixelify Sans: 1000 unidades por em, pixel de ~91 unidades, base en -12.
UPM = 1000
PX = 91
LEFT = 60
BASE = -12

# Cifras en 5x7, de arriba abajo. Esquinas recortadas como en Pixelify; el 5 y el 7 con
# esquina viva arriba para no confundirse con la S y la Z.
GLYPHS = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    # El 1 es estrecho: con el ancho de las demas, "12" se leia "1 2".
    '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
}

# Avance de Pixelify (cinco pixeles mas el espacio). El 1 ocupa tres pixeles: dos menos.
ADVANCE = {'regular': 586, 'bold': 603}
NARROW = 2 * PX
# En negrita cada trazo crece hacia la derecha (como hace Pixelify), sin cerrar los huecos.
GROW = {'regular': 0, 'bold': 34}


def glyph(rows: list[str], grow: int):
    """Contorno de una cifra: un rectangulo por cada tramo seguido de pixeles de una fila."""
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        y0 = BASE + (len(rows) - 1 - r) * PX
        c = 0
        while c < len(row):
            if row[c] != '#':
                c += 1
                continue
            start = c
            while c < len(row) and row[c] == '#':
                c += 1
            x0 = LEFT + start * PX
            x1 = LEFT + c * PX + grow
            # Sentido horario, como los contornos de Pixelify.
            pen.moveTo((x0, y0))
            pen.lineTo((x0, y0 + PX))
            pen.lineTo((x1, y0 + PX))
            pen.lineTo((x1, y0))
            pen.closePath()
    return pen.glyph()


def build(style: str) -> Path:
    names = ['.notdef'] + [f'digit{d}' for d in GLYPHS]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({ord(d): f'digit{d}' for d in GLYPHS})
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    glyphs.update({f'digit{d}': glyph(rows, GROW[style]) for d, rows in GLYPHS.items()})
    fb.setupGlyf(glyphs)
    adv = ADVANCE[style]
    metrics = {'.notdef': (500, 0)}
    for d, rows in GLYPHS.items():
        metrics[f'digit{d}'] = (adv - NARROW if len(rows[0]) == 3 else adv, LEFT)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=920, descent=-280)
    family = 'FMTC Cifras'
    sub = 'Bold' if style == 'bold' else 'Regular'
    fb.setupNameTable({'familyName': family, 'styleName': sub, 'uniqueFontIdentifier': f'{family} {sub}', 'fullName': f'{family} {sub}', 'psName': f'FMTCCifras-{sub}', 'version': 'Version 1.000'})
    fb.setupOS2(
        sTypoAscender=920,
        sTypoDescender=-280,
        usWinAscent=920,
        usWinDescent=280,
        sCapHeight=630,
        sxHeight=450,
        usWeightClass=700 if style == 'bold' else 400,
        fsSelection=0x20 if style == 'bold' else 0x40,
    )
    fb.setupPost()
    fb.updateHead(macStyle=1 if style == 'bold' else 0)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'cifras-{style}.ttf'
    fb.save(path)
    return path


if __name__ == '__main__':
    for s in ('regular', 'bold'):
        p = build(s)
        print(p.relative_to(OUT.parent.parent.parent), p.stat().st_size, 'bytes')
