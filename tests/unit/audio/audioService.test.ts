import { describe, expect, it } from "vitest";
import { AudioService, MASTER_CAP, MAX_ANIMAL_VOICES, MUSIC_FADE_S, type AudioContextLike } from "../../../src/audio/audioService";
import { connectGameAudio, musicFor } from "../../../src/audio/gameAudio";
import { degreeToHz, MUSIC, MUSIC_TRACKS, PENTATONIC, SOUND_NAMES, synthesize, synthesizeMusic } from "../../../src/audio/synth";
import { SPECIES, SPECIES_IDS } from "../../../src/domain/entities/species";
import { Game } from "../../../src/sim/game";
import { NIGHT_WARNING_MS, TRANSITION_MS } from "../../../src/sim/systems/dayNight";

class FakeParam {
  value = 1;
  ramps: { to: number; at: number }[] = [];
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(to: number, at: number) {
    this.ramps.push({ to, at });
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
  loop = false;
  started = false;
  stopped = false;
  stopAt: number | undefined;
  onended: (() => void) | null = null;
  start() {
    this.started = true;
  }
  stop(when?: number) {
    this.stopped = true;
    this.stopAt = when;
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

  it("[animales-y-granja] Sonido por especie: una vaca a 10 bloques muge atenuada; a 24 o más no se oye", async () => {
    const { audio, ctx } = await setup();
    const game = new Game({ seed: "sonidos" });
    connectGameAudio(audio, game);
    audio.setListener({ x: 0, y: 0, z: 0 }, 0);
    const before = ctx.sources.length;
    game.events.emit("animalSound", { id: "cow-0", species: "cow", sound: SPECIES.cow.sound, pos: { x: 10, y: 0, z: 0 } });
    expect(ctx.sources).toHaveLength(before + 1);
    const moo = synthesize("moo", ctx.sampleRate);
    expect((ctx.sources.at(-1)!.buffer as { getChannelData(c: number): Float32Array }).getChannelData(0)).toEqual(moo);
    // La ganancia de la voz es la de la distancia (1 - 10/24), menor que la de cerca.
    const voiceGain = ctx.gains[ctx.gains.length - 1];
    expect(voiceGain.gain.value).toBeCloseTo(1 - 10 / 24);
    expect(audio.activeAnimalVoices).toBe(1);
    game.events.emit("animalSound", { id: "cow-1", species: "cow", sound: "moo", pos: { x: 24, y: 0, z: 0 } });
    expect(ctx.sources).toHaveLength(before + 1);
    // Todas las especies tienen un sonido generado.
    for (const id of SPECIES_IDS) expect(SOUND_NAMES as readonly string[], id).toContain(SPECIES[id].sound);
  });

  it("[ciclo-dia-noche] la música cambia con un cruce suave de 5 s o más y la anterior se apaga", async () => {
    const { ctx, audio } = await setup();
    const game = new Game({ seed: "musica" });
    connectGameAudio(audio, game);
    audio.setMusic(musicFor(game.clock));
    expect(audio.musicTrack).toBe("day");
    const day = ctx.sources.at(-1)!;
    const dayGain = ctx.gains.at(-1)!;
    expect(day.loop).toBe(true);
    expect(dayGain.gain.ramps).toEqual([{ to: 1, at: MUSIC_FADE_S }]);

    ctx.currentTime = 100;
    // Llega el atardecer: la pista de noche sube mientras la de día baja.
    game.clock.restore(game.clock.durations.dayMs - TRANSITION_MS - 50, 1);
    game.step(50);
    expect(game.clock.phase).toBe("dusk");
    expect(audio.musicTrack).toBe("night");
    expect(MUSIC_FADE_S).toBeGreaterThanOrEqual(5);
    expect(dayGain.gain.ramps.at(-1)).toEqual({ to: 0, at: 100 + MUSIC_FADE_S });
    expect(day.stopAt).toBe(100 + MUSIC_FADE_S);
    const night = ctx.sources.at(-1)!;
    expect(night).not.toBe(day);
    expect(ctx.gains.at(-1)!.gain.ramps).toEqual([{ to: 1, at: 100 + MUSIC_FADE_S }]);
    // Pedir la misma pista no la reinicia.
    const sources = ctx.sources.length;
    audio.setMusic("night");
    expect(ctx.sources).toHaveLength(sources);
  });

  it("[ciclo-dia-noche] aviso de noche: suena una campanita una sola vez", async () => {
    const { audio } = await setup();
    const game = new Game({ seed: "campana" });
    connectGameAudio(audio, game);
    game.clock.restore(game.clock.durations.dayMs - NIGHT_WARNING_MS - 100, 1);
    for (let i = 0; i < 40; i++) game.step(50);
    expect(audio.requests.get("chime")).toBe(1);
  });

  it("[experiencia-infantil] música que no asusta: lenta, suave, pentatónica y sin saltos de volumen", () => {
    for (const track of MUSIC_TRACKS) {
      const def = MUSIC[track];
      expect(def.bpm, track).toBeLessThanOrEqual(100);
      // Todas las notas salen de la escala pentatónica mayor (sin semitonos que choquen).
      for (const deg of [...def.melody, ...def.bass].filter((d) => d >= 0)) {
        const semis = Math.round(12 * Math.log2(degreeToHz(def.root, deg) / def.root));
        expect(PENTATONIC as readonly number[], `${track} grado ${deg}`).toContain(((semis % 12) + 12) % 12);
      }
      const rate = 8000;
      const data = synthesizeMusic(track, rate);
      const peak = Math.max(...data.map(Math.abs));
      expect(peak, track).toBeLessThanOrEqual(0.3);
      // El bucle empieza y acaba en silencio: no hay clic al repetirse.
      expect(Math.abs(data[0]), track).toBeLessThan(0.01);
      expect(Math.abs(data[data.length - 1]), track).toBeLessThan(0.01);
      // Volumen por ventanas de 100 ms (en bucle): nivel bajo y nunca sube de golpe.
      const win = rate / 10;
      const rms: number[] = [];
      for (let i = 0; i + win <= data.length; i += win) {
        let sum = 0;
        for (let j = i; j < i + win; j++) sum += data[j] * data[j];
        rms.push(Math.sqrt(sum / win));
      }
      rms.forEach((r, k) => {
        expect(r, `${track} @${k / 10} s`).toBeLessThanOrEqual(0.12);
        expect(r - rms.at(k - 1)!, `${track} @${k / 10} s`).toBeLessThanOrEqual(0.1);
      });
    }
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
