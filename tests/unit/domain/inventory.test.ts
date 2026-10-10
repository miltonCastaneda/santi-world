import { describe, expect, it } from "vitest";
import { DROPS, MELEE, resolveHit } from "../../../src/domain/rules/damage";
import { dotsFor, emptyInventory, MAX_DOTS, RESOURCE_IDS, sanitizeInventory } from "../../../src/domain/rules/inventory";
import { TOOL_IDS } from "../../../src/domain/rules/tools";

describe("[recursos-e-inventario] Reglas del inventario", () => {
  it("tres recursos que empiezan en 0", () => {
    expect(RESOURCE_IDS).toEqual(["diamond", "meat", "pigChicken"]);
    expect(emptyInventory()).toEqual({ diamond: 0, meat: 0, pigChicken: 0 });
  });

  it("puntos visuales solo de 1 a 5", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(dotsFor)).toEqual([0, 1, 2, 3, 4, 5, 0, 0]);
    expect(MAX_DOTS).toBe(5);
  });

  it("un inventario guardado raro se corrige: enteros de 0 en adelante y 0 si falta", () => {
    expect(sanitizeInventory({ diamond: 4.7, meat: -2, pigChicken: "x" })).toEqual({ diamond: 4, meat: 0, pigChicken: 0 });
    expect(sanitizeInventory(undefined)).toEqual(emptyInventory());
  });
});

describe("[recursos-e-inventario] Tabla de herramientas sobre animales", () => {
  it("solo la Espada convierte un animal de granja en carne; el Pico, la Mano y el Collar solo hacen boing", () => {
    const table = Object.fromEntries(TOOL_IDS.map((t) => [t, resolveHit(t, "animal")]));
    expect(table.sword).toEqual({ outcome: "defeat", defeated: true, hits: 1, drop: "meat" });
    for (const t of ["hand", "pickaxe", "collar"] as const) expect(table[t], t).toEqual({ outcome: "boing", defeated: false, hits: 0, drop: null });
    expect(table.bow.outcome).toBe("none");
  });

  it("el cerdo-gallina nunca da carne: cualquier herramienta lo captura", () => {
    for (const t of TOOL_IDS) {
      expect(MELEE[t].pigChicken, t).toBe("capture");
      expect(resolveHit(t, "pigChicken").drop, t).toBeNull();
    }
    expect(DROPS.pigChicken).toBeNull();
    expect(DROPS.zombie).toBeNull();
  });
});
