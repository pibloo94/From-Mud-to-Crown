# From Mud to Crown

Gestor de recursos medieval en 2D isométrico: empiezas como campesino con una casa, una parcela, una vaca y unas gallinas, vendes lo que produces en el mercado y vas ascendiendo hasta la nobleza.

Se juega en el navegador, en ordenador y en móvil, en español e inglés.

## Estado

**Fase 0 · Prototipo.** Mapa isométrico de 10×10, tiempo con pausa y tres velocidades, trigo que crece por fases, gallinas y vaca que producen, mercado con precios fijos y partida guardada en archivo.

El roadmap completo está en el documento de diseño del proyecto.

## Cómo jugar

- **Toca una parcela** de tierra arada para sembrar trigo (2 monedas). Cuando esté dorado, tócala otra vez para cosecharlo.
- **Toca el gallinero** o **el corral** cuando aparezca el globo para recoger huevos o leche.
- **Vende** en el mercado: botón *Mercado* o el puesto rojo y blanco del camino.
- **Tiempo:** ❚❚ pausa y ▶, ▶▶, ▶▶▶ son x1, x2 y x3. En teclado: `espacio` pausa, `1` `2` `3` cambian la velocidad y `M` abre el mercado.
- **Cámara:** arrastra para moverte. Pellizca o usa la rueda del ratón para acercar.

### Partidas guardadas

La partida se guarda en **un archivo `.json` de tu dispositivo** (*Menú → Guardar partida*).

- En Chrome y Edge de escritorio eliges el archivo una vez y después se guarda solo cada 3 días de juego.
- En el resto de navegadores y en móvil, el archivo se descarga y se vuelve a abrir con *Cargar partida*.
- Además, el navegador guarda una copia automática como red de seguridad; aparece como *Continuar* en la pantalla de inicio.

## Desarrollo

Requisitos: Node.js 22.12 o superior.

```bash
npm install
npm run dev        # abre el juego en http://localhost:5173 (también accesible desde el móvil en la misma red)
npm test           # tests de la simulación
npm run build      # versión publicable en dist/
```

Con `?debug` en la URL, la partida queda accesible desde la consola del navegador como `fmtc` (por ejemplo, `fmtc.sim.state`).

### Estructura

```
src/
  data/      contenido del juego en JSON: cultivos, animales, productos, mapa inicial
  sim/       simulación pura (sin Phaser ni DOM): estado, reglas, reloj, calendario
  render/    escena isométrica de Phaser: dibuja el estado y traduce toques en órdenes
  ui/        interfaz HTML encima del lienzo: barra superior, mercado, menús
  i18n/      textos en es.json y en.json
  save/      formato del archivo de partida y guardado en disco
public/assets/sprites/   arte provisional en SVG (generado con tools/gen_sprites.py)
tests/       tests de la simulación, el guardado y el contenido
```

**Regla principal:** la simulación no sabe nada del dibujo. La interfaz y la escena llaman a `Game` (`src/sim/game.ts`), que aplica las reglas y avisa de los cambios.

### Añadir contenido

- **Un cultivo nuevo:** entrada en `src/data/crops.json`, su producto en `products.json`, sus dibujos de crecimiento en `tools/gen_sprites.py` y su nombre en `es.json` y `en.json` (`crop.<id>`, `product.<id>`).
- **Un texto nuevo:** misma clave en `src/i18n/es.json` y `en.json`. Un test comprueba que no falte ninguna.
- **Cambiar el arte:** `python3 tools/gen_sprites.py` regenera los SVG. Para usar otro arte (p. ej. Kenney), sustituye los archivos de `public/assets/sprites/` respetando nombres y anclajes.

### Flujo de trabajo

Cada cambio va en una rama con su pull request. La CI de GitHub instala dependencias, pasa los tests y compila en cada PR.

## Licencias

- Código del juego: MIT (ver `LICENSE`).
- [Phaser](https://phaser.io): MIT. Las skills de `.claude/skills/phaser-*` proceden del repositorio de Phaser (ver `.claude/skills/PHASER-LICENSE.md`).
- Arte provisional: propio, generado por `tools/gen_sprites.py`.
