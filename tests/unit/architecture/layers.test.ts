import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** Lo que diría `npm run check` de un archivo con este código en esa ruta (sin crearlo). */
async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return result.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`);
}

describe("[plataforma-escalable] Capas con dependencias en una sola dirección", () => {
  it("[plataforma-escalable] Dependencia prohibida: un archivo del dominio que importa del render hace fallar la verificación con la regla", async () => {
    const errors = await lint("src/domain/rules/prohibida.ts", 'import { RenderApp } from "../../render/renderApp";\nexport const app = RenderApp;\n');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^@typescript-eslint\/no-restricted-imports: .*"render".*docs\/architecture\.md/);
  }, 30_000);

  it("el núcleo tampoco puede usar Math.random ni importar three; el render sí puede importar el dominio", async () => {
    expect(await lint("src/sim/systems/azar.ts", "export const r = () => Math.random();\n")).toEqual([expect.stringMatching(/^no-restricted-properties: .*Rng/)]);
    expect(await lint("src/core/tres.ts", 'import * as THREE from "three";\nexport const v = new THREE.Vector3();\n')).toEqual([expect.stringMatching(/"three"/)]);
    expect(await lint("src/render/bien.ts", 'import { BLOCK_NUM } from "../domain/blocks";\nexport const n = BLOCK_NUM;\n')).toEqual([]);
  }, 30_000);
});
