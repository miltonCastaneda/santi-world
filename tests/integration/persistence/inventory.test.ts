import { describe, expect, it } from "vitest";
import { Game } from "../../../src/sim/game";
import { GameSession } from "../../../src/sim/session";
import { setupSession } from "./helpers";

describe("[recursos-e-inventario] Persistencia del inventario", () => {
  it("el inventario y la carne sin recoger se guardan con el mundo y vuelven al abrirlo", async () => {
    const { repo, user, clock, game, session, autosave } = await setupSession();
    const world = await session.openInitial({ seed: "inventario" });
    game.setInventory({ diamond: 4, meat: 2 });
    const { x, z } = game.world.spawn;
    const meat = game.dropItem("meat", { x: x + 20.5, y: game.world.store.surfaceY(Math.floor(x + 20), Math.floor(z)) + 1, z });
    expect(session.hasChanges()).toBe(true);
    await autosave.saveNow();

    const game2 = new Game({ seed: "otro" });
    await new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" }).openInitial({ worldId: world.id });
    expect(game2.inventory).toEqual({ diamond: 4, meat: 2, pigChicken: 0 });
    expect(game2.entities.get(meat.id)?.body.pos).toEqual(meat.body.pos);
  });

  it("cada mundo tiene su inventario: al cambiar de A (4 diamantes) a B se ven 0", async () => {
    const { game, session } = await setupSession();
    const a = await session.openInitial({ seed: "mundo-a" });
    game.setInventory({ diamond: 4 });
    await session.createWorld();
    expect(game.inventory).toEqual({ diamond: 0, meat: 0, pigChicken: 0 });
    await session.switchWorld(a.id);
    expect(game.inventory.diamond).toBe(4);
  });
});
