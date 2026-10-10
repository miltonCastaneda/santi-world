import { expect, test, type Page } from "@playwright/test";
import type {} from "../../src/testing/parentsTestApi";
import { openTestGame } from "./helpers/game";

async function openParents(page: Page): Promise<void> {
  await page.goto("/padres/?test=1");
  await page.waitForFunction(() => window.__padres !== undefined && document.querySelector("#parents-root")?.getAttribute("data-ready") === "true");
}

const cards = (page: Page) => page.locator("#world-list .world-card");
const card = (page: Page, name: string) => cards(page).filter({ has: page.locator("h3", { hasText: name }) });

test.describe("[vista-de-padres] vista de padres", () => {
  test("[vista-de-padres] Acceso directo por URL: /padres lleva a /padres/ sin cargar el juego", async ({ page }) => {
    await page.goto("/padres");
    await expect(page).toHaveURL(/\/padres\/$/);
    await expect(page.locator("h1")).toHaveText("Vista de padres");
    await expect(page.locator("canvas#game")).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.__santi)).toBe("undefined");
  });

  test("[vista-de-padres] Lista con miniaturas: 4 mundos, el más reciente primero", async ({ page }) => {
    await openParents(page);
    await page.evaluate(() => window.__padres!.createWorlds(4));
    await expect(cards(page)).toHaveCount(4);
    expect(await cards(page).locator("h3").allTextContents()).toEqual(["Prueba 4", "Prueba 3", "Prueba 2", "Prueba 1"]);
    for (const src of await cards(page).locator("img.thumb").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src))) expect(src).toMatch(/^blob:/);
    await expect(cards(page).first().locator(".dates")).toContainText("Creado:");
    await expect(cards(page).first().locator(".day")).toHaveText("Día 1 del juego");
  });

  test("[vista-de-padres] Mundo sin miniatura: imagen genérica, sin errores", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openParents(page);
    await page.evaluate(() => window.__padres!.createWorlds(1, { thumbnails: false }));
    await expect(cards(page)).toHaveCount(1);
    expect(await cards(page).locator("img.thumb").getAttribute("src")).toMatch(/^data:image\/svg/);
    expect(await cards(page).locator("img.thumb").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("[vista-de-padres] Borrar con confirmación, cancelar y restaurar desde la papelera", async ({ page }) => {
    await openParents(page);
    await page.evaluate(() => window.__padres!.createWorlds(2));

    await card(page, "Prueba 2").locator('[data-action="delete"]').click();
    await page.locator('.confirm-dialog [data-action="cancel"]').click();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator(".confirm-dialog")).toHaveCount(0);

    await card(page, "Prueba 2").locator('[data-action="delete"]').click();
    await expect(page.locator(".confirm-dialog")).toContainText("papelera");
    await page.locator('.confirm-dialog [data-action="confirm"]').click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.locator("#trash-list .trash-card")).toHaveCount(1);
    await expect(page.locator("#trash-list .trash-card")).toContainText("se elimina en 30 días");

    await page.locator('#trash-list [data-action="restore"]').click();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator("#trash-list .trash-card")).toHaveCount(0);
  });

  test("[vista-de-padres] Eliminación definitiva tras 30 días al abrir la vista de padres", async ({ page }) => {
    await openParents(page);
    const [old, recent] = await page.evaluate(() => window.__padres!.createWorlds(2));
    await page.evaluate(([a, b]) => Promise.all([window.__padres!.deleteDaysAgo(a, 31), window.__padres!.deleteDaysAgo(b, 10)]), [old.id, recent.id] as const);
    await openParents(page);
    const trash = await page.evaluate(() => window.__padres!.trash().then((ws) => ws.map((w) => w.id)));
    expect(trash).toEqual([recent.id]);
    await expect(page.locator("#trash-list .trash-card")).toContainText("se elimina en 20 días");
  });

  test("[vista-de-padres] Valor fuera de rango: la noche se limita a 2–30 min y se indica el límite", async ({ page }) => {
    await openParents(page);
    const [w] = await page.evaluate(() => window.__padres!.createWorlds(1));
    await card(page, "Prueba 1").locator('[data-action="settings"]').click();
    const dialog = page.locator(".settings-dialog");
    await dialog.locator('input[name="nightMinutes"]').fill("0");
    await dialog.locator('input[name="dayMinutes"]').fill("45");
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator("#settings-limits")).toContainText("de 2 a 30 min");
    await expect(dialog.locator('input[name="nightMinutes"]')).toHaveValue("2");
    await expect(dialog.locator('input[name="dayMinutes"]')).toHaveValue("30");
    const settings = await page.evaluate((id) => window.__padres!.loadWorld(id).then((l) => l.world.settings), w.id);
    expect(settings).toMatchObject({ nightMinutes: 2, dayMinutes: 30 });

    await dialog.locator('input[name="nightMinutes"]').fill("5");
    await dialog.locator('input[name="quietNight"]').check();
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate((id) => window.__padres!.loadWorld(id).then((l) => l.world.settings), w.id)).toMatchObject({ nightMinutes: 5, quietNight: true });
  });

  test("[vista-de-padres] PIN activo e incorrecto: 5 intentos bloquean el acceso", async ({ page }) => {
    await openParents(page);
    await page.locator("#pin-new").fill("1234");
    await page.locator("#pin-enable").click();
    await expect(page.locator("#pin-disable")).toBeVisible();

    await page.goto("/padres/");
    await expect(page.locator("#pin-input")).toBeVisible();
    await expect(page.locator("#world-list")).toHaveCount(0);
    for (let i = 0; i < 4; i++) {
      await page.locator("#pin-input").fill("0000");
      await page.locator("#pin-submit").click();
      await expect(page.locator("#pin-message")).toContainText(`Quedan ${4 - i} intentos`);
    }
    await page.locator("#pin-input").fill("0000");
    await page.locator("#pin-submit").click();
    await expect(page.locator("#pin-message")).toContainText("Espera");
    await expect(page.locator("#pin-input")).toBeDisabled();

    // Recargar no salta el bloqueo.
    await page.reload();
    await expect(page.locator("#pin-input")).toBeDisabled();
  });

  test("[vista-de-padres] Ver sin modificar: el visor no cambia la fecha ni los bloques", async ({ page }) => {
    await openParents(page);
    const [w] = await page.evaluate(() => window.__padres!.createWorlds(1));
    const before = await page.evaluate((id) => Promise.all([window.__padres!.loadWorld(id), window.__padres!.listChunks(id)]), w.id);

    await card(page, "Prueba 1").locator('[data-action="view"]').click();
    await expect(page.locator("#viewer")).toHaveAttribute("data-ready", "true");
    const canvas = page.locator("#viewer-canvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 40, { steps: 10 });
    await page.mouse.up();
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(2000);
    await page.locator("#viewer-close").click();
    await expect(page.locator("#viewer")).toHaveCount(0);

    const after = await page.evaluate((id) => Promise.all([window.__padres!.loadWorld(id), window.__padres!.listChunks(id)]), w.id);
    expect(after[0].world.updatedAt).toBe(before[0].world.updatedAt);
    expect(after[0].world.version).toBe(before[0].world.version);
    expect(after[0].state).toEqual(before[0].state);
    expect(after[1]).toEqual(before[1]);
  });

  test("[vista-de-padres] Exportar e importar un mundo", async ({ page }, testInfo) => {
    await openParents(page);
    await page.evaluate(() => window.__padres!.createWorlds(1));
    const [download] = await Promise.all([page.waitForEvent("download"), card(page, "Prueba 1").locator('[data-action="export"]').click()]);
    expect(download.suggestedFilename()).toBe("Prueba-1.santi.json");
    const file = testInfo.outputPath("mundo.santi.json");
    await download.saveAs(file);
    await page.locator("#import-file").setInputFiles(file);
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator("#parents-status")).toContainText("Se importó");

    await page.locator("#import-file").setInputFiles({ name: "malo.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(page.locator("#parents-status")).toContainText("no es un mundo válido");
    await expect(cards(page)).toHaveCount(2);
  });

  test("[vista-de-padres] Visor mientras el niño juega: la vista de padres se actualiza y la configuración llega al juego", async ({ page, context }) => {
    await openTestGame(page, "padres-tabs", 2);
    const worldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);
    await page.evaluate(() => window.__santi!.saveNow());

    const parents = await context.newPage();
    await openParents(parents);
    const kidCard = parents.locator(`.world-card[data-world-id="${worldId}"]`);
    const firstStamp = await kidCard.getAttribute("data-updated-at");

    // El niño construye y se guarda: la vista de padres lo ve sin recargar (BroadcastChannel).
    await page.evaluate(() => {
      const farm = window.__santi!.layout()!.farm;
      const x = Math.floor((farm.x0 + farm.x1) / 2);
      const z = Math.floor((farm.z0 + farm.z1) / 2);
      window.__santi!.setBlock(x, window.__santi!.surfaceY(x, z) + 1, z, "red");
      return window.__santi!.saveNow();
    });
    await expect(kidCard).not.toHaveAttribute("data-updated-at", firstStamp!);

    // Los padres cambian la noche: el juego abierto la recibe en caliente.
    await kidCard.locator('[data-action="settings"]').click();
    await parents.locator('.settings-dialog input[name="nightMinutes"]').fill("5");
    await parents.locator('.settings-dialog button[type="submit"]').click();
    await page.waitForFunction(() => window.__santi!.currentWorld()!.settings.nightMinutes === 5);

    // Los padres borran el mundo abierto: desaparece de "Mis Mundos" y el juego sigue guardando sin sacarlo de la papelera.
    await kidCard.locator('[data-action="delete"]').click();
    await parents.locator('.confirm-dialog [data-action="confirm"]').click();
    await expect(parents.locator("#trash-list .trash-card")).toHaveCount(1);
    expect(await page.evaluate(() => window.__santi!.worlds().then((ws) => ws.length))).toBe(0);
    await page.evaluate(() => {
      const farm = window.__santi!.layout()!.farm;
      const x = Math.floor((farm.x0 + farm.x1) / 2) + 1;
      const z = Math.floor((farm.z0 + farm.z1) / 2);
      window.__santi!.setBlock(x, window.__santi!.surfaceY(x, z) + 1, z, "blue");
      return window.__santi!.saveNow();
    });
    const trash = await parents.evaluate(() => window.__padres!.trash());
    expect(trash.map((w) => w.id)).toEqual([worldId]);
    expect(trash[0].settings.nightMinutes).toBe(5);
  });
});
