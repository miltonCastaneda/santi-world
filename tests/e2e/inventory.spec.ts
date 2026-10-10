import { expect, test, type Page } from "@playwright/test";
import { openTestGame, waitWorldReady } from "./helpers/game";
import { canvasBrightness, collectErrors, frameMs, hideHud, latencyMs } from "./helpers/page";

const panelOpen = `!document.querySelector(".inventory-panel").hidden`;
const pressE = `window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE", bubbles: true, cancelable: true }))`;

const shownCounts = (page: Page) =>
  page.locator(".inventory-item").evaluateAll((rows) =>
    rows.map((r) => ({
      resource: (r as HTMLElement).dataset.resource,
      count: r.querySelector(".inventory-count")!.textContent,
      dots: r.querySelector(".inventory-dots")!.textContent,
    })),
  );

test.describe("[recursos-e-inventario] inventario", () => {
  test("[recursos-e-inventario] Abrir el inventario: con E o la mochila aparecen los 3 recursos en 200 ms o menos", async ({ page }) => {
    const errors = collectErrors(page);
    await openTestGame(page, "inventario", 2);
    await page.evaluate(() => window.__santi!.setInventory({ diamond: 4, meat: 2 }));
    await expect(page.locator(".inventory-panel")).toBeHidden();
    const frame = await frameMs(page);

    const byKey = await latencyMs(page, pressE, panelOpen);
    expect(byKey).toBeLessThanOrEqual(200 + frame);
    expect(await shownCounts(page)).toEqual([
      { resource: "diamond", count: "4", dots: "●●●●" },
      { resource: "meat", count: "2", dots: "●●" },
      { resource: "pigChicken", count: "0", dots: "" },
    ]);
    await expect(page.locator("#bag-btn")).toHaveAttribute("aria-pressed", "true");
    // Con E se vuelve a cerrar.
    await page.evaluate(pressE);
    await expect(page.locator(".inventory-panel")).toBeHidden();

    const byBag = await latencyMs(page, `document.getElementById("bag-btn").click()`, panelOpen);
    expect(byBag).toBeLessThanOrEqual(200 + frame);
    // La ✕ es grande (64 px o más) y lo cierra.
    const close = (await page.locator(".inventory-close").boundingBox())!;
    expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(64);
    await page.locator(".inventory-close").click();
    await expect(page.locator(".inventory-panel")).toBeHidden();

    // Más de 5: solo el número.
    await page.evaluate(() => window.__santi!.setInventory({ diamond: 12 }));
    await page.evaluate(pressE);
    await expect(page.locator('.inventory-item[data-resource="diamond"] .inventory-count')).toHaveText("12");
    await expect(page.locator('.inventory-item[data-resource="diamond"] .inventory-dots')).toHaveText("");
    expect(errors).toEqual([]);
  });

  test("[recursos-e-inventario] Persistencia del inventario: 4 diamantes y 2 carnes siguen ahí al volver a abrir el mundo", async ({ page }) => {
    await openTestGame(page, "inventario-persistente", 2);
    const worldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);
    await page.evaluate(() => window.__santi!.setInventory({ diamond: 4, meat: 2 }));
    await page.evaluate(() => window.__santi!.saveNow());

    await page.reload();
    await page.waitForFunction(() => window.__santi?.ready === true);
    await waitWorldReady(page);
    expect(await page.evaluate(() => window.__santi!.currentWorld()!.id)).toBe(worldId);
    expect(await page.evaluate(() => window.__santi!.inventory())).toEqual({ diamond: 4, meat: 2, pigChicken: 0 });
    await page.locator("#bag-btn").click();
    await expect(page.locator('.inventory-item[data-resource="diamond"] .inventory-count')).toHaveText("4");
    await expect(page.locator('.inventory-item[data-resource="meat"] .inventory-count')).toHaveText("2");
  });

  test("[recursos-e-inventario] Inventario independiente por mundo: de A (4 diamantes) a B se ven 0", async ({ page }) => {
    await openTestGame(page, "inventario-a", 2);
    const a = await page.evaluate(() => window.__santi!.currentWorld()!.id);
    await page.evaluate(() => window.__santi!.setInventory({ diamond: 4 }));
    await page.locator("#bag-btn").click();
    await expect(page.locator('.inventory-item[data-resource="diamond"] .inventory-count')).toHaveText("4");

    await page.locator("#new-world-btn").click();
    await page.waitForFunction((id) => window.__santi!.currentWorld()?.id !== id, a);
    await waitWorldReady(page);
    await expect(page.locator('.inventory-item[data-resource="diamond"] .inventory-count')).toHaveText("0");

    await page.evaluate((id) => window.__santi!.switchWorld(id), a);
    await waitWorldReady(page);
    await expect(page.locator('.inventory-item[data-resource="diamond"] .inventory-count')).toHaveText("4");
  });
});

