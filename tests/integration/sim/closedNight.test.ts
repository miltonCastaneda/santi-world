import { describe, expect, it } from "vitest";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { GameSession } from "../../../src/sim/session";
import { setupSession } from "../persistence/helpers";

const HOUR = 3_600_000;

describe("[ciclo-dia-noche] El tiempo del mundo solo pasa jugando", () => {
  it("[ciclo-dia-noche] Amanecer con el juego cerrado: de noche se cierra 8 horas y al reabrir la noche sigue donde quedó y amanece a su hora", async () => {
    const { repo, user, clock, game, session, autosave } = await setupSession();
    const world = await session.openInitial({ seed: "noche-cerrada" });
    const { dayMs, nightMs } = game.clock.durations;
    // Faltan 3 minutos para el amanecer cuando el niño cierra el juego.
    game.clock.restore(dayMs + nightMs - 3 * 60_000, 2);
    await autosave.saveNow();

    clock.advance(8 * HOUR);
    const game2 = new Game({ seed: "otro" });
    await new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" }).openInitial({ worldId: world.id });
    expect(game2.clock.isNight).toBe(true);
    expect(game2.clock.dayCount).toBe(2);
    expect(Math.abs(game2.clock.msUntilDawn - 3 * 60_000)).toBeLessThanOrEqual(5000);

    let dawnAt: number | null = null;
    game2.events.on("dawn", () => (dawnAt ??= game2.timeMs));
    const start = game2.timeMs;
    for (let t = 0; t < 4 * 60_000 && dawnAt === null; t += STEP_MS) game2.step(STEP_MS);
    expect(dawnAt).not.toBeNull();
    expect(Math.abs(dawnAt! - start - 3 * 60_000)).toBeLessThanOrEqual(5000);
    expect(game2.clock.dayCount).toBe(3);
  }, 60_000);
});
