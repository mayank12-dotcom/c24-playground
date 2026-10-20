import { segmentObstacleEntry } from './collision.js';

/**
 * Find a collision-free floor route. Null means unreachable; [] means direct.
 * Optional obstacles must include every collider, already inflated by the
 * avatar radius. Exact segment checks keep smoothing clear of thin rail corners.
 */
export function findWalkRoute(start, goal, { isBlocked, obstacles, step = .65, maxIterations = 16000 } = {}) {
  if (!start || !goal || ![start.x, start.z, goal.x, goal.z].every(Number.isFinite) || typeof isBlocked !== 'function') return null;
  const clear = (from, to) => {
    if (obstacles) return !obstacles.some(obstacle => segmentObstacleEntry(from, to, obstacle) !== null);
    const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .025);
    for (let index = 0; index <= count; index++) {
      const t = count ? index / count : 0;
      if (isBlocked(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
    }
    return true;
  };
  if (isBlocked(goal.x, goal.z)) return null;
  if (clear(start, goal)) return [];
  const sx = Math.round(start.x / step), sz = Math.round(start.z / step);
  const gx = Math.round(goal.x / step), gz = Math.round(goal.z / step);
  const minX = Math.min(sx, gx) - 14, maxX = Math.max(sx, gx) + 14;
  const minZ = Math.min(sz, gz) - 14, maxZ = Math.max(sz, gz) + 14;
  const key = (x, z) => `${x},${z}`;
  const heuristic = (x, z) => Math.hypot(x - gx, z - gz);
  const first = { x: sx, z: sz, g: 0, f: heuristic(sx, sz), parent: null };
  const open = [first], known = new Map([[key(sx, sz), first]]), closed = new Set();
  let end = null, iterations = 0;
  while (open.length && iterations++ < maxIterations) {
    let best = 0;
    for (let index = 1; index < open.length; index++) if (open[index].f < open[best].f) best = index;
    const current = open.splice(best, 1)[0], currentKey = key(current.x, current.z);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    const from = current === first ? start : { x: current.x * step, z: current.z * step };
    if (Math.hypot(current.x - gx, current.z - gz) < 2 && clear(from, goal)) { end = current; break; }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const x = current.x + dx, z = current.z + dz, coordinate = key(x, z);
      if (x < minX || x > maxX || z < minZ || z > maxZ || closed.has(coordinate)) continue;
      if (!clear(from, { x: x * step, z: z * step })) continue;
      const cost = current.g + Math.hypot(dx, dz), previous = known.get(coordinate);
      if (previous && previous.g <= cost) continue;
      const node = { x, z, g: cost, f: cost + heuristic(x, z), parent: current };
      known.set(coordinate, node); open.push(node);
    }
  }
  if (!end) return null;
  const path = [{ x: goal.x, z: goal.z }];
  let current = end;
  while (current.parent) { path.unshift({ x: current.x * step, z: current.z * step }); current = current.parent; }
  const smooth = [];
  let previous = start, index = 0;
  while (index < path.length) {
    let far = index;
    while (far + 1 < path.length && clear(previous, path[far + 1])) far++;
    smooth.push(path[far]); previous = path[far]; index = far + 1;
  }
  return smooth;
}
