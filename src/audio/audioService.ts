import type { Vec3 } from "../core/math";
import { synthesize, synthesizeMusic, type MusicTrack, type SoundName } from "./synth";

/** La música de día y la de noche se cruzan en 5 s o más (design D12). */
export const MUSIC_FADE_S = 6;
/** La música se genera a menor frecuencia de muestreo (el navegador la convierte). */
const MUSIC_RATE = 22050;

/** Ganancia máxima del bus maestro: nunca más del 80 % (oídos de un niño). */
export const MASTER_CAP = 0.8;
export const DEFAULT_MASTER = 0.6;
export const MAX_ANIMAL_VOICES = 3;
/** Más allá de esta distancia (en bloques) un sonido posicional no se oye. */
export const HEARING_DISTANCE = 24;

export type Bus = "music" | "sfx" | "ambient";
export type Volumes = { master: number; music: number; sfx: number };

type Param = {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
};
type Node = { connect(dest: unknown): unknown; disconnect?(): unknown };
type GainLike = Node & { gain: Param };
type PannerLike = Node & { pan: Param };
type SourceLike = Node & { buffer: unknown; loop: boolean; start(when?: number): void; stop(when?: number): void; onended: (() => void) | null };
type BufferLike = { getChannelData(channel: number): Float32Array };

/** Lo que usa el servicio de un AudioContext (un contexto falso lo implementa en las pruebas). */
export type AudioContextLike = {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: unknown;
  readonly state: string;
  resume(): Promise<void>;
  createGain(): GainLike;
  createStereoPanner(): PannerLike;
  createBufferSource(): SourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
};

export type PlayOptions = {
  bus?: Bus;
  /** Posición en el mundo: se atenúa con la distancia y se reparte entre los dos oídos. */
  pos?: Vec3;
  /** Los animales comparten un límite de voces simultáneas, con prioridad por cercanía. */
  category?: "animal";
  volume?: number;
};

