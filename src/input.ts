import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BlockId } from "./blocks";
import { worldToVoxel } from "./mesh";
import { World } from "./world";

export type InteractionMode = "place" | "remove";

const DRAG_THRESHOLD = 8;

export class GameInput {
  mode: InteractionMode = "place";
  selected: BlockId = "grass";
  private pointerDown = new THREE.Vector2();
  private dragging = false;

  constructor(
    private camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    private world: World,
    private meshes: THREE.Object3D,
    private onChange: () => void,
  ) {
    const raycaster = new THREE.Raycaster();

    canvas.addEventListener("pointerdown", (event) => {
      this.pointerDown.set(event.clientX, event.clientY);
      this.dragging = false;
    });

    canvas.addEventListener("pointermove", (event) => {
      if (event.buttons === 0) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.dragging = true;
    });

    canvas.addEventListener("pointerup", (event) => {
      if (this.dragging) return;

      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, this.camera);
      const hits = raycaster.intersectObject(this.meshes, true);
      if (hits.length === 0) return;

      const hit = hits[0];
      const occupied = this.occupiedFromHit(hit);
      if (!occupied) return;

      const remove = event.button === 2 || this.mode === "remove";
      if (remove) {
        if (this.world.remove(occupied.x, occupied.y, occupied.z)) this.onChange();
        return;
      }

      const normal = hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
      const placed = this.world.place(
        occupied.x + Math.round(normal.x),
        occupied.y + Math.round(normal.y),
        occupied.z + Math.round(normal.z),
        this.selected,
      );
      if (placed) this.onChange();
    });

    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  attachControls(controls: OrbitControls): void {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }

  private occupiedFromHit(hit: THREE.Intersection): {
    x: number;
    y: number;
    z: number;
  } | null {
    const mesh = hit.object as THREE.InstancedMesh;
    if (hit.instanceId === undefined) return null;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(hit.instanceId, matrix);
    const pos = new THREE.Vector3().setFromMatrixPosition(matrix);
    return worldToVoxel(pos);
  }
}
