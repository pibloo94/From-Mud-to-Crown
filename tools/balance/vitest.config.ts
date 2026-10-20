import { defineConfig } from 'vitest/config';

// Configuracion propia del bot: solo ejecuta su punto de entrada y deja pasar la salida tal cual.
export default defineConfig({
  test: {
    root: new URL('../..', import.meta.url).pathname,
    include: ['tools/balance/balance.run.ts'],
    disableConsoleIntercept: true,
    testTimeout: 600_000,
    reporters: ['dot'],
  },
});
