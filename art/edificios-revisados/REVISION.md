# Revisión de los edificios

Versiones revisadas de los 41 sprites de edificios. Los originales de `public/assets/pixel/` **no se han tocado**. Estas salen del mismo generador:

```
python3 tools/gen_pixel.py --out art/edificios-revisados --only <nombres>
```

Para adoptarlas basta con regenerar sin `--out` (o copiar estos PNG encima de los originales).

Comprobado en todos:
- **Tamaño:** cada sprite mide lo mismo que su original.
- **Nitidez:** sin suavizado. Los únicos valores de transparencia son 0, la sombra (70), el humo (200) y 255.
- **Paleta:** todos los colores salen de la paleta del generador.
- **Contorno:** contorno negro completo y nada pegado al borde del lienzo (el generador lo comprueba).
- **Luz:** cae siempre de arriba a la izquierda. La cara izquierda y el faldón izquierdo del tejado van más claros; la cara derecha y el faldón del fondo, más oscuros.

Comparativas (arriba el original, abajo el revisado, y los dos a tamaño real): [granja](comparativas/granja.png), [feudo](comparativas/feudo.png), [monumentos](comparativas/monumentos.png) y [en el juego](comparativas/en-el-juego.png).

## Archivo por archivo

| Sprite | Cambio |
|---|---|
| house_1, house_2 | Sin cambios: coherentes. |
| house_3 | La planta baja de piedra pasa a los tonos de piedra comunes (cara al sol más clara). |
| granary_1–3 | Sin cambios. |
| coop_1–3 | Sin cambios (el tejado de una sola agua es así por diseño). |
| market, stall, mill, cheesery, loom | Sin cambios. |
| well | Sombra en el suelo que asoma bajo el brocal; el agua usa el color de vanos de la paleta. |
| pen_shed | Tenía sombra: ahora sí, como los demás edificios. |
| bakery | Piedra con los tonos comunes (antes, más oscura que el resto de edificios de piedra). |
| brewery | Piedra con los tonos comunes. Las cubas tenían luz y sombra al revés y se fundían unas con otras: ahora llevan luz a la izquierda, sombra a la derecha, aros de hierro y un canto oscuro que las separa. |
| manor_0 | Sin cambios (solar en ruinas). |
| manor_1 | Mismo dibujo que antes (el hastial liso que pediste se mantiene); solo gana la sombra en el suelo, que el generador calculaba y luego descartaba. |
| manor_2, manor_3 | Sombra en el suelo (el mismo fallo que en manor_1). |
| hamlet_*_0 | Sin cambios (ruinas). |
| hamlet_*_1, hamlet_*_2 | Puertas de las casitas a escala de los aldeanos (antes medían la mitad). |
| hamlet_*_3 | Lo mismo, y además: la capilla solo tenía sillares en media nave; las casas de piedra no tenían ninguno. |
| monument_works_1, _2 | Sin cambios. |
| monument_castle | El patio era un gris liso: ahora está enlosado (rejilla isométrica suave). |
| monument_greatChurch | El conjunto de nave y campanario se centra en su cuadro de 2×2. |
| monument_guildHall | Centrado en su cuadro (estaba 4 px a la izquierda). |
| monument_exchange | Centrado en su cuadro (estaba 4 px a la izquierda). |
| monument_council | Centrado en su cuadro. El olmo era una mancha verde: ahora tiene tronco, copa por bloques y luz arriba a la izquierda, como los robles del mapa. |
