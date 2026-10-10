import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Vec3 } from "../core/math";
import { CHUNK_SIZE } from "../domain/world/chunk";
import type { ChunkStore } from "../domain/world/chunkStore";
import type { WorldGenSpec } from "../domain/worldgen/generator";
import { createBlockMaterials, type BlockMaterials } from "./blockMaterial";
import { ChunkRenderer } from "./chunkRenderer";
import { EntityRenderer, type EntityView } from "./entityRenderer";
import { FollowCamera } from "./followCamera";
import { PlayerModel, type PlayerView } from "./playerModel";
import { ProjectileRenderer, type ArrowView } from "./projectileRenderer";
import { Sky, type SkyTime } from "./sky";

/** Cámara en tercera persona detrás del personaje (el juego). Sin esto, cámara orbital (visor de padres). */
export type FollowOptions = {
  player: () => PlayerView;
  isSolid: (x: number, y: number, z: number) => boolean;
  now: () => number;
};

export type RenderAppOptions = {
  viewRadius?: number;
  workers?: number;
  follow?: FollowOptions;
  entities?: () => Iterable<EntityView>;
  /** Flechas en vuelo (y, con ellas, las llamaradas del dragón). */
  arrows?: () => Iterable<ArrowView>;
};

const THUMB_W = 320;
const THUMB_H = 180;

/**
 * Escena, cámara y renderer. El juego usa la cámara en tercera persona con el personaje; el visor de
 * padres, la orbital. Sin sombras dinámicas: la profundidad la dan la oclusión ambiental y la luz por
 * vértice.
 */
export class RenderApp {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls | null = null;
  readonly follow: FollowCamera | null = null;
  readonly playerModel: PlayerModel | null = null;
  readonly materials: BlockMaterials;
  readonly chunks: ChunkRenderer;
  readonly entities: EntityRenderer | null = null;
  readonly projectiles: ProjectileRenderer | null = null;
  readonly sky: Sky;
  private worldSize: number;
  private readonly entityViews: (() => Iterable<EntityView>) | null;
  private readonly arrowViews: (() => Iterable<ArrowView>) | null;
  /** Vista fija (pruebas, ruta de rendimiento): la cámara no sigue al personaje hasta `followPlayer()`. */
  private fixed: { target: Vec3 } | null = null;
  private lastRender = 0;
  private readonly followOptions: FollowOptions | null;
  private skyTime: SkyTime = { isNight: false, progress: 0.35 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    store: ChunkStore,
    gen: WorldGenSpec,
    focus: { x: number; y: number; z: number },
    options: RenderAppOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    const viewRadius = options.viewRadius ?? 6;
    const viewDistance = viewRadius * CHUNK_SIZE;
    this.worldSize = store.sizeInBlocks;
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 250);
    this.camera.position.set(focus.x + 22, focus.y + 20, focus.z + 26);
    this.followOptions = options.follow ?? null;

    if (this.followOptions) {
      this.follow = new FollowCamera(this.camera, canvas, this.followOptions.isSolid, this.followOptions.now);
      this.playerModel = new PlayerModel();
      this.scene.add(this.playerModel.root);
    } else {
      const controls = new OrbitControls(this.camera, canvas);
      controls.target.set(focus.x, focus.y, focus.z);
      controls.enableDamping = true;
      controls.minDistance = 8;
      controls.maxDistance = 80;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.screenSpacePanning = false;
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.update();
      this.controls = controls;
    }

    // Para las entidades (MeshLambert); el terreno usa luz por vértice. Sigue la hora en Sky.
    const hemi = new THREE.HemisphereLight(0xfff4d6, 0x4a7c3a, 1.2);
    // Sol sin sombras: sin él, el blanco de las ovejas y las vacas se ve gris.
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(0.4, 1, 0.6);
    const moon = new THREE.DirectionalLight(0x9fb4ff, 0);
    moon.position.set(-0.4, 1, -0.3);
    this.scene.add(hemi, sun, moon);

    this.materials = createBlockMaterials();
    this.sky = new Sky(this.scene, this.materials, viewDistance);
    this.sky.attachLights({ hemi, sun, moon });
    this.chunks = new ChunkRenderer(store, gen, this.materials, { viewRadius, workers: options.workers ?? 1 });
    this.scene.add(this.chunks.group);

    this.entityViews = options.entities ?? null;
    if (this.entityViews) {
      this.entities = new EntityRenderer();
      this.scene.add(this.entities.group);
    }
    this.arrowViews = options.arrows ?? null;
    if (this.arrowViews) {
      this.projectiles = new ProjectileRenderer();
      this.scene.add(this.projectiles.group);
    }

