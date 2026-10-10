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
- Si un guardado falla (por ejemplo, porque el disco está lleno), aparece un ícono **⚠️💾** arriba a la derecha y el mundo actual no se reemplaza. El detalle del error queda registrado en la base (`meta` → `errorLog`) y en la consola del navegador (`F12`).
- Borrar los "datos de navegación" o "datos de sitios" del navegador **borra los mundos**. Usa **"Exportar"** en la vista de padres para guardar un respaldo en un archivo.

## El mundo de la versión 1 ("Mi primer mundo")

- La primera vez que se abre esta versión, el mundo que Santi construyó en la versión 1 se importa como **"Mi primer mundo"**: una pradera grande con su construcción en el centro, exactamente igual.
- Los datos originales **no se borran**: quedan en `localStorage` con el nombre `minecraf-de-santi-world-v2-backup`.
- Si la importación falla (por ejemplo, porque los datos estaban dañados), el juego empieza con un mundo nuevo, los datos originales quedan sin tocar y lo vuelve a intentar en el siguiente arranque.
- **Volver a la versión 1** (si hiciera falta): en la consola del navegador (`F12`), ejecuta
  `localStorage.setItem("minecraf-de-santi-world-v2", localStorage.getItem("minecraf-de-santi-world-v2-backup"))`
  y abre la versión 1 del juego.

## Vista de padres

### Cómo entrar

Escribe en la barra de direcciones **`http://localhost:5173/padres/`** (también funciona sin la barra final). Desde la pantalla del niño **no hay ningún botón, enlace ni atajo** que lleve aquí, a propósito. Puedes tenerla abierta en otra pestaña mientras el niño juega: la lista se actualiza sola cada vez que el juego guarda.

### Histórico de mundos

Cada tarjeta muestra la miniatura, el nombre, la fecha de creación, la de última modificación y el día del juego al que llegó. El más reciente va primero. Si un mundo nunca generó miniatura, se ve un paisaje genérico. Arriba a la derecha aparece cuánto espacio usan los mundos en este navegador.

### Ver un mundo sin tocarlo

**"Ver"** abre el mundo en 3D: arrastra para girar, usa la rueda para acercar y el botón derecho para desplazarte. Es **solo lectura**: no corre el juego, no avanza el tiempo y no se guarda nada. Si el niño está jugando ese mundo en otra pestaña, ves el último guardado (como mucho de hace 30 segundos).

### Borrar y restaurar

- **"Borrar"** pide confirmación. El mundo desaparece del histórico y de "Mis Mundos" del niño y pasa a la **Papelera**.
- Desde la papelera, **"Restaurar"** lo devuelve tal cual estaba. Cada mundo indica cuántos días le quedan.
- A los **30 días** en la papelera se elimina definitivamente (al abrir el juego o esta vista).
- Si borras el mundo que el niño tiene abierto, el juego sigue guardando sobre él (en la papelera, con lo último que construyó) y la próxima vez que se abra el juego entrará al mundo más reciente que quede, o a uno nuevo si no queda ninguno.

### Configurar un mundo

**"Configurar"** permite elegir, para ese mundo:

- La duración del **día** y de la **noche**, de **2 a 30 minutos** cada una. Si escribes un valor fuera de ese rango, se ajusta al límite y se te avisa.
- La **noche tranquila**: sin zombis ni dragón.
- El **volumen** general, de la música y de los efectos (0 a 100).

Los cambios se aplican la próxima vez que se abre el mundo, o al instante si el niño lo está jugando en otra pestaña. (El ciclo de día y noche, los enemigos y el sonido llegan en los próximos incrementos; la configuración ya queda guardada.)

### Exportar e importar (respaldo)

- **"Exportar"** descarga un archivo `Nombre.santi.json` con todo el mundo: guárdalo donde quieras como respaldo.
- **"Importar mundo…"** carga uno de esos archivos como un mundo **nuevo** (no reemplaza a ninguno). Un archivo que no sea un mundo se rechaza sin cambiar nada.

### PIN (opcional)

- Por defecto **no hay PIN**: la vista se abre directamente.
- En "PIN de acceso" puedes activar un PIN de **4 dígitos**. Desde entonces se pide al entrar. Tras **5 intentos fallidos** se bloquea durante **60 segundos** (recargar la página no lo salta).
- El PIN se guarda cifrado (un hash con sal, nunca el número). Es **disuasorio**: sirve para que el niño no entre por casualidad, pero no es seguridad real, porque los datos están en este navegador.
- **Si lo olvidas**: abre `http://localhost:5173/padres/`, pulsa `F12`, ve a *Application* (Aplicación) → *IndexedDB* → `minecraf-de-santi` → `meta` y borra la fila `pinHash`. Recarga la página y entrarás sin PIN.
