import { CHUNK_RECORD_BYTES, type ChunkRecord, type EntitySnapshot, type GameState, type World } from "../domain/repository/model";

export const EXPORT_FORMAT = "santi-world";

type ExportedChunk = Omit<ChunkRecord, "blocks" | "placed" | "worldId"> & { blocks: string; placed: string };

export type WorldExport = {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  userId: string;
  world: World;
  state: GameState;
  entities: EntitySnapshot[];
  chunks: ExportedChunk[];
};

export function encodeExport(p: { world: World; state: GameState; entities: EntitySnapshot[]; chunks: ChunkRecord[]; now: number }): Blob {
  const doc: WorldExport = {
    format: EXPORT_FORMAT,
    schemaVersion: p.world.schemaVersion,
    exportedAt: p.now,
    userId: p.world.ownerId,
    world: p.world,
    state: p.state,
    entities: p.entities,
    chunks: p.chunks.map((c) => ({ cx: c.cx, cz: c.cz, version: c.version, updatedAt: c.updatedAt, blocks: toBase64(c.blocks), placed: toBase64(c.placed) })),
  };
  return new Blob([JSON.stringify(doc)], { type: "application/json" });
}

/** Valida y decodifica un archivo exportado. Lanza un error con un mensaje claro si no es válido. */
export async function decodeExport(file: Blob): Promise<{ doc: WorldExport; chunks: Omit<ChunkRecord, "worldId">[] }> {
  let doc: WorldExport;
  try {
    doc = JSON.parse(await file.text()) as WorldExport;
  } catch {
    throw new Error("El archivo no es un mundo exportado (no es JSON).");
  }
  if (doc?.format !== EXPORT_FORMAT || !doc.world || !doc.state || !Array.isArray(doc.chunks)) {
    throw new Error("El archivo no es un mundo exportado.");
  }
  const chunks = doc.chunks.map((c) => {
    const blocks = fromBase64(c.blocks);
    const placed = fromBase64(c.placed);
    if (blocks.length !== CHUNK_RECORD_BYTES || placed.length !== CHUNK_RECORD_BYTES / 8) throw new Error("Un chunk del archivo está dañado.");
    return { cx: c.cx, cz: c.cz, version: c.version, updatedAt: c.updatedAt, blocks, placed };
  });
  return { doc, chunks };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
