/** Export actual character shoulder/arm geometry for close before/after review.
 * node scripts/preview-shoulders.mjs <output.json> [character-source.js]
 * The optional source snapshot is imported with the same installed Three.js.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { animateCharacter, resetCharacterPose } from '../src/character-motion.js';

const output = path.resolve(process.argv[2] || 'artifacts/shoulder-preview.json');
const source = path.resolve(process.argv[3] || 'src/character.js');
const characterSource = (await fs.readFile(source, 'utf8'))
  .replace("from 'three'", `from ${JSON.stringify(import.meta.resolve('three'))}`);
const { createCharacterFactory } = await import(`data:text/javascript;base64,${Buffer.from(characterSource).toString('base64')}`);
const factory = createCharacterFactory();
const poses = [
  { key: 'front', label: 'FRONT / SHOULDER JOINS', camera: [0, -6, 1.24], flat: true },
  { key: 'back', label: 'BACK / SHOULDER JOINS', camera: [0, 6, 1.24], flat: true },
  { key: 'profile', label: 'PROFILE / SHOULDER JOIN', camera: [6, 0, 1.24], flat: true },
  { key: 'quarter', label: 'THREE-QUARTER / NEUTRAL', camera: [4.4, -6, 1.55] },
  { key: 'walk', label: 'WALK / ARM SWING', camera: [4.4, -6, 1.55], walk: 160 },
  { key: 'raise', label: 'RAISED / PRE-PUSH', camera: [4.4, -6, 1.55], strike: .24, pushing: true },
  { key: 'push', label: 'PUSH / ARM EXTENSION', camera: [4.4, -6, 1.55], strike: .5, pushing: true },
  { key: 'seated', label: 'SEATED / BENT ARMS', camera: [4.4, -6, 1.5], seated: true },
  { key: 'whole', label: 'WHOLE FIGURE / CONTEXT', camera: [4.4, -6, 1.45], whole: true },
];

function snapshot(root) {
  root.updateMatrixWorld(true);
  root.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
  const meshes = [], vertex = new THREE.Vector3();
  root.traverse(node => {
    if (!node.isMesh) return;
    for (let ancestor = node; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const geometry = node.geometry;
    if (!geometry?.attributes.position) return;
    const vertices = [];
    for (let index = 0; index < geometry.attributes.position.count; index++) {
      node.getVertexPosition(index, vertex);
      vertex.applyMatrix4(node.matrixWorld);
      vertices.push([vertex.x, -vertex.z, vertex.y].map(value => +value.toFixed(6)));
    }
    const indices = geometry.index?.array || Array.from({ length: vertices.length }, (_, index) => index);
    const faces = [], materialIndices = [];
    for (let index = 0; index < indices.length; index += 3) {
      const group = geometry.groups.find(entry => index >= entry.start && index < entry.start + entry.count);
      faces.push([indices[index], indices[index + 1], indices[index + 2]]);
      materialIndices.push(group?.materialIndex || 0);
    }
    meshes.push({
      name: node.name || `mesh-${meshes.length}`, vertices, faces, materialIndices,
      outline: materials.every(material => material.side === THREE.BackSide),
      colors: materials.map(material => `#${(material.color || new THREE.Color('white')).getHexString()}`),
      opacities: materials.map(material => material.transparent ? material.opacity : 1),
      smooth: !materials.some(material => material.flatShading),
    });
  });
  return meshes;
}

const frames = [];
for (const pose of poses) {
  const root = factory.create({ hair: 5, sitting: !!pose.seated });
  resetCharacterPose(root, { seated: !!pose.seated });
  if (pose.walk) {
    animateCharacter(root, { dt: 1 / 60, time: 0 });
    for (let frame = 1; frame <= pose.walk; frame++) {
      root.position.z += 1.8 / 60;
      animateCharacter(root, { dt: 1 / 60, time: frame / 60, velocityZ: 1.8 });
    }
    root.position.z = 0;
  } else {
    animateCharacter(root, { dt: 1 / 60, time: .3, seated: !!pose.seated, strike: pose.strike || 0, pushing: !!pose.pushing });
  }
  const target = pose.whole ? [0, 0, 1.03] : [0, 0, pose.seated ? 1.08 : 1.22];
  frames.push({ ...pose, target, orthoScale: pose.whole ? 2.4 : 1.43, meshes: snapshot(root) });
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({
  note: 'Actual skinned runtime geometry including its black inverted-hull outline. Offline inspection; no browser claim.',
  source: path.basename(source), frames,
}));
factory.dispose();
console.log(JSON.stringify({ output, source, frames: frames.map(({ key, meshes }) => ({ key, meshes: meshes.length })) }));
