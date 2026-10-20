/** Small deterministic controller for the Product Manager's playable encounter. */
export const PM_RECRUITER_JOB_ID = 'product-manager';
export const PM_REQUIRED_BUMPS = 3;
export const PM_FALL_MS = 650;
export const PM_GROUND_MS = 450;
export const PM_RECOVER_MS = 950;
export const PM_ATTACK_MS = Object.freeze({ punch: 600, kick: 850 });

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const validPoint = value => value && Number.isFinite(value.x) && Number.isFinite(value.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const difference = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const copy = value => structuredClone(value);
const isAttack = type => Object.hasOwn(PM_ATTACK_MS, type);
const posePhases = new Set(['falling', 'grounded', 'recovering']);
const phases = new Set([...posePhases, 'approaching', 'fighting', 'returning', 'seated']);

function validAttack(attack) {
  return attack == null || (isAttack(attack.type) && Number.isSafeInteger(attack.seq)
    && attack.seq >= 0 && attack.seq <= 1_000_000 && Number.isFinite(attack.startedAt)
    && attack.startedAt >= 0 && attack.startedAt <= Number.MAX_SAFE_INTEGER);
}

function readSnapshot(value) {
  if (!value || !phases.has(value.phase) || !validPoint(value)
    || Math.abs(value.x) > 1_000_000 || Math.abs(value.z) > 1_000_000
    || !Number.isFinite(value.rotation) || Math.abs(value.rotation) > 1000
    || !Number.isFinite(value.elapsed) || value.elapsed < 0 || value.elapsed > 120_000
    || ![value.playerHealth, value.recruiterHealth].every(health => Number.isFinite(health) && health >= 0 && health <= 100)
    || !Number.isSafeInteger(value.hitSeq) || value.hitSeq < 0 || value.hitSeq > 1_000_000
    || ![null, 'player', 'recruiter', 'disengaged'].includes(value.outcome ?? null)
    || (value.chairOffset !== undefined && (!Number.isFinite(value.chairOffset) || value.chairOffset < -.5 || value.chairOffset > 0))
    || (value.sitProgress != null && (!Number.isFinite(value.sitProgress) || value.sitProgress < 0 || value.sitProgress > 1))
    || !validAttack(value.playerAttack) || !validAttack(value.recruiterAttack)) return null;
  const attack = value => value ? { type: value.type, seq: value.seq, startedAt: value.startedAt } : null;
  return { phase: value.phase, elapsed: value.elapsed, x: value.x, z: value.z,
    rotation: value.rotation, playerHealth: value.playerHealth, recruiterHealth: value.recruiterHealth,
    playerAttack: attack(value.playerAttack), recruiterAttack: attack(value.recruiterAttack),
    hitSeq: value.hitSeq, outcome: value.outcome ?? null,
    ...(value.chairOffset !== undefined ? { chairOffset: value.chairOffset } : {}),
    ...(value.sitProgress !== undefined ? { sitProgress: value.sitProgress } : {}) };
}

/** Holding a movement key into a chair is one contact, not three bumps. */
export function createRecruiterBumpGate({ releaseMs = 180, cooldownMs = 650 } = {}) {
  let latched = false, clearSince = null, lastHitAt = -Infinity;
  const release = Math.max(0, finite(releaseMs, 180));
  const cooldown = Math.max(0, finite(cooldownMs, 650));
  return {
    update(contactKind, now) {
      if (!Number.isFinite(now)) return false;
      const touching = contactKind === 'chair' || contactKind === 'recruiter';
      if (!touching) {
        if (clearSince === null) clearSince = now;
        if (now - clearSince >= release) latched = false;
        return false;
      }
      if (clearSince !== null && now - clearSince >= release) latched = false;
      clearSince = null;
      if (latched) return false;
      latched = true;
      if (now - lastHitAt < cooldown) return false;
      lastHitAt = now;
      return true;
    },
    reset() { latched = false; clearSince = null; lastHitAt = -Infinity; },
  };
}

/**
 * The caller supplies solid-world movement and fall acceptance. The controller
 * never teleports through a blocked route or advances a held fall behind it.
 * Only the encounter owner drives this controller; observers display its state.
 */
export function createRecruiterDuel({ home, landing, fallPosition } = {}) {
  if (!validPoint(home) || !validPoint(landing)) throw new TypeError('Recruiter home and landing must be finite positions.');
  const origin = { x: home.x, z: home.z, rotation: finite(home.rotation) };
  const destination = { x: landing.x, z: landing.z };
  let identity = '', ownerId = '', startedAt = 0, clock = 0;
  let active = false, returnRequested = false, combatElapsed = 0;
  let nextPlayerAttackAt = -Infinity, nextRecruiterAttackAt = Infinity;
  let playerSeq = 0, recruiterSeq = 0;
  const resolvedAttacks = new Set();
  const initial = () => ({ phase: 'seated', elapsed: 0, x: origin.x, z: origin.z,
    rotation: origin.rotation, playerHealth: 100, recruiterHealth: 100,
    playerAttack: null, recruiterAttack: null, hitSeq: 0, outcome: null });
  let state = initial();

  function transition(phase, now) {
    state.phase = phase; state.elapsed = 0;
    if (phase === 'fighting') nextRecruiterAttackAt = now + 500;
    if (phase === 'returning') {
      state.playerAttack = null; state.recruiterAttack = null;
    }
    if (phase === 'seated') active = false;
  }

  function requestReturn(outcome = 'disengaged') {
    if (!active) return;
    returnRequested = true;
    if (!state.outcome) state.outcome = outcome;
    if (!posePhases.has(state.phase)) transition('returning', clock);
  }

  function face(point, dt) {
    if (!validPoint(point) || distance(state, point) < .00001) return;
    const target = Math.atan2(point.x - state.x, point.z - state.z);
    state.rotation += clamp(difference(state.rotation, target), -dt * .006, dt * .006);
  }

  function moveTowards(point, travel, move) {
    const span = distance(state, point);
    if (!span || travel <= 0) return false;
    const from = { x: state.x, z: state.z };
    const ratio = Math.min(1, travel / span);
    const to = { x: from.x + (point.x - from.x) * ratio, z: from.z + (point.z - from.z) * ratio };
    const result = typeof move === 'function' ? move(from, to, state.rotation) : { ...to, blocked: false };
    if (!validPoint(result)) return false;
    // A world resolver can shorten a sweep or route around a corner, but may
    // never move the body farther than the requested step in a single tick.
    const allowed = Math.max(.00001, travel) + .00001;
    if (distance(from, result) > allowed) return false;
    state.x = result.x; state.z = result.z;
    return distance(from, result) > .000001;
  }

  function canStrike(actor, target, type) {
    const span = distance(actor, target);
    // Match the animated hand/foot reach so a visible miss cannot deal damage.
    if (span > (type === 'kick' ? .94 : 1.1) || span < .000001) return false;
    const dx = (target.x - actor.x) / span, dz = (target.z - actor.z) / span;
    return dx * Math.sin(finite(actor.rotation)) + dz * Math.cos(finite(actor.rotation)) >= .55;
  }

  function contact(attack, actor, target, who, now, impacts) {
    if (!attack) return;
    const id = `${identity}:${who}:${attack.seq}`;
    if (resolvedAttacks.has(id)) return;
    const age = now - attack.startedAt, duration = PM_ATTACK_MS[attack.type];
    if (age < duration * .5) return;
    resolvedAttacks.add(id);
    // A late frame must not replay a contact after its animation has finished.
    if (age >= duration || !canStrike(actor, target, attack.type)) return;
    state.hitSeq++;
    if (who === 'player') state.recruiterHealth = Math.max(0, state.recruiterHealth - (attack.type === 'kick' ? 30 : 20));
    else state.playerHealth = Math.max(0, state.playerHealth - 14);
    impacts.push({ id, type: attack.type, actor: who });
  }

  function fallProposal(elapsed) {
    const progress = clamp(elapsed / PM_FALL_MS);
    if (typeof fallPosition === 'function') {
      const point = fallPosition(progress);
      if (validPoint(point)) return { ...point, rotation: origin.rotation };
    }
    const travel = ease(progress), front = .29 * (ease(progress / .30) - travel);
    return { x: origin.x + (destination.x - origin.x) * travel + Math.sin(origin.rotation) * front,
      z: origin.z + (destination.z - origin.z) * travel + Math.cos(origin.rotation) * front,
      rotation: origin.rotation };
  }

  function advancePose(step, options, now) {
    const duration = state.phase === 'falling' ? PM_FALL_MS : state.phase === 'grounded' ? PM_GROUND_MS : PM_RECOVER_MS;
    const elapsed = Math.min(duration, state.elapsed + step);
    const proposed = { ...state, elapsed, ...(state.phase === 'falling' ? fallProposal(elapsed) : {}) };
    if (typeof options.canAdvanceFall === 'function' && options.canAdvanceFall(copy(proposed)) === false) return;
    state = proposed;
    if (elapsed >= duration) {
      if (state.phase === 'falling') transition('grounded', now);
      else if (state.phase === 'grounded') transition('recovering', now);
      else transition(returnRequested ? 'returning' : 'approaching', now);
    }
  }

  function advance(step, options, now, impacts) {
    if (!active) return;
    const player = validPoint(options.player) ? { ...options.player, rotation: finite(options.player.rotation) } : null;
    if (posePhases.has(state.phase)) { advancePose(step, options, now); return; }
    state.elapsed += step;
    if (state.phase === 'returning') {
      const remaining = distance(state, origin);
      if (remaining > .00001) {
        face(origin, step);
        moveTowards(origin, 1.7 * step / 1000, options.move);
      }
      if (distance(state, origin) <= .00002) {
        const change = difference(state.rotation, origin.rotation);
        state.rotation += clamp(change, -step * .004, step * .004);
        const aligned = Math.abs(difference(state.rotation, origin.rotation)) < .01;
        if (aligned && (typeof options.canReturnSeat !== 'function' || options.canReturnSeat(copy(state)) !== false)) {
          state.x = origin.x; state.z = origin.z; state.rotation = origin.rotation;
          transition('seated', now);
        }
      }
      return;
    }
    combatElapsed += step;
    if (!player || distance(state, player) > 8 || distance(state, origin) > 12
      || distance(player, origin) > 12 || combatElapsed >= 20_000) { requestReturn(); return; }
    face(player, step);
    const span = distance(state, player);
    if (span > .94 && !state.recruiterAttack) {
      moveTowards(player, Math.min(1.7 * step / 1000, span - .91), options.move);
    }
    if (state.phase === 'approaching') {
      if (distance(state, player) <= .94) transition('fighting', now);
      return;
    }
    if (!state.recruiterAttack && now >= nextRecruiterAttackAt && canStrike(state, player, 'punch')) {
      state.recruiterAttack = { type: 'punch', seq: ++recruiterSeq, startedAt: now };
      nextRecruiterAttackAt = now + 1500;
    }
    contact(state.playerAttack, player, state, 'player', now, impacts);
    contact(state.recruiterAttack, state, player, 'recruiter', now, impacts);
    if (state.playerAttack && now - state.playerAttack.startedAt >= PM_ATTACK_MS[state.playerAttack.type]) state.playerAttack = null;
    if (state.recruiterAttack && now - state.recruiterAttack.startedAt >= PM_ATTACK_MS[state.recruiterAttack.type]) state.recruiterAttack = null;
    if (state.recruiterHealth <= 0) requestReturn('player');
    else if (state.playerHealth <= 0) requestReturn('recruiter');
  }

  return {
    start({ id, ownerId: nextOwner, startedAt: startTime } = {}) {
      if (active || typeof id !== 'string' || !id || typeof nextOwner !== 'string' || !nextOwner || !Number.isFinite(startTime)) return false;
      identity = id; ownerId = nextOwner; startedAt = startTime; clock = startTime;
      state = { ...initial(), ...fallProposal(0), phase: 'falling' }; active = true;
      returnRequested = false; combatElapsed = 0; playerSeq = 0; recruiterSeq = 0;
      nextPlayerAttackAt = -Infinity; nextRecruiterAttackAt = Infinity; resolvedAttacks.clear();
      return true;
    },
    resume({ id, ownerId: nextOwner, startedAt: startTime } = {}, snapshot, now) {
      const resumed = readSnapshot(snapshot);
      if (active || !resumed || typeof id !== 'string' || !id || typeof nextOwner !== 'string' || !nextOwner
        || !Number.isFinite(startTime) || !Number.isFinite(now) || now < startTime) return false;
      identity = id; ownerId = nextOwner; startedAt = startTime; clock = now;
      state = resumed; active = state.phase !== 'seated';
      returnRequested = state.phase === 'returning';
      combatElapsed = ['approaching', 'fighting'].includes(state.phase) ? Math.min(20_000, state.elapsed) : 0;
      playerSeq = state.playerAttack?.seq || 0; recruiterSeq = state.recruiterAttack?.seq || 0;
      nextPlayerAttackAt = state.playerAttack ? state.playerAttack.startedAt + PM_ATTACK_MS[state.playerAttack.type] : now;
      nextRecruiterAttackAt = now + 500;
      resolvedAttacks.clear();
      // An observer taking over cleanup must never replay a contact that the
      // original owner already showed before its lease disappeared.
      if (state.playerAttack) resolvedAttacks.add(`${identity}:player:${state.playerAttack.seq}`);
      if (state.recruiterAttack) resolvedAttacks.add(`${identity}:recruiter:${state.recruiterAttack.seq}`);
      return true;
    },
    getState() { return copy(state); },
    getIdentity() { return { id: identity, ownerId, startedAt, active }; },
    attack(type, now) {
      if (!active || state.phase !== 'fighting' || !isAttack(type) || !Number.isFinite(now) || now < clock || now < nextPlayerAttackAt || state.playerAttack) return false;
      state.playerAttack = { type, seq: ++playerSeq, startedAt: now };
      nextPlayerAttackAt = state.playerAttack.startedAt + PM_ATTACK_MS[type];
      return true;
    },
    end() { requestReturn(); },
    update(dtMs, options = {}) {
      const dt = clamp(finite(dtMs), 0, 1000);
      const requestedNow = finite(options.now, clock + dt);
      const finish = Math.max(clock, requestedNow);
      const beginning = finish - dt;
      const impacts = [];
      let consumed = 0;
      while (consumed < dt) {
        const step = Math.min(25, dt - consumed);
        consumed += step;
        advance(step, options, beginning + consumed, impacts);
      }
      clock = finish;
      return { state: copy(state), impacts };
    },
  };
}
