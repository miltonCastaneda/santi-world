import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "../core/math";
import type { EntityAnim } from "../domain/entities/entityStore";
import { SPECIES_IDS } from "../domain/entities/species";

/** Lo que sabe dibujar: los animales de granja y los zombis. */
const RENDER_KINDS = [...SPECIES_IDS, "zombie"] as const;
type RenderKind = (typeof RENDER_KINDS)[number];
const isRenderKind = (s: string): s is RenderKind => (RENDER_KINDS as readonly string[]).includes(s);

/** Lo que el render lee de cada animal en cada frame (nunca lo modifica). */
export type EntityView = {
  id: string;
  species: string;
  pos: Vec3;
  yaw: number;
  anim: EntityAnim;
  /** Parpadeo cartoon (tras un golpe). */
  blink?: boolean;
};

export type EntityRenderStats = { drawCalls: number; drawn: number; poofs: number };

/** Las entidades a más de 64 bloques de la cámara no se dibujan (design: rendimiento). */
export const ENTITY_DRAW_DISTANCE = 64;

type V3 = readonly [number, number, number];
type Box = { size: V3; at: V3; color: number };
/** Cajas relativas al pivote de la parte (cuello para la cabeza, cadera para las patas). */
type ModelDef = {
  body: Box[];
  head: { pivot: V3; boxes: Box[] };
  legs: { hips: V3[]; boxes: Box[]; height: number };
  /** Radio de la sombra plana. */
  shadow: number;
};

const EYE = 0x1f2933;
const ORANGE = 0xf0a030;
const eyes = (x: number, y: number, z: number, s = 0.07): Box[] => [-x, x].map((ex) => ({ size: [s, s, 0.02], at: [ex, y, z], color: EYE }));
const quad = (x: number, y: number, z: number): V3[] => [
  [-x, y, z],
  [x, y, -z],
  [x, y, z],
  [-x, y, -z],
];
const leg = (w: number, h: number, color: number): Box[] => [{ size: [w, h, w], at: [0, -h / 2, 0], color }];

const ZOMBIE_SKIN = 0x8fd16a;
const ZOMBIE_SHIRT = 0x3fa7c9;

