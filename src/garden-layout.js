/** Shared office plan. Pure data keeps rendering, walking, and presence aligned. */
export const GARDEN_SPAWN = { x: 0, z: 4.8 };
export const GARDEN_PATH_WIDTH = 2.4;
export const GARDEN_LAYOUT_SEED = 24;

// One continuous indoor floor joins every department, lounge and common area.
// The garden-prefixed exports below remain stable for shared-seat consumers.
export const OFFICE_FLOOR = Object.freeze({ x: 0, z: -4, width: 82, depth: 80 });
export const OFFICE_PERIMETER_WALLS = Object.freeze([
  { id: 'office-envelope-back', side: 'back', x: 0, z: -44, halfX: 41, halfZ: .12, height: 1.6 },
  { id: 'office-envelope-front', side: 'front', x: 0, z: 36, halfX: 41, halfZ: .12, height: .7 },
  { id: 'office-envelope-left', side: 'left', x: -41, z: -4, halfX: .12, halfZ: 40.12, height: 1.35 },
  { id: 'office-envelope-right', side: 'right', x: 41, z: -4, halfX: .12, halfZ: 40.12, height: 1.35 },
].map(Object.freeze));

// New office fixtures occupy unused perimeter/lobby space. They are not seats,
// and none intrude into existing bot routes, desk approaches or lounge exits.
// These are exact visible footprints; collision applies avatar clearance once.
export const OFFICE_PROPS = Object.freeze([
  { id: 'office-reception', kind: 'reception', x: -22, z: 27, halfX: 3.6, halfZ: .8, height: 1.05, palette: 'blue' },
  { id: 'office-cafe-counter', kind: 'cafe-counter', x: 30, z: 19, halfX: 3.6, halfZ: .75, height: 1.05, palette: 'clay' },
  { id: 'office-back-storage', kind: 'storage', x: 0, z: -41, halfX: 4.2, halfZ: .65, height: 1.2, palette: 'butter' },
  { id: 'office-left-storage', kind: 'storage', x: -38.5, z: -33, halfX: .65, halfZ: 3.1, height: 1.2, palette: 'lavender' },
  { id: 'office-right-storage', kind: 'storage', x: 38.5, z: -3, halfX: .65, halfZ: 2.5, height: 1.2, palette: 'blue' },
  { id: 'office-printer', kind: 'printer', x: 37.8, z: -17, halfX: .7, halfZ: .65, height: 1.05, palette: 'rose' },
].map(item => Object.freeze({ rotation: 0, ...item })));

const workspacePositions = [
  [0, -3], [-13, -3], [13, -3],
  [-13, -17], [0, -17], [13, -17],
  [-13, -31], [0, -31], [13, -31],
];

// Every visitor shares one connected office plan. Stable furniture coordinates
// keep shared chairs aligned while cutaway rooms and broad halls organize them.
export const GARDEN_ROOMS = [
  { id: 'studio', name: 'Design Studio', kind: 'workspace', x: -6.5, z: -3, width: 22.5, depth: 10.5, workspaceIndices: [0, 1], palette: 'blue' },
  { id: 'quiet', name: 'Focus Office', kind: 'workspace', x: 13, z: -3, width: 10.5, depth: 9, workspaceIndices: [2], palette: 'lavender' },
  { id: 'lab', name: 'Team Workspace', kind: 'workspace', x: 0, z: -17, width: 36, depth: 10, workspaceIndices: [3, 4, 5], palette: 'rose' },
  { id: 'workshop', name: 'Project Room', kind: 'workspace', x: -13, z: -31, width: 10, depth: 9.5, workspaceIndices: [6], palette: 'clay' },
  { id: 'loft', name: 'Collaboration Studio', kind: 'workspace', x: 6.5, z: -31, width: 23, depth: 10.5, workspaceIndices: [7, 8], palette: 'butter' },
  { id: 'social-common', name: 'Team Lounge', kind: 'social', x: -29, z: -18, width: 14, depth: 11, workspaceIndices: [], palette: 'clay', entranceSide: 'front', pathZ: -10 },
  { id: 'social-reading', name: 'Reading Room', kind: 'social', x: 29, z: -32, width: 15, depth: 11, workspaceIndices: [], palette: 'lavender', entranceSide: 'front', pathZ: -24 },
  { id: 'class24-info', name: 'CARS24', kind: 'information', x: 0, z: 26, width: 14, depth: 10, workspaceIndices: [], palette: 'blue', entranceSide: 'back', pathZ: 18 },
];

