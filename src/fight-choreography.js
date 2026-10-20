/** A single shared, silent cartoon encounter in the open garden clearing. */
export const FIGHTER_IDS = Object.freeze(['bot-3', 'bot-4']);
export const SPECTATOR_IDS = Object.freeze(['bot-7', 'bot-8', 'bot-9']);
export const FIGHT_CYCLE_MS = 24_000;
export const FIGHT_CENTER = Object.freeze({ x: -4.8, z: 9 });

const clamp = value => Math.min(1, Math.max(0, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const progress = (time, start, end) => clamp((time - start) / (end - start));
const interpolate = (from, to, time, start, end) => from + (to - from) * ease(progress(time, start, end));
const pulse = (time, center, width) => {
  const p = Math.abs(time - center) / width;
  return p < 1 ? (1 + Math.cos(p * Math.PI)) / 2 : 0;
};
const gesture = (time, start, duration) => time > start && time < start + duration ? (time - start) / duration : 0;
const phaseAt = nowMs => {
  const clock = Number.isFinite(nowMs) ? nowMs : 0;
  return ((clock % FIGHT_CYCLE_MS) + FIGHT_CYCLE_MS) % FIGHT_CYCLE_MS;
};

function stageAt(time) {
  if (time < 3200) return 'walking';
  if (time < 3800) return 'bump';
  if (time < 4800) return 'argue';
  if (time < 8800) return 'punch';
  if (time < 9300) return 'shove';
  if (time < 10100) return 'fall';
  if (time < 10600) return 'step-in';
  if (time < 12550) return 'kick';
  if (time < 13400) return 'step-back';
  if (time < 15000) return 'recover';
  if (time < 16400) return 'cooldown';
  if (time < 19000) return 'leave';
  return 'wait';
}

function fighter(side, time, stage) {
  const winner = side === 0;
  const sign = winner ? -1 : 1;
  let offset;
  if (time < 3200) offset = sign * interpolate(2.3, .46, time, 0, 3200);
  else if (time < 3800) offset = sign * interpolate(.46, .64, time, 3200, 3800);
  else if (time < 8800) offset = sign * .64;
  else if (time < 10100) offset = winner
    ? time < 9300 ? interpolate(-.64, -.31, time, 8800, 9300) : interpolate(-.31, -.30, time, 9300, 10100)
    : interpolate(.64, 1.18, time, 9300, 10100);
  else if (time < 10600) offset = winner ? interpolate(-.30, .30, time, 10100, 10600) : 1.18;
  else if (time < 12550) offset = winner ? .30 : 1.18;
  else if (time < 13400) offset = winner ? interpolate(.30, -.68, time, 12550, 13400) : 1.18;
  else if (time < 16400) offset = winner ? -.68 : 1.18;
  else if (time < 19000) offset = interpolate(winner ? -.68 : 1.18, sign * 2.3, time, 16400, 19000);
  else offset = sign * 2.3;

  // The actors stop before turning away, and finish their turn back before
  // the next approach. Unwrapped angles keep the cycle seam continuous.
  const faceIn = winner ? Math.PI / 2 : -Math.PI / 2;
  let rotation = faceIn;
  if (time >= 15600 && time < 16400) rotation = faceIn + Math.PI * ease(progress(time, 15600, 16400));
  else if (time >= 16400 && time < 19600) rotation = faceIn + Math.PI;
  else if (time >= 19600 && time < 20800) rotation = faceIn + Math.PI * (1 - ease(progress(time, 19600, 20800)));

  const pose = {
    guard: ease(progress(time, 3200, 4200)) * (1 - ease(progress(time, 15000, 15600))),
    punch: 0, punchSide: 'left', shove: 0, kick: 0,
    fallProgress: null, recoverProgress: null, grounded: false,
    flinch: 0, bump: time >= 3200 && time < 3800 ? Math.sin(progress(time, 3200, 3800) * Math.PI) ** 2 : 0,
  };
  let impact = 0, impactHeight = 1.08;
  if (time >= 4800 && time < 8800) {
    const exchange = Math.floor((time - 4800) / 1000);
    const strikeTime = (time - 4800) % 1000;
    const active = exchange % 2 === side;
    pose.punchSide = exchange < 2 ? 'left' : 'right';
    pose.punch = active ? gesture(strikeTime, 0, 700) : 0;
    impact = pulse(strikeTime, 350, 120);
    pose.flinch = active ? 0 : pulse(strikeTime, 400, 220);
    // Tiny planted steps accompany the shoulder exchange, then settle before
    // the next hand starts. The receiver always has room to yield.
    offset += sign * (active ? -.40 * pulse(strikeTime, 350, 350) : .025 * pose.flinch);
  }
  if (time >= 8800 && time < 10100) {
    if (winner) pose.shove = gesture(time, 8800, 1000);
    impact = pulse(time, 9300, 180);
    impactHeight = .85;
    if (!winner) pose.flinch = pulse(time, 9400, 300);
  }
  if (!winner && time >= 9300 && time < 15000) {
    pose.fallProgress = progress(time, 9300, 10100);
    pose.grounded = time >= 10100 && time < 13400;
    if (time >= 13400) pose.recoverProgress = progress(time, 13400, 15000);
  }
  if (time >= 10600 && time < 12550) {
    const start = time < 11600 ? 10600 : 11800;
    if (winner) pose.kick = gesture(time, start, 750);
    impact = pulse(time, start + 375, 115);
    impactHeight = .35;
    if (!winner) pose.flinch = pulse(time, start + 420, 220);
  }

  const anger = ease(progress(time, 3200, 4400)) * (1 - ease(progress(time, 14200, 15800)));
  const speaking = (time >= 3850 && time < (winner ? 4600 : 4400))
    || (time >= (winner ? 6400 : 7550) && time < (winner ? 7100 : 8250))
    || (winner && time >= 10200 && time < 11000);
  return {
    id: FIGHTER_IDS[side], x: FIGHT_CENTER.x + offset, z: FIGHT_CENTER.z,
    rotation, moving: time < 3800 || time >= 8800 && time < 10600 && winner
      || time >= 9300 && time < 10100 && !winner
      || time >= 12550 && time < 13400 && winner || time >= 16400 && time < 19000,
    seatedJobId: null, fighting: time >= 3200 && time < 15000,
    encounterId: 'garden-encounter', opponentId: FIGHTER_IDS[1 - side],
    fightRole: 'fighter', fightStage: stage, fightPose: pose,
    anger, speech: speaking ? winner ? '@#$%!' : '#@%?!' : '',
    talking: speaking, impact, impactHeight,
    // Retain the old neutral gesture fields for consumers which have not
    // switched to the articulated fight pose yet.
    strike: 0, recoil: pose.flinch,
  };
}

function spectator(index, time, stage) {
  const positions = [[-2.9, 1.9], [-.2, 2.7], [3.2, 1.9]];
  const [x, z] = positions[index];
  const active = time >= 3500 && time < 15200;
  const reaction = active ? pulse(time, 9600 + index * 180, 700) : 0;
  const speaking = active && ((time >= 9500 + index * 180 && time < 10300 + index * 180)
    || (time >= 12200 + index * 200 && time < 12700 + index * 200));
  return {
    id: SPECTATOR_IDS[index], x: FIGHT_CENTER.x + x, z: FIGHT_CENTER.z + z,
    rotation: Math.atan2(-x, -z), moving: false, seatedJobId: null,
    fightRole: 'spectator', fightStage: stage, watching: true,
    reaction, talking: speaking, speech: speaking ? index === 1 ? '!!' : '…?!' : '',
  };
}

/** The encounter alone may use a paused clock; ordinary garden life continues. */
export function getFightScene(nowMs) {
  const phaseMs = phaseAt(nowMs), stage = stageAt(phaseMs);
  return {
    phaseMs, stage, center: FIGHT_CENTER,
    states: [fighter(0, phaseMs, stage), fighter(1, phaseMs, stage),
      ...SPECTATOR_IDS.map((_, index) => spectator(index, phaseMs, stage))],
  };
}

/** Physical body footprints only: the open gaps between spectators stay usable. */
export function getFightBodyVolumes(state) {
  if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.z)) return [];
  const root = { x: state.x, z: state.z, radius: .4 };
  if (state.fightRole !== 'fighter') return [root];
  const pose = state.fightPose || {};
  // A standing body tips onto its side, then rolls into a kneel during the
  // first half of the recovery. The sine follows the head's arc more closely
  // than a linear root-to-ground estimate and remains continuous at the seam.
  const fallen = Number.isFinite(pose.fallProgress) ? ease(pose.fallProgress) : 0;
  const recovered = Number.isFinite(pose.recoverProgress) ? ease(pose.recoverProgress / .52) : 0;
  const down = Math.sin(fallen * Math.PI / 2) * Math.cos(recovered * Math.PI / 2);
  if (down <= 1e-10) return [root];
  const rotation = Number.isFinite(state.rotation) ? state.rotation : 0;
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  // Actual skinned floor-pose bounds are local X [-1.273,.637] and
  // Z [-.349,.467]. These small overlapping circles follow the torso/head
  // and bent legs; they do not reserve the clearing around the encounter.
  return [root, ...[
    { x: -.45, z: .04, radius: .43 },
    { x: -.95, z: .04, radius: .43 },
    { x: .28, z: .09, radius: .40 },
  ].map(volume => ({
    x: state.x + (cosine * volume.x + sine * volume.z) * down,
    z: state.z + (-sine * volume.x + cosine * volume.z) * down,
    radius: .4 + (volume.radius - .4) * down,
  }))];
}
