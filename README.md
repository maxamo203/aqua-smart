# aqua-smart

Proyecto migrado a [Astro](https://astro.build) con `pnpm`.

## Estructura

- `src/pages/index.astro` — dashboard (SPA con navegación por hash, manejada por `public/app.js`).
- `src/pages/simulator.astro` — simulador de red de campus (escena Konva, manejada por `public/simulator.js`).
- `src/layouts/BaseLayout.astro` — layout compartido (fuentes, `<head>`).
- `src/styles/` — `styles.css` y `simulator.css`.
- `public/` — scripts vanilla (`app.js`, `sim-data.js`, `sim-engine.js`, `simulator.js`, `konva.min.js`) e imágenes del plano, servidos tal cual.

El estado del simulador (`AquaSim`) se comparte entre ambas páginas vía `localStorage` + `BroadcastChannel`, igual que en la versión original.

## Comandos

```bash
pnpm install
pnpm dev       # http://localhost:4321
pnpm build     # genera dist/
pnpm preview   # sirve el build de producción
```