export const GARDEN_WORKSPACES = workspacePositions.map(([x, z], index) => ({
  id: `garden-workspace-${index}`, index, x, z, width: 8, depth: 8,
  roomId: GARDEN_ROOMS.find(room => room.workspaceIndices.includes(index)).id,
}));

// Generous cross halls branch into the quieter social rooms. The central
// arrival atrium continues between the lounges to the information gallery.
export const GARDEN_PATHS = [
  ...[-6.5, 6.5].map(x => ({ x, z: -16.5, width: GARDEN_PATH_WIDTH, length: 43, direction: 'vertical' })),
  ...[{ x: 0, z: 4.8, width: 42 }, { x: -8.5, z: -10, width: 59 },
    { x: 8.5, z: -24, width: 59 }, { x: 0, z: -38, width: 42 }]
    .map(path => ({ ...path, length: GARDEN_PATH_WIDTH, direction: 'horizontal' })),
  ...GARDEN_WORKSPACES.map(workspace => {
    const room = GARDEN_ROOMS.find(item => item.id === workspace.roomId);
    const front = room.z + room.depth / 2;
    const crossPath = workspace.z === -3 ? 4.8 : workspace.z === -17 ? -10 : -24;
    return { x: workspace.x, z: (front + crossPath) / 2, width: GARDEN_PATH_WIDTH, length: crossPath - front, direction: 'vertical' };
  }),
  { x: 0, z: 13, width: 3.4, length: 16.4, direction: 'vertical' },
  ...GARDEN_ROOMS.filter(room => room.kind !== 'workspace').map(room => {
    const entrance = room.z + (room.entranceSide === 'back' ? -1 : 1) * room.depth / 2;
    return { x: room.x, z: (entrance + room.pathZ) / 2, width: 3.2, length: Math.abs(room.pathZ - entrance) + .1, direction: 'vertical' };
  }),
];

// Keep the legacy curve export for consumers, but align its straight edges to
// the hall floors. Rendering and collision now share the same rectangular plan.
export const GARDEN_PATH_CURVES = GARDEN_PATHS.map(path => {
  const horizontal = path.direction === 'horizontal';
  const length = horizontal ? path.width : path.length;
  const points = [0, .25, .5, .75, 1].map(t => {
    const along = (t - .5) * length;
    return horizontal ? [path.x + along, path.z] : [path.x, path.z + along];
  });
  return { points, width: horizontal ? path.length : path.width };
});

// Compatibility exports: outdoor terrain no longer surrounds the office.
export const GARDEN_LAWNS = [];

export const GARDEN_TERRACES = GARDEN_ROOMS.map(zone => ({
  roomId: zone.id, x: zone.x, z: zone.z, width: zone.width, depth: zone.depth,
  rotation: 0, palette: zone.palette, shape: 'rectangle',
}));

export const GARDEN_PLANTING_ISLANDS = [];

export const GARDEN_JUNCTIONS = [
  ...[-6.5, 6.5].flatMap(x => [4.8, -10, -24, -38].map(z => ({ x, z, radius: 1.9 }))),
  { x: 0, z: 4.8, radius: 2.6 }, { x: 0, z: 19.4, radius: 2.2 },
  { x: -29, z: -10, radius: 2.1 }, { x: 29, z: -24, radius: 2.1 },
];