    window.addEventListener("resize", this.onResize);
  }

  private readonly onResize = () => this.resize();

  /** Libera GPU y workers (el visor de padres se abre y se cierra varias veces). */
  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.controls?.dispose();
    this.follow?.dispose();
    this.playerModel?.dispose();
    this.entities?.dispose();
    this.projectiles?.dispose();
    this.sky.dispose();
    this.chunks.dispose();
    this.materials.dispose();
    this.renderer.dispose();
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Hora del mundo: luz del día (0 a 1) y dónde va el sol o la luna. */
  setTime(daylight: number, time: SkyTime): void {
    this.sky.setDaylight(daylight);
    this.skyTime = time;
  }

  /** Coloca la cámara en una vista fija (visor, pruebas visuales y ruta de rendimiento). */
  setView(position: Vec3, target: Vec3): void {
    this.camera.position.set(position.x, position.y, position.z);
    if (this.controls) {
      this.controls.target.set(target.x, target.y, target.z);
      this.controls.update();
      return;
    }
    this.fixed = { target: { ...target } };
    this.camera.lookAt(target.x, target.y, target.z);
  }

  /** Vuelve a la cámara detrás del personaje, colocada al instante. */
  followPlayer(): void {
    this.fixed = null;
    if (!this.follow || !this.followOptions) return;
    const p = this.followOptions.player();
    this.follow.snap(p.pos, p.yaw);
  }

  get isFollowing(): boolean {
    return this.follow !== null && this.fixed === null;
  }

  /** Vista inicial del visor de padres: desde arriba y en diagonal hacia el punto de aparición. */
  setSpawnView(spawn: Vec3): void {
    this.setView({ x: spawn.x + 22, y: spawn.y + 20, z: spawn.z + 26 }, spawn);
  }

  /** Rumbo horizontal de la cámara: el movimiento con WASD es relativo a él. */
  get headingYaw(): number {
    if (this.follow && !this.fixed) return this.follow.yaw;
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return Math.atan2(d.x, d.z);
  }

  cameraView(): { position: Vec3; target: Vec3 } {
    const { x, y, z } = this.camera.position;
    return { position: { x, y, z }, target: this.focusPoint() };
  }

  private focusPoint(): Vec3 {
    if (this.controls) {
      const t = this.controls.target;
      return { x: t.x, y: t.y, z: t.z };
    }
    if (this.fixed) return this.fixed.target;
    return this.follow!.focus;
  }

  /** Miniatura del mundo (WebP de 320x180, recortada al centro) tal como se ve ahora. */
  thumbnail(): Promise<Blob | null> {
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement("canvas");
    out.width = THUMB_W;
    out.height = THUMB_H;
    const ctx = out.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    const src = this.canvas;
    let sw = src.width;
    let sh = (src.width * THUMB_H) / THUMB_W;
    if (sh > src.height) {
      sh = src.height;
      sw = (sh * THUMB_W) / THUMB_H;
    }
    // Se copia en la misma tarea que el render: después el navegador puede limpiar el buffer de WebGL.
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, THUMB_W, THUMB_H);
    return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/webp", 0.8));
  }

  render(nowMs = performance.now()): void {
    const dt = this.lastRender === 0 ? 0 : Math.min(0.1, (nowMs - this.lastRender) / 1000);
    this.lastRender = nowMs;
    if (this.controls) this.updateOrbit();
    if (this.playerModel && this.followOptions) {
      const p = this.followOptions.player();
      this.playerModel.update(dt, p);
      if (this.follow && !this.fixed) this.follow.update(dt, this.playerModel.root.position, p.yaw, p.anim === "walk");
    }
    if (this.entities && this.entityViews) this.entities.update(dt, this.entityViews(), this.camera.position);
    if (this.projectiles && this.arrowViews) this.projectiles.update(dt, this.arrowViews());
    const f = this.focusPoint();
    this.chunks.setFocus(f.x, f.z);
    this.chunks.update();
    this.sky.update(this.camera, this.skyTime);
    this.renderer.render(this.scene, this.camera);
  }

  private updateOrbit(): void {
    const controls = this.controls!;
    controls.update();
    const t = controls.target;
    const clampedX = Math.max(0, Math.min(this.worldSize, t.x));
    const clampedZ = Math.max(0, Math.min(this.worldSize, t.z));
    if (clampedX !== t.x || clampedZ !== t.z) {
      const dx = clampedX - t.x;
      const dz = clampedZ - t.z;
      t.set(clampedX, t.y, clampedZ);
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
  }
}
