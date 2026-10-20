/** Shared lounge coordinates and a tiny deterministic table-tennis rally. */
export const TABLE_TENNIS_TABLES = Object.freeze([
  Object.freeze({ id: 'terrace-rally', x: 17, z: 9, width: 2.2, length: 3.8, topY: .9 }),
  Object.freeze({ id: 'garden-rally', x: -17, z: 9, width: 2.2, length: 3.8, topY: .9 }),
]);

// The two small sitting areas sit beyond the working tables and walking aisles.
// These are physical footprints; the world adds its own avatar clearance.
export const COZY_FURNITURE = Object.freeze([
  { type: 'beanbag', x: -7.3, z: 15.4, rotation: -.6, color: 'sage', halfX: .71, halfZ: .73 },
  { type: 'beanbag', x: -10, z: 15.4, rotation: .7, color: 'butter', halfX: .71, halfZ: .73 },
  { type: 'beanbag', x: -7.3, z: 18.7, rotation: -2.6, color: 'clay', halfX: .71, halfZ: .73 },
  { type: 'beanbag', x: -10, z: 18.7, rotation: 2.6, color: 'sage', halfX: .71, halfZ: .73 },
  { type: 'beanbag', x: 7.1, z: 15.6, rotation: -.7, color: 'clay', halfX: .71, halfZ: .73 },
  { type: 'beanbag', x: 10.6, z: 18.8, rotation: 2.9, color: 'butter', halfX: .71, halfZ: .73 },
  { type: 'sofa', x: -8.65, z: 12.6, rotation: 0, color: 'sage', halfX: 1.25, halfZ: .58 },
  { type: 'sofa', x: 10.1, z: 11.8, rotation: -.10, color: 'clay', halfX: 1.25, halfZ: .58 },
  { type: 'ottoman', x: 12.65, z: 17.0, rotation: Math.PI / 2, color: 'sage', halfX: .61, halfZ: .55 },
  { type: 'side-table', x: -11.25, z: 13.5, rotation: 0, color: 'cream', halfX: .42, halfZ: .42 },
  { type: 'side-table', x: 12.2, z: 13.9, rotation: 0, color: 'cream', halfX: .42, halfZ: .42 },
  { type: 'coffee-table', x: -5.3, z: 15.4, rotation: .08, halfX: .78, halfZ: .48 },
  { type: 'coffee-table', x: 9.1, z: 17.1, rotation: -.12, halfX: .78, halfZ: .48 },
  { type: 'plant', x: -13.2, z: 15.5, rotation: 0, halfX: .34, halfZ: .34 },
  { type: 'plant', x: -4.5, z: 17.4, rotation: .3, halfX: .34, halfZ: .34 },
  { type: 'plant', x: 4.5, z: 17.4, rotation: .8, halfX: .34, halfZ: .34 },
  { type: 'plant', x: 13.2, z: 15.5, rotation: .1, halfX: .34, halfZ: .34 },
  { type: 'plant', x: 20.5, z: 9, rotation: .4, halfX: .34, halfZ: .34 },
  { type: 'plant', x: -20.5, z: 9, rotation: .7, halfX: .34, halfZ: .34 },
  { type: 'lamp', x: 12.4, z: 18.9, rotation: .1, halfX: .4, halfZ: .4 },
  { type: 'lamp', x: -12, z: 17, rotation: 0, halfX: .40, halfZ: .40 },
  { type: 'bookshelf', x: -12.5, z: 19, rotation: .18, halfX: .78, halfZ: .28 },
].map((item, index) => Object.freeze({ id: `cozy-${item.type}-${index}`, ...item })));

export const COZY_RUGS = Object.freeze([
  Object.freeze({ x: -8.65, z: 16.3, width: 7.9, length: 7.7, rotation: .04, color: 'linen' }),
  Object.freeze({ x: 9.4, z: 16.1, width: 7.9, length: 8.5, rotation: -.1, color: 'sagePale' }),
]);

export const TENNIS_FLIGHT_MS = 1500;
const CYCLE_MS = TENNIS_FLIGHT_MS * 2;
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const arc = (start, end, height, t) => start + (end - start) * t + 4 * height * t * (1 - t);

/**
 * Both viewers and the rendered ball use the same clock. Each flight crosses
 * the net, bounces once on the receiving half, and meets the opponent's bat.
 * `swing` is a complete gesture phase: .5 is contact, 0/1 is the resting pose.
 */
export function getTableTennisState(nowMs, tableIndex = 0) {
  const index = Number.isInteger(tableIndex) ? mod(tableIndex, TABLE_TENNIS_TABLES.length) : 0;
  const table = TABLE_TENNIS_TABLES[index];
  const clock = Number.isFinite(nowMs) ? nowMs : 0;
  const phase = mod(clock + index * 750, CYCLE_MS);
  const hitter = phase < TENNIS_FLIGHT_MS ? 0 : 1;
  const flightProgress = (phase % TENNIS_FLIGHT_MS) / TENNIS_FLIGHT_MS;
  const direction = hitter === 0 ? 1 : -1;
  const bounceAt = .77;
  const hitY = table.topY + .13;
  const bounceY = table.topY + .035;
  const y = flightProgress < bounceAt
    ? arc(hitY, bounceY, .37, flightProgress / bounceAt)
    : arc(bounceY, hitY, .075, (flightProgress - bounceAt) / (1 - bounceAt));
  const players = [0, 1].map(side => {
    const relative = mod(phase - side * TENNIS_FLIGHT_MS + CYCLE_MS / 2, CYCLE_MS) - CYCLE_MS / 2;
    const swing = Math.abs(relative) < 240 ? (relative + 240) / 480 : 0;
    return {
      x: table.x + .13 * Math.sin(phase / CYCLE_MS * Math.PI * 2 + side * Math.PI),
      z: table.z + (side === 0 ? -2.55 : 2.55),
      rotation: side === 0 ? 0 : Math.PI,
      swing,
    };
  });
  return {
    ball: {
      x: table.x + direction * (.36 - .72 * flightProgress),
      y,
      z: table.z + direction * (-2.15 + 4.3 * flightProgress),
    },
    players,
    hitter,
    flightProgress,
  };
}
