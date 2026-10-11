import { expect, test, type Page } from "@playwright/test";

/** Milisegundos desde el inicio de la navegación hasta la marca de User Timing `name`. */
const markMs = (page: Page, name: string) =>
  page
    .waitForFunction((name) => performance.getEntriesByName(name)[0]?.startTime, name, { timeout: 30_000 })
    .then((h) => h.jsonValue() as Promise<number>);

test("[rendimiento-y-estabilidad-visual] Primer momento jugable: con un mundo existente, el personaje responde al teclado en menos de 3 s", async ({ page }) => {
  // Primera visita: se crea el mundo. La segunda es la que mide, ya con un mundo guardado.
  await page.goto("/");
  await markMs(page, "santi:jugable");

  // Desde que empieza la navegación, la tecla W queda pulsada (como un niño impaciente).
  await page.addInitScript(() => {
    const press = () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      requestAnimationFrame(press);
    };
    requestAnimationFrame(press);
  });
  await page.reload();
  const playable = await markMs(page, "santi:jugable");
  const moved = await markMs(page, "santi:primer-movimiento");
  test.info().annotations.push({ type: "arranque (ms)", description: JSON.stringify({ jugable: Math.round(playable), primerMovimiento: Math.round(moved) }) });
  expect(moved).toBeLessThan(3000);
});
