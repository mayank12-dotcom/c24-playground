import * as THREE from 'three';

// One shared, seamless surface rather than a collection of overlapping spheres.
// It is generated once, then each character gets a small articulated skeleton.
const INK = '#20211e';
const HEAD = Object.freeze({ y: 1.68, rx: .415, ry: .415, rz: .405 });
const DIMENSIONS = Object.freeze({
  hipHeight: .70, thighLength: .29, shinLength: .28, footHeight: .11,
  legSeparation: .32, shoulderHeight: 1.30, upperArmLength: Math.hypot(.17, .27),
  forearmLength: .34, height: 2.10,
});
const BONE_NAMES = [
  'hips', 'torso', 'head',
  'leftArm', 'leftForearm', 'leftHand', 'rightArm', 'rightForearm', 'rightHand',
  'leftLeg', 'leftShin', 'leftFoot', 'rightLeg', 'rightShin', 'rightFoot',
];
const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((name, index) => [name, index]));
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ARM_CURVE = Array.from({ length: 19 }, (_, index) => {
  const y = .675 + (1.255 - .675) * index / 18;
  const t = (y - .675) / .58;
  return { x: .390 - .185 * smoothstep(1.045, 1.255, y) + .030 * Math.sin(t * Math.PI), y,
    z: .015 * (1 - smoothstep(.73, 1.05, y)),
    radius: .067 + .014 * (1 - smoothstep(.675, .775, y)) };
});

function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const qx = (x - cx) / rx, qy = (y - cy) / ry, qz = (z - cz) / rz;
  const k0 = Math.hypot(qx, qy, qz);
  const k1 = Math.hypot(qx / rx, qy / ry, qz / rz);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}

