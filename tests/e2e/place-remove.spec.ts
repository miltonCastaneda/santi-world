import { expect, test, type Page } from "@playwright/test";
import { lookAtFarm, openTestGame } from "./helpers/game";
import { collectErrors } from "./helpers/page";

async function clickCenter(page: Page): Promise<void> {
  const box = await page.locator("canvas#game").boundingBox();
  if (!box) throw new Error("canvas sin tamaño");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitForCountChange(page: Page, before: number): Promise<number> {
  await page.waitForFunction((b) => window.__santi!.placedCount() !== b, before);
  return page.evaluate(() => window.__santi!.placedCount());
}

test("[personaje-y-herramientas] poner con la Mano, romper con el Pico y deshacer", async ({ page }) => {
  const errors = collectErrors(page);
  await openTestGame(page);
  // El personaje aparece en el centro de la granja: el objetivo queda a 3 bloques, dentro del alcance.
  const target = await lookAtFarm(page, 3);
  await expect(page.locator('.tool-btn[data-tool="hand"]')).toHaveClass(/active/);

  const initial = await page.evaluate(() => window.__santi!.placedCount());
  await clickCenter(page);
  const afterPlace = await waitForCountChange(page, initial);
  expect(afterPlace).toBe(initial + 1);
  expect(await page.evaluate(({ x, y, z }) => window.__santi!.getBlock(Math.floor(x), y, Math.floor(z)), target)).not.toBe(0);

  await page.getByRole("button", { name: "Pico" }).click();
  await expect(page.locator('.tool-btn[data-tool="pickaxe"]')).toHaveClass(/active/);
  await clickCenter(page);
  const afterRemove = await waitForCountChange(page, afterPlace);
  expect(afterRemove).toBe(initial);

  await page.getByRole("button", { name: "Deshacer" }).click();
  expect(await waitForCountChange(page, afterRemove)).toBe(initial + 1);

  expect(errors).toEqual([]);
});

test("[personaje-y-herramientas] Fuera de alcance: no pone el bloque y lo indica", async ({ page }) => {
  await openTestGame(page);
  await lookAtFarm(page, 12);
  const initial = await page.evaluate(() => window.__santi!.placedCount());
  // El indicador dura 700 ms: se registra en cuanto aparece, aunque la máquina vaya lenta.
  await page.evaluate(() => {
    const el = document.querySelector("#too-far")!;
    new MutationObserver(() => el.classList.contains("show") && el.setAttribute("data-seen", "1")).observe(el, { attributes: true, attributeFilter: ["class"] });
  });
  await clickCenter(page);
  await expect(page.locator("#too-far")).toHaveAttribute("data-seen", "1");
  expect(await page.evaluate(() => window.__santi!.placedCount())).toBe(initial);
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
