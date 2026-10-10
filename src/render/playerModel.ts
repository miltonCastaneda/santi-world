import * as THREE from "three";
import type { Vec3 } from "../core/math";
import type { ToolId, ToolSwing } from "../domain/rules/tools";
import type { PlayerAnim } from "../sim/player";

/** Lo que el modelo necesita leer del personaje en cada frame (nunca lo modifica). */
export type PlayerView = {
  pos: Vec3;
  yaw: number;
  anim: PlayerAnim;
  swing: ToolSwing;
  /** 0 a 1 dentro de la animación de acción. */
  actionProgress: number;
  tool: ToolId;
  invulnerable: boolean;
};

const SKIN = 0xf2c29b;
const SHIRT = 0x2f7de1;
const PANTS = 0x3b3b8f;
const HAIR = 0x5a3a1e;
const SHOES = 0x4a4a4a;

/** Camiseta con la "S" de Santi, dibujada en un lienzo de 16x16 (pixel art). */
function shirtTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f7de1";
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = "#ffd23f";
  // "S" de 6x8 píxeles en el centro.
  const s = ["111111", "110000", "110000", "111110", "011111", "000011", "000011", "111111"];
  s.forEach((row, y) => [...row].forEach((v, x) => v === "1" && g.fillRect(5 + x, 4 + y, 1, 1)));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[], y = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, y, 0);
  return new THREE.Mesh(geo, material);
}

function toolMeshes(): Record<ToolId, THREE.Object3D> {
  const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
  const wood = mat(0x8b5a2b);
  const group = (...parts: THREE.Mesh[]) => {
    const g = new THREE.Group();
    g.add(...parts);
    return g;
  };
  const pick = group(box(0.06, 0.6, 0.06, wood, -0.3), box(0.45, 0.08, 0.08, mat(0x9aa5b1), -0.58));
  const sword = group(box(0.06, 0.15, 0.06, wood, -0.08), box(0.22, 0.05, 0.08, mat(0xb8860b), -0.17), box(0.08, 0.55, 0.03, mat(0xdfe6ee), -0.47));
  const bow = group(box(0.05, 0.7, 0.05, wood, -0.3), box(0.02, 0.66, 0.02, mat(0xf2f2f2), -0.3));
  bow.children[1].position.z = 0.12;
  const collar = group(box(0.3, 0.06, 0.3, mat(0xe74c3c), -0.15), box(0.08, 0.08, 0.08, mat(0xffd23f), -0.2));
  const hand = new THREE.Group();
  return { hand, pickaxe: pick, sword, bow, collar };
}

