import { FIGHT_CENTER, FIGHT_CYCLE_MS, FIGHTER_IDS } from './fight-choreography.js';

// These are the six contact peaks in the existing choreography. The tests
// verify each against getFightScene's action midpoint and impact pulse, so
// audio does not need to scan or sample a whole encounter during startup.
export const FIGHT_CONTACTS = Object.freeze([
  { slot: 'punch-0', atMs: 5150, type: 'punch', attackerId: FIGHTER_IDS[0], defenderId: FIGHTER_IDS[1], side: 'left' },
  { slot: 'punch-1', atMs: 6150, type: 'punch', attackerId: FIGHTER_IDS[1], defenderId: FIGHTER_IDS[0], side: 'left' },
  { slot: 'punch-2', atMs: 7150, type: 'punch', attackerId: FIGHTER_IDS[0], defenderId: FIGHTER_IDS[1], side: 'right' },
  { slot: 'punch-3', atMs: 8150, type: 'punch', attackerId: FIGHTER_IDS[1], defenderId: FIGHTER_IDS[0], side: 'right' },
  { slot: 'kick-0', atMs: 10975, type: 'kick', attackerId: FIGHTER_IDS[0], defenderId: FIGHTER_IDS[1], side: 'right' },
  { slot: 'kick-1', atMs: 12175, type: 'kick', attackerId: FIGHTER_IDS[0], defenderId: FIGHTER_IDS[1], side: 'right' },
].map(contact => Object.freeze(contact)));

export const MAX_FIGHT_FRAME_MS = 150;
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.z);
const visibleFighter = fighter => fighter?.placed === true && fighter.visible === true
  && fighter.fightRole === 'fighter' && finitePoint(fighter.position);

/** Midpoint of the two actually rendered fighters, including paused poses. */
export function getFightSource(fighters = []) {
  const pair = FIGHTER_IDS.map(id => fighters.find(fighter => fighter.id === id));
  if (!pair.every(visibleFighter)) return { ...FIGHT_CENTER };
  return { x: (pair[0].position.x + pair[1].position.x) / 2,
    z: (pair[0].position.z + pair[1].position.z) / 2 };
}

function canContact(contact, fighters) {
  const attacker = fighters.find(fighter => fighter.id === contact.attackerId);
  const defender = fighters.find(fighter => fighter.id === contact.defenderId);
  if (![attacker, defender].every(visibleFighter)) return false;
  if (Math.hypot(attacker.position.x - defender.position.x, attacker.position.z - defender.position.z) >= 1.8) return false;
  // A solid obstacle can make a rendered bot lag behind its desired pose.
  // Waiting for the actual pair prevents an impact sounding across a gap.
  for (const fighter of [attacker, defender]) {
    if (!finitePoint(fighter.target)
      || Math.hypot(fighter.position.x - fighter.target.x, fighter.position.z - fighter.target.z) > .12) return false;
  }
  const action = attacker.fightPose?.[contact.type];
  if (!(action >= .5 && action < 1)) return false;
  if (contact.type === 'punch' && attacker.fightPose.punchSide !== contact.side) return false;
  if (contact.type === 'kick' && defender.fightPose?.grounded !== true) return false;
  return true;
}

function impactPosition(contact, fighters) {
  const attacker = fighters.find(fighter => fighter.id === contact.attackerId);
  const defender = fighters.find(fighter => fighter.id === contact.defenderId);
  const point = attacker[`${contact.type}Position`];
  if (finitePoint(point) && Number.isFinite(point.y)) return { x: point.x, y: point.y, z: point.z };
  const ratio = contact.type === 'kick' ? .72 : .5;
  return { x: attacker.position.x + (defender.position.x - attacker.position.x) * ratio,
    y: contact.type === 'kick' ? .35 : 1.08,
    z: attacker.position.z + (defender.position.z - attacker.position.z) * ratio };
}

/**
 * Observe the clock that actually posed the fighters, after their skeletons
 * update. Snapshots contain id, placed, visible, fightRole, position, target,
 * fightPose and optional solved punchPosition/kickPosition world coordinates.
 */
export function createFightImpactTracker() {
  let previousClock = null;
  const seen = new Set();
  return {
    reset() { previousClock = null; seen.clear(); },
    update({ clockMs, paused = false, fighters = [] } = {}) {
      if (!Number.isFinite(clockMs)) { previousClock = null; return []; }
      const previous = previousClock;
      previousClock = clockMs;
      // Establish a baseline without replaying earlier hits. Repeated clocks
      // are the normal paused state; jumps and rewinds never drain a backlog.
      if (previous === null || paused || clockMs <= previous || clockMs - previous > MAX_FIGHT_FRAME_MS) return [];
      const impacts = [];
      for (let cycle = Math.floor(previous / FIGHT_CYCLE_MS); cycle <= Math.floor(clockMs / FIGHT_CYCLE_MS); cycle++) {
        for (const contact of FIGHT_CONTACTS) {
          const at = cycle * FIGHT_CYCLE_MS + contact.atMs;
          if (at <= previous || at > clockMs) continue;
          const id = `garden-fight:${cycle}:${contact.slot}`;
          if (seen.has(id)) continue;
          seen.add(id);
          // Keep recent cycle/slot identities across a clock correction
          // without retaining a growing history for a long-running visit.
          if (seen.size > 24) seen.delete(seen.values().next().value);
          if (!canContact(contact, fighters)) continue;
          impacts.push({ id, type: contact.type, attackerId: contact.attackerId, defenderId: contact.defenderId,
            position: impactPosition(contact, fighters), clockMs: at });
        }
      }
      return impacts;
    },
  };
}
