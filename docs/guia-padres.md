# Guía para padres

> Guía mínima. Crece con cada incremento de la Fase 2.

## Cómo abrir el juego

1. Ejecuta `npm run dev` (ver el [README](../README.md)).
2. Abre `http://localhost:5173` y pon el navegador en pantalla completa para el niño.

## Lo que hoy puede hacer el niño

- Poner bloques (botón "Poner", elegir un bloque de la paleta y tocar donde construir).
- Quitar bloques (botón "Quitar" o clic derecho).
- Deshacer la última acción.
- Girar la cámara arrastrando con el mouse.
- Ver sus mundos en **"🌍 Mis Mundos"** y volver a cualquiera de ellos.
- **"＋ Crear nuevo mundo"**: guarda el mundo actual y recién después crea uno nuevo. Ya no existe "Empezar de nuevo": desde la pantalla del niño no se puede borrar ningún mundo.

## Dónde se guardan los mundos

- Todo se guarda **solo en este navegador**, en IndexedDB (base de datos `minecraf-de-santi`). No se envía nada por internet.
- El juego guarda solo: cada 30 segundos si hubo cambios, al cambiar de pestaña o minimizar, al cerrar la pestaña y antes de crear o abrir otro mundo.
- En el primer guardado, el juego le pide al navegador que **no borre estos datos** cuando falte espacio (`navigator.storage.persist()`). Algunos navegadores lo conceden solos y otros preguntan.
- Si un guardado falla (por ejemplo, porque el disco está lleno), aparece un ícono **⚠️💾** arriba a la derecha y el mundo actual no se reemplaza. El detalle del error queda registrado para la vista de padres (incremento 4). Mientras tanto, se puede ver en la consola del navegador (`F12`).
- Borrar los "datos de navegación" o "datos de sitios" del navegador **borra los mundos**. La vista de padres permitirá exportarlos a un archivo como respaldo.

## El mundo de la versión 1 ("Mi primer mundo")

- La primera vez que se abre esta versión, el mundo que Santi construyó en la versión 1 se importa como **"Mi primer mundo"**: una pradera grande con su construcción en el centro, exactamente igual.
- Los datos originales **no se borran**: quedan en `localStorage` con el nombre `minecraf-de-santi-world-v2-backup`.
- Si la importación falla (por ejemplo, porque los datos estaban dañados), el juego empieza con un mundo nuevo, los datos originales quedan sin tocar y lo vuelve a intentar en el siguiente arranque.
- **Volver a la versión 1** (si hiciera falta): en la consola del navegador (`F12`), ejecuta
  `localStorage.setItem("minecraf-de-santi-world-v2", localStorage.getItem("minecraf-de-santi-world-v2-backup"))`
  y abre la versión 1 del juego.

## Vista de padres (llega en el incremento 4)

Estará en una dirección aparte, `http://localhost:5173/padres/`, sin ningún enlace desde la pantalla del niño. Desde ahí se podrá:

- Ver el histórico de mundos, con su fecha y su miniatura.
- Abrir un mundo en modo de solo lectura.
- Borrar mundos, con confirmación y papelera.
- Exportar e importar un mundo como archivo de respaldo.
- Configurar la duración del día y la noche, la "noche tranquila" (sin zombis) y el volumen.
