/**
 * Export the actual office coordinator's scene for an offline geometry study.
 * Only the renderer, DOM and animation clock are supplied at the CPU boundary.
 * This does not launch, imitate or verify a browser, WebGL or user interaction.
 *
 * node scripts/preview-office.mjs [output.json]
 * blender -b -t 4 --python scripts/render-characters.py -- <json> <png>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { jobs } from '../src/application.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const threePath = fileURLToPath(new URL('../node_modules/three/build/three.module.js', import.meta.url));
const worldPath = fileURLToPath(new URL('../src/world.js', import.meta.url));
const bundled = await build({
  stdin: {
    contents: `import { createWorld } from ${JSON.stringify(worldPath)}; globalThis.fixture.createWorld = createWorld;`,
    resolveDir: project,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  plugins: [{ name: 'offline-office-scene-boundary', setup(plugin) {
    plugin.onResolve({ filter: /^three$/ }, () => ({ path: 'cpu-renderer', namespace: 'offline' }));
    plugin.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({
      loader: 'js', resolveDir: project,
      contents: `export * from ${JSON.stringify(threePath)};
        export class WebGLRenderer {
          constructor() { this.domElement = globalThis.fixture.node('canvas'); this.shadowMap = {}; }
          setPixelRatio() {} setClearColor() {} setSize() {} dispose() {}
          render(scene, camera) { globalThis.fixture.scene = scene; globalThis.fixture.camera = camera; }
        }`,
    }));
  } }],
});

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback); this.listeners.set(name, callbacks);
  }
  removeEventListener(name, callback) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== callback));
  }
}
const document = Object.assign(new EventTarget(), { hidden: false });
function node(tag = 'div') {
  return Object.assign(new EventTarget(), {
    tag, tagName: tag.toUpperCase(), style: {}, hidden: false, children: [],
    clientWidth: 1600, clientHeight: 1000, ownerDocument: document,
    append(...nodes) { this.children.push(...nodes); },
    remove() {}, setAttribute() {}, setPointerCapture() {},
    focus() { document.activeElement = this; }, closest() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }),
  });
}
document.createElement = node;
const window = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
const fixture = { node, scene: null };
let clock = 0, scheduled = null, nextFrame = 0;
class ClockDate extends Date { static now() { return 1_800_000_000_000 + clock; } }
vm.runInNewContext(bundled.outputFiles[0].text, {
  fixture, window, document, console, Date: ClockDate, AbortController,
  performance: { now: () => clock },
  requestAnimationFrame: callback => { scheduled = callback; return ++nextFrame; },
  cancelAnimationFrame: () => { scheduled = null; },
  setTimeout: () => 1, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
}, { filename: 'offline-office-scene.bundle.js' });
const world = fixture.createWorld({ container: node(), jobs });
for (let frame = 0; frame < 18; frame++) {
  clock = frame * 50;
  const callback = scheduled; scheduled = null;
  if (!callback) throw new Error('Actual world did not schedule an animation frame.');
  callback(clock);
}
const scene = fixture.scene;
if (!scene?.isScene) throw new Error('Actual world did not submit its scene.');
scene.updateMatrixWorld(true);
scene.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });

const vector = new THREE.Vector3(), instanceMatrix = new THREE.Matrix4();
const transform = new THREE.Matrix4(), instanceColor = new THREE.Color();
const meshes = [];
let instanceCount = 0, skinnedCount = 0;
scene.traverse(object => {
  if (!object.isMesh || !object.geometry?.attributes.position) return;
  for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
  const materialList = Array.isArray(object.material) ? object.material : [object.material];
  if (materialList.every(material => material.visible === false || material.opacity <= 0)) return;
  if (object.isSkinnedMesh) skinnedCount++;
  const attributes = object.geometry.attributes;
  const indices = object.geometry.index?.array || Array.from({ length: attributes.position.count }, (_, index) => index);
  const faces = [], materialIndices = [];
  for (let index = 0; index < indices.length; index += 3) {
    faces.push([indices[index], indices[index + 1], indices[index + 2]]);
    materialIndices.push(object.geometry.groups.find(group => index >= group.start && index < group.start + group.count)?.materialIndex || 0);
  }
  const copies = object.isInstancedMesh ? object.count : 1;
  for (let copy = 0; copy < copies; copy++) {
    transform.copy(object.matrixWorld);
    instanceColor.set('#ffffff');
    if (object.isInstancedMesh) {
      object.getMatrixAt(copy, instanceMatrix); transform.multiply(instanceMatrix);
      if (object.instanceColor) object.getColorAt(copy, instanceColor);
      instanceCount++;
    }
    const vertices = [];
    for (let index = 0; index < attributes.position.count; index++) {
      object.getVertexPosition(index, vector); vector.applyMatrix4(transform);
      vertices.push([vector.x, -vector.z, vector.y].map(value => +value.toFixed(6)));
    }
    const colors = materialList.map(material => `#${(material.color?.clone() || new THREE.Color('#ffffff')).multiply(instanceColor).getHexString()}`);
    const vertexColors = attributes.color && materialList.some(material => material.vertexColors)
      ? Array.from({ length: attributes.color.count }, (_, index) => [attributes.color.getX(index), attributes.color.getY(index), attributes.color.getZ(index)])
      : undefined;
    meshes.push({
      name: `${object.name || `office-part-${meshes.length}`}${object.isInstancedMesh ? `-${copy}` : ''}`,
      vertices, faces, materialIndices, colors, vertexColors,
      opacities: materialList.map(material => material.opacity ?? 1),
      outline: materialList.every(material => material.side === THREE.BackSide),
      smooth: !materialList.some(material => material.flatShading), castShadow: object.castShadow,
    });
  }
});

const frames = [
  { label: 'ACTUAL OFFICE / CONNECTED FLOOR PLAN', camera: [86, -100, 108], target: [0, 4, 0], orthoScale: 100, meshes },
  { label: 'ARRIVAL / WORKSTATIONS AND LOUNGE', camera: [17, -20, 22], target: [0, 2.5, .7], orthoScale: 30, meshes },
];
const output = path.resolve(process.argv[2] || path.join(project, 'artifacts/office-v48.json'));
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({
  note: 'Actual createWorld scene, nine job stations, recruiters, player and deterministic crowd. CPU scene export and offline Blender stills; materials use the inspection renderer, so live WebGL photometry and browser interaction remain unverified.',
  layout: {
    title: 'COMMON GROUND / LARGE OFFICE STUDY',
    subtitle: 'Actual runtime geometry and material colors. Offline still study; browser interaction and WebGL lighting unverified.',
    columns: 2, width: 800, height: 520, samples: 16,
  },
  frames,
}));
const jobStations = scene.children.filter(child => child.name.startsWith('job-lounge-')).length;
world.destroy();
console.log(JSON.stringify({ output, jobStations, instances: instanceCount, skinnedMeshes: skinnedCount, meshes: meshes.length, frames: frames.length, bytes: (await fs.stat(output)).size }, null, 2));
