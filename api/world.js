import { jobs } from '../src/application.js';
import { getBotOccupiedJobs } from '../src/crowd.js';
import { SEAT_IDS, SEAT_POSITIONS } from '../src/seat-catalog.js';
import { normalizeVisitorName } from '../src/visitor-profile.js';

export const VISITOR_TTL_MS = 25_000;
const PREFIX = 'common-ground:v2:';
const JOB_IDS = jobs.map(job => job.id);
export const CHALLENGE_HITS = 1;
const CHALLENGE_RADIUS = 2.4;
export const RECRUITER_HITS = 3;
export const RECRUITER_BUMP_COOLDOWN_MS = 600;
export const RECRUITER_PROGRESS_TTL_MS = 15_000;
export const RECRUITER_ENCOUNTER_TTL_MS = 60_000;
export const RECRUITER_RESET_MS = 3_000;
export const RECRUITER_HOME = Object.freeze({ x: SEAT_POSITIONS['product-manager'].x, z: SEAT_POSITIONS['product-manager'].z - 2.62 });
const RECRUITER_RANGE = 1.7;
const COMBAT_PHASES = new Set(['falling', 'grounded', 'recovering', 'approaching', 'fighting', 'returning', 'seated']);
const actions = new Set(['join', 'move', 'leave', 'claim', 'release', 'challenge', 'recruiter-bump']);
const publicFields = visitor => ({ id: visitor.id, name: normalizeVisitorName(visitor.name) || 'Visitor', x: visitor.x, z: visitor.z, hair: visitor.hair, rotation: visitor.rotation, seatedJobId: visitor.seatedJobId ?? null, lastSeen: visitor.lastSeen, ...(visitor.combatAction ? { combatAction: { ...visitor.combatAction } } : {}) });
// Omitting a name is different from explicitly supplying an empty name: older
// clients must not replace an existing visitor's chosen name with a fallback.
const nameFields = state => Object.hasOwn(state, 'name') ? { name: normalizeVisitorName(state.name) || 'Visitor' } : {};

function combatAction(value) {
  if (value === null) return null;
  if (!value || !['punch', 'kick'].includes(value.type) || !Number.isSafeInteger(value.seq) || value.seq < 0 || value.seq > 1_000_000
    || !Number.isFinite(value.startedAt) || value.startedAt < 0 || value.startedAt > Number.MAX_SAFE_INTEGER) throw new Error('Invalid combat action.');
  return { type: value.type, seq: value.seq, startedAt: value.startedAt };
}

function combatFields(state) {
  const result = {};
  if (Object.hasOwn(state, 'combatAction')) result.combatAction = combatAction(state.combatAction);
  if (Object.hasOwn(state, 'recruiterCombat')) {
    const value = state.recruiterCombat;
    if (value === null) result.recruiterCombat = null;
    else {
      if (!value || typeof value.encounterId !== 'string' || !/^[a-zA-Z0-9:-]{16,120}$/.test(value.encounterId) || !COMBAT_PHASES.has(value.phase)
        || ![value.elapsed, value.x, value.z, value.rotation, value.playerHealth, value.recruiterHealth].every(Number.isFinite)
        || value.elapsed < 0 || value.elapsed > RECRUITER_ENCOUNTER_TTL_MS || Math.hypot(value.x - RECRUITER_HOME.x, value.z - RECRUITER_HOME.z) > 20
        || Math.abs(value.rotation) > 1000 || value.playerHealth < 0 || value.playerHealth > 100 || value.recruiterHealth < 0 || value.recruiterHealth > 100
        || !Number.isSafeInteger(value.hitSeq) || value.hitSeq < 0 || value.hitSeq > 1_000_000
        || (Object.hasOwn(value, 'chairOffset') && (!Number.isFinite(value.chairOffset) || value.chairOffset < -.5 || value.chairOffset > 0))
        || (Object.hasOwn(value, 'sitProgress') && value.sitProgress !== null && (!Number.isFinite(value.sitProgress) || value.sitProgress < 0 || value.sitProgress > 1))
        || ![null, 'player', 'recruiter', 'disengaged'].includes(value.outcome ?? null)) throw new Error('Invalid recruiter combat state.');
      result.recruiterCombat = { encounterId: value.encounterId, phase: value.phase, elapsed: value.elapsed, x: value.x, z: value.z, rotation: value.rotation,
        playerHealth: value.playerHealth, recruiterHealth: value.recruiterHealth, playerAttack: combatAction(value.playerAttack ?? null),
        recruiterAttack: combatAction(value.recruiterAttack ?? null), hitSeq: value.hitSeq, outcome: value.outcome ?? null,
        ...(Object.hasOwn(value, 'chairOffset') ? { chairOffset: value.chairOffset } : {}),
        ...(Object.hasOwn(value, 'sitProgress') ? { sitProgress: value.sitProgress } : {}) };
    }
  }
  return result;
}

