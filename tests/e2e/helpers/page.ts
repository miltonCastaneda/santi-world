import type { Page } from "@playwright/test";

/** Junta los errores de consola y las excepciones no capturadas de la página. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/**
 * Cuenta los colores distintos de una captura del canvas. Un canvas en blanco
 * (o de un solo color) devuelve 1 o 2; una escena dibujada devuelve cientos.
 */
export async function countCanvasColors(page: Page, selector = "canvas"): Promise<number> {
  const png = await page.locator(selector).first().screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 7) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return colors.size;
  }, png.toString("base64"));
}
