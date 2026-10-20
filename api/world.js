import { jobs } from '../src/application.js';
import { getBotOccupiedJobs } from '../src/crowd.js';
import { SEAT_IDS, SEAT_POSITIONS } from '../src/seat-catalog.js';
import { normalizeVisitorName } from '../src/visitor-profile.js';

export const VISITOR_TTL_MS = 25_000;
const PREFIX = 'common-ground:v2:';
const JOB_IDS = jobs.map(job => job.id);
export const CHALLENGE_HITS = 1;
const CHALLENGE_RADIUS = 2.4;
const actions = new Set(['join', 'move', 'leave', 'claim', 'release', 'challenge']);
const publicFields = visitor => ({ id: visitor.id, name: normalizeVisitorName(visitor.name) || 'Visitor', x: visitor.x, z: visitor.z, hair: visitor.hair, rotation: visitor.rotation, seatedJobId: visitor.seatedJobId ?? null, lastSeen: visitor.lastSeen });
// Omitting a name is different from explicitly supplying an empty name: older
// clients must not replace an existing visitor's chosen name with a fallback.
const nameFields = state => Object.hasOwn(state, 'name') ? { name: normalizeVisitorName(state.name) || 'Visitor' } : {};

export function validateCommand(value) {
  if (!value || !actions.has(value.action)) throw new Error('Unknown action.');
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(value.id)) throw new Error('Invalid visitor ID.');
  if (typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('Invalid visitor credential.');
  if (value.action === 'claim' && !SEAT_IDS.includes(value.jobId)) throw new Error('Unknown seat.');
  if (value.action === 'challenge' && !JOB_IDS.includes(value.jobId)) throw new Error('Unknown seat.');
  const state = value.state || {};
  if (['join', 'move', 'claim', 'challenge'].includes(value.action)) {
    if (![state.x, state.z, state.rotation].every(Number.isFinite) || Math.abs(state.x) > 1_000_000 || Math.abs(state.z) > 1_000_000 || Math.abs(state.rotation) > 1000) throw new Error('Invalid position.');
    if (!Number.isInteger(state.hair) || state.hair < 0 || state.hair > 5) throw new Error('Invalid hairstyle.');
  }
  return { action: value.action, id: value.id, token: value.token, jobId: value.jobId, state: { x: state.x, z: state.z, rotation: state.rotation, hair: state.hair, ...nameFields(state) } };
}

// The local development process shares this store across all connected browsers.
// Production deliberately requires Redis rather than pretending serverless memory is shared.
export function createMemoryWorld({ now = Date.now } = {}) {
  const visitors = new Map();
  const seats = new Map();
  const botDefeats = new Map();
  function clean(time) {
    for (const [id, visitor] of visitors) if (time - visitor.lastSeen >= VISITOR_TTL_MS) visitors.delete(id);
    for (const [jobId, owner] of seats) if (!visitors.has(owner)) seats.delete(jobId);
  }
  function snapshot(time) { return { visitors: [...visitors.values()].map(publicFields), seats: Object.fromEntries(seats), botDefeats: Object.fromEntries(botDefeats), serverTime: time, status: 'shared', storage: 'memory' }; }
  return {
    async dispatch(command = { action: 'snapshot' }) {
      const time = now(); clean(time);
      if (command.action === 'snapshot') return snapshot(time);
      const { action, id, token, state, jobId } = command;
      const previous = visitors.get(id);
      if (previous && previous.token !== token) return { error: 'Visitor credential does not match.', code: 403 };
      const release = () => { for (const [key, owner] of seats) if (owner === id) seats.delete(key); };
      if (action === 'leave') {
        release(); visitors.delete(id);
        return snapshot(time);
      }
      const visitor = { ...(previous || { id, token, name: 'Visitor', x: 0, z: 0, rotation: 0, hair: 5, seatedJobId: null }), ...(state?.x !== undefined ? state : {}), ...nameFields(state || {}), lastSeen: time };
      if (visitor.seatedJobId && seats.get(visitor.seatedJobId) !== id) visitor.seatedJobId = null;
      let claimed, challenge;
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
      if (visitor.seatedJobId) Object.assign(visitor, SEAT_POSITIONS[visitor.seatedJobId]);
      visitors.set(id, visitor);
      return { ...snapshot(time), ...(claimed !== undefined ? { claimed } : {}), ...(challenge ? { challenge } : {}) };
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
local function release()
  for _, key in ipairs(jobIds) do if redis.call('GET', seatKey(key)) == id then redis.call('DEL', seatKey(key)) end end
end
local claimed, challenge = nil, nil
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
    if visitor.seatedJobId and visitor.seatedJobId ~= cjson.null then
      local position=seatPositions[visitor.seatedJobId]
      visitor.x=position.x; visitor.z=position.z; visitor.rotation=position.rotation
    end
    visitor.lastSeen=now
    redis.call('SET',visitorKey(id),cjson.encode(visitor),'PX',ttl)
    redis.call('SADD',visitorSet,id)
  end
end
local result={visitors={}, seats={}, botDefeats={}, serverTime=now, status='shared', storage='redis'}
if claimed ~= nil then result.claimed=claimed end
if challenge ~= nil then result.challenge=challenge end
local defeats=redis.call('HGETALL',defeatKey)
for index=1,#defeats,2 do result.botDefeats[defeats[index]]=tonumber(defeats[index+1]) end
for _, visitorId in ipairs(redis.call('SMEMBERS',visitorSet)) do
  local raw=redis.call('GET',visitorKey(visitorId))
  if raw then
    local visitor=cjson.decode(raw)
    visitor.token=nil
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
      const state = { ...(command.state || {}), ...nameFields(command.state || {}) };
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
