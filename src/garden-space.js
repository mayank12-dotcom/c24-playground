import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createOfficeMaterial } from './render-materials.js';
import {
  GARDEN_PATHS, GARDEN_TERRACES, GARDEN_WALLS,
  GARDEN_PROPS, GARDEN_COLLIDERS, GARDEN_RUGS,
  OFFICE_FLOOR, OFFICE_PERIMETER_WALLS, OFFICE_PROPS,
} from './garden-layout.js';

/**
 * One continuous office floor joins the interview rooms, lounges, and lobby.
 * Every repeated static part shares geometry/material batches; architectural
 * surfaces use continuous matte shading, with no expanded furniture outlines.
 */
export function createGardenSpace({ scene, box, allResources }) {
  const root = new THREE.Group();
  root.name = 'open-garden'; // Stable scene identity for seating and presence.
  root.userData.environment = 'large-office';
  scene.add(root);
  const keep = resource => { allResources.add(resource); return resource; };
  const paint = (color, options) => keep(createOfficeMaterial(color, options));
  // Warm architectural neutrals and colored textiles keep white characters
  // readable. Continuous shading lets the forms carry their own silhouettes.
  const colors = {
    path: paint('#d1ccc2'), pathEdge: paint('#aaa69c'), plaster: paint('#e4dfd5'),
    wood: paint('#aa8060'),
    cream: paint('#eadfcf'), frame: paint('#5d686b'),
    sage: paint('#74937b'), paleSage: paint('#9eaf91'),
    blue: paint('#7e9db5'), lavender: paint('#a193b3'),
    clay: paint('#bf8b77'), butter: paint('#c5a66b'), rose: paint('#ba91a0'),
    leaf: paint('#668768'), leafDark: paint('#49694f'), leafLight: paint('#8ba16b'),
    soil: paint('#75563e'), ink: paint('#38464a'),
    rug: paint('#ffffff'), thread: paint('#c4b5a0'), linen: paint('#d9bf91'),
    floor: paint('#c6bca9'), joint: paint('#b7ad9b'), white: paint('#eeeae2'),
    metal: paint('#929ca0'), glass: paint('#bbced0'), screen: paint('#52676e'),
    fixture: paint('#eae7db', { emissive: '#c8c3ab', emissiveIntensity: .25 }),
  };
  // Low-pile carpet colors identify office zones without isolated platforms;
  // the neutral lobby and hall surfaces join all open room entrances.
  const terraceFinishes = {
    linen: paint('#bfb6a7'), sage: paint('#a0ad9b'),
    blue: paint('#9aabba'), lavender: paint('#aaa0b5'),
    clay: paint('#c5a393'), butter: paint('#c4b587'), rose: paint('#bca2ab'),
  };
  const sphere = keep(new THREE.SphereGeometry(1, 20, 14));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 20));
  const pot = keep(new THREE.CylinderGeometry(1, .74, 1, 24));
  const rounded = keep(new RoundedBoxGeometry(1, 1, 1, 3, .15));
  const shade = keep(new THREE.CylinderGeometry(.62, 1, 1, 24));

  const batches = new Map();
  let activePropIndex = -1;
  let activeWallIndex = -1;
  let activeRoomId = null;
  let activeHallIndex = -1;
  let activeOfficePropIndex = -1;
  let activeOfficeWallIndex = -1;
  const dummy = new THREE.Object3D();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const localMatrix = new THREE.Matrix4();
  const transformed = new THREE.Matrix4();
  function batch(geometry, material, transform, shadows = true, tint = null) {
    const key = `${geometry.uuid}/${material.uuid}/${shadows}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, transforms: [], propIndices: [], wallIndices: [], roomIds: [], hallIndices: [], officePropIndices: [], officeWallIndices: [], tints: [], shadows });
    const item = batches.get(key);
    item.transforms.push(transform.clone());
    item.propIndices.push(activePropIndex);
    item.wallIndices.push(activeWallIndex);
    item.roomIds.push(activeRoomId);
    item.hallIndices.push(activeHallIndex);
    item.officePropIndices.push(activeOfficePropIndex);
    item.officeWallIndices.push(activeOfficeWallIndex);
    item.tints.push(tint);
  }
  function part(geometry, material, position, scale, parent = null, angles = [0, 0, 0], edged = false, shadows = true, tint = null) {
    worldPosition.set(...position); worldScale.set(...scale);
    rotation.set(...angles); quaternion.setFromEuler(rotation);
    localMatrix.compose(worldPosition, quaternion, worldScale);
    if (parent) transformed.multiplyMatrices(parent, localMatrix); else transformed.copy(localMatrix);
    batch(geometry, material, transformed, shadows, tint);
    // The legacy edged argument remains for stable furniture geometry calls.
    // Office objects use soft surface shading rather than inflated ink hulls.
  }
  function at(item) {
    dummy.position.set(item.x, 0, item.z);
    dummy.rotation.set(0, item.rotation || 0, 0);
    dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    return dummy.matrix.clone();
  }

  // A single floor under every zone makes this one large indoor office.
  // Narrow floor joints are batched, sit below hall/carpet overlays, and never
  // change walking height or introduce a physical step.
  part(box, colors.floor, [OFFICE_FLOOR.x, -.05, OFFICE_FLOOR.z],
    [OFFICE_FLOOR.width, .10, OFFICE_FLOOR.depth], null, [0, 0, 0], false, false);
  const floorLeft = OFFICE_FLOOR.x - OFFICE_FLOOR.width / 2;
  const floorBack = OFFICE_FLOOR.z - OFFICE_FLOOR.depth / 2;
  for (let x = floorLeft + 2; x < floorLeft + OFFICE_FLOOR.width; x += 2) {
    part(box, colors.joint, [x, .00025, OFFICE_FLOOR.z], [.012, .0005, OFFICE_FLOOR.depth], null, [0, 0, 0], false, false);
  }
  for (let z = floorBack + 8; z < floorBack + OFFICE_FLOOR.depth; z += 8) {
    part(box, colors.joint, [OFFICE_FLOOR.x, .00025, z], [OFFICE_FLOOR.width, .0005, .012], null, [0, 0, 0], false, false);
  }

  // Flush hall overlays and room carpets join the same shared office floor.
  part(box, colors.pathEdge, [0, -.004, 11.2], [47.4, .018, 18.4], null, [0, 0, 0], false, false);
  part(box, colors.path, [0, .003, 11.2], [47, .012, 18], null, [0, 0, 0], false, false);
  for (const [index, path] of GARDEN_PATHS.entries()) {
    activeHallIndex = index;
    part(box, colors.path, [path.x, .003, path.z], [path.width, .012, path.length], null, [0, 0, 0], false, false);
  }
  activeHallIndex = -1;
  for (const terrace of GARDEN_TERRACES) {
    activeRoomId = terrace.roomId;
    part(box, terraceFinishes[terrace.palette] || terraceFinishes.linen,
      [terrace.x, .009, terrace.z], [terrace.width, .012, terrace.depth],
      null, [0, 0, 0], false, false);
  }
  activeRoomId = null;
  for (const [index, wall] of GARDEN_WALLS.entries()) {
    activeWallIndex = index;
    const room = GARDEN_TERRACES.find(terrace => terrace.roomId === wall.roomId);
    const accent = terraceFinishes[room?.palette] || terraceFinishes.linen;
    const width = wall.halfX * 2, depth = wall.halfZ * 2;
    // A low solid plaster panel, inset baseboard and colored top cap share
    // the exact collision footprint. Openings are gaps in the wall data;
    // there is no invisible full-width wall across a doorway or roof above it.
    part(box, colors.plaster, [wall.x, (wall.height + .02) / 2, wall.z], [width, wall.height - .12, depth]);
    part(box, colors.rug, [wall.x, wall.height - .025, wall.z], [width, .05, depth], null, [0, 0, 0], false, true, accent.color);
    part(box, colors.pathEdge, [wall.x, .035, wall.z], [width, .07, depth], null, [0, 0, 0], false, true);
  }
  activeWallIndex = -1;
  // The enclosing office remains a cutaway: low solid panels and shallow
  // window insets establish an interior without hiding the third-person view.
  for (const [index, wall] of OFFICE_PERIMETER_WALLS.entries()) {
    activeOfficeWallIndex = index;
    const width = wall.halfX * 2, depth = wall.halfZ * 2;
    part(box, colors.plaster, [wall.x, wall.height / 2, wall.z], [width, wall.height, depth]);
    part(box, colors.pathEdge, [wall.x, .045, wall.z], [width, .09, depth]);
    part(box, colors.white, [wall.x, wall.height - .035, wall.z], [width, .07, depth]);
    if (wall.side !== 'front') {
      const horizontal = wall.side === 'back';
      const span = horizontal ? width : depth;
      const count = Math.floor(span / 5);
      const opening = Math.min(3.5, span / count - .35);
      for (let window = 0; window < count; window++) {
        const along = (window + .5) * span / count - span / 2;
        const x = horizontal ? wall.x + along : wall.x + (wall.side === 'left' ? 1 : -1) * (wall.halfX - .012);
        const z = horizontal ? wall.z + wall.halfZ - .012 : wall.z + along;
        const panelHeight = wall.height * .47;
        part(box, colors.glass, [x, wall.height * .63, z], horizontal ? [opening, panelHeight, .014] : [.014, panelHeight, opening], null, [0, 0, 0], false, false);
        part(box, colors.white, [x, wall.height * .63, z], horizontal ? [.035, panelHeight, .019] : [.019, panelHeight, .035], null, [0, 0, 0], false, false);
      }
    }
  }
  activeOfficeWallIndex = -1;

  const upholstery = [colors.blue, colors.clay, colors.butter, colors.lavender, colors.rose];
  function sofa(parent, material) {
    // Slender powder-coated frames and softly shaded cushions keep office
    // lounge furniture light without changing any seated-body clearances.
    // The .30 support height matches the articulated character's short legs.
    // Occupants perch at the front edge; their planted feet stay beyond both
    // the cushions and open frame while they lower, chat, and stand again.
    part(rounded, colors.frame, [0, .165, 0], [2.10, .075, .82], parent);
    for (const x of [-.94, .94]) for (const z of [-.33, .33]) part(cylinder, colors.frame, [x, .08, z], [.032, .16, .032], parent);
    part(rounded, material, [0, .56, -.32], [2.04, .64, .19], parent, [-.10, 0, 0], true);
    for (const x of [-.49, .49]) part(rounded, material, [x, .24, .04], [.95, .12, .77], parent, [0, 0, 0], true);
    for (const x of [-1.0, 1.0]) {
      part(cylinder, colors.frame, [x, .30, -.26], [.028, .34, .028], parent);
      part(rounded, colors.cream, [x, .465, -.01], [.12, .065, .80], parent, [0, 0, 0], true);
    }
    part(rounded, colors.blue, [-.68, .54, -.12], [.32, .33, .13], parent, [.10, 0, .13]);
    part(rounded, colors.butter, [.68, .55, -.11], [.33, .33, .13], parent, [.10, 0, -.13]);
    // Leave the two sitting surfaces bare: a throw belongs on the backrest,
    // rather than adding an uneven ridge beneath an occupant's pelvis.
    part(rounded, colors.linen, [.35, .63, -.20], [.37, .33, .018], parent, [-.10, 0, -.025]);
  }
  function armchair(parent, material) {
    part(rounded, colors.frame, [0, .165, 0], [1.03, .07, .83], parent);
    for (const x of [-.42, .42]) for (const z of [-.32, .32]) part(cylinder, colors.wood, [x, .08, z], [.035, .16, .035], parent);
    part(rounded, material, [0, .55, -.32], [1.04, .61, .21], parent, [-.1, 0, 0], true);
    part(rounded, material, [0, .24, .04], [.91, .12, .81], parent, [0, 0, 0], true);
    // Short armrests stop behind the seat's front lip, leaving the hanging
    // mittens clear while the visitor takes the final backward seating step.
    for (const side of [-1, 1]) part(rounded, material, [side * .49, .40, -.05], [.14, .30, .80], parent, [0, 0, 0], true);
    part(rounded, colors.rose, [-.20, .51, -.14], [.34, .31, .13], parent, [.14, 0, -.13]);
  }
  function ottoman(parent, material) {
    for (const x of [-.34, .34]) for (const z of [-.23, .23]) part(cylinder, colors.wood, [x, .055, z], [.028, .11, .028], parent);
    part(rounded, material, [0, .20, 0], [.93, .20, .72], parent, [0, 0, 0], true);
    // A narrow side seam adds textile detail without raising the support top.
    part(rounded, colors.linen, [.43, .21, 0], [.018, .025, .56], parent);
  }
  function lowTable(parent, index, side = false) {
    if (side) {
      part(cylinder, colors.wood, [0, .47, 0], [.31, .065, .31], parent);
      part(cylinder, colors.frame, [0, .24, 0], [.035, .45, .035], parent);
      part(cylinder, colors.frame, [0, .025, 0], [.23, .05, .23], parent);
    } else {
      part(rounded, colors.wood, [0, .42, 0], [1.30, .07, .80], parent, [0, 0, 0], true);
      for (const [x, z] of [[-.45, -.23], [.45, -.23], [0, .24]]) part(cylinder, colors.frame, [x, .21, z], [.033, .39, .033], parent);
      part(rounded, upholstery[index % upholstery.length], [-.24, .477, -.04], [.38, .035, .25], parent, [0, -.13, 0]);
      part(rounded, colors.cream, [-.24, .497, -.04], [.34, .008, .23], parent, [0, -.13, 0]);
    }
    // A tiny quiet tea set makes the tables feel inhabited without text/assets.
    const teaX = side ? .08 : .25, height = side ? .52 : .477;
    part(cylinder, colors.cream, [teaX, height, .03], [.10, .014, .10], parent);
    part(cylinder, colors.cream, [teaX, height + .045, .03], [.052, .08, .052], parent);
    part(cylinder, colors.soil, [teaX, height + .088, .03], [.042, .003, .042], parent, [0, 0, 0], false, false);
  }
  function floorLamp(parent) {
    part(cylinder, colors.frame, [0, .025, 0], [.26, .05, .26], parent);
    part(cylinder, colors.frame, [0, .82, 0], [.022, 1.58, .022], parent);
    part(shade, colors.linen, [0, 1.51, 0], [.30, .41, .30], parent);
    part(cylinder, colors.cream, [0, 1.297, 0], [.27, .012, .27], parent, [0, 0, 0], false, false);
  }
  function pottedPlant(parent, index) {
    part(pot, index % 3 === 1 ? colors.clay : colors.butter, [0, .225, 0], [.29, .45, .29], parent, [0, 0, 0], true);
    part(cylinder, colors.cream, [0, .455, 0], [.30, .035, .30], parent);
    part(cylinder, colors.soil, [0, .491, 0], [.26, .012, .26], parent, [0, 0, 0], false, false);
    for (let leaf = 0; leaf < 6; leaf++) {
      const angle = leaf * Math.PI / 3 + index * .47;
      const height = .88 + (leaf % 3) * .13;
      part(cylinder, colors.leafDark, [.10 * Math.sin(angle), (.48 + height) / 2, .10 * Math.cos(angle)], [.015, height - .48, .015], parent, [.18 * Math.cos(angle), 0, -.18 * Math.sin(angle)]);
      part(sphere, leaf % 2 ? colors.leaf : colors.leafLight, [.23 * Math.sin(angle), height, .23 * Math.cos(angle)], [.14, .29, .065], parent, [.52 * Math.cos(angle), angle, -.52 * Math.sin(angle)]);
    }
  }
  for (const rug of GARDEN_RUGS) {
    const parent = at(rug);
    const accent = colors[rug.palette] || colors.rug;
    // Two low rounded layers and repeating woven bands read as a woven rug
    // while keeping the walking plane flat and the geometry entirely shared.
    part(rounded, colors.thread, [0, .022, 0], [rug.width, .008, rug.depth], parent, [0, 0, 0], false, false);
    part(rounded, colors.rug, [0, .027, 0], [rug.width - .14, .004, rug.depth - .14], parent, [0, 0, 0], false, false, accent.color);
    const stripes = rug.kind === 'lounge' ? 11 : 7;
    for (let index = 0; index < stripes; index++) {
      const z = (index / (stripes - 1) - .5) * (rug.depth - .38);
      part(box, colors.thread, [0, .030, z], [rug.width - .34, .001, .016], parent, [0, 0, 0], false, false);
    }
  }
  for (const [propIndex, prop] of GARDEN_PROPS.entries()) {
    activePropIndex = propIndex;
    const parent = at(prop);
    const index = prop.workspaceIndex || 0;
    const material = colors[prop.palette] || upholstery[index % upholstery.length];
    if (prop.kind === 'sofa') sofa(parent, material);
    else if (prop.kind === 'armchair') armchair(parent, material);
    else if (prop.kind === 'ottoman') ottoman(parent, material);
    else if (prop.kind === 'coffee-table') lowTable(parent, index);
    else if (prop.kind === 'side-table') lowTable(parent, index, true);
    else if (prop.kind === 'lamp') floorLamp(parent);
    else if (prop.kind === 'plant') pottedPlant(parent, index);
  }

  activePropIndex = -1;

  // New office essentials use the same dimensions as the shared obstacles.
  // Hardware, top surfaces and accessories remain inside each solid footprint;
  // no decorative overhang creates an invisible collision disagreement.
  function cabinet(parent, prop) {
    const width = prop.halfX * 2, depth = prop.halfZ * 2, height = prop.height;
    const horizontal = width >= depth;
    const span = horizontal ? width : depth;
    const count = Math.max(2, Math.round(span / 1.35));
    const face = colors[prop.palette] || colors.cream;
    part(rounded, colors.wood, [0, height / 2, 0], [width, height, depth], parent);
    const direction = horizontal ? 1 : prop.x < 0 ? 1 : -1;
    for (let door = 0; door < count; door++) {
      const along = (door + .5) * span / count - span / 2;
      const x = horizontal ? along : direction * (width / 2 - .014);
      const z = horizontal ? depth / 2 - .014 : along;
      part(rounded, face, [x, height * .52, z], horizontal
        ? [span / count - .045, height * .80, .025]
        : [.025, height * .80, span / count - .045], parent);
      part(rounded, colors.metal, [horizontal ? x + span / count * .31 : x, height * .60,
        horizontal ? z : z + span / count * .31], horizontal
        ? [.025, .13, .025] : [.025, .13, .025], parent);
    }
  }
  function officeCounter(parent, prop, cafe = false) {
    const width = prop.halfX * 2, depth = prop.halfZ * 2, height = prop.height;
    const accent = colors[prop.palette] || colors.blue;
    part(rounded, colors.wood, [0, height * .42, 0], [width, height * .84, depth], parent);
    part(rounded, colors.cream, [0, height * .86, 0], [width, height * .08, depth], parent);
    part(rounded, accent, [0, height * .46, depth / 2 - .022], [width * .91, height * .60, .035], parent);
    // Narrow reveals suggest joined cabinet panels, avoiding heavy linework.
    for (let joint = 1; joint < 4; joint++) {
      part(box, colors.wood, [(joint / 4 - .5) * width * .91, height * .46, depth / 2 - .001], [.013, height * .60, .001], parent, [0, 0, 0], false, false);
    }
    if (cafe) {
      part(rounded, colors.frame, [-width * .22, height * .95, -.12], [width * .16, height * .10, depth * .36], parent);
      part(rounded, colors.metal, [-width * .22, height * .94, depth * .07], [width * .11, height * .07, .05], parent);
      for (const x of [width * .09, width * .20, width * .31]) {
        part(cylinder, colors.white, [x, height * .945, .04], [.065, height * .09, .065], parent);
        part(cylinder, colors.soil, [x, height * .991, .04], [.052, .003, .052], parent, [0, 0, 0], false, false);
      }
    } else {
      part(rounded, colors.frame, [-width * .18, height * .94, -.15], [width * .17, height * .12, .08], parent);
      part(rounded, colors.screen, [-width * .18, height * .945, -.105], [width * .145, height * .075, .012], parent);
      part(rounded, colors.white, [width * .21, height * .92, .05], [.55, .04, .34], parent, [0, -.12, 0]);
      part(rounded, colors.butter, [width * .21, height * .95, .05], [.50, .015, .30], parent, [0, -.12, 0]);
    }
  }
  function officePrinter(parent, prop) {
    const width = prop.halfX * 2, depth = prop.halfZ * 2, height = prop.height;
    part(rounded, colors.white, [0, height * .45, 0], [width, height * .90, depth], parent);
    part(rounded, colors.frame, [0, height * .94, -.06], [width * .92, height * .12, depth * .88], parent);
    part(rounded, colors.metal, [0, height * .70, depth / 2 - .025], [width * .86, height * .18, .04], parent);
    part(rounded, colors.frame, [0, height * .73, depth / 2 - .004], [width * .64, height * .04, .004], parent);
    part(rounded, colors.screen, [width * .30, height * .963, depth * .25], [width * .20, height * .025, depth * .20], parent);
    for (const y of [.20, .40]) part(box, colors.metal, [0, height * y, depth / 2 - .004], [width * .84, .012, .004], parent, [0, 0, 0], false, false);
  }
  for (const [index, prop] of OFFICE_PROPS.entries()) {
    activeOfficePropIndex = index;
    const parent = at(prop);
    if (prop.kind === 'reception') officeCounter(parent, prop);
    else if (prop.kind === 'cafe-counter') officeCounter(parent, prop, true);
    else if (prop.kind === 'storage') cabinet(parent, prop);
    else if (prop.kind === 'printer') officePrinter(parent, prop);
  }
  activeOfficePropIndex = -1;

  // Two slender suspended fixture bands imply an indoor ceiling while leaving
  // the camera's view entirely open. Their emission needs no extra lights.
  for (const x of [-13, 13]) {
    part(rounded, colors.frame, [x, 4.12, 11], [7.2, .10, .36], null, [0, 0, 0], false, false);
    part(rounded, colors.fixture, [x, 4.06, 11], [6.95, .025, .27], null, [0, 0, 0], false, false);
  }


  let instances = 0;
  for (const item of batches.values()) {
    const mesh = new THREE.InstancedMesh(item.geometry, item.material, item.transforms.length);
    mesh.name = `garden-batch-${root.children.length}`;
    mesh.castShadow = item.shadows; mesh.receiveShadow = true;
    item.transforms.forEach((transform, index) => mesh.setMatrixAt(index, transform));
    mesh.instanceMatrix.needsUpdate = true;
    // Rug weaves share one material/draw call; per-instance pigments retain the
    // distinct zone colors without duplicating geometry or furniture batches.
    if (item.tints.some(Boolean)) {
      item.tints.forEach((tint, index) => mesh.setColorAt(index, tint || colors.rug.color));
      mesh.instanceColor.needsUpdate = true;
    }
    // Shared instance identities support geometry/collision checks without
    // introducing separate meshes for every lounge object.
    mesh.userData.propIndices = item.propIndices;
    mesh.userData.wallIndices = item.wallIndices;
    mesh.userData.roomIds = item.roomIds;
    mesh.userData.hallIndices = item.hallIndices;
    mesh.userData.officePropIndices = item.officePropIndices;
    mesh.userData.officeWallIndices = item.officeWallIndices;
    mesh.computeBoundingSphere();
    root.add(mesh); instances += item.transforms.length;
  }
  root.userData.batchCount = root.children.length;
  root.userData.instanceCount = instances;
  // Layout colliders are the shared source for both walking and bot routes.
  return { colliders: GARDEN_COLLIDERS, dispose() { root.removeFromParent(); } };
}
