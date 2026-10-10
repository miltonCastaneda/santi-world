# ADR 0004: Simulación de paso fijo a 20 Hz con ECS-lite propio, determinista y sin dependencias del navegador

- **Estado**: Aceptado (incremento 1)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `plataforma-escalable`)

## Contexto

Hoy no hay bucle de simulación: todo ocurre en los manejadores de eventos y el render. La Fase 2 incorpora unas 60 entidades con IA, física, ciclo día/noche y reglas de daño. El spec exige determinismo (los mismos resultados a 30 o 144 FPS) y ejecución sin interfaz para las pruebas.

## Decisión

- Un bucle de **paso fijo a 20 Hz** con acumulador (máximo 5 pasos por frame), pausado con la pestaña oculta. El render interpola entre estados.
- Un **ECS-lite propio**: entidades con id y componentes opcionales en objetos planos, sistemas como funciones con un orden fijo y un índice espacial por hash.
- **Determinismo**: `Rng` con semilla (por ejemplo, mulberry32 o sfc32) y `Clock` inyectable. Usar `Math.random` o `Date.now` en `domain` y `sim` es un error de lint.
- **Comunicación** hacia render, audio y UI a través de un bus de eventos tipado; la entrada llega como intents.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| ECS-lite propio (elegido) | Mínimo y entendible; serialización trivial; suficiente para unas 60 entidades | Sin optimizaciones de memoria (que no hacen falta a esta escala) |
| bitecs u otra librería ECS | Rendimiento con miles de entidades | API orientada a arrays tipados, menos legible; una dependencia para un problema que no existe |
| POO con una clase por entidad y `update(dt)` | Familiar | Herencia frágil; comportamiento y estado mezclados; más difícil de serializar y de hacer determinista |
| Paso variable (dt del frame) | Más simple | No es determinista y la física depende de los FPS: rompe el spec |

## Consecuencias

- Positivas: pruebas sin interfaz (`createHeadlessGame`) que pueden adelantar 30 minutos en segundos; se puede reproducir un error con la semilla; render desacoplado.
- Negativas: la interpolación añade un frame de latencia visual (unos 50 ms como máximo, aceptable), y hay que vigilar que nadie use APIs del navegador en el núcleo.
- Reversión: si algún día se necesitan miles de entidades, el `EntityStore` se puede reimplementar sobre arrays tipados sin cambiar los sistemas.