function capsule(x, y, z, ax, ay, az, bx, by, bz, radius) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const t = clamp(((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) - radius;
}

// The smooth union also blends bone influences across the neck, shoulders,
// elbows, hips and ankles. Articulation therefore has no outline rings.
function bodyField(x, y, z, withWeights = false) {
  let weights = withWeights ? new Float64Array(BONE_NAMES.length) : null;
  let distance = Infinity;
  const join = (d, radius, boneWeights) => {
    const first = distance === Infinity;
    const h = first ? 0 : clamp(.5 + .5 * (d - distance) / radius);
    distance = first ? d : d * (1 - h) + distance * h - radius * h * (1 - h);
    if (weights) {
      for (let i = 0; i < weights.length; i++) weights[i] *= h;
      for (const [bone, value] of boneWeights) weights[BONE_INDEX[bone]] += value * (1 - h);
    }
  };
  const torsoInfluence = smoothstep(.73, 1.20, y);
  const bodyWeights = [['hips', 1 - torsoInfluence], ['torso', torsoInfluence]];
  // The large ball head and compact tapered torso follow the dimensional 3D
  // reference. A smaller lower torso exposes the straight legs without changing
  // the established planted-foot rig or introducing a separate pelvis blob.
  const shoulderTaper = smoothstep(1.02, 1.34, y);
  join(ellipsoid(x, y, z, 0, .965, 0, .275 - .070 * shoulderTaper, .375,
    .215 - .025 * shoulderTaper), .055, bodyWeights);
  join(ellipsoid(x, y, z, 0, HEAD.y, .004, HEAD.rx, HEAD.ry, HEAD.rz), .065, [['head', 1]]);
  // Finish the softly joined legs before adding the relaxed arms.
  // The torso-to-leg union never blends a hanging mitten into the pelvis.
  for (const [side, prefix] of [[-1, 'left'], [1, 'right']]) {
    const kneeBlend = smoothstep(.325, .455, y);
    const footBlend = 1 - smoothstep(.13, .245, y);
    // A single uninterrupted leg tube has no swollen knee or pinched ankle.
    // The two-bone bend is carried by smooth skin weights, not extra balls.
    join(capsule(x, y, z, side * .16, .655, 0, side * .16, .125, .013, .118), .055,
      [[`${prefix}Leg`, kneeBlend * (1 - footBlend)],
        [`${prefix}Shin`, (1 - kneeBlend) * (1 - footBlend)], [`${prefix}Foot`, footBlend]]);
    join(ellipsoid(x, y, z, side * .16, .085, .055, .126, .075, .151), .035,
      [[`${prefix}Foot`, 1]]);
  }
  for (const [side, prefix] of [[-1, 'left'], [1, 'right']]) {
    const elbowBlend = smoothstep(.975, 1.09, y);
    const handBlend = 1 - smoothstep(.705, .775, y);
    // One curved tube gives the entire arm an uninterrupted outer contour.
    // Only the shoulder joins the torso: a clear armpit below it prevents a
    // sheet of belly skin from folding into the raised elbow during a gesture.
    let armDistance = Infinity;
    for (let index = 1; index < ARM_CURVE.length; index++) {
      const a = ARM_CURVE[index - 1], b = ARM_CURVE[index];
      const d = capsule(x, y, z, side * a.x, a.y, a.z, side * b.x, b.y, b.z,
        (a.radius + b.radius) / 2);
      if (armDistance === Infinity) armDistance = d;
      else {
        const h = clamp(.5 + .5 * (d - armDistance) / .018);
        armDistance = d * (1 - h) + armDistance * h - .018 * h * (1 - h);
      }
    }
    // Give the upper arm a broad, soft attachment rather than the small
    // pinched contact left by a narrow capsule/torso intersection.
    join(armDistance, .008 + .064 * smoothstep(1.065, 1.235, y),
      [[`${prefix}Arm`, elbowBlend * (1 - handBlend)],
        [`${prefix}Forearm`, (1 - elbowBlend) * (1 - handBlend)], [`${prefix}Hand`, handBlend]]);

  }
  // A gently curved, sub-shoulder gap separates the relaxed hand from the
  // pear torso. Resolve it in the field as well as the sampling grid so a
  // diagonal tetrahedron cannot turn a tiny opening into a stretched sheet.
  const gapX = .300 - .025 * smoothstep(1.065, 1.18, y);
  const armGap = Math.max(
    Math.hypot(Math.abs(x) - gapX, y - clamp(y, .60, 1.135)) - .022,
    Math.abs(z) - .17);
  // A rounded subtraction ends below the actual shoulder joint. The upper
  // shoulder remains a solid, smooth bridge through relaxed and raised poses.
  const cutDistance = -armGap;
  const cutBlend = .018;
  const cutWeight = clamp(.5 + .5 * (cutDistance - distance) / cutBlend);
  distance = distance * (1 - cutWeight) + cutDistance * cutWeight
    + cutBlend * cutWeight * (1 - cutWeight);
  // The reference has little flat soles, not separate spherical shoes.
  distance = Math.max(distance, .010 - y);
  if (withWeights) {
    // A surface union can switch from chest to arm within one tiny tetrahedron
    // beside the armpit. Give that attachment a broad anatomical weight blend
    // instead, so raised arms and falls bend the shared shoulder continuously.
    const shoulderBlend = smoothstep(.96, 1.08, y) * (1 - smoothstep(1.28, 1.39, y));
    const armBones = ['leftArm', 'leftForearm', 'leftHand', 'rightArm', 'rightForearm', 'rightHand'];
    const shoulderWeight = armBones.reduce((sum, bone) => sum + weights[BONE_INDEX[bone]], weights[BONE_INDEX.torso]);
    const armWeight = shoulderWeight * smoothstep(.20, .43, Math.abs(x));
    weights[BONE_INDEX.torso] = weights[BONE_INDEX.torso] * (1 - shoulderBlend)
      + (shoulderWeight - armWeight) * shoulderBlend;
    for (const bone of armBones) weights[BONE_INDEX[bone]] *= 1 - shoulderBlend;
    const prefix = x < 0 ? 'left' : 'right', elbowBlend = smoothstep(.975, 1.09, y);
    weights[BONE_INDEX[`${prefix}Arm`]] += armWeight * shoulderBlend * elbowBlend;
    weights[BONE_INDEX[`${prefix}Forearm`]] += armWeight * shoulderBlend * (1 - elbowBlend);
  }
  return withWeights ? { distance, weights } : distance;
}

function createBodyGeometry() {
  // Marching tetrahedra needs no model downloads, third-party mesher or textures.
  // Shared edge vertices keep the result smooth and substantially smaller.
  const step = .060;
  const min = [-.59, -.045, -.455], max = [.59, 2.145, .455];
  const counts = min.map((v, axis) => Math.ceil((max[axis] - v) / step) + 1);
  // Follow the centre of both curved armpit gaps with one grid column each.
  // This preserves a true opening without adding global mesh density.
  const xSamples = Array.from({ length: counts[0] }, (_, index) => min[0] + index * step);
  for (const gap of [-.30, .30]) if (!xSamples.some(value => Math.abs(value - gap) < 1e-6)) xSamples.push(gap);
  xSamples.sort((a, b) => a - b); counts[0] = xSamples.length;
  // Resolve the shallow shoulder slope with a few extra rows rather than
  // increasing the density of every head, torso and limb on every character.
  const ySamples = Array.from({ length: counts[1] }, (_, index) => min[1] + index * step);
  ySamples.push(1.165, 1.205, 1.245, 1.285, 1.975, 2.035, 2.075);
  ySamples.sort((a, b) => a - b); counts[1] = ySamples.length;
  const [nx, ny, nz] = counts;
  const points = [], fields = [];
  const pointIndex = (x, y, z) => (y * nz + z) * nx + x;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const py = ySamples[y];
    const gapCenter = .300 - .025 * smoothstep(1.065, 1.18, py);
    const sx = xSamples[x], ax = Math.abs(sx);
    const warp = smoothstep(.24, .30, ax) * (1 - smoothstep(.30, .38, ax));
    const px = sx + Math.sign(sx) * (gapCenter - .30) * warp;
    const point = [px, py, min[2] + z * step];
    points.push(point); fields.push(bodyField(...point));
  }
  const vertices = [], indices = [], edges = new Map();
  const edgeVertex = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edges.has(key)) return edges.get(key);
    const t = fields[a] / (fields[a] - fields[b]);
    const point = points[a].map((coordinate, axis) => coordinate + t * (points[b][axis] - coordinate));
    const id = vertices.length / 3;
    vertices.push(...point); edges.set(key, id); return id;
  };
  const triangle = (a, b, c, direction) => {
    const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
    const ux = vertices[b * 3] - ax, uy = vertices[b * 3 + 1] - ay, uz = vertices[b * 3 + 2] - az;
    const vx = vertices[c * 3] - ax, vy = vertices[c * 3 + 1] - ay, vz = vertices[c * 3 + 2] - az;
    const dot = (uy * vz - uz * vy) * direction[0] + (uz * vx - ux * vz) * direction[1] + (ux * vy - uy * vx) * direction[2];
    if (dot >= 0) indices.push(a, b, c); else indices.push(a, c, b);
  };
  const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  for (let y = 0; y < ny - 1; y++) for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) {
    const corners = [pointIndex(x, y, z), pointIndex(x + 1, y, z), pointIndex(x + 1, y + 1, z), pointIndex(x, y + 1, z),
      pointIndex(x, y, z + 1), pointIndex(x + 1, y, z + 1), pointIndex(x + 1, y + 1, z + 1), pointIndex(x, y + 1, z + 1)];
    if (corners.every(i => fields[i] >= 0) || corners.every(i => fields[i] < 0)) continue;
    for (const tetra of tetrahedra) {
      const inside = tetra.map(i => corners[i]).filter(i => fields[i] < 0);
      const outside = tetra.map(i => corners[i]).filter(i => fields[i] >= 0);
      if (!inside.length || !outside.length) continue;
      const direction = [0, 1, 2].map(axis => outside.reduce((s, i) => s + points[i][axis], 0) / outside.length - inside.reduce((s, i) => s + points[i][axis], 0) / inside.length);
      if (inside.length === 1) {
        triangle(...outside.map(i => edgeVertex(inside[0], i)), direction);
      } else if (inside.length === 3) {
        triangle(...inside.map(i => edgeVertex(outside[0], i)), direction);
      } else {
        const [a, b] = inside, [c, d] = outside;
        const ac = edgeVertex(a, c), ad = edgeVertex(a, d), bc = edgeVertex(b, c), bd = edgeVertex(b, d);
        triangle(ac, ad, bc, direction); triangle(ad, bd, bc, direction);
      }
    }
  }
  // Linear interpolation inside a tetrahedron cuts across rounded hand tips,
  // shoulders and toes. Recover the curved implicit surface at the existing
  // shared vertices instead of increasing every character's triangle count.
  // Small bounded Newton steps keep the topology and the narrow arm gap intact.
  const projectionEpsilon = .0005;
  for (let i = 0; i < vertices.length; i += 3) {
    let x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
    for (let iteration = 0; iteration < 2; iteration++) {
      const distance = bodyField(x, y, z);
      if (Math.abs(distance) < .00001) break;
      const gx = (bodyField(x + projectionEpsilon, y, z) - bodyField(x - projectionEpsilon, y, z)) / (2 * projectionEpsilon);
      const gy = (bodyField(x, y + projectionEpsilon, z) - bodyField(x, y - projectionEpsilon, z)) / (2 * projectionEpsilon);
      const gz = (bodyField(x, y, z + projectionEpsilon) - bodyField(x, y, z - projectionEpsilon)) / (2 * projectionEpsilon);
      const gradientLength = Math.hypot(gx, gy, gz);
      if (gradientLength < .0001) break;
      const correction = clamp(distance / gradientLength, -.010, .010) / gradientLength;
      x -= gx * correction; y = Math.max(.010, y - gy * correction); z -= gz * correction;
    }
    vertices[i] = x; vertices[i + 1] = y; vertices[i + 2] = z;
  }
  const skinIndices = [], skinWeights = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const { weights } = bodyField(vertices[i], vertices[i + 1], vertices[i + 2], true);
    const ranked = [...weights].map((weight, index) => [index, weight]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
    for (const [index, weight] of ranked) { skinIndices.push(index); skinWeights.push(weight / total); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  // Shade the underlying smooth field rather than the tetrahedron directions.
  // Adjacent triangles therefore share a continuous surface normal, including
  // the low-poly joints, with no textures or per-frame geometry work.
  const normals = [], epsilon = .001;
  for (let i = 0; i < vertices.length; i += 3) {
    const [x, y, z] = vertices.slice(i, i + 3);
    const nx = bodyField(x + epsilon, y, z) - bodyField(x - epsilon, y, z);
    const ny = bodyField(x, y + epsilon, z) - bodyField(x, y - epsilon, z);
    const nz = bodyField(x, y, z + epsilon) - bodyField(x, y, z - epsilon);
    const magnitude = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / magnitude, ny / magnitude, nz / magnitude);
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.name = 'continuous-sculpted-character-skin';
  return geometry;
}

function expandedGeometry(geometry, width) {
  const expanded = geometry.clone();
  const position = expanded.attributes.position, normal = expanded.attributes.normal;
  for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i) + normal.getX(i) * width, position.getY(i) + normal.getY(i) * width, position.getZ(i) + normal.getZ(i) * width);
  position.needsUpdate = true; expanded.computeBoundingSphere();
  return expanded;
}