test("[enemigos-nocturnos] Refugio iluminado: la antorcha de la barra ilumina y dentro de la casa techada no aparecen zombis", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openTestGame(page, "antorcha", 2);
  await hideHud(page);

  // Casa de piedra de 5x5, 3 de alto y con techo, a 10 bloques de la granja (al aire libre).
  const house = await page.evaluate(() => {
    const s = window.__santi!;
    const farm = s.layout()!.farm;
    const x0 = farm.x1 + 10;
    const z0 = Math.floor((farm.z0 + farm.z1) / 2);
    const y = s.surfaceY(x0 + 2, z0 + 2) + 1;
    for (let dx = 0; dx < 5; dx++)
      for (let dz = 0; dz < 5; dz++) {
        for (let dy = 0; dy < 3; dy++) {
          const wall = dx === 0 || dz === 0 || dx === 4 || dz === 4;
          s.setBlock(x0 + dx, y + dy, z0 + dz, wall ? "stone" : null);
        }
        s.setBlock(x0 + dx, y - 1, z0 + dz, "grass");
        s.setBlock(x0 + dx, y + 3, z0 + dz, "planks");
      }
    return { x0, y, z0 };
  });

  // La antorcha se elige en la barra de bloques (con su ícono) y se pone con la Mano, desde adentro.
  const torchBtn = page.locator('.block-btn[data-id="torch"]');
  await expect(torchBtn).toContainText("🔥");
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.block-btn[data-id="torch"]')!.click());
  await page.waitForFunction(() => window.__santi!.selection().block === "torch" && window.__santi!.selection().tool === "hand");
  const torch = { x: house.x0 + 2, y: house.y, z: house.z0 + 3 };
  await page.evaluate(
    ([h, t]) => {
      const s = window.__santi!;
      s.teleport({ x: h.x0 + 2.5, y: h.y, z: h.z0 + 1.5 });
      s.useToolToward({ x: t.x + 0.5, y: t.y, z: t.z + 0.5 });
    },
    [house, torch] as const,
  );
  await page.waitForFunction((t) => window.__santi!.getBlock(t.x, t.y, t.z) !== 0, torch);

  const inside = await page.evaluate(
    ([h, t]) => {
      const s = window.__santi!;
      const cells = [];
      for (let dx = 1; dx <= 3; dx++) for (let dz = 1; dz <= 3; dz++) if (h.x0 + dx !== t.x || h.z0 + dz !== t.z) cells.push({ x: h.x0 + dx, y: h.y, z: h.z0 + dz });
      return cells.map((c) => ({ canSpawn: s.canSpawnZombieAt(c.x, c.y, c.z), light: s.blockLight(c.x, c.y, c.z) }));
    },
    [house, torch] as const,
  );
  for (const c of inside) {
    expect(c.canSpawn).toBe(false);
    expect(c.light).toBeGreaterThanOrEqual(8);
  }

  // Al aire libre: un lugar donde podría aparecer un zombi deja de servir con una antorcha al lado.
  const open = await page.evaluate((h) => {
    const s = window.__santi!;
    const ok = (x: number, z: number) => s.canSpawnZombieAt(x, s.surfaceY(x, z) + 1, z);
    for (let dx = 12; dx < 48; dx++)
      for (const dz of [0, 4, -4, 8, -8]) {
        const x = h.x0 + dx;
        const z = h.z0 + 2 + dz;
        if (!ok(x, z) || !ok(x + 2, z)) continue;
        const y = s.surfaceY(x, z) + 1;
        s.setBlock(x, y, z, "torch");
        return { x, y, z, nearAfter: ok(x + 2, z), light: s.blockLight(x + 2, s.surfaceY(x + 2, z) + 1, z) };
      }
    return null;
  }, house);
  expect(open, "un lugar al aire libre donde podría aparecer un zombi").not.toBeNull();
  expect(open!.nearAfter).toBe(false);
  expect(open!.light).toBeGreaterThanOrEqual(8);

  // De noche la antorcha ilumina su entorno (luz por vértice): con ella el suelo se ve más claro.
  await page.evaluate(() => {
    const s = window.__santi!;
    const t = s.dayNight();
    s.setTimeOfCycle(t.dayMs + t.nightMs / 2);
    s.setPlayerVisible(false);
  });
  const spot = open!;
  const look = () => page.evaluate((o) => window.__santi!.setView({ x: o.x + 0.51, y: o.y + 7, z: o.z + 4.5 }, { x: o.x + 0.5, y: o.y, z: o.z + 0.5 }), spot);
  await look();
  await page.waitForTimeout(500);
  await look();
  const lit = await canvasBrightness(page, "canvas#game");
  await testInfo.attach("antorcha-de-noche", { body: await page.locator("canvas#game").screenshot(), contentType: "image/png" });
  await page.evaluate((o) => window.__santi!.setBlock(o.x, o.y, o.z, null), spot);
  await page.waitForFunction((o) => window.__santi!.getBlock(o.x, o.y, o.z) === 0, spot);
  await page.waitForTimeout(1500);
  await look();
  const dark = await canvasBrightness(page, "canvas#game");
  expect(lit, `con antorcha ${lit}, sin antorcha ${dark}`).toBeGreaterThan(dark + 8);
  expect(errors).toEqual([]);
});
