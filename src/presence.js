import { jobs } from './application.js';
import { getBotOccupiedJobs } from './crowd.js';
import { SEAT_POSITIONS as chairPositions } from './seat-catalog.js';
import { normalizeVisitorName } from './visitor-profile.js';

const REQUIRED_HITS = 1;

const randomHex = bytes => [...crypto.getRandomValues(new Uint8Array(bytes))].map(value => value.toString(16).padStart(2, '0')).join('');

export function createPresence({ name, onVisitors = () => {}, onStatus = () => {}, onSeatLost = () => {} } = {}) {
  // A public avatar ID and a separate private credential prevent another visitor
  // from moving your avatar or taking/releasing your chair using a snapshot ID.
  const id = crypto.randomUUID?.() || randomHex(16);
  const token = randomHex(32);
  const visitorName = normalizeVisitorName(name) || 'Visitor';
  let state = { name: visitorName, x: 0, z: 0, rotation: 0, hair: 5, seatedJobId: null };
  let destroyed = false, inFlight = false, dirty = true, joined = false, live = false;
  let lastSent = 0, retryAt = 0, currentSeat = null, mode = '', timer;
  let mutation = Promise.resolve();
  let localAllowed = true, lastSeats = {};
  const botDefeats = {};
  const setStatus = (next, message) => { if (mode !== next) { mode = next; onStatus({ mode: next, message }); } };
  const localSnapshot = () => ({ visitors: [], seats: { ...lastSeats, ...(currentSeat ? { [currentSeat]: id } : {}) }, botDefeats: { ...botDefeats }, serverTime: Date.now(), status: 'local' });
  function localClaim(jobId) {
    if (!localAllowed || !chairPositions[jobId] || (lastSeats[jobId] && lastSeats[jobId] !== id)) return false;
    if (getBotOccupiedJobs(Date.now(), jobs).includes(jobId) && !Object.hasOwn(botDefeats, jobId)) return false;
    for (const key of Object.keys(lastSeats)) if (lastSeats[key] === id) delete lastSeats[key];
    currentSeat = jobId; state = { ...state, ...chairPositions[jobId], seatedJobId: jobId };
    onVisitors(localSnapshot());
    return true;
  }
  function localChallenge(jobId) {
    const time = Date.now();
    const result = { jobId, hits: 0, required: REQUIRED_HITS, won: false };
    const position = chairPositions[jobId];
    if (!localAllowed) result.reason = 'unavailable';
    else if (!getBotOccupiedJobs(time, jobs).includes(jobId)) result.reason = 'not-bot';
    else if (lastSeats[jobId] && lastSeats[jobId] !== id) result.reason = 'occupied';
    else if (Object.hasOwn(botDefeats, jobId)) result.reason = 'already-defeated';
    else if (currentSeat || state.seatedJobId) result.reason = 'seated';
    else if (Math.hypot(state.x - position.x, state.z - position.z) > 2.4 + 1e-9) result.reason = 'too-far';
    else {
      result.hits = REQUIRED_HITS;
      botDefeats[jobId] = time;
      result.won = localClaim(jobId);
    }
    if (!result.won) onVisitors(localSnapshot());
    return result;
  }

  function accept(snapshot, checkSeat = true) {
    if (destroyed) return;
    live = true; joined = true; retryAt = 0; localAllowed = true;
    lastSeats = { ...snapshot.seats };
    Object.assign(botDefeats, snapshot.botDefeats || {});
    setStatus('shared', 'Live visitors connected');
    if (checkSeat && currentSeat && snapshot.seats?.[currentSeat] !== id) {
      const lost = currentSeat; currentSeat = null; state = { ...state, seatedJobId: null }; onSeatLost(lost);
    }
    onVisitors(snapshot);
  }
  function disconnect(error) {
    if (destroyed) return;
    live = false; joined = false; retryAt = Date.now() + 5000;
    if (error?.status && error.status !== 503 && error.status !== 404) localAllowed = false;
    setStatus('local', 'Solo preview · live visitors unavailable');
    onVisitors(localSnapshot());
  }
  async function post(action, extra = {}) {
    const response = await fetch('/api/world', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, token, state, ...extra }), cache: 'no-store', signal: AbortSignal.timeout(6500) });
    if (!response.ok) { const error = new Error('Live connection unavailable'); error.status = response.status; throw error; }
    const snapshot = await response.json();
    if (snapshot.error || !Array.isArray(snapshot.visitors) || !snapshot.seats) throw new Error('Invalid world snapshot');
    accept(snapshot, action === 'join' || action === 'move');
    return snapshot;
  }
  async function tick() {
    if (destroyed || inFlight || Date.now() < retryAt) return;
    const elapsed = Date.now() - lastSent;
    if ((!dirty || elapsed < 250) && elapsed < 1000 && joined) return;
    inFlight = true; dirty = false; lastSent = Date.now();
    try { await queueMutation(() => post(joined ? 'move' : 'join')); }
    catch (error) { disconnect(error); }
    finally { inFlight = false; }
  }
  const queueMutation = action => {
    const operation = mutation.then(action, action);
    mutation = operation.catch(() => {});
    return operation;
  };
  const unload = () => {
    if (!joined) return;
    navigator.sendBeacon?.('/api/world', new Blob([JSON.stringify({ action: 'leave', id, token, state })], { type: 'text/plain' }));
  };
  window.addEventListener('pagehide', unload);
  setStatus('connecting', 'Connecting to live visitors…');
  timer = window.setInterval(tick, 125);

  return {
    id,
    update(next) { state = { ...state, ...next, name: visitorName }; dirty = true; },
    claimSeat(jobId) {
      return queueMutation(async () => {
        if (destroyed) return false;
        if (!live && retryAt > Date.now()) return localClaim(jobId);
        try {
          const snapshot = await post('claim', { jobId });
          if (snapshot.claimed) { currentSeat = jobId; state = { ...state, ...chairPositions[jobId], seatedJobId: jobId }; }
          return snapshot.claimed === true;
        } catch (error) { disconnect(error); return false; }
      });
    },
    challengeBot(jobId) {
      return queueMutation(async () => {
        const unavailable = () => ({ jobId, hits: 0, required: REQUIRED_HITS, won: false, reason: 'unavailable' });
        if (destroyed) return unavailable();
        if (!live && retryAt > Date.now()) return localChallenge(jobId);
        try {
          const snapshot = await post('challenge', { jobId });
          const result = snapshot.challenge;
          if (!result || result.jobId !== jobId || result.required !== REQUIRED_HITS || !Number.isInteger(result.hits) || result.hits < 0 || result.hits > REQUIRED_HITS || typeof result.won !== 'boolean' || (result.won && result.hits !== REQUIRED_HITS)) return unavailable();
          if (result.won && snapshot.claimed === true && snapshot.seats[jobId] === id) {
            currentSeat = jobId; state = { ...state, ...chairPositions[jobId], seatedJobId: jobId };
          } else if (result.won) return unavailable();
          return result;
        } catch (error) { disconnect(error); return unavailable(); }
      });
    },
    releaseSeat() {
      if (currentSeat && lastSeats[currentSeat] === id) delete lastSeats[currentSeat];
      currentSeat = null; state = { ...state, seatedJobId: null };
      if (!live) onVisitors(localSnapshot());
      return queueMutation(async () => {
        currentSeat = null; state = { ...state, seatedJobId: null };
        if (destroyed || !live) return;
        try { await post('release'); } catch (error) { disconnect(error); }
      });
    },
    destroy() {
      if (destroyed) return;
      unload(); destroyed = true; clearInterval(timer); window.removeEventListener('pagehide', unload);
    },
  };
}
