export const SEAT_LOWER_MS = 650;
export const SEAT_ENTRY_SPEED = 2.25;
export const SEAT_ALIGN_MS = 380;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => value * value * (3 - 2 * value);
const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const point = (value, name) => {
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.z)) throw new TypeError(`${name} must contain finite x and z coordinates`);
  return { x: value.x, z: value.z };
};

/** One continuous approach, gentle alignment, and lowering into an owned seat.
 * Collision checking belongs to the caller: peek before update and pause the
 * entire transfer when a person or furnishing occupies the next small step.
 */
export function createSeatEntry({ from, to, via = [], fromRotation = 0, toRotation = Math.PI, waitMs = 0, speed = SEAT_ENTRY_SPEED,
  loweringFrom = null, finalApproachFrom = null, initialFacingTo = null, alignMs = SEAT_ALIGN_MS, lowerMs = SEAT_LOWER_MS } = {}) {
  if (loweringFrom != null) return createGroundedEntry({ from, to, via, fromRotation, toRotation, waitMs, speed, loweringFrom, finalApproachFrom, initialFacingTo, alignMs, lowerMs });
  const start = point(from, 'from'), end = point(to, 'to');
  if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('speed must be positive and finite');
  const points = [start, ...via.map((value, index) => point(value, `via[${index}]`)), end];
  const segments = points.slice(1).map((value, index) => ({ from: points[index], to: value, length: Math.hypot(value.x - points[index].x, value.z - points[index].z) })).filter(segment => segment.length > .000001);
  const distance = segments.reduce((sum, segment) => sum + segment.length, 0);
  // The eased approach has a peak derivative of 1.5; account for that factor
  // so even a direct call from across a room stays within normal walking speed.
  const travelMs = Math.max(400, distance / speed * 1500);
  const lowerAt = Math.max(0, travelMs - 220);
  const waiting = Number.isFinite(waitMs) ? Math.max(0, waitMs) : 0;
  const duration = waiting + Math.max(travelMs, lowerAt + SEAT_LOWER_MS);
  let elapsed = 0;
  const initialYaw = Number.isFinite(fromRotation) ? fromRotation : 0;
  const finalYaw = Number.isFinite(toRotation) ? toRotation : Math.PI;
  function pose(time) {
    const active = Math.max(0, time - waiting);
    const travel = clamp(active / travelMs);
    let remaining = ease(travel) * distance, position = end, tangent = finalYaw;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const fraction = remaining / segment.length;
        position = { x: segment.from.x + (segment.to.x - segment.from.x) * fraction, z: segment.from.z + (segment.to.z - segment.from.z) * fraction };
        tangent = Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z);
        break;
      }
      remaining -= segment.length;
    }
    const align = ease(clamp((travel - .35) / .65));
    const approachingYaw = initialYaw + angleDifference(tangent, initialYaw) * ease(clamp(travel / .3));
    const rotation = approachingYaw + angleDifference(finalYaw, approachingYaw) * align;
    const sitProgress = ease(clamp((active - lowerAt) / SEAT_LOWER_MS));
    const complete = time >= duration;
    return { ...position, rotation, sitProgress, complete, elapsedMs: time,
      phase: time < waiting ? 'waiting' : complete ? 'seated' : active < lowerAt ? 'approaching' : 'lowering' };
  }
  const advance = (deltaMs, blocked) => blocked ? elapsed : Math.min(duration, elapsed + (Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0));
  return {
    get state() { return pose(elapsed); },
    get active() { return elapsed < duration; },
    peek(deltaMs, { blocked = false } = {}) { return pose(advance(deltaMs, blocked)); },
    update(deltaMs, { blocked = false } = {}) { elapsed = advance(deltaMs, blocked); return pose(elapsed); },
  };
}

/** Walk around the seat to its open front, settle the feet, then back/lower
 * onto the cushion. The root and the lowering pose share the same progress;
 * seatSlide lets the articulated rig keep both shoes at the front support.
 */
