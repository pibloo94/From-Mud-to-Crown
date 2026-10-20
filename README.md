# From Mud to Crown

Gestor de recursos medieval en 2D isométrico: empiezas como campesino con una casa, una parcela, una vaca y unas gallinas, vendes lo que produces en el mercado y vas ascendiendo hasta la nobleza.

Se juega en el navegador, en ordenador y en móvil, en español e inglés.

## Estado

**Arte en pixel art (estilo D: paleta limitada).** El mapa es una isla isométrica en pixel art de tonos apagados, con cada objeto dibujado a la medida de sus casillas, y la interfaz usa el mismo estilo: marcos de madera y pergamino, botones con relieve, iconos y sellos en píxel, y fuentes en píxel (Jacquard 24 y Pixelify Sans). Antes, la fase 3 completa: talleres, comercio, nobleza, tutorial y sonido.

**Fase 2 · La aldea.** Sobre la progresión de la fase 1 se añaden aldeanos con oficio y herramientas, mejoras de cada edificio (casa, granero, gallinero y corral) que se ven en el mapa, un granero con capacidad limitada, reputación con el barón y la aldea, impuestos cada estación, 21 eventos (ofertas, obligaciones y percances), el rango de Terrateniente con las tierras del este y la pantalla de *Progreso*.

El roadmap completo está en el documento de diseño del proyecto.

## Cómo jugar

