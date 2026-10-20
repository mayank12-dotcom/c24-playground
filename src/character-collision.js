import { moveUntilBlocked } from './collision.js';

/** Horizontal body clearance shared by visitors, recruiters, and bots. */
export const CHARACTER_RADIUS = .4;

const CONTACT_GAP = .0001;
const EPSILON = 1e-12;

function checkPoint(point, name) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) {
    throw new TypeError(`${name} must have finite x and z coordinates`);
  }
}

function checkRadius(radius, name = 'radius') {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number`);
  }
  return radius;
}

function activeCharacters(characters, ignoreId) {
  return characters.filter(character => {
    if (ignoreId != null && character.id === ignoreId) return false;
    checkPoint(character, 'character');
    checkRadius(character.radius ?? CHARACTER_RADIUS, 'character radius');
    return true;
  });
}

/** First entry into a circle's interior; a tangent has no solid entry. */
function characterEntry(from, dx, dz, length, character, radius) {
  if (!length) return null;
  const combinedRadius = radius + (character.radius ?? CHARACTER_RADIUS);
  if (!combinedRadius) return null;
  const rx = from.x - character.x, rz = from.z - character.z;
  const ux = dx / length, uz = dz / length;
  const projection = rx * ux + rz * uz;
  const radiusSquared = combinedRadius * combinedRadius;
  const distanceSquared = rx * rx + rz * rz;
  const tolerance = EPSILON * Math.max(1, radiusSquared);

  // A newly received visitor position can already overlap a body. Let an
  // existing overlap unwind only while separation increases for the whole
  // movement. This cannot escape through the far side of that character.
  if (distanceSquared < radiusSquared - tolerance) {
    return projection >= -EPSILON * Math.max(1, combinedRadius) ? null : 0;
  }
  if (projection >= 0) return null;

  // A cross product computes distance to the movement line without subtracting
  // two large squared distances, keeping long, fast sweeps stable.
  const cross = rx * uz - rz * ux;
  const penetration = radiusSquared - cross * cross;
  if (penetration <= tolerance) return null;
  const entryDistance = -projection - Math.sqrt(penetration);
  const segmentTolerance = EPSILON * Math.max(1, length);
  if (entryDistance >= length - segmentTolerance || entryDistance < -segmentTolerance) return null;
  return Math.max(0, entryDistance / length);
}

/**
 * Sweep a moving circular character against other horizontal character bodies.
 * Stop on the original movement line at first contact, without edge sliding.
 */
export function sweepCharacterMovement(from, to, characters, {
  radius = CHARACTER_RADIUS, ignoreId,
} = {}) {
  checkPoint(from, 'from');
  checkPoint(to, 'to');
  checkRadius(radius);
  const candidates = activeCharacters(characters, ignoreId);
  const dx = to.x - from.x, dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  let entry = 1, obstacle = null;
  for (const candidate of candidates) {
    const hit = characterEntry(from, dx, dz, length, candidate, radius);
    if (hit !== null && hit < entry) { entry = hit; obstacle = candidate; }
  }
  if (!obstacle) return { x: to.x, z: to.z, blocked: false, obstacle: null };
  const travel = Math.max(0, entry - CONTACT_GAP / length);
  return {
    x: from.x + dx * travel,
    z: from.z + dz * travel,
    blocked: true,
    obstacle,
  };
}

/** Static bounds already include their intended avatar clearance. */
export function moveWithCharacters(from, to, staticBounds, characters, options) {
  const characterMove = sweepCharacterMovement(from, to, characters, options);
  const staticMove = moveUntilBlocked(from, to, staticBounds);
  if (!staticMove.blocked) return characterMove;
  if (!characterMove.blocked) return staticMove;
  const staticTravel = Math.hypot(staticMove.x - from.x, staticMove.z - from.z);
  const characterTravel = Math.hypot(characterMove.x - from.x, characterMove.z - from.z);
  return staticTravel <= characterTravel ? staticMove : characterMove;
}

/**
 * Resolve a spawn/teleport overlap into nearby free space. Every candidate must
 * also be reachable directly, so a correction cannot jump through a wall or a
 * second character. Returns null when this local space has no clear placement.
 */
export function findCharacterPlacement(point, staticBounds, characters, {
  radius = CHARACTER_RADIUS, maxDistance = 2, ignoreId,
} = {}) {
  checkPoint(point, 'point');
  checkRadius(radius);
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new RangeError('maxDistance must be a finite, nonnegative number');
  }
  const candidates = activeCharacters(characters, ignoreId);
  const clear = position => !staticBounds.some(obstacle =>
    Math.abs(position.x - obstacle.x) < obstacle.halfX
    && Math.abs(position.z - obstacle.z) < obstacle.halfZ)
    && !candidates.some(character =>
      Math.hypot(position.x - character.x, position.z - character.z)
      < radius + (character.radius ?? CHARACTER_RADIUS));

  if (clear(point)) return { x: point.x, z: point.z };
  // A requested point inside a solid object has no valid direct exit under the
  // static collision contract. Do not repair it by teleporting across a wall.
  if (staticBounds.some(obstacle => Math.abs(point.x - obstacle.x) < obstacle.halfX
    && Math.abs(point.z - obstacle.z) < obstacle.halfZ)) return null;

  const spacing = Math.max(.1, radius / 2);
  const rings = Math.ceil(maxDistance / spacing);
  for (let ring = 1; ring <= rings; ring++) {
    const distance = Math.min(maxDistance, ring * spacing);
    const samples = Math.max(16, Math.ceil(2 * Math.PI * distance / spacing));
    for (let sample = 0; sample < samples; sample++) {
      const angle = sample / samples * 2 * Math.PI;
      const position = {
        x: point.x + Math.cos(angle) * distance,
        z: point.z + Math.sin(angle) * distance,
      };
      if (!clear(position)) continue;
      if (!moveWithCharacters(point, position, staticBounds, candidates, { radius }).blocked) {
        return position;
      }
    }
  }
  return null;
}
