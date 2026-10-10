import type { Vec3 } from "../../core/math";
import type { BlockId } from "../blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../world/chunk";
import type { GeneratorKind } from "../worldgen/generator";

/** Versión de los documentos guardados (World y GameState). Sube con cada cambio de forma. */
export const SCHEMA_VERSION = 1;

export type User = { id: string; name: string; createdAt: number };

/** Tiempo que un mundo borrado se puede restaurar antes de eliminarse definitivamente. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type WorldSettings = {
  dayMinutes: number;
  nightMinutes: number;
  quietNight: boolean;
  volume: { master: number; music: number; sfx: number };
};

export const DEFAULT_SETTINGS: WorldSettings = {
  dayMinutes: 15,
  nightMinutes: 15,
  quietNight: false,
  volume: { master: 0.6, music: 0.5, sfx: 0.8 },
};

export type World = {
  id: string;
  ownerId: string;
  name: string;
  seed: string;
  generator: GeneratorKind;
  generatorVersion: number;
  schemaVersion: number;
  /** Sube con cada guardado. */
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  dayCount: number;
  settings: WorldSettings;
};

export type CameraView = { position: Vec3; target: Vec3 };

export type GameState = {
  worldId: string;
  schemaVersion: number;
  version: number;
  updatedAt: number;
  timeOfCycleMs: number;
  dayCount: number;
  player: { pos: Vec3 | null; yaw: number; hearts: number; selectedTool: string; selectedBlock: BlockId };
  /** Cámara orbital (hasta que llegue el personaje en el incremento 5). */
  camera: CameraView | null;
  inventory: { diamond: number; meat: number; pigChicken: number };
  pendingRespawns: string[];
  burntTrees: string[];
  minedOres: string[];
  dragon: { hitsTaken: number; defeatedTonight: boolean };
};

export type EntitySnapshot = {
  id: string;
  worldId: string;
  kind: string;
  species: string;
  pos: Vec3;
  vel: Vec3;
  state: string;
  slotId?: string;
  tamed?: boolean;
  homeId?: string;
  hp?: number;
  data?: Record<string, unknown>;
};

/** Un chunk modificado tal como se guarda. Los que no están se regeneran con la semilla. */
export type ChunkRecord = {
  worldId: string;
  cx: number;
  cz: number;
  version: number;
  updatedAt: number;
  blocks: Uint8Array<ArrayBuffer>;
  placed: Uint8Array<ArrayBuffer>;
};

export const CHUNK_RECORD_BYTES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

export type NewWorld = { ownerId: string; name: string; seed: string; generator: GeneratorKind; generatorVersion: number };

export type SaveSnapshot = {
  world: World;
  state: GameState;
  entities: EntitySnapshot[];
  dirtyChunks: ChunkRecord[];
  thumbnail?: Blob;
};

export function defaultGameState(worldId: string, now: number): GameState {
  return {
    worldId,
    schemaVersion: SCHEMA_VERSION,
    version: 0,
    updatedAt: now,
    timeOfCycleMs: 0,
    dayCount: 1,
    player: { pos: null, yaw: 0, hearts: 5, selectedTool: "hand", selectedBlock: "grass" },
    camera: null,
    inventory: { diamond: 0, meat: 0, pigChicken: 0 },
    pendingRespawns: [],
    burntTrees: [],
    minedOres: [],
    dragon: { hitsTaken: 0, defeatedTonight: false },
  };
}
