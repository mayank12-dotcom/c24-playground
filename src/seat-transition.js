import { moveUntilBlocked } from './collision.js';
import { moveWithCharacters } from './character-collision.js';
import { SOCIAL_FURNITURE } from './social-layout.js';
import { FURNITURE_SEAT_STRUCTURES } from './furniture-seats.js';

export const SEAT_FRONT_LANE = .43;
const FOOT_HALF_WIDTH = .12, FOOT_HALF_DEPTH = .15;
const FOOT_SEPARATION = .16;
const FORWARD_REACH = .29;
const structureByStation = new WeakMap();

const transform = (origin, x, z, rotation = 0) => ({
  x: origin.x + Math.cos(rotation) * x + Math.sin(rotation) * z,
  z: origin.z - Math.sin(rotation) * x + Math.cos(rotation) * z,
});
function rectangle(origin, x, z, halfX, halfZ, rotation, id, profile = 'body') {
  const point = transform(origin, x, z, rotation);
  const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
  return { ...point, halfX: c * halfX + s * halfZ, halfZ: s * halfX + c * halfZ, id, profile,
    localBounds: { ...point, halfX, halfZ, rotation } };
}

function structureRectangles(origin, part, rotation, id) {
  const { x, z, halfX, halfZ, profile } = part;
  // One rotated AABB can close the gap between an armchair's arms. Narrow
  // conservative strips keep that gap open while retaining every solid part.
  // Soles use the exact local rectangle below, so floor supports need no split.
  if (profile === 'feet' || Math.abs(Math.sin(rotation * 2)) < 1e-8) {
    return [rectangle(origin, x, z, halfX, halfZ, rotation, id, profile)];
  }
  const corners = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]]
    .map(([dx, dz]) => transform(origin, x + dx, z + dz, rotation));
  const minZ = Math.min(...corners.map(point => point.z)), maxZ = Math.max(...corners.map(point => point.z));
  const count = Math.ceil((maxZ - minZ) / .035), depth = (maxZ - minZ) / count;
  return Array.from({ length: count }, (_, index) => {
    const low = minZ + depth * index, high = low + depth, xs = [];
    for (let edge = 0; edge < corners.length; edge++) {
      const a = corners[edge], b = corners[(edge + 1) % corners.length];
      if (a.z >= low && a.z <= high) xs.push(a.x);
      for (const z of [low, high]) {
        if (Math.abs(b.z - a.z) < 1e-12 || z < Math.min(a.z, b.z) || z > Math.max(a.z, b.z)) continue;
        xs.push(a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z));
      }
    }
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    return { x: (minX + maxX) / 2, z: (low + high) / 2,
      halfX: (maxX - minX) / 2, halfZ: depth / 2, id: `${id}:${index}`, profile };
  });
}

/** Only a seat's support cushion is permeable to its occupant. Backrests and
 * arms use the torso's horizontal envelope; floor rails and legs are tested
 * against the soles instead, because the seated root is above the cushion.
 */
function createSeatStructure(station) {
  if (!station) return [];
  const structures = [], add = (origin, x, z, hx, hz, rotation, label, profile) => {
    structures.push(rectangle(origin, x, z, hx, hz, rotation,
      `seat-structure:${station.job.id}:${label}`, profile));
  };
  if (station.job.kind !== 'lounge') {
    const rotation = station.rotation;
    add(station.seat, 0, -.323, .405 + .53, .042 + .27, rotation, 'backrest');
    for (const x of [-.33, .33]) for (const z of [-.23, .23]) {
      add(station.seat, x, z, .0135, .0135, rotation, `leg:${x}:${z}`, 'feet');
    }
    return structures;
  }
  const shared = FURNITURE_SEAT_STRUCTURES[station.colliderId];
  if (shared) return shared.parts.flatMap(part => structureRectangles(shared, part, shared.rotation,
    `seat-structure:${station.job.id}:${part.label}`));
  const furnishing = SOCIAL_FURNITURE.find(item => item.id === station.colliderId);
  if (!furnishing) return structures;
  if (furnishing.kind === 'couch') {
    add(furnishing, 0, -.46, 1.575 + .53, .12 + .27, 0, 'backrest');
    for (const side of [-1, 1]) {
      add(furnishing, side * 1.76, -.02, .13 + .30, .54 + .27, 0, `arm:${side}`);
      for (const z of [-.43, .43]) add(furnishing, side * 1.78, z, .025, .025, 0, `leg:${side}:${z}`, 'feet');
      add(furnishing, side * 1.78, -.02, .028, .54, 0, `side-rail:${side}`, 'feet');
    }
    for (const z of [-.43, .24]) add(furnishing, 0, z, 1.81, .028, 0, `crossbar:${z}`, 'feet');
  } else if (furnishing.kind === 'beanbag') {
    // Its raised rear remains solid. The low, soft front is the intended
    // pelvis support; planted feet remain beyond it throughout the transfer.
    add(furnishing, 0, -.48, .66 + .30, .18 + .16, furnishing.rotation, 'raised-back');
  }
  return structures;
}