const publicEncounter = value => value ? { id: value.id, ownerId: value.ownerId, startedAt: value.startedAt, updatedAt: value.updatedAt, combat: value.combat ? structuredClone(value.combat) : null } : null;

export function validateCommand(value) {
  if (!value || !actions.has(value.action)) throw new Error('Unknown action.');
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(value.id)) throw new Error('Invalid visitor ID.');
  if (typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('Invalid visitor credential.');
  if (value.action === 'claim' && !SEAT_IDS.includes(value.jobId)) throw new Error('Unknown seat.');
  if (value.action === 'challenge' && !JOB_IDS.includes(value.jobId)) throw new Error('Unknown seat.');
  if (value.action === 'recruiter-bump' && !['chair', 'recruiter'].includes(value.contactKind)) throw new Error('Invalid recruiter contact.');
  const state = value.state || {};
  if (['join', 'move', 'claim', 'challenge', 'recruiter-bump'].includes(value.action)) {
    if (![state.x, state.z, state.rotation].every(Number.isFinite) || Math.abs(state.x) > 1_000_000 || Math.abs(state.z) > 1_000_000 || Math.abs(state.rotation) > 1000) throw new Error('Invalid position.');
    if (!Number.isInteger(state.hair) || state.hair < 0 || state.hair > 5) throw new Error('Invalid hairstyle.');
  }
  return { action: value.action, id: value.id, token: value.token, jobId: value.jobId, ...(value.action === 'recruiter-bump' ? { contactKind: value.contactKind } : {}), state: { x: state.x, z: state.z, rotation: state.rotation, hair: state.hair, ...nameFields(state), ...combatFields(state) } };
}