export const GARDEN_DOORWAYS = GARDEN_ROOMS.flatMap(room => {
  if (room.kind !== 'workspace') return [{ roomId: room.id, x: room.x,
    z: room.z + (room.entranceSide === 'back' ? -1 : 1) * room.depth / 2,
    width: 3.8, side: room.entranceSide }];
  const avenueXs = [-6.5, 6.5].filter(x => Math.abs(x - room.x) < room.width / 2);
  const frontXs = [...new Set([
    ...room.workspaceIndices.map(index => GARDEN_WORKSPACES[index].x),
    ...avenueXs,
  ])].sort((a, b) => a - b);
  return [
    ...frontXs.map(x => ({ roomId: room.id, x, z: room.z + room.depth / 2, width: 3.8, side: 'front' })),
    ...avenueXs.map(x => ({ roomId: room.id, x, z: room.z - room.depth / 2, width: 3.2, side: 'back' })),
  ];
});

// Legacy outdoor railings remain absent. Low solid partitions give each room
// a readable edge; every doorway is an actual gap in the wall geometry.
export const GARDEN_RAILINGS = [];

export const GARDEN_WALL_THICKNESS = .18;
export const GARDEN_WALL_HEIGHTS = Object.freeze({ front: .85, back: 1.15, left: 1, right: 1 });

function roomSideWalls(room, side) {
  const horizontal = side === 'front' || side === 'back';
  const length = horizontal ? room.width : room.depth;
  const center = horizontal ? room.x : room.z;
  const start = center - length / 2;
  const end = center + length / 2;
  const cuts = GARDEN_DOORWAYS.filter(door => door.roomId === room.id && door.side === side)
    .map(door => [Math.max(start, (horizontal ? door.x : door.z) - door.width / 2),
      Math.min(end, (horizontal ? door.x : door.z) + door.width / 2)])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = start;
  for (const [cutStart, cutEnd] of cuts) {
    if (cutStart > cursor + .001) spans.push([cursor, cutStart]);
    cursor = Math.max(cursor, cutEnd);
  }
  if (cursor < end - .001) spans.push([cursor, end]);
  return spans.map(([from, to], index) => ({
    id: `${room.id}-${side}-${index}`, roomId: room.id, side,
    x: horizontal ? (from + to) / 2 : room.x + (side === 'left' ? -1 : 1) * room.width / 2,
    z: horizontal ? room.z + (side === 'back' ? -1 : 1) * room.depth / 2 : (from + to) / 2,
    halfX: horizontal ? (to - from) / 2 : GARDEN_WALL_THICKNESS / 2,
    halfZ: horizontal ? GARDEN_WALL_THICKNESS / 2 : (to - from) / 2,
    height: GARDEN_WALL_HEIGHTS[side],
  }));
}

export const GARDEN_WALLS = GARDEN_ROOMS.flatMap(room =>
  ['front', 'back', 'left', 'right'].flatMap(side => roomSideWalls(room, side)));

