# ADR 0012: Protección ligera de la vista de padres (ruta oculta + PIN opcional desactivado por defecto)

- **Estado**: Aceptado (incremento 4)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `vista-de-padres`, requisito B4)

## Contexto

El requisito B4 pide evaluar y proponer, sin imponer, una protección opcional para la vista de padres. Hoy el juego es local y de un solo dispositivo. Un niño de 4 años no escribe URLs, pero podría encontrar la vista en el historial del navegador. En el futuro (online) hará falta una autenticación real.

## Decisión

- **Ahora**: la protección principal es la **ruta oculta** (no hay enlaces desde la UI del niño; ver ADR-0008).
- **PIN opcional de 4 dígitos, desactivado por defecto**, configurable desde la vista de padres:
  - Se guarda como un hash **PBKDF2-SHA-256 con sal** (WebCrypto, 100 000 iteraciones) en `meta`.
  - Tras 5 intentos fallidos, se bloquea durante 60 s.
  - Si se olvida el PIN, se puede restablecer con un procedimiento documentado en la guía de padres (borrar `meta.pinHash` desde las herramientas del navegador).
- **Futuro online**: autenticación real del adulto (cuenta y sesión) en el servidor, con `/padres/` protegida por el servidor. El PIN local se mantiene como "bloqueo de dispositivo".

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Ruta oculta + PIN opcional (elegida) | Cero fricción por defecto; disuade al niño; sin backend | No es seguridad real: los datos locales son accesibles desde las herramientas del navegador |
| PIN obligatorio | Más protección | Fricción para los padres y riesgo de bloquearse sin necesidad hoy |
| "Puerta para padres" (una cuenta o mantener pulsado 3 s) | Habitual en apps infantiles | Un niño puede aprenderla; sigue sin ser seguridad real |
| Autenticación real ahora | Segura | Requiere backend: fuera de alcance (ADR-0002) |

## Consecuencias

- Positivas: cumple B4 sin imponer nada y deja preparado el camino online.
- Negativas: protección solo disuasoria, documentada como tal en la guía de padres.

## Implementación (incremento 4)

- `src/persistence/pin.ts` (`PinGuard`): `meta.pinHash = { salt, hash, iterations }` y `meta.pinLock = { failures, lockedUntil }`. El bloqueo se guarda en la base, así que recargar la página no lo salta.
- La pantalla de PIN (`pinGate` en `src/ui/parents/parentsView.ts`) se muestra solo si hay `pinHash`.
- Restablecer: borrar la fila `pinHash` de `meta` desde las herramientas del navegador (guía de padres).