// The local development process shares this store across all connected browsers.
// Production deliberately requires Redis rather than pretending serverless memory is shared.
export function createMemoryWorld({ now = Date.now } = {}) {
  const visitors = new Map();
  const seats = new Map();
  const botDefeats = new Map();
  const recruiterProgress = new Map();
  let recruiterEncounter = null, recruiterResetUntil = 0;
  function finishRecruiter(time) {
    if (recruiterEncounter) recruiterResetUntil = time + RECRUITER_RESET_MS;
    recruiterEncounter = null;
  }
  function clean(time) {
    for (const [id, visitor] of visitors) if (time - visitor.lastSeen >= VISITOR_TTL_MS) visitors.delete(id);
    for (const [jobId, owner] of seats) if (!visitors.has(owner)) seats.delete(jobId);
    for (const [id, progress] of recruiterProgress) if (!visitors.has(id) || time - progress.updatedAt >= RECRUITER_PROGRESS_TTL_MS) recruiterProgress.delete(id);
    if (recruiterEncounter && (!visitors.has(recruiterEncounter.ownerId) || time - recruiterEncounter.startedAt >= RECRUITER_ENCOUNTER_TTL_MS)) finishRecruiter(time);
  }
  function snapshot(time) { return { visitors: [...visitors.values()].map(visitor => publicFields({ ...visitor, combatAction: recruiterEncounter?.ownerId === visitor.id ? visitor.combatAction : null })), seats: Object.fromEntries(seats), botDefeats: Object.fromEntries(botDefeats), recruiterEncounter: publicEncounter(recruiterEncounter), serverTime: time, status: 'shared', storage: 'memory' }; }
  return {
    async dispatch(command = { action: 'snapshot' }) {
      const time = now(); clean(time);
      if (command.action === 'snapshot') return snapshot(time);
      const { action, id, token, state, jobId, contactKind } = command;
      const previous = visitors.get(id);
      if (previous && previous.token !== token) return { error: 'Visitor credential does not match.', code: 403 };
      const release = () => { for (const [key, owner] of seats) if (owner === id) seats.delete(key); };
      if (action === 'leave') {
        release(); visitors.delete(id);
        recruiterProgress.delete(id);
        if (recruiterEncounter?.ownerId === id) finishRecruiter(time);
        return snapshot(time);
      }
      const visitor = { ...(previous || { id, token, name: 'Visitor', x: 0, z: 0, rotation: 0, hair: 5, seatedJobId: null }), ...(state?.x !== undefined ? state : {}), ...nameFields(state || {}), lastSeen: time };
      delete visitor.recruiterCombat;
      if (visitor.seatedJobId && seats.get(visitor.seatedJobId) !== id) visitor.seatedJobId = null;
      let claimed, challenge, recruiterBump;
      if (action === 'release') { release(); visitor.seatedJobId = null; }
      if (action === 'claim') {
        claimed = (!getBotOccupiedJobs(time, jobs).includes(jobId) || botDefeats.has(jobId)) && (!seats.has(jobId) || seats.get(jobId) === id);
        if (claimed) { release(); seats.set(jobId, id); visitor.seatedJobId = jobId; }
      }
      if (action === 'challenge') {
        challenge = { jobId, hits: 0, required: CHALLENGE_HITS, won: false };
        claimed = false;
        const position = SEAT_POSITIONS[jobId];
        if (!getBotOccupiedJobs(time, jobs).includes(jobId)) challenge.reason = 'not-bot';
        else if (seats.has(jobId) && seats.get(jobId) !== id) challenge.reason = 'occupied';
        else if (botDefeats.has(jobId)) challenge.reason = 'already-defeated';
        else if (visitor.seatedJobId) challenge.reason = 'seated';
        else if (Math.hypot(visitor.x - position.x, visitor.z - position.z) > CHALLENGE_RADIUS + 1e-9) challenge.reason = 'too-far';
        else {
          release(); seats.set(jobId, id); visitor.seatedJobId = jobId;
          botDefeats.set(jobId, time);
          challenge.hits = CHALLENGE_HITS; challenge.won = true; claimed = true;
        }
      }
      if (action === 'recruiter-bump') {
        const progress = recruiterProgress.get(id) || { hits: 0, updatedAt: time, lastAt: -Infinity };
        recruiterBump = { hits: progress.hits, required: RECRUITER_HITS, started: false };
        if (!['chair', 'recruiter'].includes(contactKind)) recruiterBump.reason = 'invalid-contact';
        else if (visitor.seatedJobId) recruiterBump.reason = 'seated';
        else if (Math.hypot(visitor.x - RECRUITER_HOME.x, visitor.z - RECRUITER_HOME.z) > RECRUITER_RANGE + 1e-9) recruiterBump.reason = 'too-far';
        else if (recruiterEncounter) recruiterBump.reason = 'busy';
        else if (time < recruiterResetUntil || time - progress.lastAt < RECRUITER_BUMP_COOLDOWN_MS) recruiterBump.reason = 'cooldown';
        else {
          progress.lastAt = time; progress.updatedAt = time;
          if (progress.hits >= RECRUITER_HITS - 1 && contactKind !== 'chair') recruiterBump.reason = 'chair-needed';
          else {
            progress.hits++; recruiterBump.hits = progress.hits;
            if (progress.hits === RECRUITER_HITS) {
              recruiterEncounter = { id: `${id}:${time}`, ownerId: id, startedAt: time, updatedAt: time, combat: null };
              recruiterBump.started = true; recruiterProgress.delete(id);
            }
          }
          if (!recruiterBump.started) recruiterProgress.set(id, progress);
        }
      }
      if (recruiterEncounter?.ownerId === id) {
        const reported = state?.recruiterCombat;
        if (visitor.seatedJobId || (reported?.encounterId === recruiterEncounter.id && reported.phase === 'seated')) finishRecruiter(time);
        else if (reported?.encounterId === recruiterEncounter.id) {
          recruiterEncounter.combat = combatFields({ recruiterCombat: reported }).recruiterCombat;
          recruiterEncounter.updatedAt = time;
        }
      }
      const attack = state?.combatAction;
      if (recruiterEncounter?.ownerId !== id || !attack || attack.startedAt < recruiterEncounter.startedAt || attack.startedAt > time + 1000) delete visitor.combatAction;
      else visitor.combatAction = combatAction(attack);
      if (visitor.seatedJobId) Object.assign(visitor, SEAT_POSITIONS[visitor.seatedJobId]);
      visitors.set(id, visitor);
      return { ...snapshot(time), ...(claimed !== undefined ? { claimed } : {}), ...(challenge ? { challenge } : {}), ...(recruiterBump ? { recruiterBump } : {}) };
    },
  };
}

