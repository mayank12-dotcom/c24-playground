import { COZY_FURNITURE } from './lounge-layout.js';
import { GARDEN_PROPS } from './garden-layout.js';
import { SOCIAL_FURNITURE } from './social-layout.js';

// These are the same two sofas rendered in the information gallery. Keeping
// their origins here lets clients and the shared presence store agree on every
// cushion without importing a renderer or a browser-only module.
export const INFO_LOUNGE_FURNITURE = Object.freeze([-1, 1].map(side => Object.freeze({
  id: `class24-lounge-sofa-${side}`, kind: 'couch', source: 'information',
  roomId: 'class24-info', x: side * 4.3, z: 30.05, rotation: Math.PI,
  halfX: 1.16, halfZ: .54,
})));

const sittable = kind => ['sofa', 'couch', 'armchair', 'beanbag', 'ottoman'].includes(kind);
const immutablePoint = (x, z) => Object.freeze({ x, z });
const pointAt = (item, x, z) => immutablePoint(
  item.x + Math.cos(item.rotation) * x + Math.sin(item.rotation) * z,
  item.z - Math.sin(item.rotation) * x + Math.cos(item.rotation) * z,
);
const part = (label, x, z, halfX, halfZ, profile = 'body') =>
  Object.freeze({ label, x, z, halfX, halfZ, profile });

const furnishings = [
  ...COZY_FURNITURE.filter(item => sittable(item.type)).map(item => ({ ...item, kind: item.type === 'sofa' ? 'couch' : item.type, source: 'cozy' })),
  ...GARDEN_PROPS.filter(item => sittable(item.kind)).map(item => ({ ...item, kind: item.kind === 'sofa' ? 'couch' : item.kind, source: 'garden' })),
  ...INFO_LOUNGE_FURNITURE,
  ...SOCIAL_FURNITURE.filter(item => item.kind === 'ottoman').map(item => ({ ...item, source: 'social' })),
];

function structureParts(item) {
  const parts = [];
  const legs = (xs, zs, radius) => {
    for (const x of xs) for (const z of zs) parts.push(part(`leg:${x}:${z}`, x, z, radius, radius, 'feet'));
  };
  if (item.kind === 'beanbag') {
    parts.push(part('raised-back', 0, -.48, .66 + .30, .18 + .16));
  } else if (item.kind === 'couch') {
    const garden = item.source === 'garden', info = item.source === 'information';
    const backZ = garden ? -.32 : info ? -.37 : -.43;
    const backHalfX = garden ? 1.02 : info ? 1.075 : 1.10;
    const backHalfZ = garden ? .127 : info ? .105 : .095;
    parts.push(part('backrest', 0, backZ, backHalfX + .53, backHalfZ + .27));
    for (const side of [-1, 1]) {
      parts.push(part(`arm:${side}`, side * (garden ? 1 : info ? 1.065 : 1.14), garden || !info ? -.01 : 0,
        (garden ? .06 : info ? .075 : .08) + .30, (garden ? .40 : info ? .455 : .51) + .27));
    }
    legs(garden ? [-.94, .94] : info ? [-.88, .88] : [-.98, .98],
      garden ? [-.33, .33] : info ? [-.31, .31] : [-.38, .38], garden ? .032 : info ? .027 : .026);
    if (garden) parts.push(part('frame', 0, 0, 1.05, .41, 'feet'));
  } else if (item.kind === 'armchair') {
    parts.push(part('backrest', 0, -.32, .52 + .53, .136 + .27));
    for (const side of [-1, 1]) parts.push(part(`arm:${side}`, side * .49, -.05, .07 + .30, .40 + .27));
    legs([-.42, .42], [-.32, .32], .035);
    parts.push(part('frame', 0, 0, .515, .415, 'feet'));
  } else if (item.kind === 'ottoman' && item.source === 'garden') {
    legs([-.34, .34], [-.23, .23], .028);
  } else if (item.kind === 'ottoman') {
    parts.push(part('low-base', 0, 0, .46, .39, 'feet'));
  }
  return Object.freeze(parts);
}

/** Local structural rectangles keep the back, arms and floor supports solid
 * while only the claimed cushion permits a seated body. Body rectangles already
 * include the current rig's horizontal envelope; foot rectangles remain raw.
 */
export const FURNITURE_SEAT_STRUCTURES = Object.freeze(Object.fromEntries(furnishings.map(item => [item.id,
  Object.freeze({ ...item, parts: structureParts(item) }),
])));

function seatOffsets(item) {
  if (item.kind === 'couch') {
    const x = .53;
    const z = item.source === 'garden' ? .32 : item.source === 'information' ? .34 : .35;
    return [[-x, z], [x, z]];
  }
  return [[0, item.kind === 'ottoman' ? (item.source === 'garden' ? .24 : .36) : .34]];
}

function approachFor(item, seat) {
  const c = Math.abs(Math.cos(item.rotation)), s = Math.abs(Math.sin(item.rotation));
  const halfX = item.halfX * c + item.halfZ * s;
  const halfZ = item.halfZ * c + item.halfX * s;
  const facing = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  // The ordinary furniture footprint contains the avatar clearance. Leave an
  // additional turn lane for rigid furnishings before beginning to lower.
  const margin = .32 + (item.kind === 'beanbag' ? 0 : .36) + .08;
  const distances = [['x', halfX], ['z', halfZ]]
    .filter(([axis]) => Math.abs(facing[axis]) > 1e-8)
    .map(([axis, half]) => (item[axis] + Math.sign(facing[axis]) * (half + margin) - seat[axis]) / facing[axis]);
  const distance = Math.max(.8, Math.min(...distances));
  return immutablePoint(seat.x + facing.x * distance, seat.z + facing.z * distance);
}

/** Every free chair-like furnishing has one independently leased cushion;
 * two-cushion sofas expose two slots rather than one claim for the whole sofa.
 * Existing social companions keep their original reserved couch positions.
 */
export const FURNITURE_SEATS = Object.freeze(furnishings.flatMap(item => seatOffsets(item).map(([x, z], index) => {
  const seat = pointAt(item, x, z), approach = approachFor(item, seat);
  return Object.freeze({
    id: `${item.id}-seat-${index}`, kind: item.kind, source: item.source,
    ...(item.roomId ? { roomId: item.roomId } : {}),
    ...seat, rotation: item.rotation, seatHeight: .30,
    colliderId: item.id, approach, exit: approach,
  });
})));
