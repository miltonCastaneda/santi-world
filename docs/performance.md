# Rendimiento y estabilidad visual

El presupuesto oficial está en la [constitution](constitution.md#presupuesto-de-rendimiento). Aquí se documentan cómo se mide y los resultados de cada incremento.

## Equipo de referencia

GPU integrada tipo Intel UHD 620, 8 GB de RAM, Chrome estable, 1080p y pantalla completa.

## Cómo se mide

1. **Overlay de debug** (solo en desarrollo, tecla `F3`): FPS, tiempo de frame (media y p95), draw calls y triángulos (`renderer.info`), chunks cargados, mallados, pendientes y en vuelo, y el tiempo del mesher en el hilo principal (último y máximo) y en los workers.
2. **`npm run perf`** (`scripts/perf.mjs`):
   - Compila con `vite build`, levanta `vite preview` en el puerto 5399 y abre Chromium **con ventana y GPU real** a 1920x1080 en `?perf=1`.
   - Usa la semilla fija `perf-001`. Espera a que la carga inicial termine (todos los chunks del radio de vista mallados) y luego recorre una ruta de cámara fija durante 60 s: granja, montaña boscosa, montaña de roca, puente, estanque y de vuelta a la granja, orbitando a 40 bloques de distancia.
   - Reporta el p50, el p95, el p99 y el máximo del tiempo de frame, los draw calls, el tiempo máximo por frame del mesher en el hilo principal, la media del mesher en los workers, la memoria JS y la GPU.
   - Termina con código 1 si se excede el presupuesto (p95 de 20 ms, menos de 300 draw calls, p99 de 4 ms de mesher por frame y menos de 500 MB de memoria JS).
   - Sobre el mesher: el mallado y la luz corren en Web Workers ([ADR-0013](adr/0013-mesher-en-web-worker-y-arreglo-de-texturas.md)); en el hilo principal solo se crean las geometrías, y `ChunkRenderer` aplica una nueva únicamente si su costo estimado cabe en lo que queda de los 4 ms. El máximo absoluto se reporta, pero no se usa como criterio: los picos aislados (de 4 a 6 ms) no dependen del tamaño de la malla (una de 275 caras llegó a 2,6 ms y una de 1429, a 4,2 ms) y corresponden a pausas del recolector de basura de V8 que caen dentro de ese tramo.
   - Opciones: `--ms=30000` (duración), `--headless` (sin ventana; en muchos equipos sin GPU real, solo sirve como humo), `--record --label="incremento N"` (agrega la fila a la tabla de abajo). En PowerShell, `--` lo consume la propia terminal: usar `npm run perf '--' --record ...` o `node scripts/perf.mjs --record ...`.
   - Entidades: la ruta pasa por la granja y el estanque con toda la población inicial. Se reporta el máximo de animales dibujados a la vez y sus draw calls (presupuesto: 60 o menos; `EntityRenderer` usa una malla instanciada por especie y parte, más la sombra y las nubes "poof"). En el overlay `F3` aparecen como "entidades", "dibujadas", "draw calls" y "nodos A*".
   - De noche y con el máximo de entidades: `--night` (`?perf=1&night=1`) pone el reloj al principio de la noche y 8 zombis (el máximo) a 12 bloques del personaje, en la granja; el aparecedor no agrega más porque ya está lleno. Los zombis persiguen al personaje y a los animales mientras la cámara recorre la ruta. Los incrementos 9–13 suman sus entidades a esta misma ruta.
3. **Pruebas visuales** (`tests/e2e/visual.spec.ts`): capturas con semilla (`visual-001`) y cámara fijas comparadas con imágenes de referencia en `tests/e2e/__screenshots__/` (tolerancia del 2 %), más comprobaciones exactas:
   - Ningún píxel del color del cielo al mirar el terreno desde arriba (huecos entre chunks).
   - Romper y volver a colocar un bloque en el límite entre dos chunks deja la imagen idéntica.
   - Tres capturas seguidas del estanque son idénticas (el agua no parpadea).

   Para regenerar las referencias después de un cambio visual intencional: `npx playwright test tests/e2e/visual.spec.ts --update-snapshots`, revisar las imágenes y hacer commit.

## Resultados por incremento

| Incremento | Fecha | p50 ms | p95 ms | Draw calls máx. | Mesher p99 / máx. ms por frame | Entidades dibujadas / draw calls máx. | Carga ms | GPU |
|---|---|---|---|---|---|---|---|---|
| incremento 2 (equipo de desarrollo) | 2026-10-10 | 16.6 | 17.1 | 149 | 0.9 / 6.8 | — | 4438 | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| incremento 6, 15 animales (equipo de desarrollo) | 2026-10-10 | 16.7 | 16.8 | 186 | 4.0 / 6.9 | 15 / 19 | 3139 | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| incremento 7, día y noche (equipo de desarrollo) | 2026-10-10 | 16.7 | 17.2 | 186 | 2.3 / 4.3 | 15 / 19 | 3865 | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| incremento 8, noche con 8 zombis (equipo de desarrollo) | 2026-10-10 | 16.7 | 17.3 | 175 | 2.0 / 15.5 | 19 / 22 | 4432 | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11) |