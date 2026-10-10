import { expect, test } from "@playwright/test";
import { openTestGame } from "./helpers/game";
import { collectErrors } from "./helpers/page";

test("[animales-y-granja] la granja tiene animales que se mueven y se dibujan con 60 draw calls o menos", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openTestGame(page);
  const first = await page.evaluate(() => window.__santi!.entities());
  const count = (species: string) => first.filter((e) => e.species === species).length;
  expect(first).toHaveLength(15);
  expect([count("sheep"), count("cow"), count("goat"), count("hen"), count("chick"), count("duck")]).toEqual([3, 2, 2, 3, 3, 2]);

  // Vista alta sobre la granja: todos los animales del cercado quedan a menos de 64 bloques.
  await page.evaluate(() => {
    const farm = window.__santi!.layout()!.farm;
    const x = (farm.x0 + farm.x1) / 2;
    const z = (farm.z0 + farm.z1) / 2;
    window.__santi!.setView({ x: x + 0.01, y: 40, z: z + 22 }, { x, y: 9, z });
  });
  await page.waitForTimeout(3000);
  const stats = await page.evaluate(() => window.__santi!.stats());
  expect(stats.entitiesDrawn).toBeGreaterThanOrEqual(10);
  expect(stats.entityDrawCalls).toBeGreaterThan(0);
  expect(stats.entityDrawCalls).toBeLessThanOrEqual(60);
  await testInfo.attach("granja-con-animales", { body: await page.locator("canvas#game").screenshot(), contentType: "image/png" });

  // Sin intervención, en pocos segundos alguno se movió.
  const later = await page.evaluate(() => window.__santi!.entities());
  const moved = later.filter((e) => {
    const before = first.find((f) => f.id === e.id)!;
    return Math.hypot(e.pos.x - before.pos.x, e.pos.z - before.pos.z) > 0.5;
  });
  expect(moved.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
