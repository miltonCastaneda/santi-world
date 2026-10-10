import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openTestGame, waitWorldReady } from "./helpers/game";

const LEGACY_KEY = "minecraf-de-santi-world-v2";

/** Coloca un bloque sobre el centro de la granja y devuelve su posición. */
async function placeOnFarm(page: Page, block: string, dx = 0): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(
    ([block, dx]) => {
      const farm = window.__santi!.layout()!.farm;
      const x = Math.floor((farm.x0 + farm.x1) / 2) + dx;
      const z = Math.floor((farm.z0 + farm.z1) / 2);
      const y = window.__santi!.surfaceY(x, z) + 1;
      window.__santi!.setBlock(x, y, z, block as "red");
      return { x, y, z };
    },
    [block, dx] as const,
  );
}

const blockAt = (page: Page, p: { x: number; y: number; z: number }) => page.evaluate((p) => window.__santi!.getBlock(p.x, p.y, p.z), p);

test.describe("[mundos-y-persistencia] mundos guardados", () => {
  test("[mundos-y-persistencia] construir, guardar, recargar y recuperar", async ({ page }) => {
    await openTestGame(page, "persist-1", 2);
    const empty = await placeOnFarm(page, "yellow");
    const value = await blockAt(page, empty);
    const worldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);

    // Perder el foco dispara el autoguardado (como al cambiar de pestaña o cerrar).
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForFunction(() => window.__santi!.saveCount() >= 1);

    await page.reload();
    await page.waitForFunction(() => window.__santi?.ready === true);
    await waitWorldReady(page);
    expect(await page.evaluate(() => window.__santi!.currentWorld()!.id)).toBe(worldId);
    expect(await blockAt(page, empty)).toBe(value);
  });

  test("[mundos-y-persistencia] crear un mundo nuevo y comprobar que el anterior se guardó", async ({ page }) => {
    await openTestGame(page, "persist-2", 2);
    const spot = await placeOnFarm(page, "blue", 2);
    const blue = await blockAt(page, spot);
    const oldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);

    await page.locator("#new-world-btn").click();
    await page.waitForFunction((id) => window.__santi!.currentWorld()?.id !== id, oldId);
    await waitWorldReady(page);
    expect(await page.evaluate(() => window.__santi!.saveCount())).toBe(1);

    await page.locator("#worlds-btn").click();
    const cards = page.locator(".world-card[data-world-id]");
    await expect(cards).toHaveCount(2);
    await expect(page.locator(`.world-card[data-world-id="${oldId}"] .world-thumb`)).toHaveAttribute("style", /blob:/);
    await page.locator(`.world-card[data-world-id="${oldId}"]`).click();
    await page.waitForFunction((id) => window.__santi!.currentWorld()?.id === id, oldId);
    await expect(page.locator(".worlds-panel")).toBeHidden();
    await waitWorldReady(page);
    expect(await blockAt(page, spot)).toBe(blue);
  });

  test("[mundos-y-persistencia] Migración del mundo heredado: 'Mi primer mundo' tiene la construcción v1", async ({ page }) => {
    const v1 = readFileSync("tests/fixtures/v1-world.json", "utf8");
    await page.addInitScript(
      ([key, value]) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("seeded", "1");
        }
      },
      [LEGACY_KEY, v1] as const,
    );
    await page.goto("/?test=1&view=2");
    await page.waitForFunction(() => window.__santi?.ready === true);
    expect(await page.evaluate(() => window.__santi!.legacyImport())).toBe("imported");
    expect(await page.evaluate(() => window.__santi!.currentWorld()!.name)).toBe("Mi primer mundo");

    // Casita de la fixture: pared roja en v1 (13, g+1, 13) con el desplazamiento (112, 11, 112).
    const entries = JSON.parse(v1) as [string, string][];
    const [key] = entries.find(([, id]) => id === "red")!;
    const [x, y, z] = key.split(",").map(Number);
    expect(await page.evaluate(([x, y, z]) => window.__santi!.getBlock(112 + x, 11 + y, 112 + z), [x, y, z] as const)).toBe(6);
    expect(await page.evaluate((k) => [localStorage.getItem(k), localStorage.getItem(`${k}-backup`) !== null], LEGACY_KEY)).toEqual([null, true]);
  });

  test("[mundos-y-persistencia] ningún botón del niño borra un mundo", async ({ page }) => {
    await openTestGame(page, "persist-3", 2);
    const spot = await placeOnFarm(page, "red");
    const firstId = await page.evaluate(() => window.__santi!.currentWorld()!.id);
    await page.evaluate(() => window.__santi!.createWorld());

    const labels = await page.locator("button").evaluateAll((els) => els.map((e) => `${e.textContent} ${e.getAttribute("aria-label") ?? ""}`));
    for (const label of labels) expect(label).not.toMatch(/borrar|eliminar|papelera|delete/i);

    // Pulsar todos los botones del HUD (salvo pantalla completa) y todos los de Mis Mundos.
    const hudButtons = page.locator(".hud button:not(#full-btn)");
    for (let i = 0; i < (await hudButtons.count()); i++) {
      if (await page.locator(".worlds-panel").isVisible()) await page.locator(".worlds-close").click();
      await hudButtons.nth(i).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(50);
    }
    if (!(await page.locator(".worlds-panel").isVisible())) await page.locator("#worlds-btn").click();
    const panelButtons = page.locator(".worlds-panel button");
    const n = await panelButtons.count();
    for (let i = 0; i < n; i++) {
      if (!(await page.locator(".worlds-panel").isVisible())) await page.locator("#worlds-btn").click();
      await panelButtons.nth(i).click({ timeout: 5000 }).catch(() => {});
      await page.waitForFunction(() => !document.querySelector(".worlds-panel.busy"));
    }

    const worlds = await page.evaluate(() => window.__santi!.worlds().then((ws) => ws.map((w) => w.id)));
    expect(worlds).toContain(firstId);
    expect(worlds.length).toBeGreaterThanOrEqual(2);
    await page.evaluate((id) => window.__santi!.switchWorld(id), firstId);
    await waitWorldReady(page);
    expect(await blockAt(page, spot)).toBe(6);
  });
});
