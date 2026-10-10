# Guía para padres

> Guía mínima. Crece con cada incremento de la Fase 2.

## Cómo abrir el juego

1. Ejecuta `npm run dev` (ver el [README](../README.md)).
2. Abre `http://localhost:5173` y pon el navegador en pantalla completa para el niño.

## Lo que hoy puede hacer el niño

- Moverse con su personaje (W A S D o flechas, Espacio para saltar) y girar la cámara arrastrando con el botón derecho.
- Poner bloques con la Mano y romperlos con el Pico (clic izquierdo), y deshacer la última acción.
- Cuidar a los animales de la granja, defenderse de los zombis de noche, juntar carne en la mochila y hacerse amigo de los lobos con el Collar.
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
- La **noche tranquila**: sin zombis (ni, más adelante, dragón).
- El **volumen** general, de la música y de los efectos (0 a 100).

Los cambios se aplican la próxima vez que se abre el mundo, o al instante si el niño lo está jugando en otra pestaña. Si cambias la duración de la noche mientras ya es de noche, se respeta lo que ya pasó: la noche termina cuando se cumple la nueva duración (o enseguida, si ya la superó). Si activas la noche tranquila de noche, los zombis que haya se van con destellos en 4 segundos o menos.

### El día y la noche

- Un **día del juego** es un día seguido de una noche: por defecto **15 minutos** cada uno (30 minutos en total). El contador "Día N" del niño aumenta en cada amanecer.
- El tiempo **solo pasa mientras se juega**: con la pestaña oculta, la ventana minimizada o el juego cerrado, el reloj se detiene. Al volver a abrir un mundo, sigue a la misma hora en que se guardó.
- El **atardecer** y el **amanecer** duran 30 segundos: la luz, el cielo y la música cambian poco a poco. De noche el cielo es azul oscuro con estrellas y luna, pero los animales y el personaje siempre se distinguen.
- **Un minuto antes de la noche** aparece una luna que parpadea suavemente junto al reloj y suena una campanita una sola vez.
- **Al amanecer** reaparecen, cerca de su lugar, los animales que hayan desaparecido (nunca se duplican, y esto también se guarda).
- La **música** es una canción suave de día y una canción de cuna de noche; se cruzan en 6 segundos. Su volumen se ajusta con el control "Música".

### Los zombis

- Solo aparecen **de noche** (nunca al atardecer ni con la noche tranquila): uno cada 20 segundos, como máximo 8 a la vez, siempre a más de 24 bloques del niño y en terreno natural (pasto, tierra, arena, nieve o piedra), al aire libre y lejos de la luz de las antorchas.
- Son **cartoon**: verdes, sonrientes, con mejillas rosadas, y caminan al **60 %** de la velocidad del niño. Su voz es un "uuuh" bajito.
- **Persiguen** al niño o al animal más cercano buscando un camino: no rompen bloques ni saltan muros de 2 bloques, así que un corral cerrado (y techado, para que nada aparezca adentro) protege a los animales. Si no encuentran camino, se dan por vencidos y pasean.
- Si tocan al niño le quitan **1 corazón** con un empujón suave (después tiene 1 segundo de invulnerabilidad). Si tocan a un animal, este hace "poof" y **reaparece al amanecer**. Nunca rompen construcciones ni quitan cosas.
- Se derrotan con **un golpe** de la mano, el pico o la espada: desaparecen con destellos de colores, sin nada que asuste.
- **Al amanecer** (o al activar la noche tranquila) se van todos con destellos, escalonados en 4 segundos. No se guardan: al reabrir un mundo de noche, vuelven a aparecer de a poco.

### Carne, mochila y antorchas

- Solo la **espada** sobre un animal de la granja lo hace "poof" y deja un pedazo de **carne** flotando (sin sangre ni nada que asuste). El animal **reaparece al amanecer**. La mano y el pico solo le dan un saltito. El cerdo-gallina (más adelante) nunca da carne.
- La carne se recoge caminando cerca (1,5 bloques) o con un clic. **No desaparece** con el tiempo: queda flotando, también al cerrar y reabrir el mundo.
- La **mochila** (🎒 o la tecla E) muestra los diamantes, la carne y los cerdos-gallina con íconos, números y puntos, y **no pausa** el juego. Cada mundo tiene su propia mochila y se guarda con él. Construir **no gasta** nada: los bloques son ilimitados.
- La **antorcha** está en la barra de bloques (🔥). Ilumina de noche y, a su alrededor (luz 8 o más, unos 6 bloques), no aparecen zombis.

### Los lobos

- En la montaña boscosa viven de **4 a 6 lobos** grises de caricatura. Su voz es un "guau-guau" amistoso. **Nunca lastiman al niño.**
- **Una vez por día del juego**, a una hora al azar durante el día, cada lobo baja a la granja a buscar un animal (los patos del estanque no son presa). Si encuentra un hueco en la cerca, atrapa uno con un "poof" (el animal **reaparece al amanecer**) y vuelve a su montaña. Si la granja está **bien cerrada**, acecha desde afuera y se vuelve sin nada; como mucho insiste 2 minutos.
- Un golpe con la mano o el pico hace que un lobo salvaje se aleje. Con **2 golpes de espada** hace "poof" (sin carne) y reaparece al amanecer en su montaña.
- Con el **Collar**, un clic sobre un lobo salvaje a 3 bloques o menos lo **domestica para siempre** (se guarda con el mundo): salen corazones y se le pone un collar rojo. Hasta **3 lobos amigos siguen al niño** (si se aleja más de 30 bloques, aparecen a su lado); los demás **cuidan la granja**. Los lobos amigos **ahuyentan a los zombis** que tocan y nunca cazan ni reciben daño: cualquier golpe solo los hace saltar contentos.

### Exportar e importar (respaldo)

- **"Exportar"** descarga un archivo `Nombre.santi.json` con todo el mundo: guárdalo donde quieras como respaldo.
- **"Importar mundo…"** carga uno de esos archivos como un mundo **nuevo** (no reemplaza a ninguno). Un archivo que no sea un mundo se rechaza sin cambiar nada.

### PIN (opcional)

- Por defecto **no hay PIN**: la vista se abre directamente.
- En "PIN de acceso" puedes activar un PIN de **4 dígitos**. Desde entonces se pide al entrar. Tras **5 intentos fallidos** se bloquea durante **60 segundos** (recargar la página no lo salta).
- El PIN se guarda cifrado (un hash con sal, nunca el número). Es **disuasorio**: sirve para que el niño no entre por casualidad, pero no es seguridad real, porque los datos están en este navegador.
- **Si lo olvidas**: abre `http://localhost:5173/padres/`, pulsa `F12`, ve a *Application* (Aplicación) → *IndexedDB* → `minecraf-de-santi` → `meta` y borra la fila `pinHash`. Recarga la página y entrarás sin PIN.
