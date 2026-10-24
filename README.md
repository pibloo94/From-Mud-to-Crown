# From Mud to Crown

Gestor de recursos medieval en 2D isométrico: empiezas como campesino con una casa, una parcela, una vaca y unas gallinas, vendes lo que produces en el mercado y vas ascendiendo hasta la nobleza.

Se juega en el navegador, en ordenador y en móvil, en español e inglés.

## Estado

**Arte en pixel art (estilo D: paleta limitada).** El mapa es una isla isométrica en pixel art de tonos apagados, con cada objeto dibujado a la medida de sus casillas, y la interfaz usa el mismo estilo: marcos de madera y pergamino, botones con relieve, iconos y sellos en píxel, y fuentes en píxel (Jacquard 24 y Pixelify Sans). Antes, la fase 3 completa: talleres, comercio, nobleza, tutorial y sonido.

**Fase 2 · La aldea.** Sobre la progresión de la fase 1 se añaden aldeanos con oficio y herramientas, mejoras de cada edificio (casa, granero, gallinero y corral) que se ven en el mapa, un granero con capacidad limitada, reputación con el barón y la aldea, impuestos cada estación, 21 eventos (ofertas, obligaciones y percances), el rango de Terrateniente con las tierras del este y la pantalla de *Progreso*.

El roadmap completo está en el documento de diseño del proyecto.

## Cómo jugar

