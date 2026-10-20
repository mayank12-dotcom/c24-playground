/** Shared avatar clearance for manual movement and selected-chair routes. */
export const WALK_CLEARANCE = .32;
// Full-height panels need room for the walking hands and forward shoe, which
// extend beyond the torso clearance used by low furniture and seat routes.
export const ROOM_WALL_CLEARANCE = .50;

export function inflateObstacles(bounds, margin = WALK_CLEARANCE) {
  return bounds.map(obstacle => {
    const clearance = obstacle.kind === 'room-wall' ? Math.max(margin, ROOM_WALL_CLEARANCE) : margin;
    return { ...obstacle, halfX: obstacle.halfX + clearance, halfZ: obstacle.halfZ + clearance };
  });
}

/** First segment entry into a solid interior; touching an edge is allowed. */
export function segmentObstacleEntry(from, to, obstacle) {
  let enter = 0, exit = 1;
  for (const [axis, half] of [['x', 'halfX'], ['z', 'halfZ']]) {
    const min = obstacle[axis] - obstacle[half], max = obstacle[axis] + obstacle[half];
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-12) {
      if (from[axis] <= min || from[axis] >= max) return null;
      continue;
    }
    const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    // Repeated movement steps can turn an exact corner tangent into an
    // interval a few floating-point bits wide. Treat it as the same clear
    // tangent so a routed walk cannot stop on a numerically grazed corner.
    if (enter >= exit - 1e-10) return null;
  }
  return exit > 0 && enter < 1 ? enter : null;
}

/**
 * Stop the entire movement at the first solid object. Bounds are pre-inflated
 * by the avatar radius. Sweeping the whole segment prevents thin-object
 * tunneling, and preserving the movement line prevents automatic edge sliding.
 */
export function moveUntilBlocked(from, to, obstacles) {
  let entry = 1, obstacle = null;
  for (const candidate of obstacles) {
    const hit = segmentObstacleEntry(from, to, candidate);
    if (hit !== null && hit < entry) { entry = hit; obstacle = candidate; }
  }
  if (!obstacle) return { x: to.x, z: to.z, blocked: false, obstacle: null };
  const dx = to.x - from.x, dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  // A tiny separation prevents round-off from placing the next frame inside
  // the boundary. It never nudges the visitor sideways or away from contact.
  const travel = length ? Math.max(0, entry - .0001 / length) : entry;
  return { x: from.x + dx * travel, z: from.z + dz * travel, blocked: !!obstacle, obstacle };
}
