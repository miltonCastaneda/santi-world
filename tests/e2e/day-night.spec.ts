import { expect, test, type Page } from "@playwright/test";
import type {} from "../../src/testing/parentsTestApi";
import { openTestGame } from "./helpers/game";
import { canvasBrightness, collectErrors, diffShots, hideHud } from "./helpers/page";

const canvas = (page: Page) => page.locator("canvas#game");

/** Pone el reloj del mundo en un punto calculado a partir de las duraciones y deja dibujar. */
async function setTime(page: Page, at: (t: { dayMs: number; nightMs: number }) => number): Promise<void> {
  const durations = await page.evaluate(() => window.__santi!.dayNight());
  await page.evaluate((ms) => window.__santi!.setTimeOfCycle(ms), at(durations));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 200)))));
}

test.describe("[ciclo-dia-noche] ciclo de día y noche", () => {
  test("[ciclo-dia-noche] Aviso de que se acerca la noche: la luna parpadea y suena un aviso una sola vez", async ({ page }) => {
    const errors = collectErrors(page);
    await openTestGame(page, "noche-aviso");
    const clock = page.locator(".day-clock");
    await expect(clock).toBeVisible();
    await expect(clock.locator(".day-number b")).toHaveText("1");
    await expect(clock).not.toHaveClass(/night-soon/);
    await expect(clock.locator(".clock-moon")).toBeHidden();

    await setTime(page, (t) => t.dayMs - 61_000);
    await expect(clock).toHaveClass(/night-soon/, { timeout: 5000 });
    await expect(clock.locator(".clock-moon")).toBeVisible();
    // Parpadeo suave: una animación lenta (de un segundo o más), no un destello.
    const anim = await clock.locator(".clock-moon").evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, seconds: parseFloat(s.animationDuration) };
    });
    expect(anim.name).not.toBe("none");
    expect(anim.seconds).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1500);
    expect((await page.evaluate(() => window.__santi!.audio().requests)).chime).toBe(1);

    // Al llegar la noche: luna en el reloj y sin aviso.
    await setTime(page, (t) => t.dayMs + 1000);
    await expect(clock).toHaveClass(/(^|\s)night(\s|$)/);
    await expect(clock).not.toHaveClass(/night-soon/);
    expect((await page.evaluate(() => window.__santi!.audio().requests)).chime).toBe(1);
    expect(errors).toEqual([]);
  });

  test("[ciclo-dia-noche] Atardecer gradual: la escena se oscurece poco a poco y la luz cambia de forma continua", async ({ page }) => {
    await openTestGame(page, "noche-atardecer");
    await hideHud(page);
    await page.evaluate(() => {
      window.__santi!.setPlayerVisible(false);
      window.__santi!.setEntitiesVisible(false);
      const { farm } = window.__santi!.layout()!;
      const x = (farm.x0 + farm.x1) / 2;
      const z = (farm.z0 + farm.z1) / 2;
      window.__santi!.setView({ x: x - 12, y: 20, z: z + 14 }, { x, y: 9, z });
    });
    const brightness: number[] = [];
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      await setTime(page, (t) => t.dayMs - 30_000 + f * 29_000);
      brightness.push(await canvasBrightness(page, "canvas#game"));
    }
    for (let i = 1; i < brightness.length; i++) expect(brightness[i], `paso ${i}: ${brightness.join(", ")}`).toBeLessThan(brightness[i - 1]);
    // Ningún paso de un cuarto del atardecer (7,5 s) es un salto brusco.
    for (let i = 1; i < brightness.length; i++) expect(brightness[i - 1] - brightness[i]).toBeLessThan(brightness[0] * 0.4);

    // Frame a frame, la luz del día cambia muy poco.
    await setTime(page, (t) => t.dayMs - 20_000);
    const samples = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          const tick = () => {
            out.push(window.__santi!.dayNight().daylight);
            if (out.length < 60) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i] - samples[i - 1])).toBeLessThan(0.1);
    expect(samples.at(-1)!).toBeLessThan(samples[0]);
  });

  test("[ciclo-dia-noche] Visibilidad nocturna mínima: a medianoche un animal cercano se distingue del fondo", async ({ page }, testInfo) => {
    await openTestGame(page, "noche-visible");
    await hideHud(page);
    await setTime(page, (t) => t.dayMs + t.nightMs / 2);
    expect(await page.evaluate(() => window.__santi!.dayNight().phase)).toBe("night");

    const look = () =>
      page.evaluate(() => {
        const cow = window.__santi!.entities().find((e) => e.species === "cow")!;
        window.__santi!.setPlayerVisible(false);
        window.__santi!.setView({ x: cow.pos.x + 0.01, y: cow.pos.y + 3, z: cow.pos.z + 5 }, { x: cow.pos.x, y: cow.pos.y + 0.6, z: cow.pos.z });
      });
    const shot = async (visible: boolean) => {
      await page.evaluate((v) => window.__santi!.setEntitiesVisible(v), visible);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return canvas(page).screenshot();
    };
    await look();
    await page.waitForTimeout(300);
    await look();
    const withAnimals = await shot(true);
    const without = await shot(false);
    await testInfo.attach("medianoche-vaca", { body: withAnimals, contentType: "image/png" });
    const night = await diffShots(page, withAnimals, without);

    // Umbral de las pruebas visuales: el animal ocupa una zona visible y se separa claramente del fondo.
    expect(night.changed, JSON.stringify(night)).toBeGreaterThan(1500);
    expect(night.meanDelta, JSON.stringify(night)).toBeGreaterThanOrEqual(60);

    // De noche se ve menos que de día, pero no desaparece.
    await setTime(page, (t) => t.dayMs / 2);
    await look();
    const day = await diffShots(page, await shot(true), await shot(false));
    expect(night.meanDelta).toBeGreaterThan(day.meanDelta * 0.35);
  });
});

