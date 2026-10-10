import { expect, test, type Page } from "@playwright/test";
import { openTestGame } from "./helpers/game";

/** Todo lo que podría llevar a otra página: enlaces, formularios y atributos con URL. */
async function navigationTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("a, area, form, button, [onclick], [data-href], [href], [action], [formaction]")) {
      for (const attr of ["href", "action", "formaction", "onclick", "data-href"]) {
        const v = el.getAttribute(attr);
        if (v) out.push(v);
      }
    }
    return out;
  });
}

test("[vista-de-padres] Sin enlaces desde la UI del niño: ningún elemento ni atajo lleva a /padres/", async ({ page }) => {
  await openTestGame(page, "sin-padres", 2);
  const states: [string, () => Promise<void>][] = [
    ["juego", async () => {}],
    ["Mis Mundos abierto", async () => page.locator("#worlds-btn").click()],
  ];
  for (const [state, enter] of states) {
    await enter();
    for (const target of await navigationTargets(page)) expect(target, state).not.toMatch(/padres/i);
    expect(await page.evaluate(() => document.documentElement.outerHTML), state).not.toMatch(/\/padres|vista de padres/i);
  }
  await page.locator(".worlds-close").click();
  await expect(page.locator(".worlds-panel")).toBeHidden();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // Atajos de teclado sin ningún botón enfocado (los botones ya se revisaron arriba).
  const keys = [..."abcdefghijklmnopqrstuvwxyz0123456789", "Escape", "Enter", "Backspace", "F1", "Alt+p", "Shift+P", "Control+Shift+P"];
  for (const key of keys) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe("/");
  expect(page.context().pages().length).toBe(1);
});
