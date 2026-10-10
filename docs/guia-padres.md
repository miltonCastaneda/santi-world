# Guía para padres

> Guía mínima. Crece con cada incremento de la Fase 2.

## Cómo abrir el juego

1. Ejecuta `npm run dev` (ver el [README](../README.md)).
2. Abre `http://localhost:5173` y pon el navegador en pantalla completa para el niño.

## Lo que hoy puede hacer el niño (v1.0.0)

- Poner bloques de colores (botón "Poner" y luego tocar un bloque).
- Quitar bloques (botón "Quitar" o clic derecho).
- Deshacer la última acción.
- Girar la cámara arrastrando con el mouse.

> Cuidado: hoy "Empezar de nuevo" borra el mundo actual sin guardar una copia. La Fase 2 lo reemplaza por "Crear nuevo mundo", que guarda primero.

## Vista de padres (llega en la Fase 2)

Estará en una dirección aparte, `http://localhost:5173/padres/`, sin ningún enlace desde la pantalla del niño. Desde ahí se podrá:

- Ver el histórico de mundos, con su fecha y su miniatura.
- Abrir un mundo en modo de solo lectura.
- Borrar mundos, con confirmación y papelera.
- Configurar la duración del día y la noche, la "noche tranquila" (sin zombis) y el volumen.