// Each command, seat lease renewal, and returned snapshot is a single atomic Redis operation.
// The private token is never included in a public visitor record.
const LUA = `
local prefix, action, id, token = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local now, ttl, state, jobId = tonumber(ARGV[5]), tonumber(ARGV[6]), cjson.decode(ARGV[7]), ARGV[8]
local jobIds, botJobs, seatPositions = cjson.decode(ARGV[9]), cjson.decode(ARGV[10]), cjson.decode(ARGV[11])
local visitorSet = prefix .. 'visitors'
local function visitorKey(visitorId) return prefix .. 'visitor:' .. visitorId end
local function seatKey(seatId) return prefix .. 'seat:' .. seatId end
local recruiterKey, recruiterResetKey = prefix .. 'pm-recruiter', prefix .. 'pm-recruiter-reset'
local recruiterRaw = redis.call('GET',recruiterKey)
local recruiterEncounter = recruiterRaw and cjson.decode(recruiterRaw) or nil
local recruiterResetAt = tonumber(redis.call('GET',recruiterResetKey))
if recruiterResetAt and now-recruiterResetAt >= ${RECRUITER_RESET_MS} then redis.call('DEL',recruiterResetKey); recruiterResetAt=nil end
local function finishRecruiter()
  if recruiterEncounter then recruiterResetAt=now; redis.call('SET',recruiterResetKey,now,'PX',${RECRUITER_RESET_MS}) end
  redis.call('DEL',recruiterKey); recruiterEncounter=nil
end
if recruiterEncounter and (redis.call('EXISTS',visitorKey(recruiterEncounter.ownerId)) == 0 or now-recruiterEncounter.startedAt >= ${RECRUITER_ENCOUNTER_TTL_MS}) then finishRecruiter() end
local function saveRecruiter()
  if recruiterEncounter then
    redis.call('SET',recruiterKey,cjson.encode(recruiterEncounter),'PX',math.max(1,${RECRUITER_ENCOUNTER_TTL_MS + RECRUITER_RESET_MS}-(now-recruiterEncounter.startedAt)))
  end
end
local function release()
  for _, key in ipairs(jobIds) do if redis.call('GET', seatKey(key)) == id then redis.call('DEL', seatKey(key)) end end
end
local claimed, challenge, recruiterBump = nil, nil, nil
local defeatKey = prefix .. 'bot-defeats'
if action ~= 'snapshot' then
  local raw = redis.call('GET', visitorKey(id))
  local visitor
  if raw then
    visitor = cjson.decode(raw)
    if visitor.token ~= token then return cjson.encode({error='Visitor credential does not match.', code=403}) end
  else visitor = {id=id, token=token, name='Visitor', x=0, z=0, rotation=0, hair=5, seatedJobId=cjson.null} end
  if action == 'leave' then
    release(); redis.call('DEL', visitorKey(id)); redis.call('SREM', visitorSet, id)
    redis.call('DEL',prefix .. 'pm-bumps:' .. id)
    if recruiterEncounter and recruiterEncounter.ownerId == id then finishRecruiter() end
    for _, key in ipairs(jobIds) do redis.call('DEL',prefix .. 'challenge:' .. id .. ':' .. key) end
  else
    if state.x ~= nil then visitor.x=state.x; visitor.z=state.z; visitor.rotation=state.rotation; visitor.hair=state.hair end
    if state.name ~= nil then visitor.name=state.name end
    if visitor.seatedJobId and visitor.seatedJobId ~= cjson.null then
      if redis.call('GET', seatKey(visitor.seatedJobId)) ~= id then visitor.seatedJobId=cjson.null
      else redis.call('PEXPIRE', seatKey(visitor.seatedJobId), ttl) end
    end
    if action == 'release' then release(); visitor.seatedJobId=cjson.null end
    if action == 'claim' then
      claimed=true
      for _, botJob in ipairs(botJobs) do if botJob == jobId and redis.call('HEXISTS',defeatKey,jobId) == 0 then claimed=false end end
      local owner=redis.call('GET',seatKey(jobId))
      if owner and owner ~= id then claimed=false end
      if claimed then
        release(); redis.call('SET',seatKey(jobId),id,'PX',ttl,'NX'); visitor.seatedJobId=jobId
      end
    end
    if action == 'challenge' then
      claimed=false
      -- Old multi-bump progress is ignored; one push reserves the chair.
      local progressKey=prefix .. 'challenge:' .. id .. ':' .. jobId
      challenge={jobId=jobId,hits=0,required=${CHALLENGE_HITS},won=false}
      local isBot=false
      for _, botJob in ipairs(botJobs) do if botJob == jobId then isBot=true end end
      local owner=redis.call('GET',seatKey(jobId))
      local position=seatPositions[jobId]
      if not isBot then challenge.reason='not-bot'
      elseif owner and owner ~= id then challenge.reason='occupied'
      elseif redis.call('HEXISTS',defeatKey,jobId) == 1 then challenge.reason='already-defeated'
      elseif visitor.seatedJobId and visitor.seatedJobId ~= cjson.null then challenge.reason='seated'
      elseif (visitor.x-position.x)^2 + (visitor.z-position.z)^2 > (2.4 + 1e-9)^2 then challenge.reason='too-far'
      else
        release(); redis.call('SET',seatKey(jobId),id,'PX',ttl,'NX'); visitor.seatedJobId=jobId
        redis.call('HSET',defeatKey,jobId,now); redis.call('DEL',progressKey)
        challenge.hits=${CHALLENGE_HITS}; challenge.won=true; claimed=true
      end
    end
    if action == 'recruiter-bump' then
      local recruiterProgressKey=prefix .. 'pm-bumps:' .. id
      local rawProgress=redis.call('GET',recruiterProgressKey)
      local progress=rawProgress and cjson.decode(rawProgress) or {hits=0,lastAt=-${RECRUITER_BUMP_COOLDOWN_MS},updatedAt=now}
      if now-(progress.updatedAt or progress.lastAt) >= ${RECRUITER_PROGRESS_TTL_MS} then progress={hits=0,lastAt=-${RECRUITER_BUMP_COOLDOWN_MS},updatedAt=now} end
      local home=seatPositions['product-manager']
      recruiterBump={hits=progress.hits,required=${RECRUITER_HITS},started=false}
      if state._recruiterContact ~= 'chair' and state._recruiterContact ~= 'recruiter' then recruiterBump.reason='invalid-contact'
      elseif visitor.seatedJobId and visitor.seatedJobId ~= cjson.null then recruiterBump.reason='seated'
      elseif (visitor.x-home.x)^2 + (visitor.z-(home.z-2.62))^2 > (${RECRUITER_RANGE}+1e-9)^2 then recruiterBump.reason='too-far'
      elseif recruiterEncounter then recruiterBump.reason='busy'
      elseif recruiterResetAt or now-progress.lastAt < ${RECRUITER_BUMP_COOLDOWN_MS} then recruiterBump.reason='cooldown'
      else
        progress.lastAt=now; progress.updatedAt=now
        if progress.hits >= ${RECRUITER_HITS - 1} and state._recruiterContact ~= 'chair' then recruiterBump.reason='chair-needed'
        else
          progress.hits=progress.hits+1; recruiterBump.hits=progress.hits
          if progress.hits == ${RECRUITER_HITS} then
            recruiterEncounter={id=id .. ':' .. now,ownerId=id,startedAt=now,updatedAt=now,combat=cjson.null}
            recruiterBump.started=true; redis.call('DEL',recruiterProgressKey)
          end
        end
        if not recruiterBump.started then redis.call('SET',recruiterProgressKey,cjson.encode(progress),'PX',${RECRUITER_PROGRESS_TTL_MS}) end
      end
    end
    if recruiterEncounter and recruiterEncounter.ownerId == id then
      local reported=state.recruiterCombat
      local matches=reported and reported ~= cjson.null and reported.encounterId == recruiterEncounter.id
      if (visitor.seatedJobId and visitor.seatedJobId ~= cjson.null) or (matches and reported.phase == 'seated') then finishRecruiter()
      elseif matches then recruiterEncounter.combat=reported; recruiterEncounter.updatedAt=now end
    end
    visitor.combatAction=nil
    local attack=state.combatAction
    if recruiterEncounter and recruiterEncounter.ownerId == id and attack and attack ~= cjson.null and attack.startedAt >= recruiterEncounter.startedAt and attack.startedAt <= now+1000 then visitor.combatAction=attack end
    if visitor.seatedJobId and visitor.seatedJobId ~= cjson.null then
      local position=seatPositions[visitor.seatedJobId]
      visitor.x=position.x; visitor.z=position.z; visitor.rotation=position.rotation
    end
    visitor.lastSeen=now
    redis.call('SET',visitorKey(id),cjson.encode(visitor),'PX',ttl)
    redis.call('SADD',visitorSet,id)
  end
end
saveRecruiter()
local result={visitors={}, seats={}, botDefeats={}, recruiterEncounter=recruiterEncounter or cjson.null, serverTime=now, status='shared', storage='redis'}
if claimed ~= nil then result.claimed=claimed end
if challenge ~= nil then result.challenge=challenge end
if recruiterBump ~= nil then result.recruiterBump=recruiterBump end
local defeats=redis.call('HGETALL',defeatKey)
for index=1,#defeats,2 do result.botDefeats[defeats[index]]=tonumber(defeats[index+1]) end
for _, visitorId in ipairs(redis.call('SMEMBERS',visitorSet)) do
  local raw=redis.call('GET',visitorKey(visitorId))
  if raw then
    local visitor=cjson.decode(raw)
    visitor.token=nil
    if not recruiterEncounter or recruiterEncounter.ownerId ~= visitorId then visitor.combatAction=nil end
    visitor.name=visitor.name or 'Visitor'
    if visitor.seatedJobId and visitor.seatedJobId ~= cjson.null and redis.call('GET',seatKey(visitor.seatedJobId)) ~= visitorId then visitor.seatedJobId=cjson.null end
    table.insert(result.visitors,visitor)
  else redis.call('SREM',visitorSet,visitorId) end
end
for _, key in ipairs(jobIds) do
  local owner=redis.call('GET',seatKey(key))
  if owner then
    if redis.call('EXISTS',visitorKey(owner)) == 1 then result.seats[key]=owner else redis.call('DEL',seatKey(key)) end
  end
end
return cjson.encode(result)
`;