- **Dificultad:** al empezar una partida nueva eliges Fácil, Normal o Difícil. Cambia los precios de venta, impuestos, salarios y mantenimiento, la comida, cuántos percances y estaciones de mal tiempo salen y a partir de qué deuda embarga tu señor. No se puede cambiar después; el menú dice cuál es. Las cifras están en `src/data/progression.json` (`difficulty`).
- **Tutorial:** una partida nueva empieza con unos pasos guiados (sembrar, recoger, cosechar, vender y mirar el progreso) que avanzan solos al hacerlos; se puede saltar. Después, cada vez que llega algo nuevo aparece un consejo breve. Desde el menú se repite el tutorial o se apagan los consejos.
- **Siembra** tocando una parcela de tierra arada. Si tienes varios cultivos disponibles, eliges cuál. Cuando esté maduro, tócala otra vez para cosechar.
- **Recoge** huevos y leche tocando el gallinero o el corral cuando aparezca el escudo con un número.
- **Vende** en el mercado (botón *Mercado* o el puesto del camino): eliges la cantidad con la barra de cada producto. Los precios cambian cada semana y con la estación: ▲ por encima de lo habitual, ▼ por debajo.
- **Materiales:** en la pestaña *Comprar* del mercado hay madera, piedra y hierro (este, desde el nivel 4). Las mejoras de edificios y las herramientas piden monedas y materiales; desde el propio panel puedes comprar de una vez lo que falta. Se guardan en un almacén aparte, sin ocupar el granero.
- **Sube de nivel** cosechando, recogiendo y vendiendo. Cada nivel desbloquea algo: tierra nueva (nivel 2), zanahorias (3), gallinas (4), vacas y el rango de Granjero libre (5), coles (6), además de mejoras de edificios y herramientas. La pantalla **Progreso** (botón inferior o tocando el escudo de nivel) muestra qué llega en cada nivel y dónde se usa.
- **Edificios:** toca la casa, el granero, el gallinero o el corral para ver y comprar sus mejoras. La casa da camas; el granero, sitio para guardar (si se llena, no se puede cosechar); el gallinero y el corral, más animales y más producción.
- **Aldeanos:** en la casa, pestaña *Aldeanos*. Cada uno necesita una cama y come una ración al día; si pasan hambre, se marchan. Oficios: **labrador** (siembra y cosecha solo sus parcelas con el cultivo que le asignes, o en automático lo que más deja en temporada, y hace que todo crezca más rápido), **pastor** (más huevos y leche, y los recoge solo) y **carretero** (vende lo que sobra cada semana). Cada uno lleva su herramienta: madera, hierro y acero, cada vez más cara y más eficaz; un labrador con mejor herramienta trabaja más parcelas.
- **Despensa:** en el granero, pestaña *Despensa*. Eliges qué productos pueden comer los aldeanos (comen primero lo más barato) y cuántos días de comida se reservan. El mercado avisa si vas a vender la reserva y el carretero no la toca.
- **Impuestos:** al empezar cada estación pagas el diezmo (10 % de lo vendido) y el tributo al barón (según tus parcelas y tu rango). La primera estación es gratis. Lo que no puedas pagar enfada al barón y queda como **deuda**: crece un 10 % cada estación y se cobra antes que nada en las cuentas siguientes; si pasa de 400 monedas, tu señor embarga tierra (primero un arriendo, luego una parcela comprada; nunca las del principio).
- **Gastos fijos:** al cerrar cada estación también pagas el salario de cada aldeano según su oficio y el mantenimiento de lo construido: mejoras de edificios, talleres y sus mejoras, carretas, puesto y obras de la casa solariega. Cada panel dice cuánto cuesta. Si no llega para los salarios, se van los últimos aldeanos en llegar; sin dinero para el mantenimiento, cultivos y animales rinden un 25 % menos durante una estación. La primera estación es gratis, como los impuestos.
- **Tiempo:** cada estación sale buena, corriente o mala, y se anuncia en las cuentas: primavera lluviosa, verano seco u otoño de tizón bajan los cultivos; el invierno duro hace comer más y baja los animales. Mientras dura, se ve como una etiqueta en la barra.
- **Prevención:** en el mercado, pestaña *Comprar*, se paga azufre y espantapájaros (contra plagas y sequía) o cercas y perros (contra el zorro y las enfermedades). Dura hasta las cuentas y cuesta más cuantas más parcelas o animales tengas.
- **Conservar el rango:** Terrateniente, Señor, Barón y Conde piden mantener un mínimo con la Nobleza (Señor, también con el Pueblo llano; Conde, también con el Rey). Si en unas cuentas no lo tienes, llega un aviso; si en las siguientes sigue igual, bajas al rango anterior y tienes que volver a ganártelo.
- **Estamentos:** el Rey, la Nobleza, los Artesanos, el Pueblo llano y la Iglesia recuerdan lo que haces (de 0 a 100). Según el tramo (hostil, fría, neutral, favorable, devota) cambia lo que pagas: el Rey, los peajes; la Nobleza, el tributo; los Artesanos, los materiales; el Pueblo llano, salarios y contratación; la Iglesia, el diezmo. Lo que agrada a uno disgusta un poco a su rival (Nobleza y Pueblo llano, Rey y Nobleza, Iglesia y Artesanos), y en cada cuentas las relaciones vuelven poco a poco hacia 50. Suben con los eventos, el mecenazgo, los talleres, las obras de la casa solariega y pagando tributo, diezmo y salarios. Todo en `src/data/estates.json`; se ve en *Progreso › Rangos*.
- **Personaje:** al crear la partida, tras la dificultad, un cuestionario pide nombre, origen, carácter y ambición. Cada respuesta es un rasgo con ventajas y desventajas: relación inicial con los estamentos, cuánto favor se gana con cada uno y multiplicadores de cultivos, animales, comida, precios, experiencia, tributo, diezmo, peajes, materiales, salarios y contratación. Todo en `src/data/traits.json`. La ficha se abre tocando el escudo de nivel (pestañas *Rasgos*, *Caminos* y *Relaciones*).
- **Rasgos ganados:** las decisiones de los eventos y el mecenazgo cuentan a favor o en contra de cada estamento. Al repetir una conducta se gana un rasgo (Hombre de fe, Hombre del pueblo, Fiel vasallo, Amigo del gremio; o Mano dura e Impío si vas en contra), y otros por contadores (Mercader nato por caravanas, Señor del hambre por aldeanos idos por hambre). Se tienen como mucho 3 a la vez y los de conducta se pierden si se abandona (por debajo de la mitad del umbral). Todo en `src/data/traits.json` (`earn`, `earned`).
- **Encargos:** al empezar cada estación (desde el día 60), cada estamento pide algo hasta las cuentas: productos, monedas o tandas en los talleres, según el nivel. Cumplirlo da su favor (y por tanto méritos de su camino), algo de dinero si son productos, y cuenta como decisión a su favor. No cumplirlo no castiga. Todo en `src/data/commissions.json`; se abren desde la pastilla del estandarte.
- **Monumentos y legado:** con el último rango de su camino se puede levantar su monumento: castillo (Corona), gran iglesia (Fe), casa del gremio (Oficio), lonja (Comercio) o concejo (Pueblo). Tres etapas de monedas y materiales sobre un cuadro libre de 2×2 junto a la aldea; terminado da prestigio, sus efectos y la tarjeta del legado (la partida sigue). El castillo, además, hace Duque. Todo en `src/data/monuments.json`; el arte, en `tools/gen_pixel.py`.
- **Libro de cuentas y logros:** cada cierre de estación se apunta (lo que entra, lo que sale en las cuentas, monedas, comida, aldeanos y relaciones) y el libro lo enseña en gráficas; se abre desde el menú y desde el parte de la estación. Veintidós logros en `src/data/achievements.json`, con aviso al conseguirlos.
- **Fertilidad del suelo:** cada cosecha cansa la parcela según el cultivo (`drain` en `crops.json`), la mitad si se rota; cada día se recupera parte de lo que le falta, más en barbecho y en invierno. La cosecha rinde según la fertilidad: rotando se queda hacia el 100 %, repitiendo cultivo por debajo. La tierra cansada se ve más clara y reseca, y la ventana de siembra lo avisa. Los labradores en automático rotan y, si un taller con artesano necesita algo (el molino, trigo), lo siembran (`src/sim/soil.ts`).
- **Caminos:** Corona, Fe, Oficio, Comercio y Pueblo acumulan méritos con tus decisiones: cada punto de favor ganado con un estamento cuenta para su camino (Rey y Nobleza → Corona, Iglesia → Fe, Artesanos → Oficio, Pueblo llano → Pueblo); el Comercio crece con las ventas y las caravanas, y el Oficio también con lo que producen los talleres. Hasta Terrateniente todos avanzan a medio ritmo; desde ahí eliges uno en foco (100 %) y un segundo (50 %), y cambiar de foco cuesta un 25 % de los méritos del camino que dejas. Todo en `src/data/paths.json`. Con `BALANCE_FOCUS=<camino>` el bot de equilibrio pone ese camino en foco.
- **Rangos de cada camino:** Corona: Señor → Barón → Conde; Oficio: Artesano → Maestro → Gran maestre; Comercio: Burgués → Mercader → Alcalde de villa libre; Fe: Hermano lego → Prior → Emisario de la fe; Pueblo: Hombre bueno → Portavoz → Caudillo. El primero de cada camino solo pide sus requisitos; el segundo, además, el peldaño 3 con el camino en foco o de segundo; el tercero, el peldaño 4 en foco. Cada rango da algo (`effects` y `beds` en `progression.json`), y se acumula como los rasgos.
- **Parte de la estación:** la pastilla de cuentas de la barra dice lo que se cobrará y en cuántos días; su ventana desglosa los cobros, lo que pasaría si no llega y para cuántos días hay comida (`src/sim/forecast.ts`).
- **Talleres:** desde el nivel 9 se levantan en los cinco solares del mapa (estacas con cuerda): molino (trigo → harina), horno (harina y huevo → pan), quesería (leche → queso); desde el 13, cervecería (cebada → cerveza; la cebada se siembra desde el 12 y la cerveza se paga bien en las villas y en las Fiestas) y, desde el 15, telar (lana → paño; las ovejas se compran desde el 14, viven en el corral con su propio tope y el paño se paga caro en el puerto y en La Corte). Cada uno necesita un aldeano artesano; la herramienta y las mejoras del taller dan más tandas al día. Nunca gastan la reserva de la despensa.
- **Artesano:** título de rama (nivel 12 y dos talleres) que se suma a tu rango: lo hecho en los talleres se vende un 15 % más caro y se abren las mejoras del gremio.
- **Comercio:** desde el nivel 13, en la pestaña *Comercio* del mercado. Compra una carreta, elige villa (cada una paga más por lo que le falta), cárgala y decide si llevas escolta: sin ella, los bandidos pueden quedarse con la mitad. Vuelve en unos días con las monedas y con los materiales que compres allí. El puesto propio (nivel 14) sube un 10 % lo que vendes en casa.
- **Niveles altos:** en el 17 llegan las herramientas del gremio y la bodega de curados de la quesería; en el 18, la tercera carreta y la rueda hidráulica del molino; en el 19, el camino a **La Corte** (paga muy bien el queso y el pan) y el horno real.
- **Renombre:** en el nivel 20 la experiencia ya no sube de nivel; cada 1000 PX de más dan 10 de prestigio al cerrar la estación. La barra de experiencia muestra cuánto falta para el siguiente punto.
- **Burgués:** título de rama (nivel 15, cinco caravanas y puesto propio): carretas más grandes, mitad de peaje y mejores precios en otras villas.
- **Terrateniente:** nivel 8, 240 días de partida y Nobleza 60. Se abren las tierras del este, que se arriendan a aparceros que pagan renta cada estación.
- **Carta de nobleza y Señor:** con nivel 20, 5 años de partida, Nobleza 60, Pueblo llano 50 y un título de rama, el rey te vende la carta (en *Progreso › Rangos*). Al ser Señor se abre **el feudo**, cinco filas nuevas al sur del mapa.
- **Casa solariega:** toca el solar del feudo (o el escudo de prestigio de la barra). Cinco obras caras (casa, muralla, capilla, torre del homenaje y gran salón) que dan prestigio, plazas para soldados, una capilla que rebaja el diezmo a la mitad y fama cada estación.
- **Aldeas vasallas:** Robledal, Peñagris y Valdehierro. Se toman y se mejoran hasta nivel 3; cada estación pagan rentas (más cuanto mejor te quiere la aldea) y entregan madera, piedra o hierro.
- **Mesnada:** soldados con soldada por estación (si no cobran, se marchan). Con dos o más, las caravanas salen escoltadas gratis; también sirven en la hueste del rey, contra los bandidos y en las justas.
- **Mecenazgo:** donativo a la abadía, banquete (gasta pan y queso) y torneo, una vez por estación cada uno. Cambian monedas por **prestigio** y reputación.
- **Barón y Conde:** Barón pide 900 días, casa con tres obras, las tres aldeas, seis soldados, prestigio 800 y Nobleza 60; Conde, 1260 días, todo al máximo, diez soldados, prestigio 3000, Rey 70 y Nobleza 60. Al subir cambia tu señor feudal (el conde, luego el rey) y los eventos del barón dejan de salir.
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

