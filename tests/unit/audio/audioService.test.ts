import { describe, expect, it } from "vitest";
import { AudioService, MASTER_CAP, MAX_ANIMAL_VOICES, type AudioContextLike } from "../../../src/audio/audioService";
import { SOUND_NAMES, synthesize } from "../../../src/audio/synth";

class FakeParam {
  value = 1;
  setValueAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}

class FakeNode {
  outputs: unknown[] = [];
  connect(dest: unknown) {
    this.outputs.push(dest);
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  state = "suspended";
  gains: (FakeNode & { gain: FakeParam })[] = [];
  sources: FakeSource[] = [];
  async resume() {
    this.state = "running";
  }
  createGain() {
    const g = Object.assign(new FakeNode(), { gain: new FakeParam() });
    this.gains.push(g);
    return g;
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(), { pan: new FakeParam() });
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

async function setup() {
  const ctx = new FakeContext();
  const audio = new AudioService(() => ctx);
  await audio.unlock();
  // El primer nodo de ganancia es el maestro (conectado al destino).
  const master = ctx.gains[0];
  return { ctx, audio, master };
}

describe("[experiencia-infantil] Audio controlado", () => {
  it("no crea el contexto hasta la primera interacción", async () => {
    let created = 0;
    const audio = new AudioService(() => {
      created++;
      return new FakeContext();
    });
    expect(audio.play("click")).toBe(false);
    expect(created).toBe(0);
    const target = new EventTarget();
    audio.attachUnlock(target);
    target.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(created).toBe(1);
    expect(audio.isReady).toBe(true);
  });

  it("preparado de antemano, no suena (ni acumula sonidos) hasta la primera interacción", async () => {
    const ctx = new FakeContext();
    const audio = new AudioService(() => ctx);
    audio.prepare(SOUND_NAMES);
    expect(audio.isReady).toBe(false);
    expect(audio.play("click")).toBe(false);
    expect(ctx.sources).toHaveLength(0);
    await audio.unlock();
    expect(audio.play("click")).toBe(true);
  });

  it("volumen maestro inicial del 60 % y tope del 80 %", async () => {
    const { audio, master } = await setup();
    expect(master.gain.value).toBeCloseTo(0.6);
    audio.setVolumes({ master: 1, music: 1, sfx: 1 });
    expect(master.gain.value).toBe(MASTER_CAP);
    audio.setVolumes({ master: 5, music: 1, sfx: 1 });
    expect(master.gain.value).toBe(MASTER_CAP);
  });

  it("[experiencia-infantil] Silencio: deja de sonar todo al instante y vuelve al volumen anterior", async () => {
    const { ctx, audio, master } = await setup();
    audio.setVolumes({ master: 0.5, music: 0.5, sfx: 0.5 });
    ctx.currentTime = 12.3;
    expect(audio.toggleMute()).toBe(true);
    expect(master.gain.value).toBe(0);
    expect(audio.play("click")).toBe(false);
    expect(audio.toggleMute()).toBe(false);
    expect(master.gain.value).toBe(0.5);
    expect(audio.play("click")).toBe(true);
  });

  it("[experiencia-infantil] Muchos animales: como máximo 3 sonidos a la vez, los más cercanos", async () => {
    const { audio } = await setup();
    audio.setListener({ x: 0, y: 0, z: 0 }, 0);
    let played = 0;
    for (let i = 0; i < 20; i++) if (audio.play("boing", { category: "animal", pos: { x: 10 - i * 0.4, y: 0, z: 0 } })) played++;
    expect(audio.activeAnimalVoices).toBe(MAX_ANIMAL_VOICES);
    expect(played).toBeGreaterThan(3);
    // Uno más lejano que todos los activos no se oye.
    expect(audio.play("boing", { category: "animal", pos: { x: 20, y: 0, z: 0 } })).toBe(false);
    expect(audio.activeAnimalVoices).toBe(MAX_ANIMAL_VOICES);
  });

  it("los sonidos posicionales se atenúan con la distancia y no se oyen a 24 bloques o más", async () => {
    const { audio, ctx } = await setup();
    audio.setListener({ x: 0, y: 0, z: 0 }, 0);
    expect(audio.play("step", { pos: { x: 0, y: 0, z: 30 } })).toBe(false);
    expect(audio.play("step", { pos: { x: 0, y: 0, z: 12 } })).toBe(true);
    const voiceGain = ctx.gains[ctx.gains.length - 1];
    expect(voiceGain.gain.value).toBeCloseTo(0.5);
  });

  it("los sonidos generados son cortos y suaves (pico de 0,5 o menos)", () => {
    for (const name of SOUND_NAMES) {
      const data = synthesize(name, 22050);
      expect(data.length / 22050, name).toBeLessThanOrEqual(0.5);
      expect(Math.max(...data.map(Math.abs)), name).toBeLessThanOrEqual(0.5);
      expect(Math.max(...data.map(Math.abs)), name).toBeGreaterThan(0.01);
    }
  });
});