type Voice = { source: SourceLike; distance: number; endsAt: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Audio del juego (ADR-0009): buses master (con tope), music, sfx y ambient sobre Web Audio. El
 * contexto se crea y se reanuda con la primera interacción, como piden los navegadores.
 */
export class AudioService {
  private ctx: AudioContextLike | null = null;
  private master: GainLike | null = null;
  private buses = new Map<Bus, GainLike>();
  private buffers = new Map<SoundName, BufferLike>();
  private animalVoices: Voice[] = [];
  private volumes: Volumes = { master: DEFAULT_MASTER, music: 0.5, sfx: 0.8 };
  private muted = false;
  private listener = { pos: { x: 0, y: 0, z: 0 } as Vec3, yaw: 0 };
  private musicBuffers = new Map<MusicTrack, BufferLike>();
  private music: { track: MusicTrack; source: SourceLike; gain: GainLike } | null = null;
  private wantedMusic: MusicTrack | null = null;
  /** Cuántas veces se pidió cada sonido, haya sonado o no (para las pruebas y el overlay). */
  readonly requests = new Map<string, number>();

  constructor(private readonly createContext: () => AudioContextLike | null) {}

  get isMuted(): boolean {
    return this.muted;
  }

  get isReady(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** Ganancia efectiva del bus maestro (0 si está en silencio). */
  get masterGain(): number {
    return this.muted ? 0 : Math.min(MASTER_CAP, clamp01(this.volumes.master));
  }

  get activeAnimalVoices(): number {
    this.pruneVoices();
    return this.animalVoices.length;
  }

  /** Crea el contexto con la primera interacción del niño (pointerdown o keydown). */
  attachUnlock(target: EventTarget): void {
    const unlock = () => {
      void this.unlock();
      target.removeEventListener("pointerdown", unlock, true);
      target.removeEventListener("keydown", unlock, true);
    };
    target.addEventListener("pointerdown", unlock, true);
    target.addEventListener("keydown", unlock, true);
  }

  /**
   * Crea el contexto (suspendido hasta la primera interacción) y sintetiza los sonidos por adelantado:
   * crear un AudioContext puede tardar, y no debe hacerlo justo cuando el niño pulsa la primera tecla.
   */
  prepare(names: readonly SoundName[]): void {
    const ctx = this.ensureContext();
    if (ctx) for (const name of names) this.buffer(ctx, name);
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== "running") await ctx.resume().catch(() => {});
  }

  setVolumes(v: Volumes): void {
    this.volumes = { master: clamp01(v.master), music: clamp01(v.music), sfx: clamp01(v.sfx) };
    this.applyGains();
  }

  /** Silencio inmediato (en el mismo instante del contexto); al quitarlo vuelve al volumen anterior. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGains();
    if (muted) this.stopAnimalVoices();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setListener(pos: Vec3, yaw: number): void {
    this.listener = { pos: { ...pos }, yaw };
  }

  /** Reproduce un sonido. Devuelve false si no sonó (sin contexto, en silencio, lejos o sin voz libre). */
  play(name: SoundName, opts: PlayOptions = {}): boolean {
    this.requests.set(name, (this.requests.get(name) ?? 0) + 1);
    const ctx = this.ctx;
    // Suspendido, los sonidos se acumularían y sonarían todos juntos al reanudar.
    if (!ctx || this.muted || ctx.state !== "running") return false;
    let gain = opts.volume ?? 1;
    let pan = 0;
    let distance = 0;
    if (opts.pos) {
      const dx = opts.pos.x - this.listener.pos.x;
      const dz = opts.pos.z - this.listener.pos.z;
      distance = Math.hypot(dx, opts.pos.y - this.listener.pos.y, dz);
      if (distance >= HEARING_DISTANCE) return false;
      gain *= 1 - distance / HEARING_DISTANCE;
      // Ángulo respecto a hacia dónde mira la cámara: a la derecha, pan positivo.
      const angle = Math.atan2(dx, dz) - this.listener.yaw;
      pan = Math.max(-1, Math.min(1, -Math.sin(angle)));
    }
    const buffer = this.buffer(ctx, name);
    const duration = buffer.getChannelData(0).length / ctx.sampleRate;
    if (opts.category === "animal" && !this.claimAnimalVoice(distance)) return false;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    let tail: Node = g;
    source.connect(g);
    if (pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, ctx.currentTime);
      g.connect(p);
      tail = p;
    }
    tail.connect(this.buses.get(opts.bus ?? "sfx"));
    source.start(ctx.currentTime);
    if (opts.category === "animal") {
      const voice: Voice = { source, distance, endsAt: ctx.currentTime + duration };
      this.animalVoices.push(voice);
      source.onended = () => (this.animalVoices = this.animalVoices.filter((v) => v !== voice));
    }
    return true;
  }

  get musicTrack(): MusicTrack | null {
    return this.music?.track ?? null;
  }

  /**
   * Cambia la música con un cruce de `MUSIC_FADE_S`: la anterior baja hasta 0 mientras la nueva sube.
   * Sin contexto todavía, queda pedida y empieza cuando se crea.
   */
  setMusic(track: MusicTrack | null): void {
    this.wantedMusic = track;
    if (this.ctx) this.applyMusic(this.ctx);
  }

  private applyMusic(ctx: AudioContextLike): void {
    const track = this.wantedMusic;
    if (this.music?.track === track) return;
    const now = ctx.currentTime;
    if (this.music) {
      const { source, gain } = this.music;
      const from = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(from, now);
      gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_S);
      source.stop(now + MUSIC_FADE_S);
      this.music = null;
    }
    if (!track) return;
    const source = ctx.createBufferSource();
    source.buffer = this.musicBuffer(ctx, track);
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_S);
    source.connect(gain);
    gain.connect(this.buses.get("music"));
    source.start(now);
    this.music = { track, source, gain };
  }

  private musicBuffer(ctx: AudioContextLike, track: MusicTrack): BufferLike {
    let b = this.musicBuffers.get(track);
    if (!b) {
      const data = synthesizeMusic(track, MUSIC_RATE);
      b = ctx.createBuffer(1, data.length, MUSIC_RATE);
      b.getChannelData(0).set(data);
      this.musicBuffers.set(track, b);
    }
    return b;
  }

  private claimAnimalVoice(distance: number): boolean {
    this.pruneVoices();
    if (this.animalVoices.length < MAX_ANIMAL_VOICES) return true;
    let farthest = this.animalVoices[0];
    for (const v of this.animalVoices) if (v.distance > farthest.distance) farthest = v;
    if (farthest.distance <= distance) return false;
    farthest.source.stop();
    this.animalVoices = this.animalVoices.filter((v) => v !== farthest);
    return true;
  }

  private pruneVoices(): void {
    const now = this.ctx?.currentTime ?? 0;
    this.animalVoices = this.animalVoices.filter((v) => v.endsAt > now);
  }

  private stopAnimalVoices(): void {
    for (const v of this.animalVoices) v.source.stop();
    this.animalVoices = [];
  }

  private ensureContext(): AudioContextLike | null {
    if (this.ctx) return this.ctx;
    const ctx = this.createContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const bus of ["music", "sfx", "ambient"] as const) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses.set(bus, g);
    }
    this.applyGains();
    if (this.wantedMusic) this.applyMusic(ctx);
    return ctx;
  }

  private applyGains(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const set = (p: Param, v: number) => {
      p.cancelScheduledValues(now);
      p.setValueAtTime(v, now);
    };
    set(this.master.gain, this.masterGain);
    set(this.buses.get("music")!.gain, this.volumes.music);
    set(this.buses.get("sfx")!.gain, this.volumes.sfx);
    set(this.buses.get("ambient")!.gain, this.volumes.sfx);
  }

  private buffer(ctx: AudioContextLike, name: SoundName): BufferLike {
    let b = this.buffers.get(name);
    if (!b) {
      const data = synthesize(name, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.getChannelData(0).set(data);
      this.buffers.set(name, b);
    }
    return b;
  }
}
