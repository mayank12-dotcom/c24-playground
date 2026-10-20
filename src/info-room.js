import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { INFO_OBJECTS } from './info-content.js';
import { createOfficeMaterial } from './render-materials.js';

/** Shared local geometry makes an office information lounge without downloaded assets. */
export function createInfoRoom({ scene, shape, box, allResources, objects = INFO_OBJECTS }) {
  const root = new THREE.Group(); root.name = 'class24-information-room'; scene.add(root);
  const keep = resource => { allResources.add(resource); return resource; };
  const paint = color => keep(createOfficeMaterial(color));
  const colors = {
    cream: paint('#f5eee2'), frame: paint('#596577'), ink: paint('#3c485d'),
    blue: paint('#789fc1'), lavenderLight: paint('#d5c9e5'), clay: paint('#cd8068'),
    butter: paint('#deb35b'), glass: paint('#adc9df'), tire: paint('#535e71'),
  };
  const rounded = keep(new RoundedBoxGeometry(1, 1, 1, 3, .14));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 16));
  const sphere = keep(new THREE.SphereGeometry(1, 14, 10));
  const ring = keep(new THREE.TorusGeometry(1, .07, 5, 20));
  const raycastTargets = [], colliders = [];
  const byId = new Map(objects.map(object => [object.id, object]));
  const add = (parent, geometry, material, position, scale, outlined = true) => shape(parent, geometry, material, position, scale, outlined);
  function roundedPart(parent, material, position, scale, outlined = true) {
    return add(parent, rounded, material, position, scale, outlined);
  }
  function board(parent, material = colors.cream) {
    roundedPart(parent, colors.frame, [0, 1.3, 0], [1.68, 1.38, .085]);
    roundedPart(parent, material, [0, 1.3, .053], [1.60, 1.30, .025], false);
    for (const x of [-.59, .59]) {
      add(parent, cylinder, colors.frame, [x, .34, 0], [.024, .66, .024], false);
      roundedPart(parent, colors.cream, [x, .025, .03], [.11, .05, .62], false);
    }
  }
  // The same small physical information badge identifies each clickable object.
  function badge(parent, height) {
    add(parent, cylinder, colors.cream, [.72, height, .28], [.18, .035, .18], false).rotation.x = Math.PI / 2;
    add(parent, cylinder, colors.ink, [.72, height + .056, .306], [.018, .008, .018], false).rotation.x = Math.PI / 2;
    roundedPart(parent, colors.ink, [.72, height - .035, .308], [.03, .092, .009], false);
  }
  function story(parent) {
    board(parent);
    // A little open doorway and three calm text strokes read as a welcome sign.
    roundedPart(parent, colors.blue, [-.37, 1.35, .12], [.47, .68, .025], false);
    roundedPart(parent, colors.cream, [-.37, 1.25, .142], [.21, .40, .012], false);
    for (const [x, y, length] of [[.25, 1.60, .5], [.25, 1.43, .5], [.16, 1.26, .32], [.05, .95, 1.02]]) {
      roundedPart(parent, colors.ink, [x, y, .122], [length, .032, .012], false);
    }
    badge(parent, 1.91);
  }
  function product(parent) {
    for (const x of [-.66, .66]) roundedPart(parent, colors.frame, [x, .20, 0], [.055, .40, .80], false);
    add(parent, cylinder, colors.cream, [0, .435, 0], [.99, .055, .59]);
    // A single soft car silhouette sits on a low plinth, keeping sightlines open.
    roundedPart(parent, colors.blue, [0, .76, 0], [1.58, .40, .70]);
    roundedPart(parent, colors.blue, [-.03, 1.02, 0], [.93, .38, .64]);
    for (const z of [-.328, .328]) {
      roundedPart(parent, colors.glass, [-.06, 1.07, z], [.72, .22, .018], false);
      add(parent, box, colors.blue, [-.02, 1.07, z * 1.04], [.028, .25, .019], false);
      for (const x of [-.48, .49]) {
        const wheel = add(parent, cylinder, colors.tire, [x, .62, z * 1.12], [.18, .09, .18]); wheel.rotation.x = Math.PI / 2;
        const hub = add(parent, cylinder, colors.cream, [x, .62, z * 1.28], [.075, .008, .075], false); hub.rotation.x = Math.PI / 2;
      }
    }
    for (const z of [-.23, .23]) roundedPart(parent, colors.butter, [.793, .78, z], [.015, .09, .13], false);
    badge(parent, 1.28);
  }
  function values(parent) {
    board(parent, colors.lavenderLight);
    for (const [index, x, y] of [[0, -.40, 1.58], [1, .34, 1.56], [2, -.38, 1.02], [3, .34, 1.01]]) {
      const note = roundedPart(parent, [colors.butter, colors.cream, colors.clay, colors.cream][index], [x, y, .13], [.49, .39, .025], false);
      note.rotation.z = index % 2 ? -.07 : .06;
      for (const offset of [-.035, .045]) roundedPart(parent, colors.ink, [x, y + offset, .152], [.25, .014, .007], false);
      add(parent, sphere, colors.frame, [x, y + .13, .157], [.027, .027, .015], false);
    }
    badge(parent, 1.91);
  }
  function people(parent) {
    for (const x of [-.66, .66]) roundedPart(parent, colors.frame, [x, .16, 0], [.055, .32, .74], false);
    add(parent, cylinder, colors.cream, [0, .36, 0], [.99, .055, .55]);
    const people = [[-.49, .94, .23, colors.blue], [0, 1.11, .26, colors.clay], [.49, .96, .23, colors.butter]];
    for (const [x, y, radius, material] of people) {
      add(parent, sphere, material, [x, .65, 0], [.22, .29, .19]);
      add(parent, sphere, colors.cream, [x, y, 0], [radius, radius, radius]);
    }
    const arc = add(parent, ring, colors.blue, [0, .96, -.12], [.88, .72, 1], false); arc.rotation.y = .08;
    badge(parent, 1.38);
  }
  function careers(parent) {
    board(parent, colors.cream);
    for (const [index, x, y] of [[0, -.48, .96], [1, 0, 1.26], [2, .48, 1.56]]) {
      roundedPart(parent, [colors.blue, colors.clay, colors.butter][index], [x, y, .135], [.30, .27, .035], false);
      if (index < 2) {
        const line = roundedPart(parent, colors.frame, [x + .24, y + .15, .125], [.31, .028, .012], false); line.rotation.z = .56;
      }
    }
    badge(parent, 1.91);
  }
  function loungePiece(id, x, z, rotation, render) {
    const group = new THREE.Group(); group.name = `class24-lounge-${id}`;
    group.userData.furnitureId = `class24-lounge-${id}`;
    group.position.set(x, 0, z); group.rotation.y = rotation; root.add(group);
    render(group);
    group.updateMatrixWorld(true);
    // Include the thin outline as well as the furniture in its solid footprint.
    const bounds = new THREE.Box3().setFromObject(group, true);
    colliders.push({ id: `class24-lounge-${id}`, kind: 'information-lounge', furniture: id,
      x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2,
      halfX: (bounds.max.x - bounds.min.x) / 2, halfZ: (bounds.max.z - bounds.min.z) / 2 });
  }
  function sofa(parent, fabric) {
    for (const x of [-.88, .88]) for (const z of [-.31, .31]) {
      add(parent, cylinder, colors.frame, [x, .10, z], [.027, .20, .027], false);
    }
    roundedPart(parent, colors.frame, [0, .145, -.035], [2.15, .055, .75], false);
    roundedPart(parent, fabric, [0, .57, -.37], [2.15, .64, .21]);
    for (const x of [-1.065, 1.065]) roundedPart(parent, fabric, [x, .40, 0], [.15, .32, .91]);
    for (const x of [-.46, .46]) {
      roundedPart(parent, fabric, [x, .24, -.035], [.88, .12, .75], false);
      const pillow = roundedPart(parent, colors.butter, [x, .48, -.19], [.45, .38, .15], false);
      pillow.rotation.x = -.14; pillow.rotation.z = x < 0 ? -.11 : .11;
    }
  }
  function sideTable(parent) {
    add(parent, cylinder, colors.frame, [0, .24, 0], [.035, .48, .035], false);
    add(parent, cylinder, colors.frame, [0, .025, 0], [.24, .05, .24], false);
    add(parent, cylinder, colors.cream, [0, .49, 0], [.37, .07, .37]);
    for (const [index, material] of [colors.blue, colors.clay].entries()) {
      const book = roundedPart(parent, material, [0, .55 + index * .055, 0], [.35, .05, .24], false);
      book.rotation.y = index ? -.18 : .08;
    }
  }
  function floorLamp(parent) {
    add(parent, cylinder, colors.frame, [0, .025, 0], [.26, .05, .26], false);
    add(parent, cylinder, colors.frame, [0, .74, 0], [.021, 1.45, .021], false);
    add(parent, cylinder, colors.butter, [0, 1.47, 0], [.30, .28, .30]);
    add(parent, cylinder, colors.cream, [0, 1.315, 0], [.27, .018, .27], false);
  }
  for (const object of objects) {
    const group = new THREE.Group(); group.name = `info-object-${object.id}`;
    group.userData.infoObjectId = object.id;
    group.position.set(object.x, 0, object.z); group.rotation.y = object.rotation || 0; root.add(group);
    ({ welcome: story, product, values, people, careers }[object.kind] || story)(group);
    // Bounds enclose every plinth, board foot, and badge in the rendered object.
    const c = Math.abs(Math.cos(group.rotation.y)), s = Math.abs(Math.sin(group.rotation.y));
    colliders.push({ id: object.id, kind: 'information-object', x: object.x, z: object.z,
      halfX: object.halfX * c + object.halfZ * s, halfZ: object.halfZ * c + object.halfX * s });
    raycastTargets.push(group);
  }
  // A reading nook sits behind the exhibits. The middle remains an open route
  // from the office concourse to every information object, including careers.
  for (const [side, fabric] of [[-1, colors.blue], [1, colors.clay]]) {
    const rug = roundedPart(root, colors.lavenderLight, [side * 4.3, .014, 29.65], [3.1, .018, 2.2], false);
    rug.name = `info-lounge-rug-${side}`;
    loungePiece(`sofa-${side}`, side * 4.3, 30.05, Math.PI, group => sofa(group, fabric));
    loungePiece(`side-table-${side}`, side * 6.05, 30.05, 0, sideTable);
  }
  loungePiece('reading-lamp', -6.15, 28.8, 0, floorLamp);
  root.updateMatrixWorld(true);
  function pick(raycaster) {
    if (!raycaster || typeof raycaster.intersectObjects !== 'function') return null;
    const hits = raycaster.intersectObjects(raycastTargets, true);
    for (const hit of hits) {
      let part = hit.object;
      while (part && part !== root) {
        const object = byId.get(part.userData?.infoObjectId);
        if (object) return object;
        part = part.parent;
      }
    }
    return null;
  }
  return { colliders, objects, raycastTargets, pick, dispose() { root.removeFromParent(); } };
}
