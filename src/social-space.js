import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SOCIAL_COLLIDERS, SOCIAL_FURNITURE, SOCIAL_RUGS, SOCIAL_SEATS } from './social-layout.js';
import { createOfficeMaterial } from './render-materials.js';

/** Desk-free office lounges share their upholstery and small primitive meshes. */
export function createSocialSpace({ scene, shape, box, allResources }) {
  const root = new THREE.Group(); root.name = 'social-lounges'; scene.add(root);
  const material = color => {
    const resource = createOfficeMaterial(color); allResources.add(resource); return resource;
  };
  const colors = {
    blue: material('#789fc1'), terracotta: material('#cd8068'), ochre: material('#deb35b'),
    lavender: material('#a698c8'), rose: material('#d6a0ad'),
    linen: material('#ead4cb'), bluePale: material('#c9dae8'), rosePale: material('#e5c8cf'), cream: material('#f5eee5'),
    glow: material('#f6d890'), coffee: material('#826451'), wood: material('#bd9475'),
    frame: material('#596577'), leaf: material('#77956e'), leafLight: material('#b2c49e'), soil: material('#897e65'),
  };
  const geometry = resource => { allResources.add(resource); return resource; };
  const rounded = geometry(new RoundedBoxGeometry(1, 1, 1, 3, .12));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 14));
  const pot = geometry(new THREE.CylinderGeometry(.32, .24, .46, 16));
  const shade = geometry(new THREE.CylinderGeometry(.19, .31, .4, 12));
  const sack = geometry(new THREE.SphereGeometry(1, 20, 14));
  const positions = sack.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const angle = Math.atan2(z, x), bulge = 1 + .025 * Math.sin(angle * 3 + y * 2);
    const dent = Math.max(0, y) * .30 * Math.exp(-(x * x + z * z) * 3);
    const height = Math.min(.275 + .20 * Math.max(0, -z),
      Math.max(.035, (y + 1) * .30 + .17 * -z - dent));
    // Keep the raised back soft, but taper the front underneath the knees.
    positions.setXYZ(index, x * .67 * bulge, height, z * (z > 0 ? .38 : .69) * bulge);
  }
  sack.computeVertexNormals();
  const add = (parent, geo, mat, position, scale, outlined = true) => shape(parent, geo, mat, position, scale, outlined);
  const at = (item, name) => {
    const group = new THREE.Group(); group.name = name;
    group.position.set(item.x, 0, item.z); group.rotation.y = item.rotation || 0; root.add(group); return group;
  };
  function book(parent, x, y, z, color = 'blue', angle = 0) {
    const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = angle; parent.add(group);
    add(group, rounded, colors[color], [0, 0, 0], [.38, .055, .27], false);
    add(group, rounded, colors.cream, [0, .002, .006], [.34, .031, .25], false);
  }
  function mug(parent, x, y, z) {
    add(parent, cylinder, colors.rose, [x, y + .075, z], [.075, .15, .075], false);
    add(parent, cylinder, colors.coffee, [x, y + .152, z], [.056, .005, .056], false);
  }
  for (const rug of SOCIAL_RUGS) {
    const group = at(rug, `social-rug-${rug.roomId}`);
    add(group, cylinder, colors.frame, [0, .015, 0], [rug.width / 2, .018, rug.length / 2], false);
    add(group, cylinder, colors[rug.palette], [0, .027, 0], [rug.width / 2 - .12, .015, rug.length / 2 - .12], false);
    add(group, cylinder, colors.cream, [0, .037, 0], [rug.width / 2 - .24, .007, rug.length / 2 - .24], false);
    add(group, cylinder, colors[rug.palette], [0, .043, 0], [rug.width / 2 - .30, .007, rug.length / 2 - .30], false);
  }
  for (const item of SOCIAL_FURNITURE) {
    const group = at(item, item.id);
    group.userData.furnitureId = item.id;
    if (item.kind === 'couch') {
      const upholstery = colors[item.palette];
      // Short cushions support the rear of the pelvis at the .30 seat plane.
      // Seat roots sit at their front edge, leaving bent legs outside the sofa.
      for (const z of [-.43, .24]) add(group, rounded, colors.frame, [0, .145, z], [3.62, .055, .055], false);
      for (const side of [-1, 1]) {
        add(group, rounded, upholstery, [side * .80, .24, -.09], [1.55, .12, .76], false);
        const back = add(group, rounded, upholstery, [side * .80, .57, -.46], [1.55, .62, .18]);
        back.rotation.x = -.08;
        add(group, rounded, upholstery, [side * 1.76, .40, -.02], [.23, .32, 1.06]);
        const pillow = add(group, rounded, side < 0 ? colors.ochre : colors.lavender,
          [side * 1.30, .48, -.25], [.36, .35, .18], false);
        pillow.rotation.set(.14, side * -.12, side * -.18);
        add(group, rounded, colors.frame, [side * 1.78, .145, -.02], [.055, .055, 1.08], false);
        for (const z of [-.43, .43]) add(group, cylinder, colors.frame, [side * 1.78, .24, z], [.025, .46, .025], false);
      }
      // A folded linen throw drapes over one arm rather than adding another
      // bulky cushion under the avatar or changing its shared seat height.
      add(group, rounded, colors.linen, [1.78, .57, .12], [.26, .045, .49], false);
      add(group, rounded, colors.linen, [1.88, .39, .12], [.04, .34, .49], false);
    } else if (item.kind === 'beanbag') {
      add(group, sack, colors[item.palette], [0, 0, 0], [1, 1, 1]);
      // The pelvis is supported near the short front edge, with the lower legs
      // in front of the sack rather than disappearing into its soft volume.
      add(group, rounded, colors[item.palette], [0, .275, 0], [.86, .05, .58], false);
      add(group, rounded, colors.cream, [0, .31, -.68], [.12, .055, .015], false);
    } else if (item.kind === 'coffee-table') {
      add(group, cylinder, colors.cream, [0, .45, 0], [.77, .06, .45]);
      for (const [x, z] of [[-.42, -.2], [.42, -.2], [0, .27]]) {
        add(group, cylinder, colors.frame, [x, .22, z], [.026, .44, .026], false);
      }
      book(group, -.22, .51, .03, item.palette, -.14);
      book(group, -.20, .565, .04, 'ochre', .08);
      mug(group, .30, .48, -.09);
    } else if (item.kind === 'side-table') {
      add(group, cylinder, colors.wood, [0, .48, 0], [.38, .055, .38]);
      add(group, cylinder, colors.frame, [0, .25, 0], [.035, .46, .035], false);
      add(group, cylinder, colors.frame, [0, .035, 0], [.26, .045, .26], false);
      mug(group, .12, .51, -.06); book(group, -.10, .54, .06, item.palette, .2);
    } else if (item.kind === 'ottoman') {
      add(group, rounded, colors.frame, [0, .075, 0], [.92, .10, .78], false);
      add(group, rounded, colors[item.palette], [0, .205, 0], [1.1, .19, .96], false);
      add(group, rounded, colors.cream, [0, .301, -.10], [.79, .006, .012], false);
    } else if (item.kind === 'lamp') {
      add(group, cylinder, colors.frame, [0, .03, 0], [.26, .06, .26], false);
      add(group, cylinder, colors.frame, [0, .81, 0], [.022, 1.56, .022], false);
      add(group, shade, colors.ochre, [0, 1.64, 0], [1, 1, 1]);
      // A warm material suggests lamplight without an extra realtime light.
      add(group, cylinder, colors.glow, [0, 1.437, 0], [.265, .015, .265], false);
    } else if (item.kind === 'bookshelf') {
      for (const x of [-.7, .7]) for (const z of [-.18, .18]) {
        add(group, cylinder, colors.frame, [x, .60, z], [.024, 1.2, .024], false);
      }
      for (const y of [.14, .65, 1.16]) add(group, rounded, colors.wood, [0, y, 0], [1.48, .055, .46]);
      for (let index = 0; index < 5; index++) {
        const height = .25 + (index % 3) * .06;
        add(group, rounded, [colors.blue, colors.terracotta, colors.ochre, colors.lavender, colors.rose][index % 5],
          [-.53 + index * .18, .678 + height / 2, .01], [.11, height, .27], false);
      }
      book(group, .28, .21, 0, item.palette); book(group, .28, .265, 0, 'ochre', -.12);
      add(group, pot, colors.terracotta, [.36, 1.27, 0], [.4, .4, .4], false);
      add(group, sphere, colors.leaf, [.36, 1.49, 0], [.16, .19, .14], false);
    } else {
      add(group, pot, colors[item.palette], [0, .23, 0], [1, 1, 1]);
      add(group, cylinder, colors.soil, [0, .468, 0], [.29, .014, .29], false);
      for (let leaf = 0; leaf < 6; leaf++) {
        const angle = leaf * Math.PI / 3;
        const height = .95 + (leaf % 3) * .13;
        const stem = add(group, cylinder, colors.leaf, [.07 * Math.sin(angle), (.47 + height) / 2, .07 * Math.cos(angle)], [.014, height - .47, .014], false);
        stem.rotation.x = .12 * Math.cos(angle); stem.rotation.z = -.12 * Math.sin(angle);
        const blade = add(group, sphere, leaf % 2 ? colors.leafLight : colors.leaf,
          [.17 * Math.sin(angle), height, .17 * Math.cos(angle)], [.13, .31, .055], false);
        blade.rotation.set(.16 * Math.cos(angle), angle, -.16 * Math.sin(angle));
      }
    }
  }
  return {
    colliders: SOCIAL_COLLIDERS, seats: SOCIAL_SEATS,
    update() {},
    dispose() { root.removeFromParent(); },
  };
}
