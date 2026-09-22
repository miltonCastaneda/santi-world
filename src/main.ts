import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GameInput } from "./input";
import { WorldMesh } from "./mesh";
import { setupUi } from "./ui";
import { World, WORLD_SIZE } from "./world";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("No se encontró el lienzo");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 90);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(20, 14, 20);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.minDistance = 8;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI / 2.05;
controls.update();

const hemi = new THREE.HemisphereLight(0xfff4d6, 0x4a7c3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE + 8, WORLD_SIZE + 8),
  new THREE.MeshLambertMaterial({ color: 0x6db36d }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.51;
ground.receiveShadow = true;
scene.add(ground);

const world = World.loadOrCreate();
const worldMesh = new WorldMesh();
scene.add(worldMesh.group);
worldMesh.rebuild(world);

const refresh = () => worldMesh.rebuild(world);

const input = new GameInput(camera, canvas, world, worldMesh.group, refresh);
input.attachControls(controls);
setupUi(input, world, refresh);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function tick(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
