/** One shared clock drives the chair handoff in every visitor's scene. */
export const BOT_PUSH_FALL_MS = 650;
export const BOT_PUSH_GROUND_MS = 550;
export const BOT_PUSH_RECOVER_MS = 950;
export const BOT_PUSH_TURN_MS = 300;
export const BOT_PUSH_HANDOFF_MS = BOT_PUSH_FALL_MS + BOT_PUSH_GROUND_MS + BOT_PUSH_RECOVER_MS + BOT_PUSH_TURN_MS;
export const BOT_PUSH_LANDING_OFFSET = Object.freeze({ x: 1.2, z: -.22 });
export const BOT_PUSH_MAX_BODY_RADIUS = 1.4;

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => value * value * (3 - 2 * value);

export function botPushSeatClear(elapsedMs) {
  return Number.isFinite(elapsedMs) && elapsedMs >= BOT_PUSH_HANDOFF_MS;
}

/**
 * The bot first clears the chair's open front while tipping sideways, rests
 * briefly, gets up, then turns towards the garden. The human waits on the
 * opposite side. Feet stay in front of the chair legs and away from its back.
 * Collision resolution is deliberately left to the world, including reserving
 * the wider landing envelope before the action begins.
 */
export function getBotPushPose(seat, elapsedMs) {
  if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.z)) return null;
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const fallProgress = clamp(elapsed / BOT_PUSH_FALL_MS);
  const recoveryProgress = clamp((elapsed - BOT_PUSH_FALL_MS - BOT_PUSH_GROUND_MS) / BOT_PUSH_RECOVER_MS);
  const turned = clamp((elapsed - BOT_PUSH_FALL_MS - BOT_PUSH_GROUND_MS - BOT_PUSH_RECOVER_MS) / BOT_PUSH_TURN_MS);
  const falling = elapsed < BOT_PUSH_FALL_MS;
  const grounded = elapsed < BOT_PUSH_FALL_MS + BOT_PUSH_GROUND_MS;
  const recovering = elapsed < BOT_PUSH_FALL_MS + BOT_PUSH_GROUND_MS + BOT_PUSH_RECOVER_MS;
  const fallTravel = ease(fallProgress);
  const frontClearance = ease(clamp(fallProgress / .30));
  return {
    x: seat.x + BOT_PUSH_LANDING_OFFSET.x * fallTravel,
    // Clear the front legs before most sideways travel. The extra initial
    // .29 forward movement eases back to the shared landing point on the lawn.
    z: seat.z + BOT_PUSH_LANDING_OFFSET.z * fallTravel - .29 * (frontClearance - fallTravel),
    rotation: (Number.isFinite(seat.rotation) ? seat.rotation : Math.PI) * (1 - ease(turned)),
    seatedJobId: null, moving: false, standProgress: 1,
    botPush: elapsed < BOT_PUSH_HANDOFF_MS,
    pushStage: falling ? 'falling' : grounded ? 'grounded' : recovering ? 'recovering' : elapsed < BOT_PUSH_HANDOFF_MS ? 'turning' : 'departing',
    fallProgress, recoveryProgress, pushSide: 1,
    bodyRadius: .4 + (BOT_PUSH_MAX_BODY_RADIUS - .4) * ease(fallProgress) * (1 - ease(recoveryProgress)),
  };
}
