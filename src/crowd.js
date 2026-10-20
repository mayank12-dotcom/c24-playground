import { TABLE_TENNIS_TABLES, getTableTennisState } from './lounge-layout.js';
import { GARDEN_WORKSPACES, GARDEN_PATHS } from './garden-layout.js';
import { SOCIAL_SEATS } from './social-layout.js';
import { BOT_PUSH_HANDOFF_MS, BOT_PUSH_LANDING_OFFSET, getBotPushPose } from './bot-push.js';
import { FIGHTER_IDS, SPECTATOR_IDS, getFightScene } from './fight-choreography.js';

/** Shared, deterministic background visitors. No rendering or browser dependencies. */
export const BOT_COUNT = 15;
export const STATION_POSITIONS = GARDEN_WORKSPACES.map(({ x, z }) => [x, z]);

// Keep these seats stable rather than moving bots into a visitor's claimed seat.
export const BOT_SEATED_JOB_INDICES = [2, 5, 8];
export const BOT_SEATED_JOB_IDS = ['brand-designer', 'community-lead', 'design-intern'];

// The two loops follow connected garden paths between the work pockets. The
// railings, furniture and entrance branches stay clear of this circulation.
const aisles = [
  [-6.5, 6.5, -38, 4.8],
  [-6.5, 6.5, -24, -10],
];

function roundedLoop([left, right, top, bottom]) {
  const radius = 1.15;
  const horizontal = right - left - 2 * radius;
  const vertical = bottom - top - 2 * radius;
  const quarter = Math.PI * radius / 2;
  const segments = [
    { length: horizontal, point: t => [left + radius + t, top, 1, 0] },
    { length: quarter, point: t => arc(right - radius, top + radius, -Math.PI / 2, t) },
    { length: vertical, point: t => [right, top + radius + t, 0, 1] },
    { length: quarter, point: t => arc(right - radius, bottom - radius, 0, t) },
    { length: horizontal, point: t => [right - radius - t, bottom, -1, 0] },
    { length: quarter, point: t => arc(left + radius, bottom - radius, Math.PI / 2, t) },
    { length: vertical, point: t => [left, bottom - radius - t, 0, -1] },
    { length: quarter, point: t => arc(left + radius, top + radius, Math.PI, t) },
  ];
  function arc(x, z, start, distance) {
    const angle = start + distance / radius;
    return [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, -Math.sin(angle), Math.cos(angle)];
  }
  const length = segments.reduce((total, segment) => total + segment.length, 0);
  return {
    length,
    point(distance) {
      let remaining = ((distance % length) + length) % length;
      for (const segment of segments) {
        if (remaining <= segment.length) return segment.point(remaining);
        remaining -= segment.length;
      }
      return segments[0].point(0);
    },
  };
}

const loops = aisles.map(roundedLoop);

// One encounter, three onlookers and the existing two table-tennis pairs.
// Preserve the historical pair export for callers while keeping only two fighters.
export const BOT_SPARRING_PAIRS = [FIGHTER_IDS];
export const BOT_TABLE_TENNIS_PAIRS = [['bot-5', 'bot-6'], ['bot-11', 'bot-12']];
const positiveRemainder = (value, divisor) => ((value % divisor) + divisor) % divisor;

const DEPARTURE_SPEED = .85;
const DEPARTURE_RADIUS = 1.15;
const ease = value => value * value * (3 - 2 * value);
const defeatedAt = (botDefeats, id) => id && botDefeats && Object.hasOwn(botDefeats, id) && Number.isFinite(botDefeats[id]) ? botDefeats[id] : null;
const departures = BOT_SEATED_JOB_INDICES.map(jobIndex => {
  const [x, tableZ] = STATION_POSITIONS[jobIndex];
  const z = tableZ + 1.5 + BOT_PUSH_LANDING_OFFSET.z;
  const landingX = x + BOT_PUSH_LANDING_OFFSET.x;
  const crossZ = Math.min(...GARDEN_PATHS.filter(path => path.width > 20 && path.z > tableZ + 4).map(path => path.z));
  const radius = DEPARTURE_RADIUS;
  const straight = crossZ - radius - z;
  const across = landingX - 6.5 - 2 * radius;
  const arc = Math.PI * radius / 2;
  const joinZ = crossZ - radius;
  // The main loop is clockwise; traverse its right-hand avenue backwards so
  // the outgoing branch joins with exactly the same north-facing tangent.
  const loopOffset = 13 - 2 * radius + arc + (joinZ + 38 - radius);
  return { x: landingX, z, crossZ, straight, across, arc, loopOffset };
});

