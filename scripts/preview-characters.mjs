/**
 * Export the actual procedural Three.js character in representative poses.
 * No browser, mock model, remote assets, or WebGL context is involved.
 *
 * Run: node scripts/preview-characters.mjs [artifacts/character-preview.json]
 * Then: blender -b -t 4 --python scripts/render-characters.py -- <json> <png>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter, resetCharacterPose } from '../src/character-motion.js';

const output = path.resolve(process.argv[2] || 'artifacts/character-preview.json');
const factory = createCharacterFactory();
const poses = [
  // These four orthographic views are exactly horizontal, so head and limb
  // proportions can be compared without perspective or an elevated camera.
  { label: 'FRONT / WHITE BODY', camera: [0, -6, 1.03], hair: 5, flat: true },
  { label: 'BACK / WHITE BODY', camera: [0, 6, 1.03], hair: 5, flat: true },
  { label: 'PROFILE / WHITE BODY', camera: [6, 0, 1.03], hair: 5, flat: true },
  { label: 'WALK / SIDE VIEW', camera: [6, 0, 1.03], hair: 5, walk: 160, flat: true },
  { label: 'THREE-QUARTER / SOFT 3D', camera: [4.4, -6, 1.45], hair: 5 },
  { label: 'PUSH / SOFT ARMS', camera: [4.8, -5, 1.4], hair: 5, push: true },
  { label: 'RECRUITER / SEATED POSE', camera: [3.4, -6, 1.4], hair: 5, sitting: true, tie: true },
  { label: 'FRESH LOOK / OPTIONAL HAIR', camera: [3.4, -6, 1.4], hair: 1 },
];

function snapshot(root) {
  root.updateMatrixWorld(true);
  root.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
  const meshes = [], bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  root.traverse(node => {
    if (!node.isMesh) return;
    for (let ancestor = node; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    // Preserve the actual skinned inverted-hull outline. The offline renderer
    // uses transparent front faces and black backfaces to match THREE.BackSide.
    const outline = materials.every(material => material.side === THREE.BackSide);
    const geometry = node.geometry;
    if (!geometry?.attributes.position) return;
    const vertices = [];
    for (let index = 0; index < geometry.attributes.position.count; index++) {
      node.getVertexPosition(index, vertex);
      vertex.applyMatrix4(node.matrixWorld);
      bounds.expandByPoint(vertex);
      vertices.push([vertex.x, -vertex.z, vertex.y].map(value => +value.toFixed(6)));
    }
    const indices = geometry.index?.array || Array.from({ length: vertices.length }, (_, index) => index);
    const faces = [], materialIndices = [];
    for (let index = 0; index < indices.length; index += 3) {
      const group = geometry.groups.find(entry => index >= entry.start && index < entry.start + entry.count);
      const materialIndex = group?.materialIndex || 0;
      faces.push([indices[index], indices[index + 1], indices[index + 2]]);
      materialIndices.push(materialIndex);
    }
    meshes.push({
      name: node.name || `mesh-${meshes.length}`,
      vertices, faces, materialIndices, outline,
      colors: materials.map(material => `#${(material.color || new THREE.Color('white')).getHexString()}`),
      opacities: materials.map(material => material.transparent ? material.opacity : 1),
      smooth: !materials.some(material => material.flatShading),
    });
  });
  return { meshes, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}

const frames = [];
for (const pose of poses) {
  const root = factory.create({ hair: pose.hair, tie: !!pose.tie, sitting: !!pose.sitting });
  resetCharacterPose(root, { seated: !!pose.sitting });
  if (pose.walk) {
    animateCharacter(root, { dt: 1 / 60, time: 0 });
    for (let frame = 1; frame <= pose.walk; frame++) {
      root.position.z += 1.8 / 60;
      animateCharacter(root, { dt: 1 / 60, time: frame / 60, velocityZ: 1.8 });
    }
    // Keep the captured bone pose while centering the example on the floor.
    root.position.z = 0;
  } else {
    animateCharacter(root, { dt: 1 / 60, time: .3, seated: !!pose.sitting, strike: pose.push ? .5 : 0, pushing: !!pose.push });
  }
  frames.push({ ...pose, target: [0, 0, 1.03], orthoScale: 2.4, ...snapshot(root) });
}
const meshCounts = name => {
  const mesh = frames[0].meshes.find(entry => entry.name === name);
  return mesh ? { vertices: mesh.vertices.length, triangles: mesh.faces.length } : null;
};
const geometry = {
  body: meshCounts('continuous-white-body'),
  outline: meshCounts('continuous-body-outline'),
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({
  note: 'Actual Three.js deformed body and inverted-hull outline vertices. Offline geometry inspection; browser interaction is not verified.',
  geometry, frames,
}));
factory.dispose();
console.log(JSON.stringify({ output, geometry, poses: frames.map(({ label, meshes, bounds }) => ({
  label, meshes: meshes.length,
  vertices: meshes.reduce((sum, mesh) => sum + mesh.vertices.length, 0),
  triangles: meshes.reduce((sum, mesh) => sum + mesh.faces.length, 0), bounds,
})) }, null, 2));
