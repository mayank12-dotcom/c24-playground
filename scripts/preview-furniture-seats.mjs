/** Export actual furniture and skinned lounge occupants for offline fit review.
 * node scripts/preview-furniture-seats.mjs [output.json]
 * blender -b -t 4 --python scripts/render-characters.py -- <json> <png>
 * No browser, WebGL renderer, replacement model, or runtime asset is required.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter, resetCharacterPose } from '../src/character-motion.js';
import { createGardenSpace } from '../src/garden-space.js';
import { createCozySpace } from '../src/cozy-space.js';
import { createSocialSpace } from '../src/social-space.js';
import { createInfoRoom } from '../src/info-room.js';
import { GARDEN_PROPS } from '../src/garden-layout.js';
import { FURNITURE_SEATS } from '../src/furniture-seats.js';

const scene = new THREE.Scene(), resources = new Set();
const box = new THREE.BoxGeometry(1, 1, 1); resources.add(box);
const outline = new THREE.MeshBasicMaterial({ color: '#242724', side: THREE.BackSide }); resources.add(outline);
function shape(parent, geometry, material, position, scale, outlined = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  if (outlined) {
    const hull = new THREE.Mesh(geometry, outline);
    hull.scale.set(...scale.map(value => 1 + .014 / value)); mesh.add(hull);
  }
  return mesh;
}
const options = { scene, shape, box, allResources: resources };
const spaces = [createGardenSpace(options), createCozySpace(options), createSocialSpace(options), createInfoRoom(options)];
const factory = createCharacterFactory();
const v = new THREE.Vector3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();

function snapshot(root, center, rotation, propIndex = null) {
  root.updateMatrixWorld(true);
  root.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
  const meshes = [];
  const normalize = new THREE.Matrix4().makeRotationY(-rotation).multiply(new THREE.Matrix4().makeTranslation(-center.x, 0, -center.z));
  root.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes.position) return;
    for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const positions = node.geometry.attributes.position, indices = node.geometry.index?.array || Array.from({length:positions.count}, (_,i) => i);
    const copies = node.isInstancedMesh ? Array.from({length:node.count}, (_, i) => i).filter(i => node.userData.propIndices?.[i] === propIndex) : [null];
    for (const copy of copies) {
      transform.copy(node.matrixWorld);
      if (copy !== null) { node.getMatrixAt(copy, instance); transform.multiply(instance); }
      transform.premultiply(normalize);
      const vertices = [];
      for (let i = 0; i < positions.count; i++) {
        node.getVertexPosition(i, v); v.applyMatrix4(transform);
        vertices.push([v.x, -v.z, v.y].map(n => +n.toFixed(6)));
      }
      const faces = [], materialIndices = [];
      for (let i = 0; i < indices.length; i += 3) {
        faces.push([indices[i], indices[i+1], indices[i+2]]);
        materialIndices.push(node.geometry.groups.find(g => i >= g.start && i < g.start+g.count)?.materialIndex || 0);
      }
      meshes.push({name:node.name || `part-${meshes.length}`,vertices,faces,materialIndices,
        colors:materials.map(m => `#${m.color?.getHexString() || 'ffffff'}`),
        outline:materials.every(m => m.side===THREE.BackSide),smooth:!materials.some(m=>m.flatShading),castShadow:node.castShadow});
    }
  });
  return meshes;
}

const first = (prefix, kind) => FURNITURE_SEATS.find(seat => seat.colliderId.startsWith(prefix) && (!kind || seat.kind === kind));
const selected = [
  ['GARDEN SOFA / TWO SEATS', first('garden-', 'sofa') || first('garden-', 'couch')],
  ['ARMCHAIR / GROUNDED FEET', first('garden-', 'armchair')],
  ['GARDEN OTTOMAN', first('garden-', 'ottoman')],
  ['ROTATED SOFA / SHARED SEATS', FURNITURE_SEATS.find(seat => seat.colliderId.startsWith('garden-') && ['sofa','couch'].includes(seat.kind) && Math.abs(seat.rotation)>.5)],
  ['ARRIVAL LOUNGE SOFA', first('cozy-', 'sofa') || first('cozy-', 'couch')],
  ['BEANBAG / FRONT SUPPORT', first('cozy-', 'beanbag')],
  ['INFORMATION ROOM SOFA', first('class24-lounge-')],
  ['SOCIAL ROOM OTTOMAN', first('social-', 'ottoman')],
];
const frames = [];
for (const [label, seat] of selected) {
  if (!seat) throw new Error(`Missing representative seat: ${label}`);
  const propIndex = GARDEN_PROPS.findIndex(prop => prop.id === seat.colliderId);
  let furniture;
  if (propIndex >= 0) furniture = scene.getObjectByName('open-garden');
  else {
    scene.traverse(node => {
      if (node.name===seat.colliderId || node.userData.furnitureId===seat.colliderId || node.userData.colliderId===seat.colliderId) furniture = node;
    });
    if (!furniture) {
      const roots = ['cozy-lounge','social-lounges','class24-information-room'].map(name=>scene.getObjectByName(name));
      const candidates = roots.flatMap(root => root?.children || []).filter(group => group.isGroup && Math.hypot(group.position.x-seat.x,group.position.z-seat.z)<1);
      furniture = candidates.sort((a,b)=>Math.hypot(a.position.x-seat.x,a.position.z-seat.z)-Math.hypot(b.position.x-seat.x,b.position.z-seat.z))[0];
    }
  }
  if (!furniture) throw new Error(`No rendered furnishing for ${seat.colliderId}`);
  const center = propIndex>=0 ? GARDEN_PROPS[propIndex] : furniture.position;
  const rotation = propIndex>=0 ? GARDEN_PROPS[propIndex].rotation : furniture.rotation.y;
  const meshes = snapshot(furniture,center,rotation,propIndex>=0?propIndex:null);
  const occupants = FURNITURE_SEATS.filter(item=>item.colliderId===seat.colliderId);
  for (const slot of occupants) {
    const person = factory.create({hair:5}); person.position.set(slot.x,0,slot.z); person.rotation.y=slot.rotation;
    resetCharacterPose(person,{seated:true});
    for (let frame=0;frame<40;frame++) animateCharacter(person,{dt:1/60,time:frame/60,seated:true,lounging:true});
    meshes.push(...snapshot(person,center,rotation));
  }
  frames.push({label,camera:[3.4,-5.8,2.6],target:[0,-.1,.7],orthoScale:3.5,meshes,
    seatIds:occupants.map(item=>item.id)});
}
const output = path.resolve(process.argv[2] || 'artifacts/furniture-seating-v42.json');
await fs.writeFile(output,JSON.stringify({note:'Actual runtime furniture and deformed character geometry. Offline still inspection; browser interaction unverified.',
  layout:{title:'COMMON GROUND / SEATING FIT',subtitle:'Actual furniture and shared seated rigs. Offline geometry review; browser interaction unverified.',columns:4,width:360,height:340,samples:24},frames}));
for(const space of spaces)space.dispose?.(); factory.dispose(); for(const resource of resources)resource.dispose();
console.log(JSON.stringify({output,frames:frames.map(({label,seatIds,meshes})=>({label,seatIds,meshes:meshes.length}))},null,2));
