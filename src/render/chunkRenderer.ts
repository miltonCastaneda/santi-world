import * as THREE from "three";
import { chunkKey, CHUNK_HEIGHT, CHUNK_SIZE } from "../domain/world/chunk";
import type { ChunkStore } from "../domain/world/chunkStore";
import type { WorldGenSpec } from "../domain/worldgen/generator";
import { LIGHT_REACH } from "../domain/world/light";
import type { BlockMaterials } from "./blockMaterial";
import { meshChunk, type ChunkMeshData, type MeshData } from "./chunkMesher";
import type { MeshRequest, MeshResponse } from "./meshWorker";

export type ChunkRendererOptions = {
  /** Radio de chunks que se dibujan alrededor del foco. */
  viewRadius: number;
  /** Radio a partir del cual se liberan (histéresis). */
  unloadRadius: number;
  /** Tiempo máximo por frame para crear geometría en el hilo principal. */
  budgetMs: number;
  workers: number;
};

export type ChunkRenderStats = {
  /** Milisegundos de trabajo del mesher en el hilo principal en el último frame. */
  mainThreadMs: number;
  maxMainThreadMs: number;
  /** Tiempo medio de luz + mesh por chunk en los workers. */
  workerMsAvg: number;
  meshed: number;
  pending: number;
  inFlight: number;
  loadedChunks: number;
  /** Trabajos de mallado terminados desde el inicio. */
  jobs: number;
};

type Job = { cx: number; cz: number; priority: number };
type Slot = { worker: Worker | null; busy: boolean };

const DEFAULTS: ChunkRendererOptions = { viewRadius: 6, unloadRadius: 8, budgetMs: 4, workers: 1 };
const EDIT_PRIORITY = -1000;

