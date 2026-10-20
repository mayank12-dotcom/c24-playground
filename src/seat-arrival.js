import { BOT_PUSH_HANDOFF_MS } from './bot-push.js';
// Presentation only: shared seat ownership and server coordinates stay intact.
export const BOT_SEAT_HOLD_MS = BOT_PUSH_HANDOFF_MS;
export const BOT_SEAT_WALK_MS = 400;
const WAIT_LEFT = 1.2;
const smooth = value => value * value * (3 - 2 * value);

/**
 * Derive a render pose from the original logical visitor snapshot every frame.
 * A newly won bot chair remains visually empty of the human until its previous
 * occupant has tumbled aside and recovered. Wait left of the chair while the
 * bot clears the cushion, then walk into it. The logical claim is copied to
 * logicalSeatedJobId while seatedJobId is temporarily null for standing poses.
 * Ordinary seats and completed arrivals return the original state unchanged.
 */
export function getSeatArrival(state, nowMs, botDefeats = {}) {
  const jobId = state?.seatedJobId;
  if (!jobId || !Number.isFinite(nowMs) || !Number.isFinite(state.x) || !Number.isFinite(state.z)
    || !botDefeats || !Object.hasOwn(botDefeats, jobId) || !Number.isFinite(botDefeats[jobId])) return state;
  const elapsed = Math.max(0, nowMs - botDefeats[jobId]);
  if (elapsed >= BOT_SEAT_HOLD_MS + BOT_SEAT_WALK_MS) return state;
  const progress = Math.max(0, (elapsed - BOT_SEAT_HOLD_MS) / BOT_SEAT_WALK_MS);
  const finalYaw = Number.isFinite(state.rotation) ? state.rotation : Math.PI;
  const approachYaw = Math.PI / 2;
  const turn = Math.atan2(Math.sin(finalYaw - approachYaw), Math.cos(finalYaw - approachYaw));
  return {
    ...state,
    x: state.x - WAIT_LEFT * (1 - progress),
    z: state.z,
    rotation: approachYaw + turn * smooth(progress),
    seatedJobId: null,
    logicalSeatedJobId: jobId,
    arriving: true,
    moving: progress > 0,
    seatArrivalProgress: progress,
  };
}
