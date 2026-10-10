import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CHUNK_SIZE } from "../domain/world/chunk";
import type { ChunkStore } from "../domain/world/chunkStore";
import { createBlockMaterials, type BlockMaterials } from "./blockMaterial";
import { ChunkRenderer } from "./chunkRenderer";
import { Sky } from "./sky";

export type RenderAppOptions = { viewRadius?: number; workers?: number };

/**
 * Escena, cámara y renderer del juego. La cámara orbital es provisional hasta el incremento 5.
 * Sin sombras dinámicas: la profundidad la dan la oclusión ambiental y la luz por vértice.
 */
export class RenderApp {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly materials: BlockMaterials;
  readonly chunks: ChunkRenderer;
  readonly sky: Sky;
  private worldSize: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    store: ChunkStore,
    seed: string,
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

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(focus.x, focus.y, focus.z);
    this.controls.enableDamping = true;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 80;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.update();

    // Para entidades futuras (MeshLambert); el terreno usa luz por vértice.
    this.scene.add(new THREE.HemisphereLight(0xfff4d6, 0x4a7c3a, 1.2));

    this.materials = createBlockMaterials();
    this.sky = new Sky(this.scene, this.materials, viewDistance);
    this.chunks = new ChunkRenderer(store, seed, this.materials, { viewRadius, workers: options.workers ?? 1 });
    this.scene.add(this.chunks.group);

    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Coloca la cámara (para pruebas visuales y la ruta de rendimiento). */
  setView(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): void {
    this.camera.position.set(position.x, position.y, position.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.update();
  }

  render(): void {
    this.controls.update();
    const t = this.controls.target;
    const clampedX = Math.max(0, Math.min(this.worldSize, t.x));
    const clampedZ = Math.max(0, Math.min(this.worldSize, t.z));
    if (clampedX !== t.x || clampedZ !== t.z) {
      const dx = clampedX - t.x;
      const dz = clampedZ - t.z;
      t.set(clampedX, t.y, clampedZ);
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    this.chunks.setFocus(t.x, t.z);
    this.chunks.update();
    this.renderer.render(this.scene, this.camera);
  }
}