- **Tutorial:** una partida nueva empieza con unos pasos guiados (sembrar, recoger, cosechar, vender y mirar el progreso) que avanzan solos al hacerlos; se puede saltar. Después, cada vez que llega algo nuevo aparece un consejo breve. Desde el menú se repite el tutorial o se apagan los consejos.
- **Siembra** tocando una parcela de tierra arada. Si tienes varios cultivos disponibles, eliges cuál. Cuando esté maduro, tócala otra vez para cosechar.
- **Recoge** huevos y leche tocando el gallinero o el corral cuando aparezca el escudo con un número.
- **Vende** en el mercado (botón *Mercado* o el puesto del camino): eliges la cantidad con la barra de cada producto. Los precios cambian cada semana y con la estación: ▲ por encima de lo habitual, ▼ por debajo.
- **Materiales:** en la pestaña *Comprar* del mercado hay madera, piedra y hierro (este, desde el nivel 4). Las mejoras de edificios y las herramientas piden monedas y materiales; desde el propio panel puedes comprar de una vez lo que falta. Se guardan en un almacén aparte, sin ocupar el granero.
- **Sube de nivel** cosechando, recogiendo y vendiendo. Cada nivel desbloquea algo: tierra nueva (nivel 2), zanahorias (3), gallinas (4), vacas y el rango de Granjero libre (5), coles (6), además de mejoras de edificios y herramientas. La pantalla **Progreso** (botón inferior o tocando el escudo de nivel) muestra qué llega en cada nivel y dónde se usa.
- **Edificios:** toca la casa, el granero, el gallinero o el corral para ver y comprar sus mejoras. La casa da camas; el granero, sitio para guardar (si se llena, no se puede cosechar); el gallinero y el corral, más animales y más producción.
- **Aldeanos:** en la casa, pestaña *Aldeanos*. Cada uno necesita una cama y come una ración al día; si pasan hambre, se marchan. Oficios: **labrador** (siembra y cosecha solo sus parcelas con el cultivo que le asignes, o en automático lo que más deja en temporada, y hace que todo crezca más rápido), **pastor** (más huevos y leche, y los recoge solo) y **carretero** (vende lo que sobra cada semana). Cada uno lleva su herramienta: madera, hierro y acero, cada vez más cara y más eficaz; un labrador con mejor herramienta trabaja más parcelas.
- **Despensa:** en el granero, pestaña *Despensa*. Eliges qué productos pueden comer los aldeanos (comen primero lo más barato) y cuántos días de comida se reservan. El mercado avisa si vas a vender la reserva y el carretero no la toca.
- **Impuestos:** al empezar cada estación pagas el diezmo (10 % de lo vendido) y el tributo al barón (según tus parcelas y tu rango). La primera estación es gratis. Lo que no puedas pagar enfada al barón.
- **Reputación:** el barón y la aldea recuerdan lo que haces. Con el barón por debajo de 30 pagas más tributo; con la aldea en 70 o más, contratar cuesta la mitad.
- **Talleres:** desde el nivel 9 se levantan en los tres solares del mapa (estacas con cuerda): molino (trigo → harina), horno (harina y huevo → pan) y quesería (leche → queso). Cada uno necesita un aldeano artesano; la herramienta y las mejoras del taller dan más tandas al día. Nunca gastan la reserva de la despensa.
- **Artesano:** título de rama (nivel 12 y dos talleres) que se suma a tu rango: lo hecho en los talleres se vende un 15 % más caro y se abren las mejoras del gremio.
- **Comercio:** desde el nivel 13, en la pestaña *Comercio* del mercado. Compra una carreta, elige villa (cada una paga más por lo que le falta), cárgala y decide si llevas escolta: sin ella, los bandidos pueden quedarse con la mitad. Vuelve en unos días con las monedas y con los materiales que compres allí. El puesto propio (nivel 14) sube un 10 % lo que vendes en casa.
- **Niveles altos:** en el 17 llegan las herramientas del gremio y la bodega de curados de la quesería; en el 18, la tercera carreta y la rueda hidráulica del molino; en el 19, el camino a **La Corte** (paga muy bien el queso y el pan) y el horno real.
- **Renombre:** en el nivel 20 la experiencia ya no sube de nivel; cada 1000 PX de más dan 10 de prestigio al cerrar la estación. La barra de experiencia muestra cuánto falta para el siguiente punto.
- **Burgués:** título de rama (nivel 15, cinco caravanas y puesto propio): carretas más grandes, mitad de peaje y mejores precios en otras villas.
- **Terrateniente:** nivel 8, 240 días de partida y favor del barón 60. Se abren las tierras del este, que se arriendan a aparceros que pagan renta cada estación.
- **Carta de nobleza y Señor:** con nivel 20, 5 años de partida, favor del barón 70, aldea 60 y un título de rama, el rey te vende la carta (en *Progreso › Rangos*). Al ser Señor se abre **el feudo**, cinco filas nuevas al sur del mapa.
- **Casa solariega:** toca el solar del feudo (o el escudo de prestigio de la barra). Cinco obras caras (casa, muralla, capilla, torre del homenaje y gran salón) que dan prestigio, plazas para soldados, una capilla que rebaja el diezmo a la mitad y fama cada estación.
- **Aldeas vasallas:** Robledal, Peñagris y Valdehierro. Se toman y se mejoran hasta nivel 3; cada estación pagan rentas (más cuanto mejor te quiere la aldea) y entregan madera, piedra o hierro.
- **Mesnada:** soldados con soldada por estación (si no cobran, se marchan). Con dos o más, las caravanas salen escoltadas gratis; también sirven en la hueste del rey, contra los bandidos y en las justas.
- **Mecenazgo:** donativo a la abadía, banquete (gasta pan y queso) y torneo, una vez por estación cada uno. Cambian monedas por **prestigio** y reputación.
- **Barón y Conde:** Barón pide 900 días, casa con tres obras, las tres aldeas, seis soldados y prestigio 800; Conde, 1260 días, todo al máximo, diez soldados, prestigio 3000 y el favor del conde. Al subir cambia tu señor feudal (el conde, luego el rey) y los eventos del barón dejan de salir.
- **Rotura tierra** desde el nivel 2: la hierba junto al campo aparece punteada; tócala para comprarla.
- **Invierno:** el trigo y las zanahorias no crecen ni se siembran. La col sí.
- **Eventos:** de vez en cuando el juego se pausa con una decisión. Las **ofertas** se pueden rechazar sin castigo; las **obligaciones** (leva, prestación, cacería...) castigan si no cumples, por ejemplo con más tributo durante una estación; los **percances** (zorro, tormenta, plaga...) te dejan pagar para evitarlos o arriesgarte. Algunos se encadenan.
- **Tiempo:** ❚❚ pausa y ▶, ▶▶, ▶▶▶ son x1, x2 y x3. En teclado: `espacio` pausa, `1` `2` `3` cambian la velocidad, `M` abre el mercado y `P` el progreso.
- **Sonido:** música medieval de fondo y fanfarrias al subir de nivel, ganar un rango, cerrar las cuentas de la estación o recibir un evento. En el menú hay una barra de volumen para cada una (a 0 se apaga).
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
npm run balance    # bot de equilibrio: juega varias partidas y resume cuándo llega cada hito
npm run build      # versión publicable en dist/
```

Con `?debug` en la URL, la partida queda accesible desde la consola del navegador como `fmtc` (por ejemplo, `fmtc.sim.state`).

### Bot de equilibrio

`npm run balance` juega cuatro partidas de 1600 días (algo más de una hora a x3 cada una) a través de `Game`, igual que la interfaz, y saca una tabla con una columna por semilla y la mediana:

- día en que llega cada nivel y cada rango, y cuánto tiempo real supone;
- monedas cada 200 días y máximo sin gastar;
- impuestos pagados y sin pagar;
- hambre, aldeanos que se marchan, granero lleno;
- caravanas, experiencia sobrante, favor y prestigio al final.

El bot no piensa: cosecha, recoge, vende lo que sobra guardando 10 días de comida, compra la mejora más barata, acepta los eventos y gasta en cuanto puede. Si un jugador así no tiene problemas, el juego es fácil; si se atasca, algo falla. Está en `tools/balance/`.

- Partidas más cortas u otras semillas: `BALANCE_DAYS=800 BALANCE_SEEDS=1,2 npm run balance` (en Windows, con `set` antes de cada variable).
- Para comparar un cambio, guarda la salida antes y después: `npm run balance > antes.txt`.

### Estructura

```
src/
  data/      contenido del juego en JSON: cultivos, animales, productos, mapa, niveles, rangos,
             impuestos, edificios y sus mejoras, aldeanos y herramientas, y eventos
  sim/       simulación pura (sin Phaser ni DOM): estado, reglas, reloj, calendario
  render/    escena isométrica de Phaser: dibuja el estado y traduce toques en órdenes
  ui/        interfaz HTML encima del lienzo: barra superior, mercado, menús
  i18n/      textos en es.json y en.json
  save/      formato del archivo de partida y guardado en disco
