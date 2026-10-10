# Rendimiento y estabilidad visual

> Esqueleto inicial. El presupuesto oficial está en la [constitution](constitution.md#5-rendimiento-y-estabilidad-visual). Aquí se documentan cómo se mide y los resultados de cada incremento.

## Equipo de referencia

GPU integrada tipo Intel UHD 620, 8 GB de RAM, Chrome estable, 1080p y pantalla completa.

## Cómo se mide (previsto)

1. **Overlay de debug** (solo en desarrollo, tecla `F3`): FPS, tiempo de frame, draw calls (`renderer.info`), triángulos, chunks cargados, entidades activas y memoria.
2. **`npm run perf`** (Playwright con el navegador visible y GPU real):
   - Carga el mundo con la semilla fija `perf-001`.
   - Recorre una ruta de cámara fija durante 60 s, de día y luego de noche, con el máximo de entidades.
   - Registra el tiempo de cada frame y reporta el p50, el p95, el p99 y el máximo de draw calls.
   - Falla si se excede el presupuesto.
3. **Pruebas visuales**: capturas con semilla y cámara fijas que se comparan contra una imagen de referencia (con tolerancia) para detectar huecos entre chunks, z-fighting y sangrado del atlas.

## Resultados por incremento

| Incremento | Fecha | p50 ms | p95 ms | Draw calls máx. | Notas |
|---|---|---|---|---|---|
| (pendiente) | | | | | |
