import { expect, test, type Page } from "@playwright/test";
import { openTestGame, waitWorldReady } from "./helpers/game";
import { countPixelsNear, hideHud } from "./helpers/page";

const SKY: [number, number, number] = [0x87, 0xce, 0xeb];
const SEED = "visual-001";

/** Espera a que el mundo esté dibujado y deja pasar unos frames para que la imagen sea estable. */
async function settle(page: Page): Promise<void> {
  await waitWorldReady(page);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
}

/** Cámara alta mirando hacia abajo: en la imagen solo debería verse terreno, nunca el cielo. */
async function lookDown(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(([x, z]) => {
    const y = window.__santi!.surfaceY(x, z);
    window.__santi!.setView({ x: x + 0.01, y: y + 16, z: z + 9 }, { x, y, z });
  }, [x, z] as const);
  await settle(page);
}

test.describe("[rendimiento-y-estabilidad-visual] estabilidad visual", () => {
  test.beforeEach(async ({ page }) => {
    await openTestGame(page, SEED, 4);
    await hideHud(page);
    // Las capturas de referencia son del terreno; el personaje y los animales (que se mueven) se prueban aparte.
    await page.evaluate(() => {
      window.__santi!.setPlayerVisible(false);
      window.__santi!.setEntitiesVisible(false);
    });
  });

  test("[rendimiento-y-estabilidad-visual] Comparación visual: la granja con semilla y cámara fijas", async ({ page }) => {
    await page.evaluate(() => {
      const { farm, barn } = window.__santi!.layout()!;
      const t = { x: barn.x0 - 4, y: 11, z: barn.z1 + 3 };
      window.__santi!.setView({ x: t.x - 14, y: 22, z: t.z + 16 }, t);
      void farm;
    });
    await settle(page);
    await expect(page.locator("canvas#game")).toHaveScreenshot("granja.png", { maxDiffPixelRatio: 0.02 });
    // Ningún píxel del color del cielo dentro del terreno (la cámara mira hacia abajo).
    await lookDown(page, 120, 120);
    expect(await countPixelsNear(page, SKY)).toBeLessThanOrEqual(5);
  });

  test("[rendimiento-y-estabilidad-visual] Borde entre regiones: romper y volver a colocar en el límite", async ({ page }) => {
    // x = 128 es el límite entre los chunks 7 y 8.
    const spot = await page.evaluate(() => {
      const z = window.__santi!.layout()!.farm.z0 + 6;
      const y = window.__santi!.surfaceY(128, z) + 1;
      window.__santi!.setBlock(128, y, z, "stone");
      window.__santi!.setBlock(127, y, z, "stone");
      return { x: 128, y, z };
    });
    await lookDown(page, spot.x, spot.z);
    const before = await page.locator("canvas#game").screenshot();

    await page.evaluate(({ x, y, z }) => window.__santi!.setBlock(x, y, z, null), spot);
    await settle(page);
    await page.evaluate(({ x, y, z }) => window.__santi!.setBlock(x, y, z, "stone"), spot);
    await settle(page);

    expect(await countPixelsNear(page, SKY)).toBeLessThanOrEqual(5);
    const after = await page.locator("canvas#game").screenshot();
    expect(after.equals(before)).toBe(true);
  });

  test("[rendimiento-y-estabilidad-visual] Agua y transparencias: el agua no parpadea", async ({ page }) => {
    await page.evaluate(() => {
      const { pond } = window.__santi!.layout()!;
      window.__santi!.setView({ x: pond.x - 10, y: 18, z: pond.z + 12 }, { x: pond.x, y: 9, z: pond.z });
    });
    await settle(page);
    const shots: Buffer[] = [];
    for (let i = 0; i < 3; i++) {
      shots.push(await page.locator("canvas#game").screenshot());
      await page.waitForTimeout(200);
    }
    expect(shots[1].equals(shots[0])).toBe(true);
    expect(shots[2].equals(shots[0])).toBe(true);
    await expect(page.locator("canvas#game")).toHaveScreenshot("estanque.png", { maxDiffPixelRatio: 0.02 });
  });
});