/** Fall beside the chair, recover, then leave without reclaiming its cushion. */
function departingBot(index, elapsedMs) {
  const { x, z, crossZ, straight, across, arc, loopOffset } = departures[index];
  if (elapsedMs < BOT_PUSH_HANDOFF_MS) return getBotPushPose({
    x: x - BOT_PUSH_LANDING_OFFSET.x, z: z - BOT_PUSH_LANDING_OFFSET.z, rotation: Math.PI,
  }, elapsedMs);
  const distance = (elapsedMs - BOT_PUSH_HANDOFF_MS) / 1000 * DEPARTURE_SPEED;
  const radius = DEPARTURE_RADIUS;
  let point;
  if (distance < straight) point = [x, z + distance, 0, 1];
  else if (distance < straight + arc) {
    const angle = (distance - straight) / radius;
    point = [x - radius + Math.cos(angle) * radius,
      crossZ - radius + Math.sin(angle) * radius, -Math.sin(angle), Math.cos(angle)];
  } else if (distance < straight + arc + across) {
    point = [x - radius - (distance - straight - arc), crossZ, -1, 0];
  } else if (distance < straight + 2 * arc + across) {
    const angle = Math.PI / 2 + (distance - straight - arc - across) / radius;
    point = [6.5 + radius + Math.cos(angle) * radius,
      crossZ - radius + Math.sin(angle) * radius, -Math.sin(angle), Math.cos(angle)];
  } else {
    point = loops[0].point(loopOffset - (distance - straight - 2 * arc - across));
    point[2] *= -1; point[3] *= -1;
  }
  return { x: point[0], z: point[1], rotation: Math.atan2(point[2], point[3]),
    moving: true, standProgress: 1, seatedJobId: null, botPush: false, pushStage: 'departing' };
}

export function getBotOccupiedJobs(_nowMs, jobs = [], botDefeats = {}) {
  return BOT_SEATED_JOB_INDICES.map(index => jobs[index]?.id)
    .filter(id => typeof id === 'string' && defeatedAt(botDefeats, id) === null);
}

/**
 * Unix milliseconds, adjusted to server time by the caller, make these same
 * fifteen bots appear at the same place in every visitor's browser.
 */
export function getBots(nowMs, jobs = [], botDefeats = {}, fightNowMs = nowMs) {
  const clock = Number.isFinite(nowMs) ? nowMs : 0;
  const seconds = clock / 1000;
  const encounter = new Map(getFightScene(fightNowMs).states.map(state => [state.id, state]));
  const bots = BOT_SEATED_JOB_INDICES.map((jobIndex, index) => {
    const [x, z] = STATION_POSITIONS[jobIndex];
    const defeat = defeatedAt(botDefeats, jobs[jobIndex]?.id);
    if (defeat !== null) return { id: `bot-${index}`, hair: 5, pushJobId: jobs[jobIndex]?.id,
      ...departingBot(index, Math.max(0, clock - defeat)) };
    return { id: `bot-${index}`, x, z: z + 1.5, hair: 5, rotation: Math.PI, seatedJobId: jobs[jobIndex]?.id ?? null, moving: false };
  });
  for (let index = 0; index < BOT_COUNT - BOT_SEATED_JOB_INDICES.length; index++) {
    const id = `bot-${index + 3}`;
    if (FIGHTER_IDS.includes(id) || SPECTATOR_IDS.includes(id)) {
      bots.push({ hair: 5, ...encounter.get(id) });
      continue;
    }
    const tennisIndex = index >= 2 && index < 4 ? 0 : index >= 8 && index < 10 ? 1 : -1;
    if (tennisIndex !== -1) {
      const player = getTableTennisState(clock, tennisIndex).players[index % 2];
      bots.push({ id: `bot-${index + 3}`, hair: 5, ...player,
        tableTennis: true, tableId: TABLE_TENNIS_TABLES[tennisIndex].id,
        moving: true, seatedJobId: null });
      continue;
    }
    const routeIndex = index < 8 ? 0 : 1;
    const route = loops[routeIndex];
    const speed = .82 + routeIndex * .07;
    const phase = (index % 2) * .5 + routeIndex * .13;
    const [x, z, dx, dz] = route.point(seconds * speed + route.length * phase);
    bots.push({ id: `bot-${index + 3}`, x, z, hair: 5, rotation: Math.atan2(dx, dz), seatedJobId: null, moving: true });
  }
  return bots;
}

export const SOCIAL_BOT_COUNT = 4;
const SOCIAL_CYCLE_MS = 12000;
const socialLines = [
  [
    ['Nice to take a breather.', 'A little room to think.'],
    ['Found anything interesting?', 'A few possibilities.'],
    ['This corner is lovely.', 'I could stay here a while.'],
  ],
  [
    ['What are you reading?', 'Something for a fresh start.'],
    ['One chapter at a time.', 'That sounds about right.'],
    ['Tea and a good idea?', 'Always a good combination.'],
  ],
];

/** Shared silent conversations never occupy or compete for application seats. */
export function getSocialBots(nowMs) {
  const clock = Number.isFinite(nowMs) ? nowMs : 0;
  return SOCIAL_SEATS.filter(seat => seat.occupiedBy).map((seat, index) => {
    const pairIndex = Math.floor(index / 2), side = index % 2;
    const adjusted = clock + pairIndex * 3000;
    const phase = positiveRemainder(adjusted, SOCIAL_CYCLE_MS);
    const cycle = positiveRemainder(Math.floor(adjusted / SOCIAL_CYCLE_MS), socialLines[pairIndex].length);
    // Listening and short pauses separate each turn; speech never overlaps.
    const talking = side === 0 ? phase >= 800 && phase < 3800 : phase >= 5300 && phase < 8300;
    return {
      id: seat.occupiedBy, x: seat.x, z: seat.z, rotation: seat.rotation,
      hair: 5, seatedJobId: null, loungeSeatId: seat.id, seatType: seat.kind,
      moving: false, social: true, talking,
      speech: talking ? socialLines[pairIndex][cycle][side] : '',
      conversationId: `conversation-${pairIndex}`,
    };
  });
}
