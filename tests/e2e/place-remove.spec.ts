import { expect, test, type Page } from "@playwright/test";
import { lookAtFarm, openTestGame } from "./helpers/game";
import { collectErrors } from "./helpers/page";

async function clickCenter(page: Page, button: "left" | "right" = "left"): Promise<void> {
  const box = await page.locator("canvas#game").boundingBox();
  if (!box) throw new Error("canvas sin tamaño");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
}

async function waitForCountChange(page: Page, before: number): Promise<number> {
  await page.waitForFunction((b) => window.__santi!.placedCount() !== b, before);
  return page.evaluate(() => window.__santi!.placedCount());
}

test("[personaje-y-herramientas] poner y quitar bloques con el puntero", async ({ page }) => {
  const errors = collectErrors(page);
  await openTestGame(page);
  const target = await lookAtFarm(page);

  const initial = await page.evaluate(() => window.__santi!.placedCount());
  await clickCenter(page);
  const afterPlace = await waitForCountChange(page, initial);
  expect(afterPlace).toBe(initial + 1);
  expect(await page.evaluate(({ x, y, z }) => window.__santi!.getBlock(Math.floor(x), y, Math.floor(z)), target)).not.toBe(0);

  await clickCenter(page, "right");
  const afterRemove = await waitForCountChange(page, afterPlace);
  expect(afterRemove).toBe(initial);

  await page.getByRole("button", { name: "Deshacer" }).click();
  expect(await waitForCountChange(page, afterRemove)).toBe(initial + 1);

  expect(errors).toEqual([]);
});

test("[plataforma-escalable] la simulación avanza a 20 Hz", async ({ page }) => {
  await openTestGame(page);
  const rate = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        const k0 = window.__santi!.tick();
        setTimeout(() => resolve((window.__santi!.tick() - k0) / ((performance.now() - t0) / 1000)), 2000);
      }),
  );
  // 20 ticks por segundo, con margen por los frames lentos del WebGL por software.
  expect(rate).toBeGreaterThan(12);
  expect(rate).toBeLessThan(23);
});