export function getSeatStructure(station) {
  if (!station) return [];
  if (!structureByStation.has(station)) structureByStation.set(station, createSeatStructure(station));
  return structureByStation.get(station);
}

export function getSeatTransitionBounds(station, allBounds) {
  if (!station) return allBounds;
  // Unknown furniture never becomes permeable merely by declaring a lounge
  // ID. An owned cushion needs a known structure profile first.
  if (station.job.kind === 'lounge' && !FURNITURE_SEAT_STRUCTURES[station.colliderId]
    && !SOCIAL_FURNITURE.some(item => item.id === station.colliderId)) return allBounds;
  const others = allBounds.filter(bound => station.colliderId
    ? bound.id !== station.colliderId
    : bound.kind !== 'applicant-chair' || bound.stationIndex !== station.stationIndex);
  return [...others, ...getSeatStructure(station).filter(part => part.profile === 'body')];
}

function footPosition(point, side, rotation, slide) {
  return transform(point, side * FOOT_SEPARATION,
    Number.isFinite(slide) ? FORWARD_REACH - slide : 0, rotation);
}

/** Sweep both the body and the lower supports of the owned furnishing. This
 * keeps all surrounding objects/characters solid and does not make a chair's
 * back, arms or legs disappear when the shared seat lease is acquired.
 */
export function moveSeatTransfer(from, to, station, bounds, characters, {
  fromRotation = station?.rotation ?? 0, toRotation = fromRotation,
  fromSlide = null, toSlide = fromSlide,
} = {}) {
  const body = moveWithCharacters(from, to, bounds, characters,
    station?.job.kind === 'lounge' ? { radius: .50 } : undefined);
  if (body.blocked || !station) return body;
  const low = getSeatStructure(station).filter(part => part.profile === 'feet');
  for (const side of [-1, 1]) {
    const start = footPosition(from, side, fromRotation, fromSlide);
    const finish = footPosition(to, side, toRotation, toSlide);
    for (const part of low) {
      const local = part.localBounds;
      const rotation = local?.rotation ?? 0;
      const localPoint = point => transform({ x: 0, z: 0 }, point.x - (local?.x ?? part.x), point.z - (local?.z ?? part.z), -rotation);
      const envelope = yaw => {
        const c = Math.abs(Math.cos(yaw - rotation)), s = Math.abs(Math.sin(yaw - rotation));
        return { x: c * FOOT_HALF_WIDTH + s * FOOT_HALF_DEPTH, z: s * FOOT_HALF_WIDTH + c * FOOT_HALF_DEPTH };
      };
      const first = envelope(fromRotation), last = envelope(toRotation);
      const foot = moveUntilBlocked(localPoint(start), localPoint(finish), [{ x: 0, z: 0,
        halfX: (local?.halfX ?? part.halfX) + Math.max(first.x, last.x),
        halfZ: (local?.halfZ ?? part.halfZ) + Math.max(first.z, last.z),
      }]);
      if (foot.blocked) return { x: from.x, z: from.z, blocked: true, obstacle: part };
    }
  }
  return body;
}

/** A job seat is entered through a front-side lane, never across its backrest.
 * Lounges already expose a front approach in their shared layout.
 */