/**
 * Dibuja el mundo por chunks: decide qué chunks cargar alrededor del foco, encarga la geometría a
 * los workers por prioridad y la aplica en el hilo principal con un presupuesto por frame.
 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly options: ChunkRendererOptions;
  readonly stats: ChunkRenderStats = { mainThreadMs: 0, maxMainThreadMs: 0, workerMsAvg: 0, meshed: 0, pending: 0, inFlight: 0, loadedChunks: 0, jobs: 0 };
  private meshes = new Map<string, { opaque: THREE.Mesh | null; water: THREE.Mesh | null }>();
  private pending = new Map<string, Job>();
  /** Trabajos en los workers: chunk y versión de sus bloques al encargarlo. */
  private inFlight = new Map<number, { key: string; version: number }>();
  private inFlightKeys = new Set<string>();
  /** Versión de los bloques con la que se hizo la malla que se ve de cada chunk. */
  private meshVersions = new Map<string, number>();
  private results: MeshResponse[] = [];
  private slots: Slot[] = [];
  private nextId = 1;
  private focus: { cx: number; cz: number } | null = null;
  private workerMsTotal = 0;
  private workerJobs = 0;
  private applyMsEstimate = 0.5;
  /** Duraciones recientes de update() con trabajo, para diagnóstico. */
  readonly updateSamples: number[] = [];

  constructor(
    private store: ChunkStore,
    /** Semilla y generador: los workers regeneran los chunks no modificados en lugar de recibirlos. */
    private gen: WorldGenSpec,
    private materials: BlockMaterials,
    options: Partial<ChunkRendererOptions> = {},
    createWorker: (() => Worker) | null = defaultWorkerFactory(),
  ) {
    this.options = { ...DEFAULTS, ...options };
    const useWorkers = createWorker !== null && this.options.workers > 0;
    const count = useWorkers ? this.options.workers : 1;
    for (let i = 0; i < count; i++) {
      const worker = useWorkers ? createWorker() : null;
      const slot: Slot = { worker, busy: false };
      if (worker) {
        worker.onmessage = (e: MessageEvent<MeshResponse>) => {
          slot.busy = false;
          this.results.push(e.data);
        };
      }
      this.slots.push(slot);
    }
  }

  /** Mueve el centro de carga (en bloques). Encola lo que falta y libera lo lejano. */
  setFocus(x: number, z: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (this.focus && this.focus.cx === cx && this.focus.cz === cz) return;
    this.focus = { cx, cz };
    const { viewRadius, unloadRadius } = this.options;

    for (let dz = -viewRadius; dz <= viewRadius; dz++) {
      for (let dx = -viewRadius; dx <= viewRadius; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > viewRadius + 0.5) continue;
        const ccx = cx + dx;
        const ccz = cz + dz;
        if (!this.store.chunkInBounds(ccx, ccz)) continue;
        const key = chunkKey(ccx, ccz);
        if (!this.meshes.has(key) && !this.inFlightKeys.has(key)) this.request(ccx, ccz, d);
      }
    }

    for (const key of [...this.meshes.keys(), ...this.pending.keys()]) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.hypot(kx - cx, kz - cz) > unloadRadius) this.drop(key);
    }
    for (const chunk of [...this.store.loadedChunks()]) {
      if (Math.hypot(chunk.cx - cx, chunk.cz - cz) > unloadRadius + 1) this.store.unload(chunk.cx, chunk.cz);
    }
  }

  /** Un bloque cambió: remallar su chunk primero y luego los que alcanza su luz. */
  invalidateBlock(x: number, z: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const reach = Math.ceil(LIGHT_REACH / CHUNK_SIZE);
    for (const c of this.store.affectedChunks(x, z)) this.requestIfVisible(c.cx, c.cz, EDIT_PRIORITY + (c.cx === cx && c.cz === cz ? 0 : 1));
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) this.requestIfVisible(cx + dx, cz + dz, EDIT_PRIORITY / 2);
    }
  }

  /** Vuelve a dibujar todo (por ejemplo, al reemplazar el mundo). */
  rebuildAll(store: ChunkStore, gen: WorldGenSpec): void {
    this.store = store;
    this.gen = gen;
    for (const key of [...this.meshes.keys()]) this.drop(key);
    this.pending.clear();
    // Los resultados que lleguen del mundo anterior se descartan: ya no tienen clave en vuelo.
    this.inFlight.clear();
    this.inFlightKeys.clear();
    this.results.length = 0;
    const f = this.focus;
    this.focus = null;
    if (f) this.setFocus(f.cx * CHUNK_SIZE, f.cz * CHUNK_SIZE);
  }

  /** Llamar una vez por frame. */
  update(): void {
    const t0 = performance.now();
    const budget = this.options.budgetMs;

    // Primero los resultados y después los encargos: un chunk que cambió mientras se mallaba deja de
    // estar "en vuelo" y se puede volver a encargar en este mismo frame, antes que trabajos de menos prioridad.
    let applied = 0;
    while (this.results.length > 0) {
      const elapsed = performance.now() - t0;
      // Se aplica una geometría solo si su costo estimado cabe en lo que queda del presupuesto.
      if (applied > 0 && elapsed + this.applyMsEstimate > budget) break;
      if (applied === 0 && elapsed > budget) break;
      const res = this.results.shift()!;
      const job = this.inFlight.get(res.id);
      this.inFlight.delete(res.id);
      if (job) this.inFlightKeys.delete(job.key);
      this.workerMsTotal += res.ms;
      this.workerJobs++;
      if (!job || !this.isWanted(res.cx, res.cz)) continue;
      const ta = performance.now();
      this.apply(res.cx, res.cz, res.data);
      this.meshVersions.set(job.key, job.version);
      this.applyMsEstimate = this.applyMsEstimate * 0.8 + (performance.now() - ta) * 0.2;
      applied++;
    }

    for (const slot of this.slots) {
      if (slot.busy || this.pending.size === 0) continue;
      if (!slot.worker && performance.now() - t0 > budget) break;
      const job = this.takeNext();
      if (!job) break;
      const id = this.nextId++;
      const key = chunkKey(job.cx, job.cz);
      this.inFlight.set(id, { key, version: this.store.peek(job.cx, job.cz)?.version ?? 0 });
      this.inFlightKeys.add(key);
      if (slot.worker) {
        slot.busy = true;
        const req = this.buildRequest(id, job);
        slot.worker.postMessage(req, req.overrides.map((c) => c.blocks.buffer));
      } else {
        const t = performance.now();
        const data = meshChunk(this.store, job.cx, job.cz);
        this.results.push({ id, cx: job.cx, cz: job.cz, data, ms: performance.now() - t });
      }
    }

    const ms = performance.now() - t0;
    this.stats.mainThreadMs = ms;
    this.stats.maxMainThreadMs = Math.max(this.stats.maxMainThreadMs, ms);
    if (ms > 0.01) {
      this.updateSamples.push(ms);
      if (this.updateSamples.length > 4000) this.updateSamples.shift();
    }
    this.stats.workerMsAvg = this.workerJobs ? this.workerMsTotal / this.workerJobs : 0;
    this.stats.jobs = this.workerJobs;
    this.stats.meshed = this.meshes.size;
    this.stats.pending = this.pending.size;
    this.stats.inFlight = this.inFlight.size;
    this.stats.loadedChunks = [...this.store.loadedChunks()].length;
  }

  /** Verdadero cuando no queda trabajo pendiente (todo lo visible está dibujado). */
  get idle(): boolean {
    return this.pending.size === 0 && this.inFlight.size === 0 && this.results.length === 0;
  }

  /** El chunk (cx, cz) ya tiene su malla en la escena (aunque esté vacía). */
  isMeshed(cx: number, cz: number): boolean {
    return this.meshes.has(chunkKey(cx, cz));
  }

  /** La malla que se ve del chunk ya incluye su último cambio de bloques. */
  isUpToDate(cx: number, cz: number): boolean {
    const shown = this.meshVersions.get(chunkKey(cx, cz));
    return shown !== undefined && shown >= (this.store.peek(cx, cz)?.version ?? 0);
  }

  resetMaxStats(): void {
    this.stats.maxMainThreadMs = 0;
    this.updateSamples.length = 0;
  }

  dispose(): void {
    for (const key of [...this.meshes.keys()]) this.drop(key);
    for (const slot of this.slots) slot.worker?.terminate();
  }

  private isWanted(cx: number, cz: number): boolean {
    if (!this.focus) return false;
    return Math.hypot(cx - this.focus.cx, cz - this.focus.cz) <= this.options.unloadRadius;
  }

  private request(cx: number, cz: number, priority: number): void {
    const key = chunkKey(cx, cz);
    const existing = this.pending.get(key);
    if (!existing || existing.priority > priority) this.pending.set(key, { cx, cz, priority });
  }

  private requestIfVisible(cx: number, cz: number, priority: number): void {
    if (!this.store.chunkInBounds(cx, cz)) return;
    const key = chunkKey(cx, cz);
    if (this.meshes.has(key) || this.pending.has(key) || this.inFlightKeys.has(key)) this.request(cx, cz, priority);
  }

  private takeNext(): Job | null {
    let best: Job | null = null;
    for (const job of this.pending.values()) {
      if (this.inFlightKeys.has(chunkKey(job.cx, job.cz))) continue;
      if (!best || job.priority < best.priority) best = job;
    }
    if (best) this.pending.delete(chunkKey(best.cx, best.cz));
    return best;
  }

  private buildRequest(id: number, job: Job): MeshRequest {
    const overrides: MeshRequest["overrides"] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.store.isModified(job.cx + dx, job.cz + dz)) continue;
        const c = this.store.peek(job.cx + dx, job.cz + dz);
        if (c) overrides.push({ cx: c.cx, cz: c.cz, blocks: c.blocks.slice() });
      }
    }
    return { id, cx: job.cx, cz: job.cz, gen: this.gen, sizeInChunks: this.store.sizeInChunks, overrides };
  }

  private apply(cx: number, cz: number, data: ChunkMeshData): void {
    const key = chunkKey(cx, cz);
    const old = this.meshes.get(key);
    const make = (d: MeshData, material: THREE.Material, order: number): THREE.Mesh | null => {
      if (d.faceCount === 0) return null;
      const mesh = new THREE.Mesh(toGeometry(d), material);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      return mesh;
    };
    // Primero se agrega la geometría nueva y después se quita la vieja: nunca hay un frame con hueco.
    const next = { opaque: make(data.opaque, this.materials.opaque, 0), water: make(data.water, this.materials.water, 1) };
    if (old) disposeEntry(this.group, old);
    this.meshes.set(key, next);
  }

  private drop(key: string): void {
    const entry = this.meshes.get(key);
    if (entry) disposeEntry(this.group, entry);
    this.meshes.delete(key);
    this.meshVersions.delete(key);
    this.pending.delete(key);
  }
}

