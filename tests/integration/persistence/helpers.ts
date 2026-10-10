import { FakeClock } from "../../../src/core/clock";
import type { BlockId } from "../../../src/domain/blocks";
import { AutosaveService } from "../../../src/persistence/autosave";
import { InMemoryWorldRepository } from "../../../src/persistence/inMemoryRepository";
import { Game } from "../../../src/sim/game";
import { GameSession } from "../../../src/sim/session";
import { sequentialIds } from "./repositoryContract";

export async function setupSession(opts: { repo?: InMemoryWorldRepository; clock?: FakeClock } = {}) {
  const clock = opts.clock ?? new FakeClock(1_700_000_000_000);
  const repo = opts.repo ?? new InMemoryWorldRepository({ clock, newId: sequentialIds("w") });
  const user = await repo.ensureDefaultUser();
  let seeds = 0;
  const game = new Game({ seed: "provisional" });
  const session = new GameSession(game, user.id, { repo, clock, newSeed: () => `seed-${++seeds}` });
  const autosave = new AutosaveService(repo, session, clock);
  session.attachSaver(autosave);
  return { clock, repo, user, game, session, autosave };
}

/** Coloca n bloques en fila sobre el punto de aparición (sobre la granja) y devuelve sus posiciones. */
export function placeRow(game: Game, n: number, block: BlockId = "red", dz = 0) {
  const { x, z } = game.world.spawn;
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = { x: Math.floor(x) - 10 + i, y: game.world.store.surfaceY(Math.floor(x) - 10 + i, Math.floor(z) + dz) + 1, z: Math.floor(z) + dz };
    if (!game.world.place(p.x, p.y, p.z, block)) throw new Error(`no se pudo colocar en ${JSON.stringify(p)}`);
    out.push(p);
  }
  return out;
}
