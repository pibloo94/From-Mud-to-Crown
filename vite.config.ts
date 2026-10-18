import { defineConfig } from 'vite';

// Rutas relativas para que el build funcione igual en itch.io, GitHub Pages o una carpeta local.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