/** Animales de cajas, estilo del personaje (ADR-0010). El frente es +z. */
const MODELS: Record<RenderKind, ModelDef> = {
  // Zombi cartoon (preguntas abiertas, punto 6): verde claro, ojos grandes con brillo y una sonrisa;
  // los brazos estirados hacia adelante, sin heridas ni dientes.
  zombie: {
    body: [
      { size: [0.56, 0.68, 0.32], at: [0, 1.09, 0], color: ZOMBIE_SHIRT },
      { size: [0.18, 0.18, 0.6], at: [-0.37, 1.32, 0.22], color: ZOMBIE_SHIRT },
      { size: [0.18, 0.18, 0.6], at: [0.37, 1.32, 0.22], color: ZOMBIE_SHIRT },
      { size: [0.17, 0.17, 0.14], at: [-0.37, 1.32, 0.58], color: ZOMBIE_SKIN },
      { size: [0.17, 0.17, 0.14], at: [0.37, 1.32, 0.58], color: ZOMBIE_SKIN },
    ],
    head: {
      pivot: [0, 1.43, 0],
      boxes: [
        { size: [0.5, 0.48, 0.48], at: [0, 0.24, 0], color: ZOMBIE_SKIN },
        { size: [0.52, 0.1, 0.5], at: [0, 0.5, 0], color: 0x4e8a3c },
        // Ojos grandes: blanco, pupila y un brillo.
        ...[-0.12, 0.12].flatMap((x): Box[] => [
          { size: [0.16, 0.17, 0.02], at: [x, 0.29, 0.245], color: 0xffffff },
          { size: [0.08, 0.09, 0.02], at: [x, 0.27, 0.255], color: EYE },
          { size: [0.03, 0.03, 0.02], at: [x + 0.02, 0.3, 0.262], color: 0xffffff },
        ]),
        { size: [0.16, 0.04, 0.02], at: [0, 0.11, 0.245], color: 0x3c6b30 },
        { size: [0.04, 0.04, 0.02], at: [-0.09, 0.13, 0.245], color: 0x3c6b30 },
        { size: [0.04, 0.04, 0.02], at: [0.09, 0.13, 0.245], color: 0x3c6b30 },
        { size: [0.07, 0.04, 0.02], at: [-0.17, 0.17, 0.243], color: 0xf2a7a7 },
        { size: [0.07, 0.04, 0.02], at: [0.17, 0.17, 0.243], color: 0xf2a7a7 },
      ],
    },
    legs: {
      hips: [
        [-0.13, 0.75, 0],
        [0.13, 0.75, 0],
      ],
      boxes: leg(0.24, 0.75, 0x6c5ba8),
      height: 0.75,
    },
    shadow: 0.45,
  },
  sheep: {
    body: [
      { size: [0.8, 0.6, 1.0], at: [0, 0.75, 0], color: 0xf4f1ea },
      { size: [0.2, 0.2, 0.15], at: [0, 0.85, -0.55], color: 0xf4f1ea },
    ],
    head: {
      pivot: [0, 0.95, 0.45],
      boxes: [{ size: [0.4, 0.4, 0.38], at: [0, 0, 0.2], color: 0x4a3f38 }, { size: [0.46, 0.14, 0.3], at: [0, 0.22, 0.12], color: 0xf4f1ea }, ...eyes(0.11, 0.05, 0.395)],
    },
    legs: { hips: quad(0.22, 0.45, 0.3), boxes: leg(0.16, 0.45, 0x4a3f38), height: 0.45 },
    shadow: 0.6,
  },
  cow: {
    body: [
      { size: [0.9, 0.65, 1.2], at: [0, 0.875, 0], color: 0xf5f5f0 },
      { size: [0.92, 0.3, 0.35], at: [0, 0.95, 0.15], color: 0x2b2b2b },
      { size: [0.92, 0.25, 0.3], at: [0, 0.78, -0.35], color: 0x2b2b2b },
      { size: [0.3, 0.12, 0.25], at: [0, 0.5, -0.15], color: 0xf2a7a7 },
    ],
    head: {
      pivot: [0, 1.05, 0.55],
      boxes: [
        { size: [0.5, 0.45, 0.42], at: [0, 0, 0.22], color: 0xf5f5f0 },
        { size: [0.4, 0.2, 0.1], at: [0, -0.12, 0.47], color: 0xf2a7a7 },
        { size: [0.08, 0.16, 0.08], at: [-0.2, 0.3, 0.12], color: 0xe8dcc0 },
        { size: [0.08, 0.16, 0.08], at: [0.2, 0.3, 0.12], color: 0xe8dcc0 },
        ...eyes(0.14, 0.08, 0.435),
      ],
    },
    legs: { hips: quad(0.25, 0.55, 0.4), boxes: leg(0.18, 0.55, 0xf5f5f0), height: 0.55 },
    shadow: 0.7,
  },
  goat: {
    body: [{ size: [0.6, 0.5, 0.9], at: [0, 0.7, 0], color: 0xd9c7a5 }],
    head: {
      pivot: [0, 0.9, 0.4],
      boxes: [
        { size: [0.34, 0.36, 0.4], at: [0, 0, 0.2], color: 0xe6d8bc },
        { size: [0.07, 0.25, 0.07], at: [-0.1, 0.28, 0.05], color: 0x6b6259 },
        { size: [0.07, 0.25, 0.07], at: [0.1, 0.28, 0.05], color: 0x6b6259 },
        { size: [0.1, 0.16, 0.06], at: [0, -0.24, 0.34], color: 0xbfae8c },
        ...eyes(0.1, 0.06, 0.405),
      ],
    },
    legs: { hips: quad(0.17, 0.45, 0.3), boxes: leg(0.13, 0.45, 0xbfae8c), height: 0.45 },
    shadow: 0.5,
  },
  hen: {
    body: [
      { size: [0.4, 0.35, 0.5], at: [0, 0.425, 0], color: 0xfafafa },
      { size: [0.3, 0.25, 0.12], at: [0, 0.55, -0.28], color: 0xfafafa },
    ],
    head: {
      pivot: [0, 0.55, 0.2],
      boxes: [
        { size: [0.25, 0.28, 0.25], at: [0, 0.12, 0.08], color: 0xfafafa },
        { size: [0.1, 0.08, 0.1], at: [0, 0.1, 0.25], color: ORANGE },
        { size: [0.06, 0.1, 0.16], at: [0, 0.3, 0.06], color: 0xe03030 },
        ...eyes(0.08, 0.17, 0.205, 0.05),
      ],
    },
    legs: {
      hips: [
        [-0.08, 0.25, 0],
        [0.08, 0.25, 0],
      ],
      boxes: leg(0.06, 0.25, ORANGE),
      height: 0.25,
    },
    shadow: 0.35,
  },
  chick: {
    body: [{ size: [0.26, 0.24, 0.28], at: [0, 0.22, 0], color: 0xffe14d }],
    head: {
      pivot: [0, 0.3, 0.1],
      boxes: [{ size: [0.2, 0.2, 0.2], at: [0, 0.08, 0.04], color: 0xffe14d }, { size: [0.06, 0.05, 0.06], at: [0, 0.07, 0.16], color: ORANGE }, ...eyes(0.05, 0.12, 0.14, 0.04)],
    },
    legs: {
      hips: [
        [-0.05, 0.1, 0],
        [0.05, 0.1, 0],
      ],
      boxes: leg(0.04, 0.1, ORANGE),
      height: 0.1,
    },
    shadow: 0.2,
  },
  duck: {
    body: [
      { size: [0.4, 0.3, 0.55], at: [0, 0.33, 0], color: 0xf7f7f2 },
      { size: [0.25, 0.15, 0.12], at: [0, 0.45, -0.3], color: 0xf7f7f2 },
    ],
    head: {
      pivot: [0, 0.45, 0.22],
      boxes: [{ size: [0.24, 0.26, 0.24], at: [0, 0.1, 0.06], color: 0x2f8f46 }, { size: [0.14, 0.06, 0.16], at: [0, 0.05, 0.24], color: ORANGE }, ...eyes(0.08, 0.14, 0.185, 0.05)],
    },
    legs: {
      hips: [
        [-0.08, 0.18, 0],
        [0.08, 0.18, 0],
      ],
      boxes: leg(0.06, 0.18, ORANGE),
      height: 0.18,
    },
    shadow: 0.35,
  },
};

