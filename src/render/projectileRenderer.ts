import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "../core/math";

/** Lo que el render lee de cada flecha en vuelo (nunca la modifica). */
export type ArrowView = { pos: Vec3; vel: Vec3 };

type Fire = { origin: THREE.Vector3; startedAt: number };

const MAX_ARROWS = 16;
const MAX_FIRES = 6;
const FLAMES = 14;
/** Una llamarada cartoon dura menos de 1 s (checklist "Revisión de efectos"). */
const FIRE_SECONDS = 0.9;
const FLAME_COLORS = [new THREE.Color(0xffd23f), new THREE.Color(0xff9f1c), new THREE.Color(0xffe8a3), new THREE.Color(0xff7b3a)];

/** Flecha de cajas: varilla de madera, punta gris y plumas blancas. El frente es +z. */
function arrowGeometry(): THREE.BufferGeometry {
  const parts: [number, number, number, number, number, number, number][] = [
    [0.05, 0.05, 0.7, 0, 0, 0, 0xb07a3c],
    [0.09, 0.09, 0.12, 0, 0, 0.38, 0x9aa3ad],
    [0.14, 0.02, 0.14, 0, 0, -0.3, 0xfafafa],
    [0.02, 0.14, 0.14, 0, 0, -0.3, 0xfafafa],
  ];
  const color = new THREE.Color();
  const geos = parts.map(([w, h, d, x, y, z, c]) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    color.setHex(c);
    const n = g.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return merged;
}

/**
 * Flechas en vuelo (apuntan hacia donde van) y las llamaradas cartoon del dragón: cubos amarillos
 * y naranjas que suben y se achican, sin humo negro ni nada que asuste. Dos draw calls como mucho.
 */
export class ProjectileRenderer {
  readonly group = new THREE.Group();
  private readonly arrows: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private fires: Fire[] = [];
  private time = 0;

  constructor() {
    this.group.name = "projectiles";
    const arrowGeo = arrowGeometry();
    const arrowMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, MAX_ARROWS);
    const flameGeo = new THREE.BoxGeometry(1, 1, 1);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.flames = new THREE.InstancedMesh(flameGeo, flameMat, FLAMES * MAX_FIRES);
    this.flames.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLAMES * MAX_FIRES * 3), 3);
    for (const mesh of [this.arrows, this.flames]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      this.group.add(mesh);
    }
    this.geometries.push(arrowGeo, flameGeo);
    this.materials.push(arrowMat, flameMat);
  }

  /** Llamarada en `pos` (sobre la copa del árbol que quema el dragón). */
  fire(pos: Vec3): void {
    if (this.fires.length >= MAX_FIRES) this.fires.shift();
    this.fires.push({ origin: new THREE.Vector3(pos.x, pos.y, pos.z), startedAt: this.time });
  }

  clear(): void {
    this.fires = [];
  }

  get drawCalls(): number {
    return (this.arrows.visible ? 1 : 0) + (this.flames.visible ? 1 : 0);
  }

  update(dtSeconds: number, arrows: Iterable<ArrowView>): void {
    this.time += dtSeconds;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const forward = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const a of arrows) {
      if (n >= MAX_ARROWS) break;
      dir.set(a.vel.x, a.vel.y, a.vel.z);
      if (dir.lengthSq() < 1e-9) continue;
      q.setFromUnitVectors(forward, dir.normalize());
      m.compose(new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z), q, one);
      this.arrows.setMatrixAt(n++, m);
    }
    this.arrows.count = n;
    this.arrows.visible = n > 0;
    this.arrows.instanceMatrix.needsUpdate = true;

    this.fires = this.fires.filter((f) => this.time - f.startedAt < FIRE_SECONDS);
    let k = 0;
    for (const f of this.fires) {
      const t = (this.time - f.startedAt) / FIRE_SECONDS;
      for (let i = 0; i < FLAMES; i++) {
        // Espiral fija (ángulo áureo): se ve igual cada vez, sin azar.
        const a = i * 2.39996 + t * 3;
        const r = 0.3 + 0.9 * ((i % 5) / 5) * (1 - t * 0.5);
        const rise = ((i * 0.37) % 1) * 0.8 + t * 1.8;
        const size = (0.32 - 0.1 * ((i % 3) / 2)) * (1 - t) + 0.03;
        q.setFromAxisAngle(forward, a);
        m.compose(new THREE.Vector3(f.origin.x + Math.cos(a) * r, f.origin.y + rise, f.origin.z + Math.sin(a) * r), q, new THREE.Vector3(size, size, size));
        this.flames.setMatrixAt(k, m);
        this.flames.setColorAt(k, FLAME_COLORS[i % FLAME_COLORS.length]);
        k++;
      }
    }
    this.flames.count = k;
    this.flames.visible = k > 0;
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.group.remove(this.arrows, this.flames);
    this.arrows.dispose();
    this.flames.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
