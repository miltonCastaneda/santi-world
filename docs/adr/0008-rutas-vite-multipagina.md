# ADR 0008: Rutas separadas con Vite multipágina ("/" y "/padres/"), sin librería de router

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `vista-de-padres`)

## Contexto

La vista de padres debe estar en una ruta independiente, sin enlaces desde la UI del niño, y no debería cargar el juego. Hoy hay una sola página.

## Decisión

Usar **Vite multipágina**: `index.html` (el juego) y `padres/index.html` (los padres) en `build.rollupOptions.input`. Cada página tiene su punto de entrada (`apps/game/main.ts` y `apps/parents/main.ts`) y comparten los módulos `persistence`, `render` y `domain`. Un middleware mínimo en `vite.config.ts` redirige `/padres` a `/padres/` en desarrollo y vista previa. Una prueba E2E garantiza que el bundle del niño no contiene enlaces a `/padres`.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Vite multipágina (elegida) | Separación física de los bundles; ninguna dependencia; funciona en cualquier hosting estático | `/padres` sin barra final necesita un redirect en algunos hostings |
| SPA con hash (`#/padres`) | Una sola página | El juego y los padres comparten bundle y estado; es fácil "filtrar" un acceso desde la UI del niño |
| Librería de router (vue-router, etc.) | Rutas declarativas | Una dependencia y un framework para solo 2 rutas |
| Una app separada (otro proyecto) | Aislamiento total | Duplica el build y los módulos compartidos |

## Consecuencias

- Positivas: el juego del niño no incluye código de los padres; carga independiente; preparado para proteger `/padres/` en el servidor cuando haya modo online.
- Negativas: hay que configurar el redirect en el hosting futuro (documentado en el README).
