export const SEAT_RISE_MS = 750;
export const SEAT_STEP_MS = 300;
export const SEAT_FORWARD_REACH = .29;

const smoothstep = value => value * value * (3 - 2 * value);
const clamp = value => Math.max(0, Math.min(1, value));
const riseWeight = progress => smoothstep(clamp((progress - .12) / .30));
function inverseSmoothstep(value) {
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) / 2;
    if (smoothstep(middle) < value) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function point(value, name) {
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.z)) {
    throw new TypeError(`${name} must contain finite x and z coordinates`);
  }
  return { x: value.x, z: value.z };
}

function duration(value, name, allowZero = false) {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new RangeError(`${name} must be a ${allowZero ? 'nonnegative' : 'positive'} finite duration`);
  return value;
}

function createTransferExit({ start, end, front, riseDuration, stepDuration, initialStand, startingSlide, speed, via }) {
  if (!Number.isFinite(initialStand) || initialStand < 0 || initialStand > 1) throw new RangeError('initialStand must be between zero and one');
  if (!Number.isFinite(startingSlide) || startingSlide < 0 || startingSlide > SEAT_FORWARD_REACH) throw new RangeError('startingSlide must be within the seated foot reach');
  if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('speed must be positive and finite');
  const initialWeight = riseWeight(initialStand);
  const transferDistance = Math.hypot(front.x - start.x, front.z - start.z);
  // An interrupted controlled lower may use a different root/height curve.
  // Spread that recovery over its remaining rise instead of compressing a
  // large shift into the end of the fully seated weight-transfer window.
  const followsRiseWindow = initialWeight < 1 - 1e-9
    && Math.abs(startingSlide - SEAT_FORWARD_REACH * initialWeight) < .002;
  const transferWeight = local => followsRiseWindow
    ? clamp((riseWeight(initialStand + (1 - initialStand) * local) - initialWeight) / (1 - initialWeight))
    : smoothstep(local);
  const peakWindow = clamp((Math.max(initialStand, .27) - .12) / .30);
  const peakDerivative = followsRiseWindow
    ? (1 - initialStand) * 6 * peakWindow * (1 - peakWindow) / (.30 * (1 - initialWeight))
    : 1.5;
  const riseMs = Math.max(riseDuration, transferDistance * peakDerivative / speed * 1000);
  const points = [front, ...via.map((value, index) => point(value, `via[${index}]`)), end];
  const segments = points.slice(1).map((to, index) => ({ from: points[index], to,
    length: Math.hypot(to.x - points[index].x, to.z - points[index].z) })).filter(segment => segment.length > 1e-8);
  const distance = segments.reduce((sum, segment) => sum + segment.length, 0);
  const stepMs = Math.max(SEAT_STEP_MS, stepDuration, distance / speed * 1500);
  const total = riseMs + stepMs;
  let cumulative = 0;
  const corners = segments.slice(0, -1).map(segment => {
    cumulative += segment.length;
    return riseMs + stepMs * inverseSmoothstep(cumulative / distance);
  });
  let elapsed = 0;
  function pose(time) {
    const rise = riseMs === 0 ? 1 : clamp(time / riseMs);
    const weight = transferWeight(rise);
    const step = smoothstep(clamp((time - riseMs) / stepMs));
    let remaining = step * distance, position = end, walkTarget = null;
    if (time >= riseMs) for (const segment of segments) {
      if (remaining <= segment.length + 1e-8) {
        const fraction = clamp(remaining / segment.length);
        position = { x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
          z: segment.from.z + (segment.to.z - segment.from.z) * fraction };
        walkTarget = { ...segment.to };
        break;
      }
      remaining -= segment.length;
    }
    const complete = time >= total;
    return {
      x: time < riseMs ? start.x + (front.x - start.x) * weight : position.x,
      z: time < riseMs ? start.z + (front.z - start.z) * weight : position.z,
      standProgress: initialStand + (1 - initialStand) * rise,
      seatSlide: time < riseMs ? startingSlide + (SEAT_FORWARD_REACH - startingSlide) * weight : SEAT_FORWARD_REACH * (1 - step),
      walkTarget,
      phase: complete ? 'complete' : time < riseMs ? 'rising' : 'stepping',
      complete, mayWalk: complete, elapsedMs: time,
    };
  }
  const advance = (deltaMs, blocked) => {
    if (blocked) return elapsed;
    const next = Math.min(total, elapsed + (Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0));
    // Commit a routed corner before advancing along the next segment. The
    // caller's collision sweep must never cut diagonally across that corner.
    const corner = corners.find(time => time > elapsed + 1e-7 && time < next);
    return corner ?? next;
  };
  return {
    get state() { return pose(elapsed); },
    get active() { return elapsed < total; },
    peek(deltaMs, { blocked = false } = {}) { return pose(advance(deltaMs, blocked)); },
    update(deltaMs, { blocked = false } = {}) { elapsed = advance(deltaMs, blocked); return pose(elapsed); },
  };
}

/**
 * Keep a seat reserved while its occupant rises, then steps clear. The caller
 * checks a proposed step with peek() before committing update(); a blocked step
 * pauses in place without completing the exit or releasing the chair.
 *
 * standProgress is deliberately linear because the shared character rig eases
 * the pelvis and limbs itself. Normal keyboard walking starts only at mayWalk.
 * Supplying riseTo selects an explicit transfer: positions include the forward
 * weight shift, all blocking pauses the clock, and via points keep the walking
 * departure outside chair legs and backs. Legacy callers retain the old mode.
 */
export function createSeatExit({ from, to, riseMs = SEAT_RISE_MS, stepMs = SEAT_STEP_MS,
  riseTo = null, initialStand = 0, startingSlide = 0, speed = 2.25, via = [] } = {}) {
  const start = point(from, 'from');
  const end = point(to, 'to');
  const riseDuration = duration(riseMs, 'riseMs', true);
  const stepDuration = duration(stepMs, 'stepMs');
  if (riseTo !== null) return createTransferExit({ start, end, front: point(riseTo, 'riseTo'),
    riseDuration, stepDuration, initialStand, startingSlide, speed, via });
  const totalDuration = riseDuration + stepDuration;
  let elapsed = 0;

  const pose = time => {
    const standProgress = riseDuration === 0 ? 1 : Math.min(1, time / riseDuration);
    const stepProgress = Math.max(0, Math.min(1, (time - riseDuration) / stepDuration));
    const blend = smoothstep(stepProgress);
    const complete = time >= totalDuration;
    return {
      x: start.x + (end.x - start.x) * blend,
      z: start.z + (end.z - start.z) * blend,
      standProgress,
      phase: complete ? 'complete' : time < riseDuration ? 'rising' : 'stepping',
      complete,
      mayWalk: complete,
      elapsedMs: time,
    };
  };

  const advance = (deltaMs, blocked) => {
    // Negative or non-finite frame intervals must not rewind or poison a pose.
    const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    const next = Math.min(totalDuration, elapsed + delta);
    // A collision never interrupts the rise, including a frame that straddles
    // the rise/step boundary. Once upright, preserve the last clear position.
    return blocked ? Math.min(next, Math.max(elapsed, riseDuration)) : next;
  };

  return {
    get state() { return pose(elapsed); },
    get active() { return elapsed < totalDuration; },
    peek(deltaMs, { blocked = false } = {}) { return pose(advance(deltaMs, blocked)); },
    update(deltaMs, { blocked = false } = {}) {
      elapsed = advance(deltaMs, blocked);
      return pose(elapsed);
    },
  };
}
