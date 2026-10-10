# ADR 0001: Mantener Vite + TypeScript + Three.js, con UI en DOM sin framework

- **Estado**: Aceptado (incremento 1)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/`

## Contexto

La Fase 2 multiplica el alcance del juego (chunks, entidades, IA, audio, vista de padres). Hay que decidir si conviene cambiar de motor o de framework antes de crecer. El repo ya usa Vite 6, TypeScript estricto y Three.js 0.170 con buen resultado. La constitution pide preferir lo existente y justificar cada dependencia.

## Decisión

Mantener **Vite + TypeScript + Three.js**. La UI (el HUD del niño y el panel de padres) se hace con **DOM y TypeScript, sin framework**.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Vite + TS + Three.js (elegida) | Ya funciona; control fino de la geometría (BufferGeometry, InstancedMesh); bundle pequeño; mucha documentación | Hay que construir a mano física, IA y escena |
| Babylon.js | Incluye física, GUI e inspector | Migración completa; bundle más grande; menos control del mesher |
| React Three Fiber + React para la UI | Composición declarativa y ecosistema | Agrega React y su ciclo de render; dificulta mantener la simulación pura y determinista; más complejidad para un HUD simple |
| Motor completo (Godot/Unity con export web) | Editor y herramientas de juego | Otro lenguaje y toolchain; builds pesados; se pierde el flujo web y TS actual |

## Consecuencias

- Positivas: no hay que migrar; la curva de aprendizaje es mínima; control total del rendimiento.
- Negativas: física, IA y pathfinding son propios (ver ADR-0004 a 0007), y la UI con DOM requiere orden (componentes como funciones con TS).
- Reversión: como el núcleo `domain` y `sim` es puro, se podría cambiar el render sin tocar las reglas.
