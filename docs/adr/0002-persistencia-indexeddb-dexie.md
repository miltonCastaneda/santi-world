# ADR 0002: Persistencia local con IndexedDB (Dexie) detrás de WorldRepository, sin backend por ahora

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `mundos-y-persistencia`)

## Contexto

Hoy el único mundo se serializa completo en `localStorage` en cada acción. La Fase 2 necesita:

- Varios mundos.
- Mundos 64 veces más grandes.
- Guardado transaccional ("guardar antes de limpiar").
- Autoguardado sin congelar el juego.
- Esquema versionado con migraciones.
- La posibilidad de migrar a un backend más adelante.

## Decisión

1. Usar **IndexedDB mediante Dexie 4** como almacenamiento local.
2. Acceder siempre a través del puerto **`WorldRepository`**, con dos implementaciones: `DexieWorldRepository` (producción) e `InMemoryWorldRepository` (pruebas).
3. **No crear un backend en la Fase 2**. Se crea cuando se cumpla alguno de estos criterios: jugar desde 2 o más dispositivos, multiusuario o publicación.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| IndexedDB + Dexie (elegida) | Asíncrono; cuota de cientos de MB; transacciones; guarda binarios (`Uint8Array`, `Blob`); Dexie trae **versionado y `upgrade()` nativo**, índices compuestos y buen soporte TS (unos 30 KB gz) | Una dependencia nueva; IndexedDB puede ser desalojado si no se llama a `persist()` |
| IndexedDB nativo o `idb` (1 KB) | Mínimo o sin dependencia | Las migraciones y consultas compuestas se escriben a mano; más código propio que mantener y probar |
| `localStorage` | Ya se usa | Síncrono (bloquea el frame), unos 5 MB, solo strings, sin transacciones: no cumple el spec |
| SQLite WASM + OPFS | SQL real y facilidad de pasar a Postgres | Unos 1 MB de WASM, configuración de COOP/COEP, complejidad desproporcionada para un usuario |
| Backend ahora (Node + Postgres, Supabase, etc.) | Preparado para online | Hosting, cuentas, privacidad de un menor y operación, sin necesidad hoy; viola "solo local" |

## Consecuencias

- Positivas:
  - Guardado incremental de los chunks modificados en una sola transacción.
  - Pruebas de contrato contra memoria y Dexie (con `fake-indexeddb`).
  - Pasar a online consiste en implementar `HttpWorldRepository`.
- Negativas: depende de Dexie, y hay que gestionar el desalojo con `navigator.storage.persist()` y exportaciones.
- Reversión: como todo pasa por el puerto, se puede cambiar Dexie por `idb` o nativo sin tocar el dominio.
- Criterio de sincronización futura: `updatedAt` y `version` por chunk, con "gana la última escritura" al principio.