function createGroundedEntry({ from, to, via, fromRotation, toRotation, waitMs, speed, loweringFrom, finalApproachFrom, initialFacingTo, alignMs, lowerMs }) {
  const start = point(from, 'from'), end = point(to, 'to'), stage = point(loweringFrom, 'loweringFrom');
  if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('speed must be positive and finite');
  if (!Number.isFinite(alignMs) || alignMs < 0) throw new RangeError('alignMs must be nonnegative and finite');
  if (!Number.isFinite(lowerMs) || lowerMs <= 0) throw new RangeError('lowerMs must be positive and finite');
  const initialYaw = Number.isFinite(fromRotation) ? fromRotation : 0;
  const finalYaw = Number.isFinite(toRotation) ? toRotation : Math.PI;
  const frontLane = finalApproachFrom == null ? null : point(finalApproachFrom, 'finalApproachFrom');
  const path = [start, ...via.map((value, index) => point(value, `via[${index}]`)), ...(frontLane ? [frontLane] : []), stage];
  const segments = path.slice(1).map((value, index) => ({ from: path[index], to: value,
    length: Math.hypot(value.x - path[index].x, value.z - path[index].z),
    yaw: Math.atan2(value.x - path[index].x, value.z - path[index].z),
  })).filter(segment => segment.length > .000001);
  const distance = segments.reduce((sum, segment) => sum + segment.length, 0);
  const travelMs = distance > .000001 ? Math.max(160, distance / speed * 1500) : 0;
  // A caller already at the front can still arrive facing away. Let that turn
  // finish before the ordinary gait's stationary foot settle begins.
  const turnMs = !segments.length && Math.abs(angleDifference(finalYaw, initialYaw)) > .001 ? 360 : 0;
  const waiting = Number.isFinite(waitMs) ? Math.max(0, waitMs) : 0;
  const lowerAt = travelMs + turnMs + alignMs;
  const duration = waiting + lowerAt + lowerMs;
  const reach = Math.hypot(stage.x - end.x, stage.z - end.z);
  const backwardsFinal = !!frontLane && segments.length > 0;
  const firstClearance = initialFacingTo == null ? null : point(initialFacingTo, 'initialFacingTo');
  const escapeIndex = firstClearance == null ? -1 : segments.findIndex(segment =>
    Math.hypot(segment.to.x-firstClearance.x,segment.to.z-firstClearance.z)<1e-7);
  const corners = [];
  let walked = 0;
  for (const segment of segments.slice(0, -1)) {
    walked += segment.length;
    let low = 0, high = 1;
    for (let index = 0; index < 40; index++) {
      const middle = (low + high) / 2;
      if (ease(middle) < walked / distance) low = middle; else high = middle;
    }
    corners.push(waiting + (low + high) / 2 * travelMs);
  }
  let elapsed = 0;
  // Face the table while sidestepping across the front lane, then take the
  // short backward step. Turning the feet beside a chair leg is unsafe.
  const heading = index => index<=escapeIndex ? initialYaw : backwardsFinal && index >= segments.length - 2 ? finalYaw : segments[index].yaw;

  function walkPose(active) {
    let remaining = ease(clamp(active / travelMs)) * distance;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (remaining <= segment.length || index === segments.length - 1) {
        const fraction = clamp(remaining / segment.length);
        const currentHeading = heading(index);
        const turnDistance = Math.min(backwardsFinal && index === segments.length - 2 ? .50 : .30, segment.length / 2);
        let rotation = index && index !== escapeIndex+1 ? currentHeading : initialYaw + angleDifference(currentHeading, initialYaw) * ease(clamp(remaining / turnDistance));
        const nextHeading = index + 1 < segments.length ? heading(index + 1) : finalYaw;
        const lookAhead = ease(clamp((remaining - (segment.length - turnDistance)) / turnDistance));
        rotation += angleDifference(nextHeading, rotation) * lookAhead;
        if(index<=escapeIndex)rotation=initialYaw;
        if (backwardsFinal && index === segments.length - 1) rotation = finalYaw;
        return { x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
          z: segment.from.z + (segment.to.z - segment.from.z) * fraction,
          rotation, walkTarget: { ...segment.to } };
      }
      remaining -= segment.length;
    }
    return { ...stage, rotation: finalYaw, walkTarget: { ...stage } };
  }
  function pose(time) {
    const active = Math.max(0, time - waiting);
    if (time < waiting) return { ...start, rotation: initialYaw, sitProgress: 0,
      complete: false, elapsedMs: time, phase: 'waiting', seatSlide: null, walkTarget: null };
    if (active < travelMs) return { ...walkPose(active), sitProgress: 0,
      complete: false, elapsedMs: time, phase: 'approaching', seatSlide: null };
    if (active < lowerAt) return { ...stage,
      rotation: turnMs ? initialYaw + angleDifference(finalYaw, initialYaw) * ease(clamp((active - travelMs) / turnMs)) : finalYaw,
      // The first stationary frame can still carry measured approach velocity.
      // Keep its endpoint while the gait settles so a predicted step stays clear.
      sitProgress: 0, complete: false, elapsedMs: time, phase: 'aligning', seatSlide: null, walkTarget: { ...stage } };
    const blend = ease(clamp((active - lowerAt) / lowerMs));
    const complete = time >= duration;
    return { x: stage.x + (end.x - stage.x) * blend, z: stage.z + (end.z - stage.z) * blend,
      rotation: finalYaw, sitProgress: blend, seatSlide: reach * (1 - blend), walkTarget: null,
      complete, elapsedMs: time, phase: complete ? 'seated' : 'lowering' };
  }
  const advance = (deltaMs, blocked) => {
    if (blocked) return elapsed;
    const next = Math.min(duration, elapsed + (Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0));
    // Reach each bend before taking the next segment. A single render frame
    // must not cut diagonally through a backrest or a thin nearby furnishing.
    const corner = corners.find(time => time > elapsed + 1e-7 && time < next);
    return corner ?? next;
  };
  return {
    get state() { return pose(elapsed); },
    get active() { return elapsed < duration; },
    peek(deltaMs, { blocked = false } = {}) { return pose(advance(deltaMs, blocked)); },
    update(deltaMs, { blocked = false } = {}) { elapsed = advance(deltaMs, blocked); return pose(elapsed); },
  };
}
