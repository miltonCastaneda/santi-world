import type { Game } from "../sim/game";
import type { WorldClock } from "../sim/systems/dayNight";
import type { AudioService } from "./audioService";
import { isSoundName, type MusicTrack } from "./synth";

/** El audio solo escucha eventos del juego y nunca lo modifica (design D6). */
export function connectGameAudio(audio: AudioService, game: Game): void {
  const e = game.events;
  e.on("footstep", ({ pos }) => audio.play("step", { pos, volume: 0.7 }));
  e.on("jumped", ({ pos }) => audio.play("jump", { pos, volume: 0.6 }));
  e.on("blockPlaced", ({ pos }) => audio.play("place", { pos }));
  e.on("blockBroken", ({ pos }) => audio.play("break", { pos }));
  e.on("bump", ({ pos }) => audio.play("bump", { pos }));
  e.on("tooFar", () => audio.play("far"));
  e.on("toolUsed", ({ tool }) => {
    if (tool === "sword" || tool === "bow" || tool === "collar") audio.play("swish", { volume: 0.7 });
  });
  e.on("playerHit", ({ result }) => audio.play(result === "poof" ? "poof" : "boing"));
  // Cada especie tiene su voz; comparten un límite de 3 voces, con prioridad para las más cercanas.
  e.on("animalSound", ({ sound, pos }) => {
    if (isSoundName(sound)) audio.play(sound, { pos, category: "animal", bus: "ambient" });
  });
  e.on("nightSoon", () => audio.play("chime", { volume: 0.7 }));
  // La música cambia al empezar el atardecer y el amanecer: el cruce acompaña a la luz.
  e.on("phaseChanged", () => audio.setMusic(musicFor(game.clock)));
}

/** Pista que corresponde a la hora: la de noche desde el atardecer hasta el amanecer. */
export function musicFor(clock: WorldClock): MusicTrack {
  return clock.phase === "dusk" || clock.phase === "night" ? "night" : "day";
}