function disposeEntry(group: THREE.Group, entry: { opaque: THREE.Mesh | null; water: THREE.Mesh | null }): void {
  for (const m of [entry.opaque, entry.water]) {
    if (!m) continue;
    group.remove(m);
    m.geometry.dispose();
  }
}

export function toGeometry(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(d.normals, 3));
  g.setAttribute("tileUv", new THREE.BufferAttribute(d.uvs, 2));
  g.setAttribute("tileLayer", new THREE.BufferAttribute(d.layers, 1));
  g.setAttribute("shade", new THREE.BufferAttribute(d.shade, 3));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.boundingSphere = CHUNK_BOUNDS.clone();
  return g;
}

/** Toda la geometría de un chunk cabe en su volumen; evita recorrer los vértices en el hilo principal. */
const CHUNK_BOUNDS = new THREE.Sphere(
  new THREE.Vector3(CHUNK_SIZE / 2, CHUNK_HEIGHT / 2, CHUNK_SIZE / 2),
  Math.hypot(CHUNK_SIZE / 2, CHUNK_HEIGHT / 2, CHUNK_SIZE / 2),
);

function defaultWorkerFactory(): (() => Worker) | null {
  if (typeof Worker === "undefined") return null;
  return () => new Worker(new URL("./meshWorker.ts", import.meta.url), { type: "module" });
}