/**
 * Personaje del niño hecho de cajas (ADR-0010), con animación procedural: idle, caminar, saltar y
 * acción según la herramienta. Es un solo modelo, así que usa mallas normales (unas 8 draw calls).
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  /** Animación que se está mostrando (para las pruebas de tiempos de transición). */
  anim: PlayerAnim = "idle";
  shownTool: ToolId = "hand";
  private readonly body = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly tools: Record<ToolId, THREE.Object3D>;
  private phase = 0;
  private time = 0;
  private initialized = false;

  constructor() {
    const skin = new THREE.MeshLambertMaterial({ color: SKIN });
    const shirt = new THREE.MeshLambertMaterial({ color: SHIRT });
    const front = new THREE.MeshLambertMaterial({ map: shirtTexture() });
    const pants = new THREE.MeshLambertMaterial({ color: PANTS });
    const hair = new THREE.MeshLambertMaterial({ color: HAIR });
    const shoes = new THREE.MeshLambertMaterial({ color: SHOES });

    // BoxGeometry ordena las caras +x, -x, +y, -y, +z, -z: la "S" va en +z (el frente).
    const torso = box(0.5, 0.7, 0.28, [shirt, shirt, shirt, shirt, front, shirt], 0.35);
    torso.position.y = 0.75;
    const head = box(0.44, 0.44, 0.44, skin, 0.22);
    head.position.y = 1.45;
    const hairCap = box(0.46, 0.14, 0.46, hair, 0.4);
    hairCap.position.y = 1.45;
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1f2933 });
    const eyes = [-0.1, 0.1].map((x) => {
      const e = box(0.07, 0.07, 0.02, eyeMat);
      e.position.set(x, 1.7, 0.225);
      return e;
    });

    for (const [leg, x] of [
      [this.legL, -0.13],
      [this.legR, 0.13],
    ] as const) {
      leg.position.set(x, 0.75, 0);
      leg.add(box(0.24, 0.6, 0.26, pants, -0.3), box(0.25, 0.15, 0.28, shoes, -0.675));
    }
    for (const [arm, x] of [
      [this.armL, -0.36],
      [this.armR, 0.36],
    ] as const) {
      arm.position.set(x, 1.4, 0);
      arm.add(box(0.2, 0.3, 0.22, shirt, -0.15), box(0.18, 0.4, 0.2, skin, -0.5));
    }
    this.tools = toolMeshes();
    for (const t of Object.values(this.tools)) {
      t.position.set(0, -0.62, 0.12);
      t.rotation.x = Math.PI / 2;
      t.visible = false;
      this.armR.add(t);
    }

    this.body.add(torso, head, hairCap, ...eyes, this.legL, this.legR, this.armL, this.armR);
    this.root.add(this.body);
  }

  update(dtSeconds: number, v: PlayerView): void {
    this.time += dtSeconds;
    const target = new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z);
    // La simulación va a 20 Hz: se suaviza la posición para que se vea fluida a 60 FPS.
    if (!this.initialized || this.root.position.distanceTo(target) > 4) this.root.position.copy(target);
    else this.root.position.lerp(target, 1 - Math.exp(-dtSeconds * 25));
    this.initialized = true;
    let dy = v.yaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * (1 - Math.exp(-dtSeconds * 15));

    if (v.tool !== this.shownTool || !this.tools[v.tool].visible) {
      for (const [id, mesh] of Object.entries(this.tools)) mesh.visible = id === v.tool;
      this.shownTool = v.tool;
    }
    this.anim = v.anim;
    this.pose(v, dtSeconds);
    // Parpadeo mientras es invulnerable (tras un golpe o al reaparecer).
    this.body.visible = !v.invulnerable || Math.floor(this.time * 10) % 2 === 0;
  }

  private pose(v: PlayerView, dt: number): void {
    const swingTo = (g: THREE.Group, angle: number) => (g.rotation.x += (angle - g.rotation.x) * (1 - Math.exp(-dt * 20)));
    this.body.position.y = 0;
    this.body.scale.set(1, 1, 1);
    switch (v.anim) {
      case "walk": {
        this.phase += dt * 10;
        const s = Math.sin(this.phase) * 0.7;
        this.legL.rotation.x = s;
        this.legR.rotation.x = -s;
        this.armL.rotation.x = -s * 0.8;
        this.armR.rotation.x = s * 0.8;
        this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05;
        break;
      }
      case "jump":
        swingTo(this.legL, -0.4);
        swingTo(this.legR, 0.3);
        swingTo(this.armL, -2.6);
        swingTo(this.armR, -2.6);
        break;
      case "action": {
        // Brazo derecho: golpe hacia abajo (pico, espada, mano), hacia delante (arco) o lanzar (collar).
        const p = v.actionProgress;
        const arc = Math.sin(p * Math.PI);
        const peak = v.swing === "shoot" ? -1.5 : v.swing === "throw" ? -2.8 : -2.2;
        this.armR.rotation.x = v.swing === "shoot" ? peak : peak * arc;
        this.armL.rotation.x = v.swing === "shoot" ? -1.4 : 0;
        swingTo(this.legL, 0);
        swingTo(this.legR, 0);
        break;
      }
      default:
        swingTo(this.legL, 0);
        swingTo(this.legR, 0);
        swingTo(this.armL, 0);
        swingTo(this.armR, 0);
        this.body.scale.y = 1 + Math.sin(this.time * 2.5) * 0.012;
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          (m as THREE.MeshLambertMaterial).map?.dispose();
          (m as THREE.Material).dispose();
        }
      }
    });
  }
}