function createHairGeometry(style) {
  const positions = [], indices = [];
  const rows = 12, columns = 28;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const phi = column / columns * Math.PI * 2;
    const front = Math.max(0, Math.sin(phi)), back = Math.max(0, -Math.sin(phi));
    let hem = 1.49 - front * .30 + back * .15;
    if (style === 1) hem += .13 * Math.cos(phi + .5) * front;
    if (style === 2) hem += .065 * Math.sin(phi * 2 + .4) + back * .07;
    if (style === 3) hem -= .11;
    if (style === 4) hem += .48 * (1 - front ** 4);
    const theta = row / rows * hem;
    const swept = style === 1 ? .065 * Math.sin(theta) * (.5 - .5 * Math.cos(phi)) : 0;
    const crest = style === 2 ? .045 * Math.sin(theta) ** 2 * (.5 + .5 * Math.cos(phi - .6)) : 0;
    const rx = HEAD.rx + .015 + (style === 4 ? .018 : 0), rz = HEAD.rz + .014 + (style === 4 ? .018 : 0);
    positions.push(rx * Math.sin(theta) * Math.cos(phi) - swept * .3,
      (HEAD.ry + .015 + crest) * Math.cos(theta) + swept + .009,
      rz * Math.sin(theta) * Math.sin(phi) + .004);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1;
    if (row) indices.push(a, a + 1, b);
    indices.push(a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  geometry.name = `continuous-hair-cap-${style}`;
  return geometry;
}

function createSkeleton() {
  const rig = {};
  const add = (name, parent, x, y, z) => {
    const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, z);
    rig[name] = bone; if (parent) rig[parent].add(bone); return bone;
  };
  add('hips', null, 0, .70, 0);
  add('torso', 'hips', 0, .28, 0);
  add('head', 'torso', 0, HEAD.y - .98, 0);
  for (const [side, prefix] of [[-1, 'left'], [1, 'right']]) {
    add(`${prefix}Arm`, 'torso', side * .25, .32, 0);
    add(`${prefix}Forearm`, `${prefix}Arm`, side * .17, -.27, 0);
    add(`${prefix}Hand`, `${prefix}Forearm`, side * .005, -.34, .025);
    add(`${prefix}Leg`, 'hips', side * .16, -.02, 0);
    add(`${prefix}Shin`, `${prefix}Leg`, 0, -.29, 0);
    add(`${prefix}Foot`, `${prefix}Shin`, 0, -.28, .01);
  }
  rig.bones = BONE_NAMES.map(name => rig[name]);
  rig.rest = Object.fromEntries(BONE_NAMES.map(name => [name, { position: rig[name].position.toArray(), rotation: rig[name].rotation.toArray().slice(0, 3) }]));
  rig.dimensions = DIMENSIONS;
  return rig;
}

