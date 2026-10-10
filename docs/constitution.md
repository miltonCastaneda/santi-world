# Constitution de "El Mundo de Santi"

Este documento fija los principios **no negociables** del proyecto. Todo change de OpenSpec (proposal, specs, design y tasks) debe respetarlos. Si un change necesita romper un principio, primero se modifica este documento mediante un ADR explícito.

> En SDD (Spec-Driven Development), la *constitution* es la "ley superior" del proyecto. Los specs describen *qué* se construye y la constitution describe *cómo debe ser siempre* lo que se construye.

## 1. Apto para 4 años

- Para jugar no hace falta leer: todas las acciones del niño se representan con **íconos grandes** (mínimo 64x64 px en desktop) y retroalimentación visual o sonora. El texto solo es un apoyo opcional.
- **Sin gore ni violencia gráfica**: no hay sangre, cadáveres ni sonidos de dolor. Los "ataques" son golpecitos cartoon (rebote, parpadeo y un sonido tipo "boing"). Las criaturas que desaparecen lo hacen con una nube "poof" y estrellas.
- Ni los enemigos ni la música dan miedo: son caricaturescos y suaves.
- **El niño no puede perder progreso ni romper algo permanente por accidente**:
  - Ninguna acción del niño borra un mundo.
  - Antes de limpiar o reiniciar algo, se guarda de forma persistente.
  - Lo que el niño puede destruir se puede reconstruir o reaparece.
  - Si el personaje pierde todos sus corazones, reaparece sin perder nada.
- La UI del niño **no contiene enlaces** a la vista de padres ni a configuraciones.

## 2. Escalable

- La arquitectura es modular y sus límites son explícitos:
  - `domain` y `sim`: lógica pura de TypeScript, sin DOM ni Three.js.
  - `render`, `input`, `audio`, `persistence` y `ui`.
  - `apps`: los puntos de entrada.
- `domain` y `sim` no dependen de ningún otro módulo. Esto se verifica con lint.
- La persistencia vive **detrás de una interfaz de repositorio** (`WorldRepository`), para poder cambiar la implementación local por un backend o un modo online sin tocar el dominio.
- El mundo se organiza **por chunks** y se carga y descarga de forma progresiva.
- **IDs de usuario y de mundo desde ya** (UUID), aunque hoy exista un solo usuario.
- Los datos persistidos llevan **versión de esquema** y migraciones probadas.

## 3. Todo cambio documentado

Cada change actualiza:

- Su spec (OpenSpec): `openspec/changes/<change>/specs/...`, que al archivar pasa a `openspec/specs/`.
- Los ADRs de las decisiones nuevas: `docs/adr/NNNN-titulo.md`.
- La guía de ejecución (`README.md`) y las guías de uso (`docs/guia-padres.md` y `docs/guia-nino.md`) si cambia el uso.
- `docs/architecture.md` si cambian módulos o límites.
- `CHANGELOG.md`, en la sección `[Sin publicar]`.

## 4. Todo con pruebas

- **Unitarias** (Vitest): lógica de simulación, IA, físicas, reglas de daño, ciclo día/noche, persistencia y migraciones.
- **Integración**: repositorio sobre IndexedDB simulado y simulación sin interfaz de escenarios completos.
- **E2E y smoke** (Playwright): los flujos críticos del niño y de los padres.
- La lógica del dominio es **determinista**: usa RNG con semilla y un reloj inyectable.

### Definición de "hecho" (DoD)

Una tarea o incremento está hecho solo cuando se cumplen las cuatro condiciones:

1. La funcionalidad cumple los escenarios de su spec.
2. Todas las pruebas pasan (`npm test`, `npm run e2e`) y no hay errores de tipos ni de lint (`npm run check`).
3. Los docs afectados (y el CHANGELOG) están actualizados.
4. Se puede demostrar en el navegador (`npm run dev`).

## 5. Rendimiento y estabilidad visual

- Sin parpadeos, z-fighting, huecos entre chunks, sangrado de texturas ni caídas de FPS perceptibles.

### Presupuesto de rendimiento

El equipo de referencia es un desktop modesto: GPU integrada tipo Intel UHD 620, 8 GB de RAM, Chrome estable y 1080p.

| Métrica | Presupuesto |
|---|---|
| FPS objetivo | 60 FPS |
| Tiempo de frame p95 | 20 ms o menos |
| Draw calls por frame | menos de 300 |
| Entidades activas | 60 o menos (8 zombis, 6 lobos y 1 dragón como máximo) |
| Reconstrucción de chunks | 4 ms o menos por frame (repartida entre frames) |
| Tiempo hasta poder jugar | menos de 3 s con la caché caliente |
| Memoria JS | menos de 500 MB |

**Cómo se mide**: con el overlay de debug en desarrollo y con el script `npm run perf` (Playwright), que recorre una ruta de cámara fija con una semilla fija y registra los tiempos de frame. El detalle está en `docs/performance.md`.

## Idioma y convenciones

- La documentación, los specs y la UI están en **español**. El código (identificadores) está en inglés.
- Las dependencias nuevas solo se agregan con un ADR que las justifique. Se prefiere lo que ya existe en el repo.