El bot no piensa: cosecha, recoge, vende lo que sobra guardando 10 días de comida, guarda lo que costarán las cuentas de la estación, compra la mejora más barata, acepta los eventos y gasta el resto en cuanto puede (en el feudo, primero las obras y después el mecenazgo). Si un jugador así no tiene problemas, el juego es fácil; si se atasca, algo falla. Está en `tools/balance/`.

- Partidas más cortas, otras semillas u otra dificultad: `BALANCE_DAYS=800 BALANCE_SEEDS=1,2 BALANCE_DIFFICULTY=hard npm run balance` (en Windows, con `set` antes de cada variable).
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
public/assets/fonts/     cifras 0-9 propias, más legibles que las de Pixelify (tools/gen_digits.py)
tests/       tests de la simulación, el guardado y el contenido
tools/       generadores del pixel art (gen_pixel.py) y de las cifras (gen_digits.py), y bot de equilibrio (balance/)
```

**Regla principal:** la simulación no sabe nada del dibujo. La interfaz y la escena llaman a `Game` (`src/sim/game.ts`), que aplica las reglas y avisa de los cambios.

### Añadir contenido

- **Un cultivo nuevo:** entrada en `src/data/crops.json`, su producto en `products.json`, sus dibujos de crecimiento en `tools/gen_pixel.py` y su nombre en `es.json` y `en.json` (`crop.<id>`, `product.<id>`).
- **Un evento nuevo:** entrada en `src/data/events.json` (categoría `offer`, `obligation` o `mishap`, peso, condiciones, opciones con coste, efectos y riesgo) y sus textos `event.<id>.*` en los dos idiomas. Las ofertas deben tener una opción `decline` sin efectos. Para encadenar eventos, una opción marca un `flag` y el siguiente lo pide con `"flag:<nombre>": 1`. Los tests comprueban textos y reglas.
- **Una mejora de edificio:** entrada en `src/data/buildings.json` (coste, nivel y lo que suma: camas, capacidad, animales...) y su nombre `upgrade.<edificio>.<id>`. Aparece sola en el panel del edificio y en la pantalla de *Progreso*.
- **Un paso o un consejo del tutorial:** en `src/data/tutorial.json` (los consejos llevan su condición: nivel, días, rango, camas...) y sus textos `tutorial.<id>.*` o `tip.<id>.*` en los dos idiomas.
- **Ajustar el ritmo:** experiencia por nivel, rangos, precio de la tierra, impuestos, mantenimiento, renombre, reputación, arriendos y frecuencia de eventos están en `src/data/progression.json`; aldeanos, oficios, salarios y herramientas, en `src/data/villagers.json`; la carta, el feudo, la casa solariega, las aldeas, la mesnada y el mecenazgo, en `src/data/nobility.json`.
- **Un texto nuevo:** misma clave en `src/i18n/es.json` y `en.json`. Un test comprueba que no falte ninguna.
- **Que nada se pise en el mapa:** `src/data/layout.json` dice cuántas casillas ocupa cada objeto (la casa solariega y las aldeas, 2×2), qué casillas se reservan junto a otro (el puesto y la carreta junto al mercado) y junto a qué no se rotura. Un dibujo nunca se pinta más ancho que sus casillas, y un test lo comprueba con `public/assets/pixel/manifest.json`, que genera `tools/gen_pixel.py`.
- **Cambiar el arte:** `python3 tools/gen_pixel.py` regenera el pixel art del mapa (PNG a 32×16 px por casilla, que el juego amplía ×4 sin suavizar) y también los marcos, botones e iconos de la interfaz (`public/assets/ui/`, que el CSS amplía ×2 o ×3). Para usar otro arte, sustituye los PNG de `public/assets/pixel/` respetando nombres, anclaje (vértice inferior de la casilla) y ancho máximo (32 px por casilla); el test de anchos avisa si alguno no cabe. En invierno, los suelos y los árboles cambian a su versión nevada (`<nombre>_snow.png`). Si un dibujo no tiene versión nevada, se queda como está.

### Flujo de trabajo

Cada cambio va en una rama con su pull request. La CI de GitHub instala dependencias, pasa los tests y compila en cada PR.

## Licencias

- Código del juego: MIT (ver `LICENSE`).
- [Phaser](https://phaser.io): MIT. Las skills de `.claude/skills/phaser-*` proceden del repositorio de Phaser (ver `.claude/skills/PHASER-LICENSE.md`).
- Arte: propio, generado por `tools/gen_pixel.py` (mapa e interfaz).
- Cifras: fuente propia generada por `tools/gen_digits.py`; el resto del texto, Pixelify Sans y Jacquard 24 (Google Fonts).
