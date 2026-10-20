import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COZY_FURNITURE, COZY_RUGS, TABLE_TENNIS_TABLES, getTableTennisState } from './lounge-layout.js';
import { createOfficeMaterial } from './render-materials.js';

/** Small shared meshes keep the lounge light; there are no texture downloads. */
export function createCozySpace({ scene, shape, box, allResources }) {
  const root = new THREE.Group(); root.name = 'cozy-lounge'; scene.add(root);
  const material = color => {
    const result = createOfficeMaterial(color); allResources.add(result); return result;
  };
  const colors = {
    // Preserve the shared layout keys while giving each lounge a clearer accent.
    sage: material('#789fc1'), sagePale: material('#d8cce8'), clay: material('#cd8068'),
    butter: material('#deb35b'), linen: material('#e5c8cf'), cream: material('#f5eee5'),
    lavender: material('#a698c8'), rose: material('#d6a0ad'),
    wood: material('#bd9475'), frame: material('#596577'), leaf: material('#7e9876'),
    glow: material('#f6d890'), coffee: material('#826451'),
    leafLight: material('#adc09a'), net: material('#596577'), ball: material('#fff7d8'),
  };
  const geometry = geometry => { allResources.add(geometry); return geometry; };
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  const pot = geometry(new THREE.CylinderGeometry(.31, .235, .46, 16));
  const shade = geometry(new THREE.CylinderGeometry(.19, .31, .4, 12));
  const rounded = geometry(new RoundedBoxGeometry(1, 1, 1, 3, .15));
  // A single softly dented sack silhouette, rather than a stack of spheres.
  const sack = geometry(new THREE.SphereGeometry(1, 20, 14));
  const attribute = sack.getAttribute('position');
  for (let index = 0; index < attribute.count; index++) {
    const x = attribute.getX(index), y = attribute.getY(index), z = attribute.getZ(index);
    const angle = Math.atan2(z, x);
    const bulge = 1 + .025 * Math.sin(angle * 3 + y * 2);
    const dent = Math.max(0, y) * .30 * Math.exp(-(x * x + z * z) * 3);
    const height = Math.min(.275 + .20 * Math.max(0, -z),
      Math.max(.035, (y + 1) * .30 + .17 * -z - dent));
    // Match the low social beanbags: a soft back and a short front support
    // keep the character's knees and planted feet beyond the upholstery.
    attribute.setXYZ(index, x * .67 * bulge, height, z * (z > 0 ? .38 : .69) * bulge);
  }
  sack.computeVertexNormals();
  const colliders = [];
  const add = (parent, geo, mat, position, scale, outlined = true) => shape(parent, geo, mat, position, scale, outlined);
  const groupAt = (item, name) => {
    const group = new THREE.Group(); group.name = name;
    group.position.set(item.x, 0, item.z); group.rotation.y = item.rotation || 0; root.add(group); return group;
  };
  const footprint = item => {
    const c = Math.abs(Math.cos(item.rotation || 0)), s = Math.abs(Math.sin(item.rotation || 0));
    colliders.push({ id: item.id, kind: 'cozy-furniture', furniture: item.type,
      x: item.x, z: item.z, halfX: item.halfX * c + item.halfZ * s, halfZ: item.halfZ * c + item.halfX * s });
  };
  function mug(parent, x, y, z) {
    add(parent, cylinder, colors.rose, [x, y, z], [.09, .17, .09]);
    add(parent, cylinder, colors.coffee, [x, y + .087, z], [.065, .006, .065], false);
    // A tiny C-shaped handle is unnecessary at the normal camera distance.
  }
  for (const rug of COZY_RUGS) {
    const group = groupAt(rug, 'lounge-rug');
    add(group, cylinder, colors.frame, [0, .014, 0], [rug.width / 2, .018, rug.length / 2], false);
    add(group, cylinder, colors[rug.color], [0, .026, 0], [rug.width / 2 - .12, .015, rug.length / 2 - .12], false);
    add(group, cylinder, colors.cream, [0, .037, 0], [rug.width / 2 - .24, .008, rug.length / 2 - .24], false);
    add(group, cylinder, colors[rug.color], [0, .044, 0], [rug.width / 2 - .3, .007, rug.length / 2 - .3], false);
  }
  for (const item of COZY_FURNITURE) {
    const group = groupAt(item, item.id); footprint(item);
    group.userData.furnitureId = item.id;
    if (item.type === 'beanbag') {
      const upholstery = item.color === 'sage' ? colors.lavender : colors[item.color];
      add(group, sack, upholstery, [0, 0, 0], [1, 1, 1]);
      add(group, rounded, upholstery, [0, .275, 0], [.86, .05, .58], false);
      // Small stitched label, kept on the back of the same organic cushion.
      add(group, box, colors.cream, [0, .31, -.68], [.12, .055, .015], false);
    } else if (item.type === 'sofa') {
      const upholstery = colors[item.color];
      for (const x of [-.98, .98]) for (const z of [-.38, .38]) {
        add(group, cylinder, colors.frame, [x, .10, z], [.026, .20, .026], false);
      }
      // Perch on the front lip instead of burying the short-legged rig in a
      // deep cushion. A thin lower frame keeps the furniture visually light.
      add(group, rounded, colors.frame, [0, .145, -.04], [2.21, .055, .76], false);
      add(group, rounded, upholstery, [0, .24, -.04], [2.21, .12, .76], false);
      add(group, rounded, upholstery, [0, .57, -.43], [2.2, .60, .19]);
      for (const side of [-1, 1]) {
        add(group, rounded, upholstery, [side * 1.14, .40, -.01], [.16, .32, 1.02]);
        const pillow = add(group, rounded, side < 0 ? colors.butter : colors.lavender,
          [side * .75, .48, -.22], [.37, .34, .19], false);
        pillow.rotation.set(.12, side * -.12, side * -.18);
      }
      add(group, rounded, colors.linen, [1.14, .577, .16], [.20, .035, .44], false);
      add(group, rounded, colors.linen, [1.225, .40, .16], [.025, .32, .44], false);
    } else if (item.type === 'ottoman') {
      add(group, rounded, colors.frame, [0, .075, 0], [.92, .10, .78], false);
      add(group, rounded, colors.rose, [0, .205, 0], [1.1, .19, .96], false);
      add(group, rounded, colors.cream, [0, .301, -.10], [.79, .006, .012], false);
    } else if (item.type === 'side-table') {
      add(group, cylinder, colors.wood, [0, .48, 0], [.38, .055, .38]);
      add(group, cylinder, colors.frame, [0, .25, 0], [.035, .46, .035], false);
      add(group, cylinder, colors.frame, [0, .035, 0], [.26, .045, .26], false);
      const book = add(group, rounded, colors.clay, [-.09, .53, .10], [.35, .05, .25], false); book.rotation.y = -.13;
      mug(group, .20, .595, -.15);
    } else if (item.type === 'coffee-table') {
      // A slim oval powder-coated top and three light legs leave air beneath.
      add(group, cylinder, colors.cream, [0, .48, 0], [.76, .055, .46]);
      for (const [x, z] of [[-.43, -.20], [.43, -.20], [0, .29]]) add(group, cylinder, colors.frame, [x, .23, z], [.027, .46, .027], false);
      add(group, rounded, colors.sage, [-.23, .54, .04], [.44, .055, .32], false);
      add(group, box, colors.cream, [-.23, .572, .04], [.40, .015, .28], false);
      const book = add(group, rounded, colors.clay, [-.21, .603, .03], [.41, .045, .29], false); book.rotation.y = -.19;
      mug(group, .31, .592, -.08);
    } else if (item.type === 'plant') {
      add(group, pot, colors.clay, [0, .23, 0], [1, 1, 1]);
      add(group, cylinder, colors.wood, [0, .463, 0], [.275, .012, .275], false);
      for (let leaf = 0; leaf < 5; leaf++) {
        const angle = leaf * Math.PI * 2 / 5 + .15;
        const height = 1.05 + (leaf % 3) * .16;
        const stem = add(group, cylinder, colors.leaf, [.06 * Math.sin(angle), (height + .44) / 2, .06 * Math.cos(angle)], [.014, height - .44, .014], false);
        stem.rotation.z = -.10 * Math.sin(angle); stem.rotation.x = .10 * Math.cos(angle);
        const blade = add(group, sphere, leaf % 2 ? colors.leafLight : colors.leaf,
          [.15 * Math.sin(angle), height, .15 * Math.cos(angle)], [.12, .32, .055], false);
        blade.rotation.set(.12 * Math.cos(angle), angle, -.12 * Math.sin(angle));
      }
    } else if (item.type === 'lamp') {
      add(group, cylinder, colors.frame, [0, .025, 0], [.23, .05, .23], false);
      add(group, cylinder, colors.frame, [0, .81, 0], [.024, 1.57, .024], false);
      add(group, shade, colors.butter, [0, 1.64, 0], [1, 1, 1]);
      // Warm material, with no additional realtime light or shadow pass.
      add(group, cylinder, colors.glow, [0, 1.437, 0], [.265, .015, .265], false);
    } else if (item.type === 'bookshelf') {
      for (const x of [-.70, .70]) for (const z of [-.18, .18]) add(group, cylinder, colors.frame, [x, .66, z], [.024, 1.32, .024], false);
      for (const y of [.12, .7, 1.28]) add(group, rounded, colors.cream, [0, y, 0], [1.48, .055, .46]);
      for (let book = 0; book < 6; book++) {
        const height = .27 + (book % 3) * .07;
        add(group, rounded, [colors.sage, colors.clay, colors.butter, colors.lavender, colors.rose][book % 5], [-.53 + book * .18, .728 + height / 2, .02], [.11, height, .27], false);
      }
      add(group, rounded, colors.sagePale, [.27, .238, 0], [.45, .18, .34], false);
      add(group, box, colors.cream, [.27, .36, 0], [.38, .035, .3], false);
    }
  }
  const balls = TABLE_TENNIS_TABLES.map((table, index) => {
    const group = groupAt(table, 'table-tennis');
    colliders.push({ x: table.x, z: table.z, halfX: table.width / 2, halfZ: table.length / 2 });
    add(group, rounded, colors.sage, [0, table.topY - .035, 0], [table.width - .03, .07, table.length - .03]);
    // Court boundary and centre lines sit just above the shared top plane.
    for (const x of [-table.width / 2 + .06, table.width / 2 - .06]) add(group, box, colors.cream, [x, table.topY + .003, 0], [.025, .008, table.length - .1], false);
    for (const z of [-table.length / 2 + .06, table.length / 2 - .06]) add(group, box, colors.cream, [0, table.topY + .003, z], [table.width - .1, .008, .025], false);
    add(group, box, colors.cream, [0, table.topY + .003, 0], [.022, .008, table.length - .1], false);
    for (const x of [-.86, .86]) for (const z of [-1.49, 1.49]) add(group, cylinder, colors.frame, [x, .42, z], [.028, .84, .028], false);
    for (const x of [-.86, .86]) add(group, rounded, colors.cream, [x, .20, 0], [.045, .045, 3.04], false);
    for (const x of [-table.width / 2 + .035, table.width / 2 - .035]) add(group, cylinder, colors.frame, [x, table.topY + .105, 0], [.025, .27, .025], false);
    add(group, box, colors.cream, [0, table.topY + .22, 0], [table.width - .025, .025, .025], false);
    for (let strand = -5; strand <= 5; strand++) add(group, box, colors.net, [strand * (table.width - .08) / 10, table.topY + .11, 0], [.008, .19, .008], false);
    for (const y of [.065, .135]) add(group, box, colors.net, [0, table.topY + y, 0], [table.width - .05, .008, .008], false);
    const ball = add(root, sphere, colors.ball, [table.x, 1.2, table.z], [.035, .035, .035], false);
    ball.name = `tennis-ball-${index}`;
    return ball;
  });
  function update(nowMs) {
    balls.forEach((ball, index) => {
      const position = getTableTennisState(nowMs, index).ball;
      ball.position.set(position.x, position.y, position.z);
    });
  }
  update(0);
  return { update, colliders, dispose() { root.removeFromParent(); } };
}
