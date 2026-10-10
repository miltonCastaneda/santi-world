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
  e.on("blockMined", ({ pos }) => {
    audio.play("break", { pos, volume: 0.6 });
    audio.play("gem", { pos });
  });
  e.on("bump", ({ pos }) => audio.play("bump", { pos }));
  e.on("tooFar", () => audio.play("far"));
  e.on("toolUsed", ({ tool }) => {
    if (tool === "sword" || tool === "collar") audio.play("swish", { volume: 0.7 });
  });
  // El Arco: "fiu" al disparar y un "toc" de madera si la flecha se clava en un bloque.
  e.on("arrowShot", ({ pos }) => audio.play("shoot", { pos, volume: 0.8 }));
  e.on("arrowEnded", ({ pos, hit }) => hit === "block" && audio.play("thunk", { pos, volume: 0.6 }));
  e.on("playerHit", ({ result }) => audio.play(result === "poof" ? "poof" : "boing"));
  // Cada especie tiene su voz; comparten un límite de 3 voces, con prioridad para las más cercanas.
  e.on("animalSound", ({ sound, pos }) => {
    if (isSoundName(sound)) audio.play(sound, { pos, category: "animal", bus: "ambient" });
  });
  e.on("nightSoon", () => audio.play("chime", { volume: 0.7 }));
  // Golpes cartoon: rebote con "boing"; un zombi derrotado (o que se va al amanecer) hace destellos.
  e.on("entityHit", ({ pos, outcome, defeated }) => {
    if (outcome === "boing" || (outcome === "defeat" && !defeated)) audio.play("boing", { pos, volume: 0.8 });
    // Lobo domesticado (o un lobo amigo que salta contento): campanitas y un "guau" alegre.
    if (outcome === "tame") audio.play("tame", { pos });
    if (outcome === "happy") audio.play("woof", { pos, volume: 0.8 });
  });
  e.on("entityRemoved", ({ species, pos }) => audio.play(species === "zombie" || species === "dragon" ? "sparkle" : "poof", { pos, volume: 0.8 }));
  // El dragón: un "ruar" de dibujo animado al llegar, fuego suave, un "ding" por cada flecha que lo alcanza.
  e.on("dragonArrived", ({ pos }) => audio.play("rawr", { pos }));
  e.on("dragonFire", ({ pos }) => {
    audio.play("rawr", { pos, volume: 0.6 });
    audio.play("fire", { pos });
  });
  e.on("treeBurnt", ({ pos }) => audio.play("poof", { pos, volume: 0.7 }));
  e.on("dragonAte", ({ pos }) => audio.play("poof", { pos }));
  e.on("dragonHit", ({ pos }) => audio.play("ding", { pos }));
  e.on("dragonLeft", ({ pos }) => audio.play("rawr", { pos, volume: 0.5 }));
  e.on("itemCollected", () => audio.play("pickup"));
  e.on("pigChickenCaptured", ({ pos }) => audio.play("capture", { pos }));
  e.on("pigChickenReleased", ({ pos }) => audio.play("release", { pos }));
  e.on("releaseBlocked", ({ pos }) => audio.play("bump", { pos }));
  e.on("releaseArmed", ({ armed }) => armed && audio.play("click"));
  // La música cambia al empezar el atardecer y el amanecer: el cruce acompaña a la luz.
  e.on("phaseChanged", () => audio.setMusic(musicFor(game.clock)));
}

/** Pista que corresponde a la hora: la de noche desde el atardecer hasta el amanecer. */
export function musicFor(clock: WorldClock): MusicTrack {
  return clock.phase === "dusk" || clock.phase === "night" ? "night" : "day";
}
