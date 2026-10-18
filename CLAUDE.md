# Instrucciones para Claude en este repositorio

Juego "From Mud to Crown": gestor de recursos medieval 2D isométrico con Phaser 4 + TypeScript + Vite. Lee `README.md` para la estructura.

## Reglas de arquitectura

- `src/sim/` es lógica pura: nunca importa Phaser ni toca el DOM. Todo cambio de estado pasa por `Game` (`src/sim/game.ts`).
- El contenido (cultivos, animales, productos, mapa, niveles y rangos, edificios y mejoras, aldeanos y herramientas, impuestos y eventos) vive en `src/data/*.json`. La pantalla de *Progreso* se genera a partir de esos datos. Añadir contenido no debería requerir tocar la lógica.
- Ningún texto visible se escribe en el código: todo sale de `src/i18n/es.json` y `en.json`, siempre con las mismas claves.
- El formato de partida lleva versión (`src/save/serialize.ts`). Si cambia `GameState`, sube `SAVE_VERSION` y añade la conversión en `migrate()` para no romper partidas antiguas.
- Diseñar pensando en móvil y escritorio: objetivos táctiles de al menos 44 px y sin depender del ratón.

## Antes de abrir una PR

- `npm test` y `npm run typecheck` sin errores; añade tests para cada regla nueva de la simulación.
- Prueba el juego en el navegador (escritorio y móvil vertical) y revisa capturas.
- Para dudas de la API de Phaser 4, consulta las skills `phaser-*` de `.claude/skills/`. Phaser 4 no es Phaser 3.

## Flujo de trabajo con el propietario

- Una rama y una PR por funcionalidad. El propietario revisa; solo se hace merge tras su OK.
- Código y comentarios en español; nombres de variables en inglés.
- Commits en español, en imperativo y descriptivos.
