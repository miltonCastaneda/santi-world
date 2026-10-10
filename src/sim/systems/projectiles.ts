import { rayAabb, raycastVoxels, type Aabb, type Vec3 } from "../../core/math";
import { ARROW, canShoot } from "../../domain/rules/archery";

export type Arrow = { id: string; pos: Vec3; vel: Vec3; bornAt: number };

/** Algo a lo que una flecha le puede pegar (una criatura o el dragón). */
export type ArrowTarget = { id: string; box: Aabb };

export type ArrowEnd =
  | { type: "entity"; arrow: Arrow; pos: Vec3; targetId: string }
  | { type: "block"; arrow: Arrow; pos: Vec3; cell: Vec3 }
  | { type: "expired"; arrow: Arrow; pos: Vec3 };

/**
 * Flechas en vuelo (design D9): 30 bloques/s, gravedad de 10, 3 subpasos por tick, recorrido DDA
 * contra los bloques y rayo contra las cajas de las criaturas, y vida de 3 s.
 */
export class ProjectileSystem {
  arrows: Arrow[] = [];
  private lastShotAt: number | null = null;
  private count = 0;

  reset(): void {
    this.arrows = [];
    this.lastShotAt = null;
    this.count = 0;
  }

  /** Dispara una flecha; devuelve null si todavía no pasó el tiempo entre disparos. */
  shoot(from: Vec3, vel: Vec3, now: number): Arrow | null {
    if (!canShoot(this.lastShotAt, now)) return null;
    this.lastShotAt = now;
    const arrow = { id: `arrow-${this.count++}`, pos: { ...from }, vel: { ...vel }, bornAt: now };
    this.arrows.push(arrow);
    return arrow;
  }

  step(dtMs: number, now: number, isSolid: (x: number, y: number, z: number) => boolean, targets: readonly ArrowTarget[]): ArrowEnd[] {
    const ends: ArrowEnd[] = [];
    const h = dtMs / 1000 / ARROW.substeps;
    this.arrows = this.arrows.filter((a) => {
      if (now - a.bornAt >= ARROW.lifeMs) {
        ends.push({ type: "expired", arrow: a, pos: { ...a.pos } });
        return false;
      }
      for (let s = 0; s < ARROW.substeps; s++) {
        a.vel.y -= ARROW.gravity * h;
        const len = Math.hypot(a.vel.x, a.vel.y, a.vel.z) * h;
        const dir = { x: a.vel.x * h / len, y: a.vel.y * h / len, z: a.vel.z * h / len };
        const ray = { origin: a.pos, direction: dir };
        const block = raycastVoxels(ray, len, isSolid);
        let hitT = block ? block.distance : Infinity;
        let hitId: string | null = null;
        for (const t of targets) {
          const d = rayAabb(ray, t.box, Math.min(len, hitT));
          if (d !== null && d < hitT) {
            hitT = d;
            hitId = t.id;
          }
        }
        if (hitT <= len) {
          const pos = { x: a.pos.x + dir.x * hitT, y: a.pos.y + dir.y * hitT, z: a.pos.z + dir.z * hitT };
          a.pos = pos;
          if (hitId !== null) ends.push({ type: "entity", arrow: a, pos: { ...pos }, targetId: hitId });
          else ends.push({ type: "block", arrow: a, pos: { ...pos }, cell: block!.cell });
          return false;
        }
        a.pos = { x: a.pos.x + a.vel.x * h, y: a.pos.y + a.vel.y * h, z: a.pos.z + a.vel.z * h };
      }
      return true;
    });
    return ends;
  }
}