/** Une cajas en una geometría con color por vértice: una parte = una draw call para toda la especie. */
function boxesGeometry(boxes: Box[]): THREE.BufferGeometry {
  const color = new THREE.Color();
  const parts = boxes.map((b) => {
    const g = new THREE.BoxGeometry(...b.size);
    g.translate(...b.at);
    color.setHex(b.color);
    const n = g.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** Malla instanciada que crece al doble cuando hacen falta más instancias. */
class Instances {
  mesh: THREE.InstancedMesh;
  used = 0;

  constructor(
    private readonly group: THREE.Group,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    capacity: number,
    private readonly colored = false,
  ) {
    this.mesh = this.create(capacity);
  }

  private create(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    // Las instancias se reparten por todo el mapa: el recorte por distancia se hace a mano.
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  begin(): void {
    this.used = 0;
  }

  push(matrix: THREE.Matrix4, color?: THREE.Color): void {
    if (this.used === this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.create(old.instanceMatrix.count * 2);
      const copy = new THREE.Matrix4();
      const copyColor = new THREE.Color();
      for (let i = 0; i < this.used; i++) {
        old.getMatrixAt(i, copy);
        this.mesh.setMatrixAt(i, copy);
        if (this.colored) {
          old.getColorAt(i, copyColor);
          this.mesh.setColorAt(i, copyColor);
        }
      }
      this.group.remove(old);
      old.dispose();
    }
    this.mesh.setMatrixAt(this.used, matrix);
    if (color) this.mesh.setColorAt(this.used, color);
    this.used++;
  }

  end(): void {
    this.mesh.count = this.used;
    this.mesh.visible = this.used > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.group.remove(this.mesh);
    this.mesh.dispose();
  }
}

const scratch = new THREE.Matrix4();

/** Estado visual de cada animal: posición suavizada y fase de las animaciones. */
type Shown = { species: RenderKind; pos: THREE.Vector3; yaw: number; phase: number; swing: number; headPitch: number; lower: number; seenAt: number };

/** `cloud`: nube blanca con estrellas (animales). `sparkle`: destellos de colores que suben (zombis). */
export type PoofStyle = "cloud" | "sparkle";
type Poof = { origin: THREE.Vector3; startedAt: number; style: PoofStyle };
const POOF_PARTICLES = 10;
const POOF_SECONDS = 0.6;
const SPARKLE_SECONDS = 0.9;
const MAX_POOFS = 24;
const POOF_COLORS = [new THREE.Color(0xffffff), new THREE.Color(0xffd23f)];
const SPARKLE_COLORS = [new THREE.Color(0xffe066), new THREE.Color(0x8ee8ff), new THREE.Color(0xffb3e6), new THREE.Color(0xffffff)];

/**
 * Dibuja los animales con una malla instanciada por especie y parte (cuerpo, cabeza y patas), una
 * sombra plana y las nubes "poof". Las animaciones son procedurales (ADR-0010) y los cambios de
 * posición de la simulación (20 Hz) se suavizan como con el personaje.
 */
export class EntityRenderer {
  readonly group = new THREE.Group();
  private readonly parts: Record<RenderKind, { body: Instances; head: Instances; legs: Instances }>;
  private readonly shadows: Instances;
  private readonly poofMesh: Instances;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly shown = new Map<string, Shown>();
  private poofs: Poof[] = [];
  private time = 0;
  private frame = 0;
  private lastStats: EntityRenderStats = { drawCalls: 0, drawn: 0, poofs: 0 };

  constructor() {
    this.group.name = "entities";
    const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.materials.push(lambert);
    const parts = {} as Record<RenderKind, { body: Instances; head: Instances; legs: Instances }>;
    for (const id of RENDER_KINDS) {
      const m = MODELS[id];
      const geos = [boxesGeometry(m.body), boxesGeometry(m.head.boxes), boxesGeometry(m.legs.boxes)];
      this.geometries.push(...geos);
      parts[id] = {
        body: new Instances(this.group, geos[0], lambert, 16),
        head: new Instances(this.group, geos[1], lambert, 16),
        legs: new Instances(this.group, geos[2], lambert, 16 * m.legs.hips.length),
      };
    }
    this.parts = parts;

    const shadowGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const poofGeo = new THREE.BoxGeometry(1, 1, 1);
    const poofMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.geometries.push(shadowGeo, poofGeo);
    this.materials.push(shadowMat, poofMat);
    this.shadows = new Instances(this.group, shadowGeo, shadowMat, 64);
    this.poofMesh = new Instances(this.group, poofGeo, poofMat, POOF_PARTICLES * 4, true);
  }

  get stats(): EntityRenderStats {
    return this.lastStats;
  }

  /** Mundo nuevo: se olvida lo que se mostraba, sin "poof". */
  clear(): void {
    this.shown.clear();
    this.poofs = [];
  }

  /** Nube "poof" con estrellas en `pos` (desaparición de una criatura). */
  poof(pos: Vec3, style: PoofStyle = "cloud"): void {
    if (this.poofs.length >= MAX_POOFS) this.poofs.shift();
    this.poofs.push({ origin: new THREE.Vector3(pos.x, pos.y + (style === "sparkle" ? 0.9 : 0.4), pos.z), startedAt: this.time, style });
  }

  update(dtSeconds: number, views: Iterable<EntityView>, camera: THREE.Vector3): void {
    this.time += dtSeconds;
    this.frame++;
    for (const id of RENDER_KINDS) {
      const p = this.parts[id];
      p.body.begin();
      p.head.begin();
      p.legs.begin();
    }
    this.shadows.begin();

    let drawn = 0;
    const smooth = 1 - Math.exp(-dtSeconds * 15);
    for (const v of views) {
      if (!isRenderKind(v.species)) continue;
      const shown = this.track({ ...v, species: v.species }, dtSeconds, smooth);
      if (shown.pos.distanceTo(camera) > ENTITY_DRAW_DISTANCE) continue;
      if (v.blink && Math.floor(this.time * 10) % 2 === 1) continue;
      this.draw(shown, v.anim);
      drawn++;
    }
    // Lo que dejó de existir hace "poof" (si estaba cerca: lo lejano ni se veía).
    for (const [id, s] of this.shown) {
      if (s.seenAt === this.frame) continue;
      if (s.pos.distanceTo(camera) <= ENTITY_DRAW_DISTANCE) this.poof(s.pos, s.species === "zombie" ? "sparkle" : "cloud");
      this.shown.delete(id);
    }
    this.drawPoofs();

    const all = [...RENDER_KINDS.flatMap((id) => [this.parts[id].body, this.parts[id].head, this.parts[id].legs]), this.shadows, this.poofMesh];
    for (const inst of all) inst.end();
    // Una draw call por malla visible (un solo material por malla).
    const drawCalls = all.filter((inst) => inst.mesh.visible).length;
    this.lastStats = { drawCalls, drawn, poofs: this.poofs.length };
  }

  private track(v: EntityView & { species: RenderKind }, dt: number, smooth: number): Shown {
    let s = this.shown.get(v.id);
    const target = new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z);
    if (!s || s.species !== v.species) {
      s = { species: v.species, pos: target, yaw: v.yaw, phase: 0, swing: 0, headPitch: 0, lower: 0, seenAt: this.frame };
      this.shown.set(v.id, s);
    } else if (s.pos.distanceTo(target) > 4) {
      s.pos.copy(target);
    } else {
      s.pos.lerp(target, smooth);
    }
    let dy = v.yaw - s.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    s.yaw += dy * (1 - Math.exp(-dt * 10));
    s.seenAt = this.frame;

    const legH = MODELS[s.species].legs.height;
    const bird = MODELS[s.species].legs.hips.length === 2;
    const toward = (from: number, to: number, rate: number) => from + (to - from) * (1 - Math.exp(-dt * rate));
    const swingTarget = v.anim === "walk" ? 0.6 : v.anim === "run" ? 0.9 : 0;
    s.swing = toward(s.swing, swingTarget, 10);
    if (v.anim === "walk" || v.anim === "run") s.phase += dt * (v.anim === "run" ? 14 : 8);
    const peck = bird ? 0.5 + 0.5 * Math.max(0, Math.sin(this.time * 9)) : 1;
    const pitchTarget = v.anim === "graze" ? peck : v.anim === "rest" ? 0.25 : v.anim === "idle" ? Math.sin(this.time * 0.8 + s.phase) * 0.12 : 0;
    s.headPitch = toward(s.headPitch, pitchTarget, 8);
    s.lower = toward(s.lower, v.anim === "rest" ? legH * 0.7 : 0, 4);
    return s;
  }

  private draw(s: Shown, anim: EntityAnim): void {
    const m = MODELS[s.species];
    const parts = this.parts[s.species];
    const bounce = anim === "walk" || anim === "run" ? Math.abs(Math.cos(s.phase)) * (anim === "run" ? 0.06 : 0.03) : 0;
    const bob = anim === "swim" ? Math.sin(this.time * 2 + s.phase) * 0.03 : 0;
    const root = new THREE.Matrix4().compose(
      new THREE.Vector3(s.pos.x, s.pos.y + bounce + bob - s.lower, s.pos.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw),
      new THREE.Vector3(1, 1, 1),
    );
    parts.body.push(root);

    const local = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    local.makeTranslation(...m.head.pivot).multiply(rot.makeRotationX(s.headPitch));
    parts.head.push(scratch.multiplyMatrices(root, local));

    // Patas en pares diagonales; nadando o echado se recogen.
    const fold = anim === "swim" ? 0 : 1 - s.lower / m.legs.height;
    m.legs.hips.forEach((hip, i) => {
      const angle = Math.sin(s.phase + (i % 2 === 0 ? 0 : Math.PI)) * s.swing;
      local.makeTranslation(...hip).multiply(rot.makeRotationX(angle)).multiply(new THREE.Matrix4().makeScale(1, Math.max(0.05, fold), 1));
      parts.legs.push(scratch.multiplyMatrices(root, local));
    });

    const r = m.shadow;
    local.compose(new THREE.Vector3(s.pos.x, s.pos.y + 0.02, s.pos.z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
    this.shadows.push(local);
  }

  private drawPoofs(): void {
    this.poofs = this.poofs.filter((p) => this.time - p.startedAt < (p.style === "sparkle" ? SPARKLE_SECONDS : POOF_SECONDS));
    this.poofMesh.begin();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const p of this.poofs) {
      if (p.style === "sparkle") {
        this.drawSparkle(p, m, q);
        continue;
      }
      const t = (this.time - p.startedAt) / POOF_SECONDS;
      const spread = 1 - (1 - t) * (1 - t);
      for (let i = 0; i < POOF_PARTICLES; i++) {
        // Reparto en espiral (ángulo áureo): la nube se ve igual cada vez, sin azar.
        const a = i * 2.39996;
        const up = (i / POOF_PARTICLES) * 1.2 - 0.3;
        const pos = new THREE.Vector3(p.origin.x + Math.cos(a) * spread, p.origin.y + up * spread, p.origin.z + Math.sin(a) * spread);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + t * 6);
        const size = 0.22 * (1 - t) + 0.02;
        m.compose(pos, q, new THREE.Vector3(size, size, size));
        this.poofMesh.push(m, POOF_COLORS[i % 2]);
      }
    }
  }

  /** Destellos: una espiral de colores que sube girando y titila al apagarse. */
  private drawSparkle(p: Poof, m: THREE.Matrix4, q: THREE.Quaternion): void {
    const t = (this.time - p.startedAt) / SPARKLE_SECONDS;
    const n = POOF_PARTICLES + 4;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + t * 4;
      const r = 0.25 + 0.6 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
      const pos = new THREE.Vector3(p.origin.x + Math.cos(a) * r, p.origin.y + (i / n - 0.5) * 1.4 + t * 0.9, p.origin.z + Math.sin(a) * r);
      q.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), a * 2);
      const twinkle = 0.75 + 0.25 * Math.sin(this.time * 30 + i);
      const size = (0.16 * (1 - t) + 0.02) * twinkle;
      m.compose(pos, q, new THREE.Vector3(size, size, size));
      this.poofMesh.push(m, SPARKLE_COLORS[i % SPARKLE_COLORS.length]);
    }
  }

  dispose(): void {
    for (const id of RENDER_KINDS) for (const inst of Object.values(this.parts[id])) inst.dispose();
    this.shadows.dispose();
    this.poofMesh.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
