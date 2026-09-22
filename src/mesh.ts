import * as THREE from "three";
import { BLOCKS, BLOCK_IDS, type BlockId } from "./blocks";
import { WORLD_SIZE, type World } from "./world";

const geometry = new THREE.BoxGeometry(1, 1, 1);

export const WORLD_OFFSET = WORLD_SIZE / 2 - 0.5;

export function voxelToWorld(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x - WORLD_OFFSET, y, z - WORLD_OFFSET);
}

export function worldToVoxel(point: THREE.Vector3): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: Math.round(point.x + WORLD_OFFSET),
    y: Math.round(point.y),
    z: Math.round(point.z + WORLD_OFFSET),
  };
}

export class WorldMesh {
  readonly group = new THREE.Group();
  private meshes = new Map<BlockId, THREE.InstancedMesh>();

  rebuild(world: World): void {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
      mesh.dispose();
    }
    this.meshes.clear();

    const byType = new Map<BlockId, THREE.Vector3[]>();
    for (const id of BLOCK_IDS) byType.set(id, []);

    for (const [k, id] of world.blocks) {
      const [x, y, z] = k.split(",").map(Number);
      byType.get(id)?.push(voxelToWorld(x, y, z));
    }

    const dummy = new THREE.Object3D();
    for (const id of BLOCK_IDS) {
      const positions = byType.get(id) ?? [];
      if (positions.length === 0) continue;
      const material = new THREE.MeshLambertMaterial({
        color: BLOCKS[id].color,
        transparent: id === "water",
        opacity: id === "water" ? 0.82 : 1,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.blockId = id;
      positions.forEach((pos, i) => {
        dummy.position.copy(pos);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.set(id, mesh);
      this.group.add(mesh);
    }
  }
}