// Prop half sizes are LOCAL to their rotation. Department corners retain
// furnished lounge areas. They leave the desk approaches, side-entry
// landmarks, both avenues and occupied-chair tumble clearances untouched.
const propShapes = {
  sofa: [1.125, .51], armchair: [.58, .57], ottoman: [.49, .40],
  'coffee-table': [.68, .43], 'side-table': [.34, .34],
  lamp: [.31, .31], plant: [.39, .39],
};
const roomProps = {
  studio: [
    ['sofa', 3.55, -6.2], ['coffee-table', 3.3, -3.95, .10],
    ['armchair', 3.25, -.6, -.45], ['side-table', 2.1, -.5],
    ['lamp', 4.2, -7.2], ['plant', -16.5, 1.1], ['plant', -16.5, -6.8],
  ],
  quiet: [
    ['sofa', 16.3, -6.3], ['coffee-table', 14.65, -4.85, -.10],
    ['ottoman', 16.3, -3.45], ['lamp', 17.8, -6.3],
    ['plant', 9.2, -.3], ['plant', 9.2, -6.3],
  ],
  lab: [
    ['sofa', 16.3, -20.1], ['coffee-table', 16.3, -17.80, -.08],
    ['armchair', 3.25, -20.2, -.50], ['ottoman', 3.1, -13.95],
    ['side-table', 4.65, -20.1], ['lamp', 17.6, -21.1],
    ['plant', -16.5, -20.2], ['plant', 16.7, -13.3], ['plant', -16.5, -13.4],
  ],
  workshop: [
    ['sofa', -16.35, -33.4, Math.PI / 2], ['coffee-table', -13.90, -34.0, -.15],
    ['armchair', -9.65, -33.6, .5], ['lamp', -16.6, -35.1],
    ['plant', -16.5, -27.4], ['plant', -9.4, -28.0],
  ],
  loft: [
    ['sofa', 3.6, -34.5], ['coffee-table', 3.6, -32.20, .08],
    ['armchair', 16.7, -34.5, -.55], ['ottoman', 3, -27.70],
    ['side-table', 15.3, -34.5], ['lamp', 4.7, -35.4],
    ['plant', -3.4, -35], ['plant', 16.7, -27.4],
  ],
};
const palettes = ['blue', 'clay', 'butter', 'lavender', 'rose'];
let decorationSeed = GARDEN_LAYOUT_SEED;
const nextDecoration = () => ((decorationSeed = (decorationSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const GARDEN_PROPS = GARDEN_ROOMS.flatMap(room => (roomProps[room.id] || []).map(([kind, x, z, rotation = 0]) => {
  const [halfX, halfZ] = propShapes[kind];
  const palette = palettes[Math.floor(nextDecoration() * palettes.length)];
  return { kind, x, z, rotation, palette, halfX, halfZ, roomId: room.id, workspaceIndex: room.workspaceIndices[0] };
})).map((item, index) => ({ id: `garden-prop-${index}`, ...item }));

// Flat rugs define warm lounge islands without a step, fence or collision box.
// The woven detail is procedural and shares geometry/material batches.
export const GARDEN_RUGS = [
  ...GARDEN_WORKSPACES.map(workspace => ({
    roomId: workspace.roomId, x: workspace.x, z: workspace.z + .1,
    width: 3.4, depth: 5.6, rotation: 0, kind: 'interview',
    palette: GARDEN_ROOMS.find(room => room.id === workspace.roomId).palette,
  })),
  { roomId: 'studio', x: 3.3, z: -5.35, width: 3.0, depth: 3.0, rotation: .035, palette: 'blue', kind: 'lounge' },
  { roomId: 'quiet', x: 16.3, z: -4.9, width: 3.0, depth: 4.0, rotation: -.025, palette: 'lavender', kind: 'lounge' },
  { roomId: 'lab', x: 16.3, z: -19.35, width: 3.0, depth: 3.0, rotation: .025, palette: 'rose', kind: 'lounge' },
  { roomId: 'workshop', x: -16.2, z: -33.8, width: 2.8, depth: 3.0, rotation: -.045, palette: 'clay', kind: 'lounge' },
  { roomId: 'loft', x: 3.6, z: -33.75, width: 3.0, depth: 3.2, rotation: .035, palette: 'butter', kind: 'lounge' },
];

// Interior potted plants stay in GARDEN_PROPS; outdoor trees are removed.
export const GARDEN_TREES = [];

function worldBounds(item, kind) {
  const cosine = Math.abs(Math.cos(item.rotation || 0));
  const sine = Math.abs(Math.sin(item.rotation || 0));
  return {
    x: item.x, z: item.z,
    halfX: item.halfX * cosine + item.halfZ * sine,
    halfZ: item.halfZ * cosine + item.halfX * sine,
    kind,
    ...(item.id === undefined ? {} : { id: item.id }),
    ...(item.workspaceIndex === undefined ? {} : { workspaceIndex: item.workspaceIndex }),
    ...(item.roomId === undefined ? {} : { roomId: item.roomId }),
  };
}

export const GARDEN_COLLIDERS = [
  ...GARDEN_PROPS.map(item => worldBounds(item, item.kind)),
  ...GARDEN_WALLS.map(item => ({ ...item, kind: 'room-wall' })),
  ...OFFICE_PERIMETER_WALLS.map(item => ({ ...item, kind: 'room-wall' })),
  ...OFFICE_PROPS.map(item => worldBounds(item, 'office-fixture')),
];

export function isGardenBlocked(x, z, margin = .28) {
  return GARDEN_COLLIDERS.some(item => Math.abs(x - item.x) < item.halfX + margin && Math.abs(z - item.z) < item.halfZ + margin);
}