test("[vista-de-padres] Cambiar la duración de la noche: la próxima noche dura 5 min ± 1 s", async ({ page, context }) => {
  await openTestGame(page, "noche-padres", 2);
  const worldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);
  await page.evaluate(() => window.__santi!.saveNow());
  expect(await page.evaluate(() => window.__santi!.dayNight())).toMatchObject({ nightMs: 15 * 60_000, quietNight: false });

  const parents = await context.newPage();
  await parents.goto("/padres/?test=1");
  await parents.waitForFunction(() => window.__padres !== undefined && document.querySelector("#parents-root")?.getAttribute("data-ready") === "true");
  await parents.locator(`.world-card[data-world-id="${worldId}"] [data-action="settings"]`).click();
  await parents.locator('.settings-dialog input[name="nightMinutes"]').fill("5");
  await parents.locator('.settings-dialog input[name="quietNight"]').check();
  await parents.locator('.settings-dialog button[type="submit"]').click();
  await expect(parents.locator(".settings-dialog")).toHaveCount(0);

  // El juego abierto lo recibe en caliente, sin recargar.
  await page.waitForFunction(() => window.__santi!.dayNight().nightMs === 300_000);
  expect(await page.evaluate(() => window.__santi!.dayNight().quietNight)).toBe(true);

  // Empieza la noche: termina a los 5 min (no a los 15). Saltamos hasta 1,5 s antes del final.
  const { dayMs, dayCount } = await page.evaluate(() => window.__santi!.dayNight());
  await page.evaluate((t) => window.__santi!.setTimeOfCycle(t), dayMs + 1000);
  expect(await page.evaluate(() => window.__santi!.dayNight().phase)).toBe("night");
  await page.evaluate((t) => window.__santi!.setTimeOfCycle(t), dayMs + 300_000 - 1500);
  expect(await page.evaluate(() => window.__santi!.dayNight().phase)).toBe("dawn");
  await page.waitForFunction((n) => window.__santi!.dayNight().dayCount === n + 1, dayCount, { timeout: 4000 });
  const after = await page.evaluate(() => window.__santi!.dayNight());
  expect(after.phase).toBe("day");
  expect(after.timeOfCycleMs).toBeLessThan(2500);
});