export function seatEntryGates(station, walkingBound = null) {
  const facing = { x: Math.sin(station.rotation), z: Math.cos(station.rotation) };
  const stage = { x: station.seat.x + facing.x * FORWARD_REACH,
    z: station.seat.z + facing.z * FORWARD_REACH };
  if (station.job.kind === 'lounge') {
    let gate = station.approach;
    if (walkingBound) {
      const distances = [['x', 'halfX'], ['z', 'halfZ']].filter(([axis]) => Math.abs(facing[axis]) > 1e-8)
        .map(([axis, half]) => (walkingBound[axis] + Math.sign(facing[axis]) * (walkingBound[half] + .04) - station.seat[axis]) / facing[axis]);
      const suppliedDistance = (gate.x - station.seat.x) * facing.x + (gate.z - station.seat.z) * facing.z;
      const distance = Math.max(suppliedDistance, Math.min(...distances));
      gate = { x: station.seat.x + facing.x * distance, z: station.seat.z + facing.z * distance };
    }
    const furnishing = FURNITURE_SEAT_STRUCTURES[station.colliderId];
    if (!walkingBound || !furnishing) return [{ gate, via: [gate, stage], stage, finalApproachFrom: gate }];
    // A coffee table may occupy the distant straight approach while the
    // sofa's front remains open. Enter from either end of that front strip,
    // clearing the arms before crossing toward the chosen cushion.
    const localSeat = transform({ x: 0, z: 0 }, station.seat.x - furnishing.x, station.seat.z - furnishing.z, -furnishing.rotation);
    const armFront = furnishing.parts.filter(part => part.profile === 'body' && part.label.startsWith('arm:'))
      .reduce((front, part) => Math.max(front, part.z + part.halfZ), -Infinity);
    const laneDistance = Math.max(FORWARD_REACH, Number.isFinite(armFront) ? armFront - localSeat.z + .05 : FORWARD_REACH);
    const lane = { x: station.seat.x + facing.x * laneDistance, z: station.seat.z + facing.z * laneDistance };
    const sides = [-1, 1].map(side => {
      const direction = { x: facing.z * side, z: -facing.x * side };
      const distances = [['x', 'halfX'], ['z', 'halfZ']].filter(([axis]) => Math.abs(direction[axis]) > 1e-8)
        .map(([axis, half]) => (walkingBound[axis] + Math.sign(direction[axis]) * (walkingBound[half] + .04) - lane[axis]) / direction[axis]);
      const distance = Math.max(.75, Math.min(...distances));
      const sideGate = { x: lane.x + direction.x * distance, z: lane.z + direction.z * distance };
      return { gate: sideGate, via: [sideGate, lane, stage], stage, finalApproachFrom: lane };
    });
    return [{ gate, via: [gate, lane, stage], stage, finalApproachFrom: lane }, ...sides];
  }
  const lane = { x: station.seat.x + facing.x * SEAT_FRONT_LANE,
    z: station.seat.z + facing.z * SEAT_FRONT_LANE };
  return [1, -1].map(side => ({
    gate: transform(lane, side * 1.1, 0, station.rotation),
    via: [lane, stage], stage, finalApproachFrom: lane,
  }));
}

export function seatRouteLength(from, points) {
  let previous = from, distance = 0;
  for (const point of points) {
    distance += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;
  }
  return distance;
}

/** Compare complete physical routes, including their bends and the next walk.
 * A blocked nearer side never wins over an available clear side.
 */
export function rankSeatRoutes(from, routes, { isClear = () => true, remainingDistance = () => 0 } = {}) {
  return routes.filter(route => isClear(route)).map(route => ({ route,
    distance: seatRouteLength(from, [...(route.via || []), route.to]),
    remaining: remainingDistance(route.to),
  })).filter(value => Number.isFinite(value.remaining))
    .sort((a, b) => (a.distance + a.remaining) - (b.distance + b.remaining) || a.distance - b.distance)
    .map(value => value.route);
}

/** End a departure beyond the ordinary seat footprint, with enough room to
 * turn afterwards. A desk can reject the front candidate; it never grants an
 * exception through that desk or releases the visitor inside the chair.
 */
export function seatDepartureOptions(station, ownedBound) {
  const facing = { x: Math.sin(station.rotation), z: Math.cos(station.rotation) };
  let frontDistance = .8;
  if (ownedBound) {
    const turnMargin = station.job.seatType === 'beanbag' ? 0 : .36;
    const distances = [['x', 'halfX'], ['z', 'halfZ']].filter(([axis]) => Math.abs(facing[axis]) > 1e-8)
      .map(([axis, half]) => (ownedBound[axis] + Math.sign(facing[axis]) * (ownedBound[half] + turnMargin + .03) - station.seat[axis]) / facing[axis]);
    frontDistance = Math.max(FORWARD_REACH, Math.min(...distances));
  }
  const front = { to: { x: station.seat.x + facing.x * frontDistance,
    z: station.seat.z + facing.z * frontDistance }, via: [] };
  if (station.job.kind !== 'lounge') return [front, ...seatEntryGates(station)
    .map(entrance => ({ to: entrance.gate, via: [entrance.finalApproachFrom] }))];
  const turnMargin = station.job.seatType === 'beanbag' ? 0 : .36;
  const walkingBound = ownedBound ? { ...ownedBound,
    halfX: ownedBound.halfX + turnMargin, halfZ: ownedBound.halfZ + turnMargin } : null;
  // Reverse the same clear front strip used to approach the cushion. A direct
  // diagonal to a side endpoint could cut an arm or nearby coffee table.
  return [front, ...seatEntryGates(station, walkingBound)
    .map(entrance => ({ to: entrance.gate, via: [entrance.finalApproachFrom] }))];
}