export function createRedisWorld({ url, token, fetcher = fetch, now = Date.now }) {
  return {
    async dispatch(command = { action: 'snapshot' }) {
      const time = now();
      const state = { ...(command.state || {}), ...nameFields(command.state || {}), ...(command.action === 'recruiter-bump' ? { _recruiterContact: command.contactKind } : {}) };
      const response = await fetcher(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['EVAL', LUA, 0, PREFIX, command.action, command.id || '', command.token || '', time, VISITOR_TTL_MS, JSON.stringify(state), command.jobId || '', JSON.stringify(SEAT_IDS), JSON.stringify(getBotOccupiedJobs(time, jobs)), JSON.stringify(SEAT_POSITIONS)]), signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error('Shared world storage is unavailable.');
      const value = await response.json();
      if (value.error || typeof value.result !== 'string') throw new Error('Shared world storage returned an invalid response.');
      const snapshot = JSON.parse(value.result);
      // Redis cjson encodes an empty Lua table as an object rather than an array.
      if (!Array.isArray(snapshot.visitors)) snapshot.visitors = [];
      else snapshot.visitors = snapshot.visitors.map(publicFields);
      return snapshot;
    },
  };
}

function respond(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

export async function handleWorldRequest(req, res, store) {
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return respond(res, 405, { error: 'Method not allowed.' }); }
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return respond(res, 403, { error: 'Same-origin requests only.' }); }
    catch { return respond(res, 403, { error: 'Invalid origin.' }); }
  }
  if (!store) return respond(res, 503, { status: 'local', error: 'Live visitors are unavailable. Configure the shared Redis integration to enable multiplayer.' });
  try {
    let command;
    if (req.method === 'POST') {
      const length = Number(req.headers['content-length']);
      if (length > 4096) return respond(res, 413, { error: 'Request too large.' });
      let body = req.body;
      if (!body) {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4096) return respond(res, 413, { error: 'Request too large.' }); chunks.push(chunk); }
        body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
      }
      if (typeof body === 'string') { if (Buffer.byteLength(body) > 4096) return respond(res, 413, { error: 'Request too large.' }); body = JSON.parse(body); }
      else if (Buffer.byteLength(JSON.stringify(body)) > 4096) return respond(res, 413, { error: 'Request too large.' });
      command = validateCommand(body);
    }
    const result = await store.dispatch(command);
    return respond(res, result.code || 200, result);
  } catch (error) {
    const invalid = error instanceof SyntaxError || /^(Unknown|Invalid)/.test(error.message);
    return respond(res, invalid ? 400 : 503, { status: 'local', error: invalid ? error.message : 'Live connection is temporarily unavailable.' });
  }
}

let productionStore;
export default async function handler(req, res) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token && !productionStore) productionStore = createRedisWorld({ url, token });
  return handleWorldRequest(req, res, productionStore);
}
