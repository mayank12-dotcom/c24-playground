/** Soft outdoor lounges share their own seats, separate from application desks. */
export const SOCIAL_ROOMS = Object.freeze([
  Object.freeze({ id: 'social-common', name: 'Common Room', key: 'common', x: -29, z: -18, width: 14, depth: 11, palette: 'blue' }),
  Object.freeze({ id: 'social-reading', name: 'Reading Room', key: 'reading', x: 29, z: -32, width: 15, depth: 11, palette: 'terracotta' }),
]);

const point = (x, z) => Object.freeze({ x, z });

// The back sofa seats two companions at the cushion's front edge. Their hips
// stay supported while both knees and feet hang beyond the upholstery.
// Beanbags leave a wide central lane, with clear approaches on their inward sides.
export const SOCIAL_SEATS = Object.freeze(SOCIAL_ROOMS.flatMap((room, roomIndex) => [
  ...[-1, 1].map((side, index) => Object.freeze({
    id: `lounge-${room.key}-${index}`, roomId: room.id, kind: 'couch',
    x: room.x + side * .78, z: room.z - 2.36,
    rotation: -side * .34, seatHeight: .30,
    colliderId: `social-couch-${room.key}`,
    approach: point(room.x + side * .78, room.z - 1.4),
    exit: point(room.x + side * .78, room.z - 1.4),
    occupiedBy: `social-${roomIndex * 2 + index}`,
  })),
  ...[-1, 1].map((side, index) => Object.freeze({
    id: `lounge-${room.key}-${index + 2}`, roomId: room.id, kind: 'beanbag',
    x: room.x + side * 3.16, z: room.z + .5,
    rotation: -side * Math.PI / 2, seatHeight: .30,
    colliderId: `social-beanbag-${room.key}-${index}`,
    approach: point(room.x + side * 2.15, room.z + .5),
    exit: point(room.x + side * 2.15, room.z + .5),
  })),
]));

export const SOCIAL_FURNITURE = Object.freeze(SOCIAL_ROOMS.flatMap(room => [
  Object.freeze({ id: `social-couch-${room.key}`, roomId: room.id, kind: 'couch', x: room.x, z: room.z - 2.7,
    rotation: 0, halfX: 1.95, halfZ: .65, palette: room.palette }),
  ...SOCIAL_SEATS.filter(seat => seat.roomId === room.id && seat.kind === 'beanbag').map((seat, index) => Object.freeze({
    id: seat.colliderId, roomId: room.id, kind: 'beanbag', x: room.x + (index ? 1 : -1) * 3.5, z: room.z + .5,
    rotation: seat.rotation, halfX: .71, halfZ: .73, palette: index ? 'ochre' : 'lavender',
  })),
  ...[-1, 1].map(side => Object.freeze({
    id: `social-side-table-${room.key}-${side}`, roomId: room.id, kind: 'side-table',
    x: room.x + side * 2.75, z: room.z - 3.45,
    rotation: 0, halfX: .42, halfZ: .42, palette: room.palette,
  })),
  Object.freeze({ id: `social-coffee-table-${room.key}`, roomId: room.id, kind: 'coffee-table',
    x: room.x - 3.65, z: room.z - 1.4, rotation: .18, halfX: .82, halfZ: .5, palette: room.palette }),
  Object.freeze({ id: `social-ottoman-${room.key}`, roomId: room.id, kind: 'ottoman',
    x: room.x + 3.65, z: room.z - 1.4, rotation: -.15, halfX: .61, halfZ: .55, palette: room.key === 'common' ? 'rose' : 'ochre' }),
  Object.freeze({ id: `social-lamp-${room.key}`, roomId: room.id, kind: 'lamp',
    x: room.x + 3.95, z: room.z - 3.65, rotation: 0, halfX: .38, halfZ: .38, palette: 'ochre' }),
  Object.freeze({ id: `social-bookshelf-${room.key}`, roomId: room.id, kind: 'bookshelf',
    x: room.x - 4.45, z: room.z + 2.9, rotation: -.12, halfX: .8, halfZ: .29, palette: room.palette }),
  ...[-1, 1].map((side, index) => Object.freeze({
    id: `social-plant-${room.key}-${index}`, roomId: room.id, kind: 'plant',
    x: room.x + side * 5.2, z: room.z - 3.65,
    rotation: side * .3, halfX: .39, halfZ: .39, palette: side < 0 ? 'terracotta' : 'blue',
  })),
]));

export const SOCIAL_RUGS = Object.freeze(SOCIAL_ROOMS.map(room => Object.freeze({
  roomId: room.id, x: room.x, z: room.z - .35, width: 10.4, length: 6.2,
  rotation: room.key === 'common' ? .025 : -.035, palette: room.key === 'common' ? 'rosePale' : 'bluePale',
})));

// IDs survive rotation so only the seat owner can ignore its furnishing.
export const SOCIAL_COLLIDERS = Object.freeze(SOCIAL_FURNITURE.map(item => {
  const c = Math.abs(Math.cos(item.rotation)), s = Math.abs(Math.sin(item.rotation));
  return Object.freeze({ id: item.id, roomId: item.roomId, kind: item.kind,
    x: item.x, z: item.z, halfX: item.halfX * c + item.halfZ * s,
    halfZ: item.halfZ * c + item.halfX * s });
}));
