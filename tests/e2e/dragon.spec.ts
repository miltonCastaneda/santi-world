import { expect, test } from "@playwright/test";
import { openTestGame } from "./helpers/game";

test.describe("[enemigos-nocturnos] dragón y Arco en el navegador", () => {
  test("[enemigos-nocturnos] Derrotar al dragón con 5 disparos: a medianoche llega el dragón, el Arco dispara flechas que se ven y con 5 impactos hace poof", async ({ page }) => {
    test.setTimeout(120_000);
    await openTestGame(page, "e2e-dragon");
    await page.evaluate(() => {
      const s = window.__santi!;
      const d = s.dayNight();
      s.setTimeOfCycle(d.dayMs + d.nightMs / 2 - 300);
    });
    await page.waitForFunction(() => window.__santi!.dragon() !== null, undefined, { timeout: 20_000 });

    // El dragón, quieto delante de la cámara, se dibuja.
    const at = await page.evaluate(() => {
      const s = window.__santi!;
      s.setPaused(true);
      const p = s.player().pos;
      const at = { x: p.x + 14, y: s.surfaceY(Math.floor(p.x + 14), Math.floor(p.z)) + 6, z: p.z };
      s.moveEntity(s.dragon()!.id, at);
      s.setView({ x: p.x - 2, y: p.y + 4, z: p.z + 6 }, { x: at.x, y: at.y, z: at.z });
      return at;
    });
    await page.waitForTimeout(500);
    const drawn = await page.evaluate(() => window.__santi!.stats().entitiesDrawn);
    expect(drawn).toBeGreaterThan(0);

    // Un clic con el Arco: sale una flecha y se dibuja.
    await page.getByRole("button", { name: /arco/i }).click();
    await page.evaluate((at) => {
      const s = window.__santi!;
      s.setPaused(false);
      s.useToolToward({ x: at.x, y: at.y + 0.7, z: at.z });
    }, at);
    await page.waitForFunction(() => window.__santi!.arrows() > 0, undefined, { timeout: 5_000 });
    await page.evaluate(() => window.__santi!.setPaused(true));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__santi!.stats().effectDrawCalls)).toBeGreaterThanOrEqual(1);

    // Cuatro impactos no bastan; con el quinto, "poof" de estrellas.
    const hits = await page.evaluate(() => {
      const s = window.__santi!;
      s.setPaused(false);
      for (let i = 0; i < 4; i++) s.hitDragon();
      return s.dragon()?.hits ?? null;
    });
    expect(hits).toBe(4);
    await page.evaluate(() => window.__santi!.hitDragon());
    expect(await page.evaluate(() => window.__santi!.dragon())).toBeNull();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__santi!.stats().poofs)).toBeGreaterThan(0);
    // Nunca le hace daño al personaje.
    expect((await page.evaluate(() => window.__santi!.player())).hearts).toBe(5);
  });
});