public/assets/pixel/     arte del mapa en pixel art (PNG, generado con tools/gen_pixel.py)
public/assets/ui/        marcos, botones, sellos e iconos de la interfaz en pixel art (tools/gen_pixel.py)
tests/       tests de la simulación, el guardado y el contenido
tools/       generador del pixel art (gen_pixel.py) y bot de equilibrio (balance/)
```

**Regla principal:** la simulación no sabe nada del dibujo. La interfaz y la escena llaman a `Game` (`src/sim/game.ts`), que aplica las reglas y avisa de los cambios.

### Añadir contenido

- **Un cultivo nuevo:** entrada en `src/data/crops.json`, su producto en `products.json`, sus dibujos de crecimiento en `tools/gen_pixel.py` y su nombre en `es.json` y `en.json` (`crop.<id>`, `product.<id>`).
- **Un evento nuevo:** entrada en `src/data/events.json` (categoría `offer`, `obligation` o `mishap`, peso, condiciones, opciones con coste, efectos y riesgo) y sus textos `event.<id>.*` en los dos idiomas. Las ofertas deben tener una opción `decline` sin efectos. Para encadenar eventos, una opción marca un `flag` y el siguiente lo pide con `"flag:<nombre>": 1`. Los tests comprueban textos y reglas.
- **Una mejora de edificio:** entrada en `src/data/buildings.json` (coste, nivel y lo que suma: camas, capacidad, animales...) y su nombre `upgrade.<edificio>.<id>`. Aparece sola en el panel del edificio y en la pantalla de *Progreso*.
- **Un paso o un consejo del tutorial:** en `src/data/tutorial.json` (los consejos llevan su condición: nivel, días, rango, camas...) y sus textos `tutorial.<id>.*` o `tip.<id>.*` en los dos idiomas.
- **Ajustar el ritmo:** experiencia por nivel, rangos, precio de la tierra, impuestos, reputación, arriendos y frecuencia de eventos están en `src/data/progression.json`; aldeanos, oficios y herramientas, en `src/data/villagers.json`; la carta, el feudo, la casa solariega, las aldeas, la mesnada y el mecenazgo, en `src/data/nobility.json`.
- **Un texto nuevo:** misma clave en `src/i18n/es.json` y `en.json`. Un test comprueba que no falte ninguna.
- **Que nada se pise en el mapa:** `src/data/layout.json` dice cuántas casillas ocupa cada objeto (la casa solariega y las aldeas, 2×2), qué casillas se reservan junto a otro (el puesto y la carreta junto al mercado) y junto a qué no se rotura. Un dibujo nunca se pinta más ancho que sus casillas, y un test lo comprueba con `public/assets/pixel/manifest.json`, que genera `tools/gen_pixel.py`.
- **Cambiar el arte:** `python3 tools/gen_pixel.py` regenera el pixel art del mapa (PNG a 32×16 px por casilla, que el juego amplía ×4 sin suavizar) y también los marcos, botones e iconos de la interfaz (`public/assets/ui/`, que el CSS amplía ×2 o ×3). Para usar otro arte, sustituye los PNG de `public/assets/pixel/` respetando nombres, anclaje (vértice inferior de la casilla) y ancho máximo (32 px por casilla); el test de anchos avisa si alguno no cabe. En invierno, los suelos y los árboles cambian a su versión nevada (`<nombre>_snow.png`). Si un dibujo no tiene versión nevada, se queda como está.

### Flujo de trabajo

Cada cambio va en una rama con su pull request. La CI de GitHub instala dependencias, pasa los tests y compila en cada PR.

## Licencias

- Código del juego: MIT (ver `LICENSE`).
- [Phaser](https://phaser.io): MIT. Las skills de `.claude/skills/phaser-*` proceden del repositorio de Phaser (ver `.claude/skills/PHASER-LICENSE.md`).
- Arte: propio, generado por `tools/gen_pixel.py` (mapa e interfaz).