/** Owns shared geometry/materials; call dispose once when the world is destroyed. */
export function createCharacterFactory() {
  const resources = new Set();
  const keep = object => { resources.add(object); return object; };
  const bodyGeometry = keep(createBodyGeometry());
  const outlineGeometry = keep(expandedGeometry(bodyGeometry, .019));
  const skinMaterial = keep(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  const blackMaterial = keep(new THREE.MeshBasicMaterial({ color: INK }));
  const outlineMaterial = keep(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  const hairGeometries = Array.from({ length: 5 }, (_, style) => keep(createHairGeometry(style)));
  const eyeGeometry = keep(new THREE.SphereGeometry(1, 8, 6));
  const tieShape = new THREE.Shape();
  tieShape.moveTo(-.045, .112); tieShape.lineTo(.045, .112); tieShape.lineTo(.027, .052);
  tieShape.lineTo(.057, -.155); tieShape.lineTo(0, -.215); tieShape.lineTo(-.057, -.155);
  tieShape.lineTo(-.027, .052); tieShape.closePath();
  const tieGeometry = keep(new THREE.ExtrudeGeometry(tieShape, { depth: .019, bevelEnabled: false, steps: 1 }));
  const skeletons = new Set();
  const create = ({ hair = 5, tie = false, sitting = false } = {}) => {
    const root = new THREE.Group(); root.name = 'sculpted-cartoon-character';
    const rig = createSkeleton(); root.add(rig.hips); root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(rig.bones); skeletons.add(skeleton); rig.skeleton = skeleton;
    const mesh = new THREE.SkinnedMesh(bodyGeometry, skinMaterial); mesh.name = 'continuous-white-body';
    const outline = new THREE.SkinnedMesh(outlineGeometry, outlineMaterial); outline.name = 'continuous-body-outline';
    for (const surface of [mesh, outline]) {
      surface.frustumCulled = false; root.add(surface); surface.bind(skeleton);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; outline.castShadow = false;
    const style = Number.isFinite(hair) ? ((Math.trunc(hair) % 6) + 6) % 6 : 5;
    if (style !== 5) {
      const hairMesh = new THREE.Mesh(hairGeometries[style], blackMaterial);
      hairMesh.name = 'single-piece-hairstyle'; hairMesh.castShadow = true; rig.head.add(hairMesh);
    }
    for (const x of [-.083, .083]) {
      const eye = new THREE.Mesh(eyeGeometry, blackMaterial);
      const faceDepth = HEAD.rz * Math.sqrt(1 - (x / HEAD.rx) ** 2 - (.13 / HEAD.ry) ** 2);
      eye.name = 'minimal-dot-eye'; eye.position.set(x, -.13, faceDepth + .013);
      eye.scale.set(.015, .019, .011); rig.head.add(eye);
    }
    if (tie) {
      const necktie = new THREE.Mesh(tieGeometry, blackMaterial);
      necktie.name = 'recruiter-necktie'; necktie.position.set(0, .155, .188); necktie.rotation.x = -.25;
      rig.torso.add(necktie);
    }
    root.userData = {
      rig, body: rig.hips, head: rig.head, arms: [rig.leftArm, rig.rightArm], sitting,
      mesh, outline, hair: style,
      dispose() { skeleton.dispose(); skeletons.delete(skeleton); },
    };
    return root;
  };
  return {
    create,
    dispose() { for (const skeleton of skeletons) skeleton.dispose(); skeletons.clear(); for (const resource of resources) resource.dispose(); resources.clear(); },
  };
}
