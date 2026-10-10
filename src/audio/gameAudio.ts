import type { Game } from "../sim/game";
import type { AudioService } from "./audioService";

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
}
