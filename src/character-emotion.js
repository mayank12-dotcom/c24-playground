import * as THREE from 'three';

// Only the two fighters receive these small overlays. Reuse their actual head
// surface so the blush follows the smooth skin without another spherical blob.
const sharedGeometry = new WeakMap();
const clamp = value => Math.max(0, Math.min(1, value));

// The dot eyes move with the reference sculpt. Project the small brow onto
// that same front surface instead of keeping an old, buried face offset.
function faceSurfaceDepth(body, x, y) {
  const points = body.attributes.position, indices = body.index;
  let front = -Infinity;
  for (let triangle = 0; triangle < (indices?.count ?? points.count); triangle += 3) {
    const a = indices ? indices.getX(triangle) : triangle;
    const b = indices ? indices.getX(triangle + 1) : triangle + 1;
    const c = indices ? indices.getX(triangle + 2) : triangle + 2;
    const ax = points.getX(a), ay = points.getY(a);
    const bx = points.getX(b), by = points.getY(b);
    const cx = points.getX(c), cy = points.getY(c);
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denominator) < 1e-10) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    front = Math.max(front, u * points.getZ(a) + v * points.getZ(b) + (1 - u - v) * points.getZ(c));
  }
  return Number.isFinite(front) ? front : .291;
}

function headGeometry(body, headHeight) {
  const source = body.attributes.position;
  const normal = body.attributes.normal;
  const index = body.index;
  const positions = [], normals = [], colors = [], indices = [], vertices = new Map();
  const pale = new THREE.Color('#fffefa');
  const warm = new THREE.Color('#ee8778');
  const color = new THREE.Color();
  const add = original => {
    if (vertices.has(original)) return vertices.get(original);
    const next = positions.length / 3;
    const x = source.getX(original), y = source.getY(original), z = source.getZ(original);
    const nx = normal.getX(original), ny = normal.getY(original), nz = normal.getZ(original);
    positions.push(x + nx * .0015, y - headHeight + ny * .0015, z + nz * .0015);
    normals.push(nx, ny, nz);
    const height = clamp((y - (headHeight - .14)) / .34);
    const blend = height * height * (3 - 2 * height);
    color.copy(pale).lerp(warm, blend);
    colors.push(color.r, color.g, color.b);
    vertices.set(original, next);
    return next;
  };
  const count = index?.count ?? source.count;
  for (let triangle = 0; triangle < count; triangle += 3) {
    const a = index ? index.getX(triangle) : triangle;
    const b = index ? index.getX(triangle + 1) : triangle + 1;
    const c = index ? index.getX(triangle + 2) : triangle + 2;
    if (Math.min(source.getY(a), source.getY(b), source.getY(c)) < headHeight - .12) continue;
    indices.push(add(a), add(b), add(c));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'fighter-head-blush-surface';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A subtle, independently fading expression attached to an existing head. */
export function createCharacterEmotion(character, { allResources } = {}) {
  const rig = character?.userData?.rig;
  const head = rig?.head;
  const body = character?.userData?.mesh?.geometry;
  if (!head || !body) throw new TypeError('Character emotion requires a sculpted character rig.');
  // The sculpt's head can change size or height independently of its feet.
  // Read its bind position rather than the currently animated head transform.
  const headHeight = ['hips', 'torso', 'head'].reduce((height, name) => height
    + (rig.rest?.[name]?.position?.[1] ?? rig[name]?.position.y ?? 0), 0);
  let shared = sharedGeometry.get(body);
  if (!shared) {
    shared = {
      tint: headGeometry(body, headHeight),
      brow: new THREE.BoxGeometry(.105, .015, .014),
      references: 0,
      registries: new Map(),
    };
    shared.brow.name = 'fighter-angry-brow-geometry';
    sharedGeometry.set(body, shared);
  }
  shared.references++;
  if (allResources) {
    shared.registries.set(allResources, (shared.registries.get(allResources) ?? 0) + 1);
    allResources.add(shared.tint); allResources.add(shared.brow);
  }
  const tintMaterial = new THREE.MeshLambertMaterial({
    color: '#ffffff', vertexColors: true, transparent: true,
    opacity: 0, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const browMaterial = new THREE.MeshBasicMaterial({
    color: '#49352f', transparent: true, opacity: 0, depthWrite: false,
  });
  allResources?.add(tintMaterial); allResources?.add(browMaterial);
  const root = new THREE.Group(); root.name = 'fighter-angry-expression';
  const tint = new THREE.Mesh(shared.tint, tintMaterial); tint.name = 'fighter-head-blush';
  tint.castShadow = false; tint.receiveShadow = true;
  root.add(tint);
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(shared.brow, browMaterial);
    brow.name = side < 0 ? 'fighter-left-angry-brow' : 'fighter-right-angry-brow';
    const eye = head.children.find(child => child.name === 'minimal-dot-eye' && Math.sign(child.position.x) === side);
    const x = eye?.position.x ?? side * .083;
    const y = (eye?.position.y ?? -.025) + .071;
    brow.rotation.z = side * .28;
    let front = -Infinity;
    for (const dx of [-.0525, 0, .0525]) for (const dy of [-.0075, .0075]) {
      front = Math.max(front, faceSurfaceDepth(body,
        x + dx * Math.cos(brow.rotation.z) - dy * Math.sin(brow.rotation.z),
        headHeight + y + dx * Math.sin(brow.rotation.z) + dy * Math.cos(brow.rotation.z)));
    }
    brow.position.set(x, y, front + .008);
    root.add(brow);
  }
  root.visible = false;
  head.add(root);
  let disposed = false;
  return {
    root,
    update(anger = 0) {
      if (disposed) return;
      const amount = Number.isFinite(anger) ? clamp(anger) : 0;
      root.visible = amount > .001;
      tintMaterial.opacity = amount * .38;
      browMaterial.opacity = amount * .95;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      tintMaterial.dispose(); browMaterial.dispose();
      allResources?.delete(tintMaterial); allResources?.delete(browMaterial);
      if (allResources) {
        const remaining = shared.registries.get(allResources) - 1;
        if (remaining) shared.registries.set(allResources, remaining);
        else {
          shared.registries.delete(allResources);
          allResources.delete(shared.tint); allResources.delete(shared.brow);
        }
      }
      if (--shared.references === 0) {
        shared.tint.dispose(); shared.brow.dispose();
        sharedGeometry.delete(body);
      }
    },
  };
}
