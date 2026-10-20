import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { BackSide, Box3, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { STATION_POSITIONS, getBots, getBotOccupiedJobs, getSocialBots, BOT_COUNT, SOCIAL_BOT_COUNT } from '../src/crowd.js';
import { jobs as allJobs } from '../src/application.js';
import { getStationColliders } from '../src/station-layout.js';
import { GARDEN_COLLIDERS, GARDEN_SPAWN, GARDEN_WORKSPACES, GARDEN_ROOMS, GARDEN_WALLS, GARDEN_DOORWAYS } from '../src/garden-layout.js';
import { SOCIAL_SEATS } from '../src/social-layout.js';
import { FURNITURE_SEATS } from '../src/furniture-seats.js';
import { INFO_OBJECTS } from '../src/info-content.js';
import { SEAT_APPROACH_OFFSET } from '../src/station-layout.js';
import { findWalkRoute } from '../src/navigation.js';
import { inflateObstacles, segmentObstacleEntry } from '../src/collision.js';
import { FIGHTER_IDS, SPECTATOR_IDS, FIGHT_CYCLE_MS, getFightScene, getFightBodyVolumes } from '../src/fight-choreography.js';
import { SEAT_FRONT_LANE } from '../src/seat-transition.js';
import { animateCharacter, resetCharacterPose, SEATED_HIP_HEIGHT } from '../src/character-motion.js';

// Exercise the real world coordinator, math, scene, character rigs, and ticks.
// Only GPU/DOM boundaries and the crowd clock are supplied by this Node fixture.
const threePath = fileURLToPath(new URL('../node_modules/three/build/three.module.js', import.meta.url));
const worldPath = fileURLToPath(new URL('../src/world.js', import.meta.url));
const bundled = await build({
  stdin: { contents: `import {createWorld} from ${JSON.stringify(worldPath)}; globalThis.fixture.createWorld=createWorld;`, resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  plugins: [{ name: 'world-cpu-fixture', setup(plugin) {
    plugin.onLoad({filter:/\/src\/world\.js$/},async args=>{
      const original=await readFile(args.path,'utf8');
      const marker='const routeBounds=inflateObstacles(furnitureBounds);';
      assert.equal(original.split(marker).length,2,'the fixture observes the actual combined physical furnishings');
      const actors='const botCharacters = new Map();';
      assert.equal(original.split(actors).length,2,'the fixture observes the actual resolved background actors');
      const fight=original.match(/let fightClockMs = null, fightPaused = false[^;]*;/)?.[0];
      assert.ok(fight,'the fixture observes the shared encounter clock');
      return {loader:'js',resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),
        contents:original.replace('const target = new THREE.Vector3(0, 0, 4.8);','const target = new THREE.Vector3(globalThis.fixture.spawn?.x??0,0,globalThis.fixture.spawn?.z??4.8);')
          .replace('const playerPosition = new THREE.Vector3(0, 0, 4.8);','const playerPosition = new THREE.Vector3(globalThis.fixture.spawn?.x??0,0,globalThis.fixture.spawn?.z??4.8);')
          .replace(marker,`globalThis.fixture.physicalBounds=furnitureBounds;${marker}if(globalThis.fixture.chooseSpawn){const spawn=globalThis.fixture.chooseSpawn(furnitureBounds);playerPosition.set(spawn.x,0,spawn.z);target.copy(playerPosition);}`)
          .replace(actors,`${actors}globalThis.fixture.crowdActors=botCharacters;`)
          .replace(fight,`${fight}Object.defineProperty(globalThis.fixture,'fightState',{get:()=>({clock:fightClockMs,paused:fightPaused})});`)};
    });
    plugin.onResolve({ filter: /^three$/ }, () => ({ path: 'three-fixture', namespace: 'fixture' }));
    plugin.onResolve({ filter: /^\.\/crowd\.js$/ }, () => ({ path: 'crowd-fixture', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: fileURLToPath(new URL('..', import.meta.url)), contents: args.path === 'three-fixture'
      ? `export * from ${JSON.stringify(threePath)}; export class WebGLRenderer { constructor(){this.domElement=globalThis.fixture.node('canvas');globalThis.fixture.canvas=this.domElement;this.shadowMap={};} setPixelRatio(){} setClearColor(){} setSize(){} render(scene,camera){globalThis.fixture.scene=scene;globalThis.fixture.camera=camera;} dispose(){} }`
      : 'export const STATION_POSITIONS=globalThis.fixture.positions;export const BOT_SEATED_JOB_INDICES=[2,5,8];export const getBots=(now,jobs,defeats,fightClock)=>globalThis.fixture.botGenerator?globalThis.fixture.botGenerator(now,jobs,defeats,fightClock):globalThis.fixture.bots;export const getBotOccupiedJobs=(now,jobs,defeats)=>globalThis.fixture.botOccupiedGenerator?globalThis.fixture.botOccupiedGenerator(now,jobs,defeats):globalThis.fixture.bots.map(bot=>bot.seatedJobId).filter(Boolean);export const getSocialBots=now=>globalThis.fixture.socialGenerator?globalThis.fixture.socialGenerator(now):[];' }));
  } }],
});
const source = bundled.outputFiles[0].text;

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, listener) { const next = this.listeners.get(name) || []; next.push(listener); this.listeners.set(name, next); }
  removeEventListener(name, listener) { this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== listener)); }
  fire(name, event = {}) { for (const listener of [...(this.listeners.get(name) || [])]) listener(event); }
}

function setup(t, { spawn = null, chooseSpawn = null, bots = [], botGenerator = null, socialGenerator = null, jobs = [{ id: 'product-designer', title: 'Product Designer' }, { id: 'frontend-engineer', title: 'Frontend Engineer' }] } = {}) {
  let clock = 0, callback = null, nextFrame = 0;
  const calls = [], fightFrames = [];
  const document = Object.assign(new EventTarget(), { hidden: false });
  function node(tag = 'div') {
    return Object.assign(new EventTarget(), {
      tag, tagName:tag.toUpperCase(), style: {}, hidden: false, children: [], clientWidth: 1280, clientHeight: 900, ownerDocument: document,
      append(...nodes) { this.children.push(...nodes); }, remove() { this.removed = true; },
      setAttribute() {}, setPointerCapture() {}, focus() { document.activeElement = this; },
      closest() { return null; }, getBoundingClientRect: () => ({ left: 37, top: 59, width: 1280, height: 900 }),
    });
  }
  document.createElement = node;
  const window = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
  const fixture = { node, spawn, chooseSpawn, positions: STATION_POSITIONS, bots, botGenerator, botOccupiedGenerator:botGenerator === getBots ? getBotOccupiedJobs : null, socialGenerator, scene: null };
  class ClockDate extends Date { static now() { return 1_800_000_000_000 + clock; } }
  vm.runInNewContext(source, {
    fixture, window, document, Date: ClockDate, console, AbortController,
    performance: { now: () => clock },
    requestAnimationFrame: fn => { callback = fn; return ++nextFrame; },
    cancelAnimationFrame: () => { callback = null; },
    setTimeout: () => 1, clearTimeout() {},
    ResizeObserver: class { observe() {} disconnect() {} },
  }, { filename: 'world-transition.bundle.js' });
  const world = fixture.createWorld({
    container: node(), jobs,
    onSeat: job => calls.push(['seat', job.id, clock]),
    onSeatReady: job => calls.push(['ready', job.id, clock]),
    onStandUpStart: (id, reason) => calls.push(['start', id, reason, clock]),
    onStandUp: (id, reason) => calls.push(['standing', id, reason, clock]),
    onInfoSelect: object => calls.push(['information', object.id, clock]),
    onFootstep: event => calls.push(['footstep', event, clock]),
    onFightFrame: event => fightFrames.push(event),
  });
  let destroyed = false;
  const destroy = () => { if (!destroyed) { destroyed = true; world.destroy(); } };
  t.after(destroy);
  const step = (milliseconds = 50) => {
    clock += milliseconds;
    const frame = callback; callback = null;
    assert.ok(frame, 'the world has a scheduled animation frame');
    frame(clock);
  };
  step(0);
  const key = (type, value, overrides={}) => window.fire(type, { key: value, code:value===' '?'Space':undefined, target: document.activeElement || node(), preventDefault() {}, stopPropagation() {}, ...overrides });
  const groundEvent = (type, point, overrides = {}) => {
    const projected = new Vector3(point.x, point.y || 0, point.z).project(fixture.camera);
    const bounds = fixture.canvas.getBoundingClientRect();
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'the ground target is visible within the canvas');
    fixture.canvas.fire(type, {
      button: 0, pointerId: 1, target: fixture.canvas, currentTarget: fixture.canvas,
      clientX: bounds.left + (projected.x + 1) * bounds.width / 2,
      clientY: bounds.top + (1 - projected.y) * bounds.height / 2,
      preventDefault() {}, ...overrides,
    });
  };
  return { world, calls, fightFrames, fixture, step, key, groundEvent, node, destroy, get clock() { return clock; } };
}

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} versus ${expected}`);
const headingError = (actual, expected) => Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)));
function assertWalkingTurn(character, previous, previousYaw, description) {
  const dx = character.position.x - previous.x, dz = character.position.z - previous.z;
  assert.ok(Math.hypot(dx,dz)>1e-7,`${description}: changing direction keeps the character walking`);
  const heading = Math.atan2(dx, dz);
  assert.ok(headingError(character.rotation.y,previousYaw)<Math.PI*.35,
    `${description}: the body turns smoothly instead of snapping to its new heading`);
  assert.ok(headingError(character.rotation.y,heading)<=headingError(previousYaw,heading)+1e-5,
    `${description}: the body turns toward its requested travel while walking`);
  return Math.hypot(dx,dz);
}
function cameraHeading(camera){const direction=camera.getWorldDirection(new Vector3());return Math.atan2(direction.x,direction.z);}
const seatCoordinates = () => ({ x: STATION_POSITIONS[0][0], z: STATION_POSITIONS[0][1] + 1.5 });
function settleIntoSeat(ui, id = 'product-designer', { maxFrames = 240 } = {}) {
  assert.equal(ui.world.sitAt(id), true, 'the requested clear chair is reserved');
  for (let frame = 0; frame < maxFrames && !ui.world.isSeatReady(id); frame++) ui.step();
  assert.equal(ui.world.isSeatReady(id), true, 'the visible approach and lowering finish before proceeding');
}
function settleOutOfSeat(ui,{maxFrames=240,onFrame=()=>{}}={}){
  for(let frame=0;frame<maxFrames&&ui.world.isStandingUp();frame++){ui.step();onFrame();}
  assert.equal(ui.world.isStandingUp(),false,'the physical departure finishes within the bounded wait');
}

test('local footstep contacts follow alternating planted feet during keyboard and double-click walks, while ambient walkers stay silent', t => {
  const ui = setup(t, { botGenerator: now => [{ id: 'ambient-walker', x: 4 + Math.sin(now / 1000), z: 7, rotation: 0, moving: true, seatedJobId: null }] });
  const contacts = () => ui.calls.filter(([type]) => type === 'footstep');
  const ambient = ui.fixture.crowdActors.get('ambient-walker');
  assert.ok(ambient?.placed, 'the ambient walker is actually present in the rendered world');
  const ambientStart = ambient.character.position.clone();
  for (let frame = 0; frame < 16; frame++) ui.step();
  assert.ok(ambient.character.position.distanceTo(ambientStart) > .05, 'the background character really walks while the local player is idle');
  assert.equal(contacts().length, 0, 'an idle player does not inherit the walking bot’s footfalls');

  ui.key('keydown', 'ArrowRight');
  for (let frame = 0; frame < 20; frame++) ui.step();
  ui.key('keyup', 'ArrowRight');
  const keyboard = contacts();
  assert.ok(keyboard.length >= 3, 'resolved keyboard movement produces actual landing events');
  for (let index = 0; index < keyboard.length; index++) {
    const [, event, clock] = keyboard[index];
    assert.ok(['left', 'right'].includes(event.side));
    assert.ok(Math.abs(event.position.y) < .025, `the audible impact is planted on the rendered floor: ${event.position.y}`);
    assert.ok(event.speed > 0 && Number.isFinite(event.position.x) && Number.isFinite(event.position.z));
    close(event.time, clock / 1000, 'the gait event uses the current animation tick');
    if (index) assert.notEqual(event.side, keyboard[index - 1][1].side, 'the left and right planted feet alternate');
  }
  for (let frame = 0; frame < 12; frame++) ui.step();
  assert.equal(contacts().length, keyboard.length, 'feet settling after release do not play extra impacts');

  ui.groundEvent('dblclick', { x: 0, z: 4.8 });
  for (let frame = 0; frame < 35; frame++) ui.step();
  assert.ok(contacts().length > keyboard.length, 'walking to a double-click destination uses the same landing callback');
  const stoppedCount = contacts().length;
  for (let frame = 0; frame < 12; frame++) ui.step();
  assert.equal(contacts().length, stoppedCount, 'the target arrival stops sound while the ambient bot keeps walking');
});

test('local footsteps stay silent during blocked movement, chair lowering, seated idle, and the delayed rise', t => {
  const ui = setup(t);
  const contacts = () => ui.calls.filter(([type]) => type === 'footstep');
  ui.world.setVisitors([{ id: 'solid-person', x: 0, z: 4.8 - .8, seatedJobId: null }]);
  ui.step();
  ui.key('keydown', 'w');
  for (let frame = 0; frame < 4; frame++) ui.step();
  const blockedAt = ui.world.getPlayerState();
  assert.ok(4.8 - blockedAt.z < .01, 'only the small initial gap closes before body contact');
  for (let frame = 0; frame < 14; frame++) ui.step();
  close(ui.world.getPlayerState().x, blockedAt.x, 'solid character blocks walking x');
  close(ui.world.getPlayerState().z, blockedAt.z, 'solid character blocks walking z');
  assert.equal(contacts().length, 0, 'holding a movement key against a body cannot trigger phantom walking sounds');
  ui.key('keyup', 'w');
  ui.world.setVisitors([]);

  assert.equal(ui.world.sitAt('product-designer'), true);
  const player = worldCharacters(ui.fixture)[0];
  let previous = contacts().length, sawLowering = false;
  for (let frame = 0; frame < 160 && !ui.world.isSeatReady('product-designer'); frame++) {
    ui.step();
    if (player.userData.motion.poseMode === 'lowering') {
      sawLowering = true;
      assert.equal(contacts().length, previous, 'cushion transfers and lowering do not imitate a walking step');
    }
    previous = contacts().length;
  }
  assert.equal(sawLowering, true);
  assert.equal(ui.world.isSeatReady('product-designer'), true);
  const seatedCount = contacts().length;
  for (let frame = 0; frame < 12; frame++) ui.step();
  assert.equal(contacts().length, seatedCount);
  ui.world.standUp('movement');
  for (let frame = 0; frame < 14; frame++) ui.step();
  assert.equal(contacts().length, seatedCount, 'the delayed get-up pose stays quiet until genuine walking resumes');
});


test('real world holds the logical chair while rising, then releases after physically stepping clear', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  const seat = seatCoordinates();
  assert.equal(ui.world.isSeatReady('product-designer'), true);
  let completed = false;
  const departure = ui.world.standUp('movement');
  assert.ok(departure && typeof departure.then === 'function', 'leaving is asynchronous');
  departure.then(() => { completed = true; });
  assert.equal(ui.world.isSeatReady('product-designer'), false);
  for (let frame = 0; frame < 14; frame++) {
    ui.step();
    const state = ui.world.getPlayerState();
    assert.equal(state.seatedJobId, 'product-designer', 'the shared chair stays reserved while rising');
    close(state.x, seat.x, 'rising x'); close(state.z, seat.z, 'rising z');
    assert.equal(completed, false);
  }
  assert.equal(ui.calls.filter(([type]) => type === 'start').length, 1);
  assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 0);
  settleOutOfSeat(ui);
  await departure;
  assert.equal(completed, true);
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 1);
  assert.ok(ui.calls.find(([type]) => type === 'standing')[3] - ui.calls.find(([type]) => type === 'start')[3] >= 1050);
});

test('holding movement keys cannot move the character before the get-up delay has finished', t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  const seat = seatCoordinates();
  ui.key('keydown', 'w');
  for (let frame = 0; frame < 14; frame++) {
    ui.step();
    const state = ui.world.getPlayerState();
    close(state.x, seat.x, 'key-held rise x'); close(state.z, seat.z, 'key-held rise z');
    assert.equal(state.seatedJobId, 'product-designer');
  }
  ui.key('keyup', 'w');
  settleOutOfSeat(ui);
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.filter(([type]) => type === 'start').length, 1, 'repeated movement does not restart the exit');
});

test('destroying an active exit settles its pending operation without publishing a stale stand-up event', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  const departure = ui.world.standUp('navigation');
  for (let frame = 0; frame < 4; frame++) ui.step();
  ui.destroy();
  await departure;
  assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 0, 'an old world cannot release a later world’s presence');
});

const worldCharacters = fixture => fixture.scene.children.filter(item => item.name === 'sculpted-cartoon-character' && item.visible);
const assertSeparated = characters => {
  for (let index = 0; index < characters.length; index++) for (let other = index + 1; other < characters.length; other++) {
    const a = characters[index].position, b = characters[other].position;
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.8-1e-7, 'visible character bodies stay separated');
  }
};

function assertFallenBodyClear(character,characters,jobIndex,elapsed,physicalBounds){
  const point=new Vector3(),mesh=character.userData.mesh;
  character.updateMatrixWorld(true);
  const solids=physicalBounds
    .filter(object=>!(object.kind==='applicant-chair'&&object.stationIndex===jobIndex));
  const heightBand={desk:[.79,.95],'applicant-chair':[.12,1.12],'recruiter-chair':[.12,1.12],sofa:[.15,1.05],beanbag:[0,.62],whiteboard:[.08,1.7],plant:[0,1.3],planting:[0,.5],tree:[0,1.2]};
  let floor=Infinity;
  const vertices=mesh.geometry.getAttribute('position');
  for(let index=0;index<vertices.count;index++){
    mesh.getVertexPosition(index,point);point.applyMatrix4(mesh.matrixWorld);
    floor=Math.min(floor,point.y);
    for(const object of solids){
      const [low,high]=heightBand[object.kind]||[0,1.2];
      const intrusion=point.y>low+.02&&point.y<high-.02
        &&Math.abs(point.x-object.x)<object.halfX-.015&&Math.abs(point.z-object.z)<object.halfZ-.015;
      assert.equal(intrusion,false,intrusion
        ? `actual falling skin clears ${object.kind} at ${elapsed}ms; vertex ${index} at ${point.toArray()}, root ${character.position.toArray()}, yaw ${character.rotation.y}, object ${JSON.stringify(object)}`
        : `actual falling skin clears ${object.kind} at ${elapsed}ms`);
    }
    for(const other of characters){
      if(other===character)continue;
      assert.ok(point.y<.12||point.y>1.95||Math.hypot(point.x-other.position.x,point.z-other.position.z)>.29,
        `actual falling skin clears the solid core of every other person at ${elapsed}ms`);
    }
  }
  assert.ok(floor>=-.06,`actual falling skin stays above the lawn at ${elapsed}ms; minY=${floor}`);
}

test('a motionless visitor blocks held forward movement and the player can back away deliberately', t => {
  const ui = setup(t);
  ui.world.setVisitors([{ id: 'in-the-path', x: 0, z: 3.3, hair: 2, rotation: 0, seatedJobId: null }]);
  ui.key('keydown', 'w');
  for (let frame = 0; frame < 30; frame++) { ui.step(); assertSeparated(worldCharacters(ui.fixture)); }
  const stopped = ui.world.getPlayerState();
  close(stopped.x, 0, 'a body bump does not slide sideways');
  assert.ok(stopped.z>=4.1 && stopped.z<4.102, 'the player stops before the other character');
  ui.key('keyup', 'w');
  ui.key('keydown', 's');
  for (let frame = 0; frame < 20; frame++) ui.step();
  ui.key('keyup', 's');
  assert.ok(ui.world.getPlayerState().z>stopped.z+.3, 'moving back escapes contact');
});

test('a walking bot routes around a motionless player without walking through them', t => {
  const bot = { id: 'bot-9', x: 0, z: 2.8, hair: 1, rotation: 0, moving: true, seatedJobId: null };
  const ui = setup(t, { bots: [bot] });
  for (let frame = 0; frame < 100; frame++) {
    bot.z = Math.min(7, 2.8 + frame * .06);
    ui.step();
    assertSeparated(worldCharacters(ui.fixture));
  }
  const actor = worldCharacters(ui.fixture)[1];
  assert.ok(actor.position.z>5.6, 'the bot eventually walks around and past the stationary player');
});

test('coincident remote visitor arrivals are placed separately and cannot push through the local player', t => {
  const ui = setup(t);
  const arrivals = ['first', 'second', 'third'].map(id => ({ id, x: 0, z: 4.8, hair: 2, rotation: 0, seatedJobId: null }));
  ui.world.setVisitors(arrivals);
  for (let frame = 0; frame < 40; frame++) {
    ui.step();
    const visible = worldCharacters(ui.fixture);
    assert.equal(visible.length, 4, 'all arrivals receive a clear placement');
    assertSeparated(visible);
    close(ui.world.getPlayerState().x, 0, 'arrivals cannot push player x');
    close(ui.world.getPlayerState().z, 4.8, 'arrivals cannot push player z');
  }
});

test('occupied front-side departures pause after rising and retain the chair until a path clears', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  const seat=seatCoordinates();
  ui.world.setVisitors([-1.1, 1.1].map((x, index) => ({ id: `blocking-exit-${index}`, x:seat.x+x, z:seat.z-SEAT_FRONT_LANE, hair: 1, seatedJobId: null })));
  let completed = false;
  const departure = ui.world.standUp('movement');
  departure.then(() => { completed = true; });
  for (let frame = 0; frame < 50; frame++) { ui.step(); assertSeparated(worldCharacters(ui.fixture)); }
  assert.equal(completed, false);
  assert.equal(ui.world.getPlayerState().seatedJobId, 'product-designer', 'blocking people do not make the chair available early');
  assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 0);
  ui.world.setVisitors([]);
  settleOutOfSeat(ui,{onFrame:()=>assertSeparated(worldCharacters(ui.fixture))});
  await departure;
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 1);
});

test('getting up uses the other front-side departure when the preferred side is occupied', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  const seat=seatCoordinates();
  ui.world.setVisitors([{ id: 'beside-chair', x:seat.x-1.1, z:seat.z-SEAT_FRONT_LANE, hair: 1, seatedJobId: null }]);
  const departure = ui.world.standUp('movement');
  settleOutOfSeat(ui,{onFrame:()=>assertSeparated(worldCharacters(ui.fixture))});
  await departure;
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.ok(ui.world.getPlayerState().x > seat.x+1, 'the clear opposite side is used without crossing the person or backrest');
  close(ui.world.getPlayerState().z,seat.z-SEAT_FRONT_LANE,'the final position stays in the front departure lane');
});

test('manual movement during a delayed job navigation cancels the queued destination', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  ui.world.goToJob('frontend-engineer');
  for (let frame = 0; frame < 5; frame++) ui.step();
  ui.key('keydown', 'w');
  ui.key('keyup', 'w');
  settleOutOfSeat(ui);
  await Promise.resolve();
  const afterExit = ui.world.getPlayerState();
  for (let frame = 0; frame < 30; frame++) ui.step();
  close(ui.world.getPlayerState().x, afterExit.x, 'a cancelled destination does not resume x movement');
  close(ui.world.getPlayerState().z, afterExit.z, 'a cancelled destination does not resume z movement');
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
});

test('selecting another opportunity automatically leaves the current chair and walks to the next seat without movement keys', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  const character = worldCharacters(ui.fixture)[0];
  const probes = [0, 1].map(index => makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName(`job-lounge-${index}`)));
  try {
    const before = character.position.clone();
    assert.equal(ui.world.goToJob('product-designer'), true, 'selecting the current opportunity keeps the visitor seated');
    assert.equal(ui.world.isSeatReady('product-designer'), true);
    assert.equal(ui.world.isStandingUp(), false);
    assert.equal(ui.calls.filter(([type]) => type === 'start').length, 0);
    assert.equal(ui.world.goToJob('frontend-engineer'), true, 'selecting a new opportunity starts the transfer directly');
    assert.equal(ui.world.isStandingUp(), true, 'the existing smooth get-up sequence starts without a key press');
    assert.ok(character.position.distanceTo(before) < 1e-7, 'choosing the new seat never teleports the visible character');
    for (let frame = 0; frame < 5; frame++) ui.step();
    assert.equal(ui.world.isStandingUp(), true, 'the visitor is still rising when changing the selected opportunity');
    assert.equal(ui.world.goToJob('product-designer'), true, 'the visitor can change the queued destination while getting up');
    assert.equal(ui.world.goToJob('frontend-engineer'), true, 'the latest opportunity selection replaces the queued return');
    let previous = character.position.clone(), sawWalk = false, sawSecondEntry = false;
    const collisionErrors = [];
    for (let frame = 0; frame < 600 && !ui.world.isSeatReady('frontend-engineer'); frame++) {
      const leaving = ui.world.isStandingUp();
      ui.step();
      const state = ui.world.getPlayerState();
      if (leaving && ui.world.isStandingUp()) {
        assert.equal(state.seatedJobId, 'product-designer', 'the original chair remains reserved until the visitor walks clear');
        assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 0, 'the old chair is not released during its physical exit');
      }
      if (!state.seatedJobId && !ui.world.isStandingUp()) sawWalk = true;
      if (state.seatedJobId === 'frontend-engineer') {
        sawSecondEntry = true;
        assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 1, 'the new seat is reserved only after the old chair is released');
      }
      assert.equal(worldCharacters(ui.fixture)[0], character, 'the entire trip uses the same character rig');
      assert.ok(character.position.distanceTo(previous) <= 2.25 * .05 + .0001, 'the exit, walking route, and new entry stay at normal walking speed');
      for (const probe of probes) {
        try { probe.assertClear(character, `opportunity-to-opportunity transfer frame ${frame}; leaving=${ui.world.isStandingUp()}, entering=${ui.world.isSittingDown()}, seat=${state.seatedJobId}`); }
        catch (error) { if (collisionErrors.length < 8) collisionErrors.push(error.message); }
      }
      previous.copy(character.position);
      await Promise.resolve();
    }
    assert.equal(sawWalk, true, 'the visitor walks between the two lounge chairs');
    assert.equal(sawSecondEntry, true, 'the destination chair is approached and lowered into automatically');
    assert.equal(ui.world.isSeatReady('frontend-engineer'), true, 'the new role opens after reaching the second seated pose');
    assert.deepEqual(ui.calls.filter(([type]) => type === 'ready').map(([, id]) => id), ['product-designer', 'frontend-engineer']);
    assert.deepEqual(ui.calls.filter(([type]) => type === 'seat').map(([, id]) => id), ['product-designer', 'frontend-engineer'], 'only the newest destination reserves a chair');
    assert.equal(ui.calls.filter(([type]) => type === 'start').length, 1, 'the user does not need a separate manual exit action');
    assert.deepEqual(collisionErrors, [], 'the complete automatic trip clears the furniture at both chairs');
  } finally {
    for (const probe of probes) probe.dispose();
  }
});

test('the actual nineteen-bot crowd stays separate through shared paths, conversations, sparring, tennis, and chair departures', t => {
  const ui = setup(t, { jobs: allJobs, botGenerator: getBots, socialGenerator: getSocialBots });
  const defeats = Object.fromEntries([2, 5, 8].map(index => [allJobs[index].id, 1_800_000_000_000 + 3000]));
  for (let frame = 0; frame < 600; frame++) {
    if (frame === 60) ui.world.setBotDefeats(defeats);
    ui.step();
    const characters = worldCharacters(ui.fixture);
    assert.equal(characters.length, 1 + BOT_COUNT + SOCIAL_BOT_COUNT, `all nineteen bots remain visibly placed at frame ${frame}`);
    assertSeparated(characters);
    // Seat cushions are deliberate owned transfers. Every other physical
    // furnishing and rail remains solid during the whole shared simulation.
    const solids = [...GARDEN_COLLIDERS, ...getStationColliders(STATION_POSITIONS)]
      .filter(object => !['applicant-chair', 'recruiter-chair'].includes(object.kind));
    for (const character of characters) for (const object of solids) {
      assert.ok(Math.abs(character.position.x-object.x) >= object.halfX+.32-1e-7
        || Math.abs(character.position.z-object.z) >= object.halfZ+.32-1e-7,
      `visible crowd avoids the ${object.kind || 'furniture'} footprint at frame ${frame}`);
    }
  }
});

test('a chair transfer cannot pass through another visitor to sit down', t => {
  const ui = setup(t);
  ui.world.setVisitors([{ id: 'between-player-and-chair', x: 0, z: 2, hair: 1, seatedJobId: null }]);
  const accepted = ui.world.sitAt('product-designer');
  // Either refusal at claim time or a reserved, paused approach is valid; the
  // visible body must never cross the waiting person to reach the cushion.
  for (let frame = 0; frame < 120; frame++) {
    ui.step();
    assertSeparated(worldCharacters(ui.fixture));
    assert.equal(ui.world.isSeatReady('product-designer'), false);
  }
  if (!accepted) assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.some(([type]) => type === 'ready'), false);
});

test('an obstructed won-chair arrival stays visibly standing and withholds the sidebar-ready callback', t => {
  const ui = setup(t);
  ui.world.setBotDefeats({ 'product-designer': 1_800_000_000_000 });
  assert.equal(ui.world.sitAt('product-designer'), true);
  assert.equal(ui.world.isSeatReady('product-designer'), false);
  ui.world.setVisitors([{ id: 'beside-the-handoff', x: 0, z: .3, hair: 1, seatedJobId: null }]);
  for (let frame = 0; frame < 75; frame++) {
    ui.step();
    assertSeparated(worldCharacters(ui.fixture));
    assert.equal(ui.world.isSeatReady('product-designer'), false);
  }
  assert.equal(ui.calls.some(([type]) => type === 'ready'), false, 'a logical claim alone must not show the job sidebar');
  ui.world.setVisitors([]);
  for (let frame = 0; frame < 240 && !ui.world.isSeatReady('product-designer'); frame++) ui.step();
  assert.equal(ui.world.isSeatReady('product-designer'), true);
  assert.equal(ui.calls.filter(([type]) => type === 'ready').length, 1);
});

test('single clicks leave the player still and a double click walks to the projected floor coordinate', t => {
  const ui = setup(t);
  const start = ui.world.getPlayerState(), destination = { x: 3, z: 4.8 };
  ui.groundEvent('pointerdown', destination);
  ui.groundEvent('pointerup', destination);
  ui.groundEvent('click', destination);
  for (let frame = 0; frame < 20; frame++) ui.step();
  close(ui.world.getPlayerState().x, start.x, 'single click x');
  close(ui.world.getPlayerState().z, start.z, 'single click z');

  ui.groundEvent('dblclick', destination);
  close(ui.world.getPlayerState().x, start.x, 'double click never teleports x');
  close(ui.world.getPlayerState().z, start.z, 'double click never teleports z');
  ui.step();
  const firstStep = ui.world.getPlayerState();
  assert.ok(firstStep.x>start.x&&firstStep.x<start.x+.12,'the first animation tick begins a normal step toward the clicked destination');
  close(firstStep.z, start.z, 'the step stays on the requested clear ground line');
  assert.ok(headingError(firstStep.rotation, Math.PI) > .1, 'the body begins turning toward the clicked destination');
  assert.ok(headingError(firstStep.rotation,Math.PI/2)>.5,'the first step blends the body turn instead of snapping to its destination heading');
  for (let frame = 0; frame < 140; frame++) ui.step();
  const arrived = ui.world.getPlayerState();
  assert.ok(Math.hypot(arrived.x - destination.x, arrived.z - destination.z) < .061, 'walking arrives at the real raycast ground target');
  assert.equal(arrived.seatedJobId, null);
});

test('left, back, and diagonal keyboard directions walk immediately while the body turns smoothly', t => {
  for (const direction of [
    { name: 'left', keys: ['ArrowLeft'], heading: -Math.PI / 2 },
    { name: 'back', keys: ['ArrowDown'], heading: 0 },
    { name: 'diagonal left', keys: ['ArrowUp', 'ArrowLeft'], heading: -Math.PI * .75 },
  ]) {
    const ui = setup(t), character = worldCharacters(ui.fixture)[0];
    const start = character.position.clone();
    let previous = start.clone(), previousYaw=character.rotation.y, previousCameraHeading=cameraHeading(ui.fixture.camera);
    direction.keys.forEach(key => ui.key('keydown', key));
    for (let frame = 0; frame < 20; frame++) {
      ui.step();
      assertWalkingTurn(character,previous,previousYaw,`${direction.name}, frame ${frame}`);
      const cameraYaw=cameraHeading(ui.fixture.camera);
      assert.ok(headingError(cameraYaw,previousCameraHeading)<=25*Math.PI/180*.05+1e-7,
        `${direction.name}: the trailing camera turns gradually while the body steers`);
      if(frame===0)assert.ok(headingError(character.rotation.y,direction.heading)>.1,
        `${direction.name}: walking starts during the turn, without snapping the body heading`);
      previous.copy(character.position);
      previousYaw=character.rotation.y;previousCameraHeading=cameraYaw;
    }
    const travel = character.position.clone().sub(start);
    assert.ok(travel.length() > 1, `${direction.name}: a held direction produces a real walk`);
    assert.ok(headingError(Math.atan2(travel.x, travel.z), direction.heading) < .01,
      `${direction.name}: camera follow cannot curve a held keyboard direction`);
    assert.ok(headingError(character.rotation.y,direction.heading)<.03,`${direction.name}: the body settles into its walking heading`);
    direction.keys.forEach(key => ui.key('keyup', key));
    ui.destroy();
  }
});

test('reversing a held walking direction keeps normal walking speed while the body turns', t => {
  const ui = setup(t), character = worldCharacters(ui.fixture)[0];
  ui.key('keydown', 'w');
  for (let frame = 0; frame < 12; frame++) ui.step();
  const turningAt = character.position.clone(), originalYaw = character.rotation.y;
  ui.key('keydown', 's'); ui.key('keyup', 'w');
  let previous = turningAt.clone(),previousYaw=character.rotation.y,previousCameraHeading=cameraHeading(ui.fixture.camera);
  for (let frame = 0; frame < 28; frame++) {
    ui.step();
    const distance=assertWalkingTurn(character,previous,previousYaw,`reversal frame ${frame}`);
    assert.ok(Math.abs(distance-2.25*.05)<1e-7,'changing a held direction does not reset the walking speed');
    assert.ok(character.position.z>previous.z,'the requested backward movement begins on the first reversed tick');
    const cameraYaw=cameraHeading(ui.fixture.camera);
    assert.ok(headingError(cameraYaw,previousCameraHeading)<=25*Math.PI/180*.05+1e-7,'a reversal cannot abruptly swing the camera');
    previous.copy(character.position);
    previousYaw=character.rotation.y;previousCameraHeading=cameraYaw;
  }
  assert.ok(headingError(character.rotation.y, originalYaw) > 3, 'the body faces the reversed direction');
  assert.ok(character.position.z > turningAt.z + 1, 'the character eventually walks back along the requested direction');
  ui.key('keyup', 's');
});

test('a camera drag suppresses the associated double click and later deliberate double clicks still work', t => {
  const ui = setup(t), destination = { x: 3, z: 4.8 };
  ui.groundEvent('pointerdown', destination);
  ui.groundEvent('pointermove', destination, { clientX: 800, clientY: 600 });
  ui.groundEvent('pointerup', destination);
  ui.groundEvent('dblclick', destination);
  for (let frame = 0; frame < 10; frame++) ui.step();
  close(ui.world.getPlayerState().x, 0, 'drag does not start a walk x');
  close(ui.world.getPlayerState().z, 4.8, 'drag does not start a walk z');
  ui.step(100);
  ui.groundEvent('dblclick', destination);
  for (let frame = 0; frame < 140; frame++) ui.step();
  const arrived = ui.world.getPlayerState();
  assert.ok(Math.hypot(arrived.x - destination.x, arrived.z - destination.z) < .061, 'a subsequent double click is not permanently suppressed');
});

test('double clicks outside the canvas and on solid or occupied coordinates cannot start a walk', t => {
  const ui = setup(t), destination = { x: 3, z: 4.8 };
  const control = ui.node('button');
  control.fire('dblclick', { button: 0, clientX: 700, clientY: 600, target: control });
  ui.groundEvent('dblclick', { x: STATION_POSITIONS[0][0], z: STATION_POSITIONS[0][1] });
  for (let frame = 0; frame < 20; frame++) ui.step();
  close(ui.world.getPlayerState().x, 0, 'solid or UI click does not move x');
  close(ui.world.getPlayerState().z, 4.8, 'solid or UI click does not move z');
  ui.world.setVisitors([{ id: 'target-occupant', ...destination, hair: 1, seatedJobId: null }]);
  ui.step();
  ui.groundEvent('dblclick', destination);
  for (let frame = 0; frame < 60; frame++) ui.step();
  close(ui.world.getPlayerState().x, 0, 'a character-occupied target does not move x');
  close(ui.world.getPlayerState().z, 4.8, 'a character-occupied target does not move z');
});

test('a double-click route goes around a desk and garden furniture without cutting through their footprints', t => {
  const ui = setup(t), destination = { x: 2, z: -6 };
  const obstacles = inflateObstacles(ui.fixture.physicalBounds);
  assert.equal(obstacles.some(obstacle=>Math.abs(destination.x-obstacle.x)<obstacle.halfX&&Math.abs(destination.z-obstacle.z)<obstacle.halfZ),false,
    'the route target is clear floor beside the lounge furnishings');
  let previous = ui.world.getPlayerState();
  const character = worldCharacters(ui.fixture)[0];
  let crossedCorner=false,previousTravelHeading=null;
  let previousYaw = character.rotation.y,previousCameraHeading=cameraHeading(ui.fixture.camera);
  assert.ok(obstacles.some(obstacle => segmentObstacleEntry(previous, destination, obstacle) !== null), 'the requested direct line actually crosses a solid object');
  ui.groundEvent('dblclick', destination);
  for (let frame = 0; frame < 400; frame++) {
    ui.step();
    const state = ui.world.getPlayerState();
    for (const obstacle of obstacles) assert.equal(segmentObstacleEntry(previous, state, obstacle), null, `walking avoids the ${obstacle.kind || 'furniture'} footprint`);
    const dx=state.x-previous.x,dz=state.z-previous.z,moved=Math.hypot(dx,dz)>1e-7;
    if(Math.hypot(previous.x-destination.x,previous.z-destination.z)>.061)
      assertWalkingTurn(character,previous,previousYaw,`routed corner frame ${frame}`);
    if(moved){
      const heading=Math.atan2(dx,dz);
      crossedCorner||=previousTravelHeading!==null&&headingError(heading,previousTravelHeading)>.1;
      previousTravelHeading=heading;
    }
    const cameraYaw=cameraHeading(ui.fixture.camera);
    assert.ok(headingError(cameraYaw,previousCameraHeading)<=25*Math.PI/180*.05+1e-7,'the camera follows routed corners gradually');
    previousCameraHeading=cameraYaw;
    previousYaw = character.rotation.y;
    previous = state;
  }
  assert.ok(Math.hypot(previous.x - destination.x, previous.z - destination.z) < .061, 'the detoured walk reaches its ground destination');
  assert.equal(previous.seatedJobId, null, 'walking past a chair does not divert this route');
  assert.equal(crossedCorner,true,'the continuous walk includes an actual change of route direction');
});

test('double clicking the floor while seated waits for the full rise and chair departure before walking', async t => {
  const ui = setup(t), destination = { x: 3, z: 3 };
  settleIntoSeat(ui);
  ui.step(0);
  ui.groundEvent('dblclick', destination);
  const seat = seatCoordinates();
  for (let frame = 0; frame < 14; frame++) {
    ui.step();
    const state = ui.world.getPlayerState();
    close(state.x, seat.x, 'double-click rise x'); close(state.z, seat.z, 'double-click rise z');
    assert.equal(state.seatedJobId, 'product-designer', 'the chair remains owned through the rise');
  }
  for (let frame = 0; frame < 6; frame++) ui.step();
  assert.equal(ui.world.getPlayerState().seatedJobId, 'product-designer', 'the chair remains owned until the final departure step');
  settleOutOfSeat(ui);
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  const departed = ui.world.getPlayerState();
  assert.ok(ui.calls.find(([type]) => type === 'standing')[3] - ui.calls.find(([type]) => type === 'start')[3] >= 1050);
  await Promise.resolve();
  ui.step();
  const character=worldCharacters(ui.fixture)[0];
  assertWalkingTurn(character,departed,departed.rotation,'the queued floor walk begins immediately after the complete chair exit');
  assert.ok(headingError(character.rotation.y,departed.rotation)>.1,'the body begins facing its selected floor route after the exit promise');
  assert.equal(ui.world.getPlayerState().seatedJobId,null,'walking toward the floor cannot sit again in the departed chair');
  for (let frame = 0; frame < 200; frame++) ui.step();
  const arrived = ui.world.getPlayerState();
  assert.ok(Math.hypot(arrived.x - destination.x, arrived.z - destination.z) < .061);
  assert.equal(ui.calls.filter(([type]) => type === 'start').length, 1, 'one double click causes only one get-up');
});

test('a movement key cancels a floor destination queued during chair departure', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  ui.step(0);
  ui.groundEvent('dblclick', { x: 3, z: 3 });
  for (let frame = 0; frame < 5; frame++) ui.step();
  ui.key('keydown', 'd'); ui.key('keyup', 'd');
  settleOutOfSeat(ui);
  await Promise.resolve();
  const stopped = ui.world.getPlayerState();
  for (let frame = 0; frame < 60; frame++) ui.step();
  close(ui.world.getPlayerState().x, stopped.x, 'a canceled floor target does not resume x');
  close(ui.world.getPlayerState().z, stopped.z, 'a canceled floor target does not resume z');
  assert.equal(ui.world.getPlayerState().seatedJobId, null, 'waiting beside the chair does not automatically reseat an idle user');
  ui.world.goToJob('product-designer');
  for (let frame = 0; frame < 160 && !ui.world.isSeatReady('product-designer'); frame++) ui.step();
  assert.equal(ui.world.isSeatReady('product-designer'), true, 'explicitly selecting the same chair permits a deliberate return');
});

test('a later job selection supersedes a floor destination queued during chair departure', async t => {
  const ui = setup(t);
  settleIntoSeat(ui);
  ui.step(0);
  ui.groundEvent('dblclick', { x: 3, z: 3 });
  for (let frame = 0; frame < 5; frame++) ui.step();
  ui.world.goToJob('frontend-engineer');
  settleOutOfSeat(ui);
  await Promise.resolve();
  for (let frame = 0; frame < 240; frame++) ui.step();
  assert.ok(ui.world.getPlayerState().x < -3, 'the character follows the new job route instead of the old floor target');
});

test('destroy removes the ground double-click handler', t => {
  const ui = setup(t), canvas = ui.fixture.canvas;
  assert.equal(canvas.listeners.get('dblclick')?.length, 1);
  ui.destroy();
  assert.equal(canvas.listeners.get('dblclick')?.length, 0);
});

test('automatic chair arrival keeps the same rig, follows a continuous approach, and lowers before opening the role', t => {
  const ui = setup(t), player = worldCharacters(ui.fixture)[0];
  const original = player.position.clone();
  const halfwayHip = (player.userData.rig.rest.hips.position[1] - .012 + SEATED_HIP_HEIGHT) / 2;
  const limbs = ['leftFoot', 'rightFoot', 'leftHand', 'rightHand'];
  const previousLimbs = Object.fromEntries(limbs.map(name => [name, player.userData.rig[name].getWorldPosition(new Vector3())]));
  ui.key('keydown', 'w');
  let previous = player.position.clone(), previousHip = player.userData.rig.hips.position.y;
  let started = false, lowering = false;
  for (let frame = 0; frame < 300 && !ui.world.isSeatReady('product-designer'); frame++) {
    ui.step();
    assert.equal(worldCharacters(ui.fixture)[0], player, 'taking a seat does not replace or reset the character');
    assert.ok(player.position.distanceTo(previous) <= 2.25 * .05 + 1e-7, 'walking and seat entry never teleport the visible root');
    const hip = player.userData.rig.hips.position.y;
    assert.ok(Math.abs(hip - previousHip) < .09, 'the pelvis lowers gradually instead of snapping into its seated pose');
    const rootDelta = player.position.clone().sub(previous);
    for (const name of limbs) {
      const position = player.userData.rig[name].getWorldPosition(new Vector3());
      if (player.userData.motion.poseMode === 'lowering' || ui.world.isSeatReady('product-designer')) {
        const articulatedStep = position.clone().sub(previousLimbs[name]).sub(rootDelta).length();
        assert.ok(articulatedStep < (name.endsWith('Foot') ? .13 : .16), `${name} blends out of its actual walking pose without a limb pop`);
      }
      previousLimbs[name] = position;
    }
    started ||= ui.world.isSittingDown();
    lowering ||= started && player.userData.motion.poseMode === 'lowering'
      && hip < halfwayHip && hip > SEATED_HIP_HEIGHT;
    if (ui.world.isSittingDown()) assert.equal(ui.calls.filter(([type]) => type === 'ready').length, 0, 'the sidebar waits for the full visible transfer');
    previous.copy(player.position); previousHip = hip;
  }
  assert.ok(started && lowering, 'walking into the chair automatically begins a real lowering animation');
  assert.ok(player.position.distanceTo(original) > 5, 'the character physically walks to the chair');
  assert.equal(ui.world.isSeatReady('product-designer'), true);
  assert.equal(ui.calls.filter(([type]) => type === 'seat').length, 1);
  assert.equal(ui.calls.filter(([type]) => type === 'ready').length, 1);
});

test('an incoming person pauses a reserved seat approach without lowering through their body', t => {
  const ui = setup(t), player = worldCharacters(ui.fixture)[0], start = player.position.clone();
  assert.equal(ui.world.sitAt('product-designer'), true);
  assert.ok(player.position.equals(start), 'claiming the chair leaves the visible root at its current position');
  ui.world.setVisitors([{ id: 'late-arrival', x: 0, z: 2, hair: 5, seatedJobId: null }]);
  for (let frame = 0; frame < 140; frame++) {
    ui.step(); assertSeparated(worldCharacters(ui.fixture));
    assert.equal(ui.world.isSeatReady('product-designer'), false);
  }
  assert.equal(ui.world.isSittingDown(), true, 'the reserved approach waits while another body is in the way');
  const blocker=worldCharacters(ui.fixture)[1],held=player.position.clone();
  assert.ok(player.position.distanceTo(blocker.position)>=.8-1e-7,'the visible root stops outside the other person’s solid body');
  for(let frame=0;frame<10;frame++){
    ui.step();
    assert.ok(player.position.distanceTo(held)<1e-7,'the blocked transfer stays still instead of inching through the person');
    assertSeparated(worldCharacters(ui.fixture));
  }
  assert.ok(player.userData.rig.hips.position.y > .6, 'a blocked approach remains upright');
  ui.world.setVisitors([]);
  for (let frame = 0; frame < 240 && !ui.world.isSeatReady('product-designer'); frame++) ui.step();
  assert.equal(ui.world.isSeatReady('product-designer'), true);
  assert.equal(ui.calls.filter(([type]) => type === 'ready').length, 1);
});

test('a movement key during lowering reverses the current pose smoothly and releases only after standing', t => {
  const ui = setup(t), player = worldCharacters(ui.fixture)[0];
  assert.equal(ui.world.sitAt('product-designer'), true);
  const halfwayHip = (player.userData.rig.rest.hips.position[1] - .012 + SEATED_HIP_HEIGHT) / 2;
  let halfwayLowered = false;
  for (let frame = 0; frame < 240 && !halfwayLowered; frame++) {
    ui.step();
    const hip = player.userData.rig.hips.position.y;
    halfwayLowered = player.userData.motion.poseMode === 'lowering'
      && hip < halfwayHip && hip > SEATED_HIP_HEIGHT;
  }
  assert.equal(halfwayLowered, true, 'the actual body reaches an intermediate lowered pose before the interruption');
  assert.equal(ui.world.isSittingDown(), true, 'the interruption happens during lowering');
  const before = player.position.clone(), hip = player.userData.rig.hips.position.y;
  ui.key('keydown', 'a'); ui.key('keyup', 'a'); ui.step();
  assert.ok(player.position.distanceTo(before) < .12, 'reversing an entry never moves the root abruptly');
  assert.ok(Math.abs(player.userData.rig.hips.position.y - hip) < .09, 'getting up begins at the current lowered height');
  assert.equal(ui.world.getPlayerState().seatedJobId, 'product-designer');
  assert.equal(ui.calls.filter(([type]) => type === 'ready').length, 0);
  settleOutOfSeat(ui);
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.filter(([type]) => type === 'standing').length, 1);
});

test('new characters start bald and Fresh Look changes only the local hairstyle', t => {
  const ui = setup(t, { jobs: allJobs, botGenerator: getBots, socialGenerator: getSocialBots });
  const characters = [];
  ui.fixture.scene.traverse(object => { if (object.name === 'sculpted-cartoon-character') characters.push(object); });
  assert.equal(characters.length, 1 + allJobs.length + BOT_COUNT + SOCIAL_BOT_COUNT);
  for (const character of characters) {
    assert.equal(character.userData.hair, 5, 'all default actors use the bald style');
    assert.equal(character.children.some(child => child.name === 'hair'), false, 'bald characters have no hair mesh');
  }
  const before = ui.world.getPlayerState();
  ui.world.randomizeHair();
  const after = ui.world.getPlayerState();
  assert.ok(after.hair >= 0 && after.hair < 5, 'Fresh Look explicitly opts into a hairstyle');
  close(after.x, before.x, 'Fresh Look keeps position x'); close(after.z, before.z, 'Fresh Look keeps position z');
  assert.ok(characters.slice(1).every(character => character.userData.hair === 5), 'other actors remain bald');
});

test('upholstered job chairs retain the shared cushion height and physical walking footprints',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots});
  const chairs=[];
  ui.fixture.scene.traverse(object=>{if(object.isGroup&&object.name.startsWith('upholstered-job-'))chairs.push(object);});
  assert.equal(chairs.length,allJobs.length*2,'every recruiter and applicant receives a soft chair');
  for(const chair of chairs){
    const position=chair.getWorldPosition(new Vector3()),bounds=new Box3().setFromObject(chair,true);
    assert.ok(bounds.min.x>=position.x-.41001&&bounds.max.x<=position.x+.41001,'the upholstery and outlines stay inside the shared width');
    assert.ok(bounds.min.z>=position.z-.38001&&bounds.max.z<=position.z+.38001,'chair backs and outlines stay inside the shared depth');
    const cushion=chair.children.find(mesh=>Math.abs(mesh.position.y-.27)<.001&&Math.abs(mesh.scale.y-.06)<.001);
    assert.ok(cushion,'the upholstered chair retains a separate soft seat cushion');
    close(new Box3().setFromObject(cushion,true).max.y,.30,'the cushion matches the articulated seated pelvis');
  }
});

test('a remote visitor can leave a beanbag completely without losing their own furniture exemption early', t => {
  const ui = setup(t), seat = SOCIAL_SEATS.find(seat => !seat.occupiedBy);
  const state = { id: 'beanbag-guest', x: seat.x, z: seat.z, rotation: seat.rotation, hair: 5, seatedJobId: seat.id };
  ui.world.setVisitors([state]); ui.step();
  const actor = worldCharacters(ui.fixture).find(character => Math.hypot(character.position.x-seat.x, character.position.z-seat.z) < .05);
  assert.ok(actor, 'the visitor appears on the shared beanbag');
  ui.world.setVisitors([{ ...state, ...seat.exit, seatedJobId: null }]);
  for (let frame = 0; frame < 60; frame++) ui.step();
  assert.ok(Math.hypot(actor.position.x-seat.exit.x, actor.position.z-seat.exit.z) < .061, 'the visitor reaches the clear side of the whole beanbag footprint');
});

test('combined room walls and furniture leave every job chair, shared seat, and gallery exhibit connected through doorways', t => {
  const ui=setup(t,{jobs:allJobs});
  const bounds = inflateObstacles(ui.fixture.physicalBounds);
  assert.equal(bounds.filter(object=>object.kind==='information-lounge').length,5,'the combined route checks include all Class 24 lounge furniture');
  const isBlocked = (x,z) => bounds.some(object => Math.abs(x-object.x)<object.halfX && Math.abs(z-object.z)<object.halfZ);
  assert.equal(bounds.filter(object=>object.kind==='room-wall').length,GARDEN_WALLS.length,'visible partitions are included in the actual world collision and routing bounds');
  assert.ok(GARDEN_ROOMS.every(room=>bounds.some(object=>object.kind==='room-wall'&&object.roomId===room.id)),'all eight rooms have solid edges');
  const destinations = [
    ...GARDEN_WORKSPACES.map(workspace => ({ id: workspace.id, x: workspace.x, z: workspace.z+1.5+SEAT_APPROACH_OFFSET })),
    ...GARDEN_WORKSPACES.map(workspace => ({ id: `${workspace.id}-front-side`, x: workspace.x-1.1, z: workspace.z+1.5-SEAT_FRONT_LANE })),
    ...GARDEN_WORKSPACES.filter(workspace=>[2,5,8].includes(workspace.index)).map(workspace => ({ id: `${workspace.id}-occupied-wait`, x: workspace.x-1.1, z: workspace.z+2.8 })),
    ...SOCIAL_SEATS.filter(seat => !seat.occupiedBy).map(seat => ({ id: seat.id, ...seat.approach })),
    ...INFO_OBJECTS.map(object => ({ id: object.id, x: object.x ? object.x-Math.sign(object.x)*2.2 : 0, z: object.x ? object.z : object.z-2.2 })),
    ...GARDEN_DOORWAYS.map((door,index) => ({ ...door, id: `door-${index}` })),
  ];
  const assertRoute = (start,destination) => {
    const route = findWalkRoute(start,destination,{isBlocked,obstacles:bounds});
    assert.notEqual(route,null,`${destination.id} is reachable from (${start.x}, ${start.z}) through the connected rooms`);
    let from = start;
    for (const to of [...route,destination]) {
      assert.equal(bounds.some(object => segmentObstacleEntry(from,to,object)!==null),false,`${destination.id} route clears the combined furniture and walls`);
      from = to;
    }
  };
  for (const destination of destinations) assertRoute(GARDEN_SPAWN,destination);
  const roomStops = destinations.filter(destination=>destination.id.endsWith('-front-side')||destination.id.startsWith('lounge-')||INFO_OBJECTS.some(object=>object.id===destination.id));
  for(let index=0;index<roomStops.length;index++)assertRoute(roomStops[index],roomStops[(index+1)%roomStops.length]);
});

test('manual walking bumps into a visible room wall and passes through its open doorway', t => {
  const contacts=[
    {side:'front',key:'w',axis:'z',sign:1,select:wall=>wall.x>-11&&wall.x<-8},
    {side:'back',key:'s',axis:'z',sign:-1,select:wall=>wall.x<-9},
    {side:'left',key:'d',axis:'x',sign:-1,select:()=>true},
    {side:'right',key:'a',axis:'x',sign:1,select:()=>true},
  ];
  for(const contact of contacts){
    const wall=GARDEN_WALLS.find(wall=>wall.roomId==='studio'&&wall.side===contact.side&&contact.select(wall));
    assert.ok(wall,`the studio ${contact.side} wall has a solid center`);
    const spawn={x:wall.x,z:wall.z};spawn[contact.axis]+=contact.sign*1.5;
    const blocked=setup(t,{spawn});
    blocked.key('keydown',contact.key);
    let worstContact={penetration:-Infinity};
    for(let frame=0;frame<35;frame++){
      blocked.step();
      for(const point of skinPoints(worldCharacters(blocked.fixture)[0])){
        const penetration=Math.min(wall.halfX-Math.abs(point.x-wall.x),wall.halfZ-Math.abs(point.z-wall.z),point.y,wall.height-point.y);
        if(penetration>worstContact.penetration)worstContact={frame,penetration,point:point.toArray(),root:blocked.world.getPlayerState()};
      }
    }
    assert.ok(worstContact.penetration<.004,`the actual white body, hands and feet stay outside the ${contact.side} partition; worst contact ${JSON.stringify(worstContact)}`);
    blocked.key('keyup',contact.key);
    const stopped=blocked.world.getPlayerState(),otherAxis=contact.axis==='z'?'x':'z';
    close(stopped[otherAxis],wall[otherAxis],'bumping into the wall does not slide sideways');
    const clearance=contact.sign*(stopped[contact.axis]-wall[contact.axis])-wall[contact.axis==='z'?'halfZ':'halfX'];
    assert.ok(clearance>=.32&&clearance<.6,'the character stops beside the actual visible partition with body and stride clearance');
    blocked.destroy();
  }

  const door=GARDEN_DOORWAYS.find(door=>door.roomId==='studio'&&door.side==='front'&&door.x===0);
  assert.ok(door,'the studio has an open entrance aligned to its central desk');
  const passing=setup(t,{spawn:{x:door.x,z:door.z+1.5}});
  passing.key('keydown','w');
  for(let frame=0;frame<25;frame++)passing.step();
  passing.key('keyup','w');
  const inside=passing.world.getPlayerState();
  close(inside.x,door.x,'walking through the door stays on the requested line');
  assert.ok(inside.z<door.z-.7,'the same manual movement enters through the real gap instead of stopping on an invisible wall');
});

test('selecting a chair in a different room rises, walks through the connecting doors, and lowers into the new chair', async t => {
  const from=allJobs[1],to=allJobs[3],ui=setup(t,{jobs:allJobs});
  assert.notEqual(GARDEN_WORKSPACES[1].roomId,GARDEN_WORKSPACES[3].roomId,'the journey crosses distinct enclosed rooms');
  assert.equal(ui.world.goToJob(from.id),true);
  for(let frame=0;frame<700&&!ui.world.isSeatReady(from.id);frame++)ui.step();
  assert.equal(ui.world.isSeatReady(from.id),true,'the initial chair is reached from the arrival hall');
  const character=worldCharacters(ui.fixture)[0];
  const walls=inflateObstacles(ui.fixture.physicalBounds.filter(bound=>bound.kind==='room-wall'));
  assert.equal(ui.world.goToJob(to.id),true);
  assert.equal(ui.world.isStandingUp(),true,'choosing the next role begins the existing natural get-up sequence');
  let previous=character.position.clone(),sawHall=false;
  for(let frame=0;frame<900&&!ui.world.isSeatReady(to.id);frame++){
    ui.step();
    const current=character.position;
    assert.ok(current.distanceTo(previous)<=2.25*.05+.0001,'the room transfer never teleports the character');
    for(const wall of walls)assert.equal(segmentObstacleEntry(previous,current,wall),null,'entry, walking, and departure all stay outside solid walls');
    if(current.z<-8.25&&current.z>-12)sawHall=true;
    previous.copy(current);
    await Promise.resolve();
  }
  assert.equal(sawHall,true,'the route visits the corridor between the two rooms');
  assert.equal(ui.world.isSeatReady(to.id),true,'the destination job opens only once the character has sat in the other room');
  assert.deepEqual(ui.calls.filter(([type])=>type==='ready').map(([,id])=>id),[from.id,to.id]);
});

test('gallery objects open only after walking close, and single or double exhibit clicks never become floor routes', t => {
  const ui = setup(t);
  assert.equal(ui.world.goToInfoRoom(), true, 'the main navigation can take the visitor into the gallery');
  for (let frame = 0; frame < 400 && Math.hypot(ui.world.getPlayerState().x,ui.world.getPlayerState().z-25.5)>.061; frame++) ui.step();
  const gallery = ui.world.getPlayerState();
  assert.ok(Math.hypot(gallery.x,gallery.z-25.5)<.061, 'the gallery is reachable by real walking');
  const object = INFO_OBJECTS.find(object => object.id === 'class24-careers');
  const displayPoint = { x: object.x, z: object.z, y: 1.3 };
  ui.groundEvent('click',displayPoint);
  ui.groundEvent('dblclick',displayPoint);
  for (let frame = 0; frame < 30; frame++) ui.step();
  assert.equal(ui.calls.filter(([type])=>type==='information').length,0,'a distant exhibit does not reveal its sidebar');
  close(ui.world.getPlayerState().x,gallery.x,'far exhibit click does not move x');
  close(ui.world.getPlayerState().z,gallery.z,'far exhibit click does not move z');
  ui.groundEvent('dblclick',{x:0,z:27.5});
  for(let frame=0;frame<160&&Math.abs(ui.world.getPlayerState().z-27.5)>.061;frame++)ui.step();
  assert.ok(Math.abs(ui.world.getPlayerState().z-27.5)<.061,'a deliberate ground double click approaches the exhibit');
  ui.groundEvent('click',displayPoint);
  assert.equal(ui.calls.filter(([type])=>type==='information').length,1);
  assert.equal(ui.calls.find(([type])=>type==='information')[1],object.id,'the clicked object supplies its own information');
  const opened=ui.world.getPlayerState();
  for(let frame=0;frame<30;frame++)ui.step();
  close(ui.world.getPlayerState().x,opened.x,'near exhibit single click keeps x');
  close(ui.world.getPlayerState().z,opened.z,'near exhibit single click keeps z');
});

test('a free shared beanbag automatically accepts a visiting character without turning it into a job table', t => {
  const ui=setup(t),seat=SOCIAL_SEATS.find(seat=>!seat.occupiedBy);
  assert.equal(ui.world.goToJob(seat.id),true);
  for(let frame=0;frame<900&&!ui.world.isSeatReady(seat.id);frame++)ui.step();
  assert.equal(ui.world.isSeatReady(seat.id),true,'the connected room entrance leads into the free seat');
  const player=worldCharacters(ui.fixture)[0];
  assert.ok(Math.hypot(player.position.x-seat.x,player.position.z-seat.z)<.001);
  assert.equal(ui.world.getPlayerState().seatedJobId,seat.id,'the shared seat has its own stable lease id');
  assert.equal(ui.calls.filter(([type])=>type==='ready').length,1);
});

test('an existing remote visitor walks and lowers into a claimed chair without heartbeat resets or limb pops', t => {
  const ui=setup(t),seat=seatCoordinates();
  const walking={id:'remote-applicant',x:0,z:1.2,rotation:Math.PI,hair:5,seatedJobId:null};
  ui.world.setVisitors([walking]);ui.step(0);
  const actor=worldCharacters(ui.fixture)[1],start=actor.position.clone();
  const claimed={...walking,...seat,seatedJobId:'product-designer'};
  ui.world.setVisitors([claimed]);
  assert.ok(actor.position.equals(start),'a remote claim does not move the visible character immediately');
  let previous=actor.position.clone(),previousHip=actor.userData.rig.hips.position.y,lowered=false;
  const names=['leftFoot','rightFoot','leftHand','rightHand'];
  const previousLimbs=Object.fromEntries(names.map(name=>[name,actor.userData.rig[name].getWorldPosition(new Vector3())]));
  for(let frame=0;frame<180&&!actor.userData.sitting;frame++){
    if(frame%5===0)ui.world.setVisitors([claimed]);
    ui.step();
    assert.ok(worldCharacters(ui.fixture).includes(actor),'the walking character keeps its own articulated rig');
    const rootDelta=actor.position.clone().sub(previous);
    assert.ok(rootDelta.length()<=2.25*.05+1e-7,'remote entry stays at the normal walking speed');
    assert.ok(Math.abs(actor.userData.rig.hips.position.y-previousHip)<.09,'the remote pelvis lowers continuously');
    const lowering=actor.userData.motion.poseMode==='lowering';lowered||=lowering;
    for(const name of names){
      const position=actor.userData.rig[name].getWorldPosition(new Vector3());
      if(lowering||actor.userData.sitting){
        assert.ok(position.clone().sub(previousLimbs[name]).sub(rootDelta).length()<(name.endsWith('Foot')?.13:.16),`${name} remains continuous for other viewers too`);
      }
      previousLimbs[name]=position;
    }
    assertSeparated(worldCharacters(ui.fixture));
    previous.copy(actor.position);previousHip=actor.userData.rig.hips.position.y;
  }
  assert.ok(lowered,'other viewers see an actual lowering phase');
  assert.equal(actor.userData.sitting,true,'repeated shared-world heartbeats do not restart the approach');
  assert.ok(Math.hypot(actor.position.x-seat.x,actor.position.z-seat.z)<.001);
  assert.equal(ui.calls.some(([type])=>type==='ready'),false,'another visitor sitting does not open the local sidebar');
});

test('a remote reserved chair approach pauses at another person and resumes only after the path clears', t => {
  const ui=setup(t),seat=seatCoordinates();
  const walking={id:'remote-waiter',x:0,z:1.2,rotation:Math.PI,hair:5,seatedJobId:null};
  ui.world.setVisitors([walking]);ui.step(0);
  const actor=worldCharacters(ui.fixture)[1],claimed={...walking,...seat,seatedJobId:'product-designer'};
  ui.world.setVisitors([claimed]);
  const blocker={id:'crossing-person',x:0,z:.3,rotation:0,hair:5,seatedJobId:null};
  ui.world.setVisitors([claimed,blocker]);
  for(let frame=0;frame<140;frame++){
    if(frame%5===0)ui.world.setVisitors([claimed,blocker]);
    ui.step();assertSeparated(worldCharacters(ui.fixture));
    assert.equal(actor.userData.sitting,false,'the avatar cannot lower into a chair through the crossing person');
  }
  assert.ok(actor.position.z>=1.1,'the remote root remains before the other body');
  assert.ok(actor.userData.rig.hips.position.y>.6,'waiting does not lower the remote character early');
  assert.equal(ui.world.sitAt('product-designer'),false,'the remote lease keeps its chair unavailable during the obstruction');
  ui.world.setVisitors([claimed]);
  for(let frame=0;frame<180&&!actor.userData.sitting;frame++){
    if(frame%5===0)ui.world.setVisitors([claimed]);ui.step();
  }
  assert.equal(actor.userData.sitting,true,'the reserved approach finishes after the person leaves');
  assert.ok(Math.hypot(actor.position.x-seat.x,actor.position.z-seat.z)<.001);
});

test('one confirmed push visibly tips each seated bot onto the lawn before the visitor lowers into its chair', t => {
  for (const index of [2, 5, 8]) {
    const job = allJobs[index], [x,z] = STATION_POSITIONS[index], seat = { x, z:z+1.5 };
    // Isolate the chair handoff from an unrelated walk across every ambient
    // circulation path; ordinary crowd bumps intentionally stop such walks.
    const ui = setup(t, { spawn:{x:x-1.1,z:seat.z+1.3},jobs: allJobs, botGenerator: getBots, socialGenerator: getSocialBots });
    const furnitureProbe=makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName(`job-lounge-${index}`));
    t.after(()=>furnitureProbe.dispose());
    const bot = worldCharacters(ui.fixture).find(character => Math.hypot(character.position.x-seat.x,character.position.z-seat.z)<.001);
    assert.ok(bot, `${job.id} starts with a visibly seated bot`);
    ui.world.goToJob(job.id);
    for (let frame=0;frame<1400 && Math.hypot(ui.world.getPlayerState().x-(x-1.1),ui.world.getPlayerState().z-seat.z-1.3)>.061;frame++) ui.step();
    assert.ok(Math.hypot(ui.world.getPlayerState().x-(x-1.1),ui.world.getPlayerState().z-seat.z-1.3)<.061,`${job.id} reaches the occupied chair's actual side approach`);
    for(let frame=0;frame<120&&!ui.world.canPushBot(job.id);frame++)ui.step();
    assert.equal(ui.world.canPushBot(job.id),true, `${job.id}: the nearby clear side offers one deliberate push`);
    const epoch = 1_800_000_000_000+ui.clock;
    ui.world.setBotDefeats({[job.id]:epoch});
    assert.equal(ui.world.pushBot(job.id),true,'a confirmed seat claim starts the visible push');
    assert.equal(ui.world.sitAt(job.id),true,'the claim reserves the chair while its old occupant falls away');
    assert.equal(ui.world.getPlayerState().seatedJobId,job.id);
    assert.equal(ui.world.isSeatReady(job.id),false,'claiming a chair does not open its job sidebar early');
    let lowestHead=Infinity,largestRoll=0,readyAfter=null,previous=bot.position.clone();
    for(let frame=0;frame<260&&!ui.world.isSeatReady(job.id);frame++){
      ui.step();
      const elapsed=ui.clock-(epoch-1_800_000_000_000);
      furnitureProbe.assertClear(bot,`${job.id} pushed bot at ${elapsed}ms`);
      assertSeparated(worldCharacters(ui.fixture));
      assert.ok(bot.position.distanceTo(previous)<.16,'the pushed character moves continuously without a teleport');
      previous.copy(bot.position);
      if(elapsed>=650&&elapsed<=1200){
        lowestHead=Math.min(lowestHead,bot.userData.rig.head.getWorldPosition(new Vector3()).y);
        largestRoll=Math.max(largestRoll,Math.abs(bot.userData.rig.hips.rotation.z));
      }
      if([350,650,900,1200,1700,2150,2450].includes(elapsed))assertFallenBodyClear(bot,worldCharacters(ui.fixture),index,elapsed,ui.fixture.physicalBounds);
      if(elapsed<2450)assert.equal(ui.world.isSeatReady(job.id),false,'the whole fall, pause, and recovery happen before a visible seat transfer');
      if(ui.world.isSeatReady(job.id))readyAfter=elapsed;
    }
    assert.ok(largestRoll>1,'the bot really rolls sideways rather than simply walking out');
    assert.ok(lowestHead<.85,'the bot visibly reaches the garden floor');
    assert.ok(readyAfter>=2450,'the job opens only after the bot has cleared and the visitor is seated');
    assert.equal(ui.calls.filter(([type,id])=>type==='ready'&&id===job.id).length,1);
    const player=worldCharacters(ui.fixture)[0];
    assert.ok(Math.hypot(player.position.x-seat.x,player.position.z-seat.z)<.001);
    assert.ok(Math.hypot(bot.position.x-seat.x,bot.position.z-seat.z)>.8,'the previous occupant stays outside the claimed chair');
    ui.destroy();
  }
});

test('a push refuses a landing blocked by another visitor and never displaces a real seated visitor',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots});
  const job=allJobs[2],[x,z]=STATION_POSITIONS[2];
  ui.world.goToJob(job.id);
  for(let frame=0;frame<800&&Math.hypot(ui.world.getPlayerState().x-(x-1.1),ui.world.getPlayerState().z-z-2.8)>.061;frame++)ui.step();
  assert.equal(ui.world.canPushBot(job.id),true);
  ui.world.setVisitors([{id:'crossing-the-landing',x:x+1.2,z:z+1.72,hair:5,seatedJobId:null}]);ui.step();
  assert.equal(ui.world.canPushBot(job.id),false,'the enlarged falling-body corridor needs a clear lawn');
  assert.equal(ui.world.getPlayerState().seatedJobId,null);
  assertSeparated(worldCharacters(ui.fixture));
  ui.world.setVisitors([]);ui.step();
  ui.world.setSeatOccupancy({[job.id]:{visitorId:'another-person'}});
  assert.equal(ui.world.canPushBot(job.id),false,'a shared human lease never becomes a bot to be pushed');
});

test('a late visitor approaching a confirmed push stays outside the falling body and the handoff completes once clear',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots});
  const job=allJobs[2],[x,z]=STATION_POSITIONS[2],visitor={id:'late-crossing',x:x+4,z:z+1.72,hair:5,seatedJobId:null};
  ui.world.goToJob(job.id);
  for(let frame=0;frame<800&&Math.hypot(ui.world.getPlayerState().x-(x-1.1),ui.world.getPlayerState().z-z-2.8)>.061;frame++)ui.step();
  ui.world.setVisitors([visitor]);ui.step();
  assert.equal(ui.world.canPushBot(job.id),true);
  const start=ui.clock,bot=worldCharacters(ui.fixture).find(character=>Math.hypot(character.position.x-x,character.position.z-z-1.5)<.001);
  ui.world.setBotDefeats({[job.id]:1_800_000_000_000+start});
  ui.world.pushBot(job.id);assert.equal(ui.world.sitAt(job.id),true);
  for(let frame=0;frame<120;frame++){
    if(frame===4)ui.world.setVisitors([{...visitor,x:x+1.2}]);
    if(frame===60)ui.world.setVisitors([]);
    ui.step();assertSeparated(worldCharacters(ui.fixture));
    if([650,900,1200,1700,2150].includes(ui.clock-start))assertFallenBodyClear(bot,worldCharacters(ui.fixture),2,ui.clock-start,ui.fixture.physicalBounds);
  }
  assert.equal(ui.world.isSeatReady(job.id),true,'a crossing visitor cannot interrupt the reserved final seat permanently');
  assert.equal(ui.calls.filter(([type])=>type==='ready').length,1);
});

test('cancelling a won-chair transfer keeps the bot fall but never fires a stale local seated callback',async t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots});
  const job=allJobs[2],[x,z]=STATION_POSITIONS[2];
  ui.world.goToJob(job.id);
  for(let frame=0;frame<800&&Math.hypot(ui.world.getPlayerState().x-(x-1.1),ui.world.getPlayerState().z-z-2.8)>.061;frame++)ui.step();
  ui.world.setBotDefeats({[job.id]:1_800_000_000_000+ui.clock});
  assert.equal(ui.world.pushBot(job.id),true);
  assert.equal(ui.world.sitAt(job.id),true);
  for(let frame=0;frame<7;frame++)ui.step();
  ui.key('keydown','s');ui.key('keyup','s');
  for(let frame=0;frame<100;frame++){ui.step();assertSeparated(worldCharacters(ui.fixture));}
  await Promise.resolve();
  assert.equal(ui.world.getPlayerState().seatedJobId,null);
  assert.equal(ui.calls.filter(([type])=>type==='ready').length,0,'standing during the handoff cannot open the role later');
  assert.equal(ui.calls.filter(([type])=>type==='standing').length,1);
});

function skinPoints(character,boneNames=null){
  character.updateMatrixWorld(true);
  const mesh=character.userData.mesh,geometry=mesh.geometry,point=new Vector3(),points=[];
  const indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const bones=boneNames&&new Set(boneNames.map(name=>character.userData.rig.bones.indexOf(character.userData.rig[name])));
  const components=['getX','getY','getZ','getW'];
  for(let index=0;index<geometry.attributes.position.count;index++){
    if(bones&&!components.some(component=>bones.has(indices[component](index))&&weights[component](index)>.5))continue;
    mesh.getVertexPosition(index,point);point.applyMatrix4(mesh.matrixWorld);points.push(point.clone());
  }
  return points;
}

function limbSurfaceGap(attacker,receiver,bones){
  const limb=skinPoints(attacker,bones),target=skinPoints(receiver);
  assert.ok(limb.length>0,'the contact check samples the actual striking skin');
  let squared=Infinity;
  for(const point of limb)for(const other of target)squared=Math.min(squared,point.distanceToSquared(other));
  return Math.sqrt(squared);
}

// Check the rendered furniture, including its seat, backrest, timber base and
// feet. The owner-specific walking exemption must never hide a deformed shin,
// hand or torso passing through one of these actual closed surfaces.
function makeFurnitureSkinProbe(group,{selectPart=()=>true}={}){
  group.updateWorldMatrix(true,true);
  const material=new MeshBasicMaterial({side:DoubleSide}),solids=[];
  const ray=new Raycaster(),direction=new Vector3(1,.417,.239).normalize();
  const point=new Vector3(),nearest=new Vector3();
  group.traverse(object=>{
    if(!object.isMesh||object.material.side===BackSide)return;
    for(let parent=object;parent&&parent!==group;parent=parent.parent)if(parent.name==='sculpted-cartoon-character')return;
    for(let instance=0;instance<(object.isInstancedMesh?object.count:1);instance++){
      if(!selectPart(object,object.isInstancedMesh?instance:null))continue;
      const matrix=object.matrixWorld.clone();
      if(object.isInstancedMesh){const local=new Matrix4();object.getMatrixAt(instance,local);matrix.multiply(local);}
      const proxy=new Mesh(object.geometry,material);
      proxy.matrixAutoUpdate=false;proxy.matrix.copy(matrix);proxy.matrixWorld.copy(matrix);
      const geometry=object.geometry,positions=geometry.attributes.position;
      const indices=geometry.index?.array||Array.from({length:positions.count},(_,index)=>index);
      const vertices=Array.from({length:positions.count},(_,index)=>new Vector3().fromBufferAttribute(positions,index).applyMatrix4(matrix));
      const triangles=[];
      for(let index=0;index<indices.length;index+=3)triangles.push(new Triangle(vertices[indices[index]],vertices[indices[index+1]],vertices[indices[index+2]]));
      solids.push({proxy,bounds:new Box3().setFromObject(proxy,true),triangles,description:`${object.parent?.name||'root'}/${object.name}${object.isInstancedMesh?` instance ${instance}`:''} at ${object.position.toArray()}`});
    }
  });
  assert.ok(solids.length>0,'the physical probe includes actual rendered solid surfaces');
  return {
    dispose(){material.dispose();},
    assertClear(character,description){
      character.updateMatrixWorld(true);
      const mesh=character.userData.mesh;
      let minY=Infinity;
      for(let index=0;index<mesh.geometry.attributes.position.count;index++){
        mesh.getVertexPosition(index,point);point.applyMatrix4(mesh.matrixWorld);minY=Math.min(minY,point.y);
        for(const solid of solids){
          if(!solid.bounds.containsPoint(point))continue;
          ray.set(point,direction);
          let crossings=0,last=-Infinity;
          for(const hit of ray.intersectObject(solid.proxy,false))if(hit.distance-last>1e-5){crossings++;last=hit.distance;}
          if(crossings%2===0)continue;
          let depth=Infinity;
          for(const triangle of solid.triangles){triangle.closestPointToPoint(point,nearest);depth=Math.min(depth,point.distanceTo(nearest));}
          const bone=character.userData.rig.bones[mesh.geometry.attributes.skinIndex.getX(index)].name;
          assert.ok(depth<.004,`${description}: actual ${bone} skin penetrates ${solid.description} by ${depth} units at ${point.toArray()}; root ${character.position.toArray()}, yaw ${character.rotation.y}`);
        }
      }
      assert.ok(minY>-.025,`${description}: the actual body stays above the floor; minimum ${minY}`);
    },
  };
}

function furnishingProbe(fixture,seat){
  if(seat.source==='garden'){
    const propIndex=Number(seat.colliderId.replace('garden-prop-',''));
    assert.ok(Number.isInteger(propIndex),`${seat.id} identifies its real instanced furnishing`);
    return makeFurnitureSkinProbe(fixture.scene.getObjectByName('open-garden'),{
      selectPart:(object,instance)=>instance!==null&&object.userData.propIndices?.[instance]===propIndex,
    });
  }
  let group=fixture.scene.getObjectByName(seat.colliderId);
  if(!group)fixture.scene.traverse(object=>{if(object.userData.furnitureId===seat.colliderId)group=object;});
  assert.ok(group,`${seat.id} has an identifiable rendered furnishing`);
  return makeFurnitureSkinProbe(group);
}

function clearFloorNear(point,bounds){
  const inflated=inflateObstacles(bounds,.40);
  const seats=[...FURNITURE_SEATS,...SOCIAL_SEATS];
  const clear=candidate=>inflated.every(bound=>Math.abs(candidate.x-bound.x)>=bound.halfX||Math.abs(candidate.z-bound.z)>=bound.halfZ)
    &&seats.every(seat=>Math.hypot(candidate.x-seat.approach.x,candidate.z-seat.approach.z)>.40&&Math.hypot(candidate.x-seat.x,candidate.z-seat.z)>.84);
  if(clear(point))return point;
  for(let radius=.3;radius<=3;radius+=.3)for(let index=0;index<24;index++){
    const candidate={x:point.x+Math.sin(index*Math.PI/12)*radius,z:point.z+Math.cos(index*Math.PI/12)*radius};
    if(clear(candidate))return candidate;
  }
  assert.fail(`no clear nearby standing floor beside ${JSON.stringify(point)}`);
}

function makeCharacterSkinProbe(character){
  const geometry=character.userData.mesh.geometry.clone(),positions=geometry.attributes.position;
  for(const [index,point] of skinPoints(character).entries())positions.setXYZ(index,point.x,point.y,point.z);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new MeshBasicMaterial({side:DoubleSide}),proxy=new Mesh(geometry,material);
  proxy.name='actual-neighboring-seated-body';
  const probe=makeFurnitureSkinProbe(proxy);
  return{assertClear:probe.assertClear,dispose(){probe.dispose();geometry.dispose();material.dispose();}};
}

test('every newly usable lounge cushion keeps the actual seated body and both soles outside its rendered furnishing',t=>{
  const ui=setup(t,{jobs:allJobs,bots:[{id:'cushion-fit-partner',x:0,z:15,rotation:0,moving:false}]}),[character,partner]=worldCharacters(ui.fixture),failures=[];
  assert.ok(FURNITURE_SEATS.length>=30,'the checks include all new garden, atrium, gallery and social seats');
  for(const seat of FURNITURE_SEATS){
    const probe=furnishingProbe(ui.fixture,seat);
    try{
      character.position.set(seat.x,0,seat.z);character.rotation.y=seat.rotation;
      for(const time of [0,.8,2.4]){
        resetCharacterPose(character,{seated:true});
        animateCharacter(character,{dt:1/60,time,seated:true,lounging:true});
        probe.assertClear(character,`${seat.id} relaxed seated pose at ${time}`);
      }
    }catch(error){failures.push(error.message);}finally{probe.dispose();}
  }
  const couches=Map.groupBy(FURNITURE_SEATS.filter(seat=>seat.kind==='couch'),seat=>seat.colliderId);
  assert.ok(partner,'a second actual body verifies independent shared sofa cushions');
  for(const [id,seats] of couches){
    assert.equal(seats.length,2,`${id} offers two actual cushion positions`);
    for(const [index,actor] of [character,partner].entries()){
      actor.position.set(seats[index].x,0,seats[index].z);actor.rotation.y=seats[index].rotation;
      resetCharacterPose(actor,{seated:true});
      animateCharacter(actor,{dt:1/60,time:.8,seated:true,lounging:true});
    }
    for(const [actor,neighbor] of [[character,partner],[partner,character]]){
      const probe=makeCharacterSkinProbe(neighbor);
      try{probe.assertClear(actor,`${id} keeps its two actual neighboring seated bodies separate`);}
      catch(error){failures.push(error.message);}finally{probe.dispose();}
    }
  }
  assert.deepEqual(failures,[],'no new cushion embeds the hips, arms, shins or soles in its furniture');
});

test('new garden, atrium, gallery and social furnishings allow continuous solid entry and departure, including a rotated sofa',async t=>{
  const by=(source,kind,predicate=()=>true)=>FURNITURE_SEATS.find(seat=>seat.source===source&&seat.kind===kind&&predicate(seat));
  const seats=[
    by('garden','couch',seat=>Math.abs(seat.rotation)<.01),
    by('garden','couch',seat=>Math.abs(seat.rotation)>.5),
    by('garden','armchair'),by('garden','ottoman'),
    by('cozy','beanbag'),by('cozy','couch'),by('cozy','ottoman'),
    by('information','couch'),by('social','ottoman'),
  ];
  assert.ok(seats.every(Boolean),'all new furniture types and the rotated room sofa are exercised');
  for(const seat of seats){
    await t.test(seat.id,async sub=>{
    const ui=setup(sub,{chooseSpawn:bounds=>clearFloorNear(seat.approach,bounds),jobs:allJobs}),character=worldCharacters(ui.fixture)[0];
    const probe=furnishingProbe(ui.fixture,seat);
    try{
      probe.assertClear(character,`${seat.id} initial clear approach`);
      assert.equal(ui.world.goToJob(seat.id),true,`${seat.id} has a reachable seat approach`);
      let previous=character.position.clone();
      for(let frame=0;frame<320&&!ui.world.isSeatReady(seat.id);frame++){
        await Promise.resolve();
        ui.step();probe.assertClear(character,`${seat.id} physical entry frame ${frame}`);
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,`${seat.id} entry never teleports the visible body`);
        previous.copy(character.position);
      }
      assert.equal(ui.world.isSeatReady(seat.id),true,`${seat.id} completes its approach and lowers before becoming ready; player=${JSON.stringify(ui.world.getPlayerState())}, root=${character.position.toArray()}, entering=${ui.world.isSittingDown()}, callbacks=${JSON.stringify(ui.calls.filter(([type])=>type!=='footstep'))}`);
      assert.equal(ui.world.getPlayerState().seatedJobId,seat.id);
      const departure=ui.world.standUp('movement');
      previous.copy(character.position);
      for(let frame=0;frame<320&&ui.world.isStandingUp();frame++){
        ui.step();probe.assertClear(character,`${seat.id} physical departure frame ${frame}`);
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,`${seat.id} departure never teleports the visible body`);
        previous.copy(character.position);
      }
      assert.equal(ui.world.isStandingUp(),false,`${seat.id} has a clear physical departure; player=${JSON.stringify(ui.world.getPlayerState())}, root=${character.position.toArray()}`);
      await departure;
      assert.equal(ui.world.getPlayerState().seatedJobId,null,`${seat.id} releases only after walking clear`);
      assert.equal(ui.calls.filter(([type])=>type==='ready').length,1);
      assert.equal(ui.calls.filter(([type])=>type==='standing').length,1);
    }finally{probe.dispose();ui.destroy();}
    });
  }
});

test('a shared sofa permits the free cushion beside a seated visitor while keeping that visitor solid and reserved',async t=>{
  const seats=FURNITURE_SEATS.filter(seat=>seat.colliderId==='cozy-sofa-6'),[localSeat,guestSeat]=seats;
  assert.equal(seats.length,2);
  const ui=setup(t,{jobs:allJobs,chooseSpawn:bounds=>clearFloorNear({x:localSeat.approach.x-1.4,z:localSeat.approach.z+1.4},bounds)});
  ui.world.setVisitors([{id:'neighboring-cushion-guest',x:guestSeat.x,z:guestSeat.z,rotation:guestSeat.rotation,hair:5,seatedJobId:guestSeat.id}]);
  for(let frame=0;frame<100;frame++)ui.step();
  const [player,guest]=worldCharacters(ui.fixture);
  assert.ok(guest?.userData.sitting,'the neighboring visitor visibly occupies their own cushion');
  assert.equal(ui.world.sitAt(guestSeat.id),false,'another visitor’s occupied cushion cannot be claimed');
  const probe=furnishingProbe(ui.fixture,localSeat);
  function physicalFrame(description,checkNeighborSkin=false){
    probe.assertClear(player,description);
    assert.ok(Math.hypot(player.position.x-guest.position.x,player.position.z-guest.position.z)>=.8-1e-7,`${description}: the seated neighbor remains solid`);
    assert.ok(Math.hypot(guest.position.x-guestSeat.x,guest.position.z-guestSeat.z)<1e-7,`${description}: taking the free cushion never displaces its neighbor`);
    if(checkNeighborSkin){
      const neighbor=makeCharacterSkinProbe(guest);
      try{neighbor.assertClear(player,`${description}: actual skin clears the neighboring visitor`);}finally{neighbor.dispose();}
    }
  }
  try{
    assert.equal(ui.world.goToJob(localSeat.id),true,`the second cushion has an independent approach; local=${JSON.stringify(ui.world.getPlayerState())}, guest=${guest.position.toArray()}, callbacks=${JSON.stringify(ui.calls.filter(([type])=>type!=='footstep'))}`);
    for(let frame=0;frame<400&&!ui.world.isSeatReady(localSeat.id);frame++){
      await Promise.resolve();
      ui.step();physicalFrame(`shared sofa entry frame ${frame}`,frame%10===0);
    }
    assert.equal(ui.world.isSeatReady(localSeat.id),true,'the local visitor settles beside the existing visitor');
    physicalFrame('both shared sofa visitors seated',true);
    const departure=ui.world.standUp('movement');
    for(let frame=0;frame<320&&ui.world.isStandingUp();frame++){
      ui.step();physicalFrame(`shared sofa departure frame ${frame}`,frame%10===0);
    }
    assert.equal(ui.world.isStandingUp(),false);
    await departure;
    assert.equal(ui.world.getPlayerState().seatedJobId,null);
    assert.equal(ui.world.sitAt(guestSeat.id),false,'leaving one cushion retains the neighbor’s occupancy');
    assert.equal(ui.calls.filter(([type])=>type==='ready').length,1,'only the local free-cushion arrival publishes its ready callback');
  }finally{probe.dispose();}
});

test('selecting a nearby chair uses the clear front or nearest side without crossing to a fixed opposite gate', t => {
  const seat = seatCoordinates();
  for (const approach of [
    { name: 'clear front', x: seat.x, z: seat.z - .30, side: 0, maxDistance: .7 },
    { name: 'left', x: seat.x - 1.65, z: seat.z - SEAT_FRONT_LANE, side: -1, maxDistance: 2.5 },
    { name: 'right', x: seat.x + 1.65, z: seat.z - SEAT_FRONT_LANE, side: 1, maxDistance: 2.5 },
  ]) {
    const ui = setup(t, { spawn: approach }), character = worldCharacters(ui.fixture)[0];
    assert.equal(ui.world.goToJob('product-designer'), true, `${approach.name}: the clear chair can be selected`);
    let distance = 0, previous = character.position.clone();
    for (let frame = 0; frame < 220 && !ui.world.isSeatReady('product-designer'); frame++) {
      ui.step();
      distance += character.position.distanceTo(previous);
      if (approach.side === 0) assert.ok(Math.abs(character.position.x - seat.x) < .02,
        'a clear centered approach lowers directly instead of detouring to a side');
      else assert.ok((character.position.x - seat.x) * approach.side >= -.02,
        `${approach.name}: the visitor stays on the nearest side until reaching the centered chair`);
      previous.copy(character.position);
    }
    assert.equal(ui.world.isSeatReady('product-designer'), true, `${approach.name}: the natural approach finishes`);
    assert.ok(distance <= approach.maxDistance,
      `${approach.name}: the approach follows the nearby clear access rather than a long fixed-side loop; length ${distance}`);
    assert.equal(ui.calls.filter(([type]) => type === 'ready').length, 1,
      'the job sidebar opens once, after the character visibly sits');
    ui.destroy();
  }
});

test('leaving a job chair chooses the clear departure toward the next selected opportunity', async t => {
  const seat=seatCoordinates();
  for(const destination of [
    {job:allJobs[1],side:-1,name:'left room'},
    {job:allJobs[2],side:1,name:'right room'},
  ]){
    const ui=setup(t,{jobs:allJobs,spawn:{x:seat.x,z:seat.z-.30}});
    settleIntoSeat(ui);
    assert.equal(ui.world.goToJob(destination.job.id),true,`${destination.name}: the next chair is available`);
    assert.equal(ui.world.isStandingUp(),true,'selecting a role begins a physical departure');
    settleOutOfSeat(ui);
    const departed=ui.world.getPlayerState();
    assert.ok((departed.x-seat.x)*destination.side>1,
      `${destination.name}: the character exits on the clear side that shortens the onward walk`);
    assert.equal(departed.seatedJobId,null,'the old chair releases after the physical departure completes');
    close(departed.z,seat.z-SEAT_FRONT_LANE,'a solid table keeps the departure in the safe front-side lane');
    await Promise.resolve();
    ui.destroy();
  }
});

test('actual skinned job entry and exit clear the owned backrest, cushion, base, legs and table from every approach side',async t=>{
  const seat=seatCoordinates();
  const starts=[
    {name:'rear',x:seat.x,z:seat.z+.95},
    {name:'rear walking boundary',x:seat.x,z:seat.z+.72},
    {name:'front',x:seat.x,z:seat.z-.30},
    {name:'left',x:seat.x-1.3,z:seat.z},
    {name:'right',x:seat.x+1.3,z:seat.z},
  ];
  for(const spawn of starts){
    const ui=setup(t,{spawn}),character=worldCharacters(ui.fixture)[0];
    const probe=makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName('job-lounge-0'));
    try{
      probe.assertClear(character,`${spawn.name} start`);
      assert.equal(ui.world.sitAt('product-designer'),true,`${spawn.name} approach can reserve a clear chair`);
      let previous=character.position.clone();
      for(let frame=0;frame<320&&!ui.world.isSeatReady('product-designer');frame++){
        ui.step();probe.assertClear(character,`${spawn.name} entry frame ${frame}`);
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,`${spawn.name} entry stays within normal walking speed`);
        previous.copy(character.position);
        assert.equal(ui.calls.filter(([type])=>type==='ready').length,ui.world.isSeatReady('product-designer')?1:0,'the role opens only after the physical transfer completes');
      }
      assert.equal(ui.world.isSeatReady('product-designer'),true,`${spawn.name} entry eventually sits`);
      for(let frame=0;frame<5;frame++){ui.step();probe.assertClear(character,`${spawn.name} seated frame ${frame}`);}
      const departure=ui.world.standUp('movement');
      previous.copy(character.position);
      for(let frame=0;frame<320&&ui.world.isStandingUp();frame++){
        ui.step();probe.assertClear(character,`${spawn.name} exit frame ${frame}`);
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,`${spawn.name} exit stays within normal walking speed`);
        previous.copy(character.position);
      }
      assert.equal(ui.world.isStandingUp(),false,`${spawn.name} exit clears the chair`);
      await departure;
      assert.equal(ui.world.getPlayerState().seatedJobId,null);
      for(let frame=0;frame<5;frame++){ui.step();probe.assertClear(character,`${spawn.name} after exit frame ${frame}`);}
      const departedYaw=character.rotation.y;
      const cameraHeading=Math.atan2(character.position.x-ui.fixture.camera.position.x,
        character.position.z-ui.fixture.camera.position.z);
      const turnDirection=[
        {keys:['w'],x:0,z:1},{keys:['s'],x:0,z:-1},
        {keys:['a'],x:-1,z:0},{keys:['d'],x:1,z:0},
        {keys:['w','a'],x:-1,z:1},{keys:['w','d'],x:1,z:1},
        {keys:['s','a'],x:-1,z:-1},{keys:['s','d'],x:1,z:-1},
      ].map(direction=>({...direction,heading:Math.atan2(Math.sin(cameraHeading)*direction.z-Math.cos(cameraHeading)*direction.x,
        Math.cos(cameraHeading)*direction.z+Math.sin(cameraHeading)*direction.x)}))
        .sort((a,b)=>headingError(a.heading,departedYaw+Math.PI)-headingError(b.heading,departedYaw+Math.PI))[0];
      turnDirection.keys.forEach(key=>ui.key('keydown',key));
      for(let frame=0;frame<13;frame++){
        const previousPosition=character.position.clone(),previousYaw=character.rotation.y;
        ui.step();probe.assertClear(character,`${spawn.name} turning after exit frame ${frame}`);
        assertWalkingTurn(character,previousPosition,previousYaw,`${spawn.name} departure turn frame ${frame}`);
      }
      turnDirection.keys.forEach(key=>ui.key('keyup',key));
      assert.ok(headingError(character.rotation.y,departedYaw)>2.5,
        `${spawn.name}: the released chair leaves enough room for an actual half turn`);
    }finally{probe.dispose();ui.destroy();}
  }
});

test('cancelling an approach or half-lowered seat reverses without crossing the owned furniture',async t=>{
  const seat=seatCoordinates(),spawn={x:seat.x,z:seat.z+.95};
  for(const cancelPhase of ['approaching','lowering']){
    const ui=setup(t,{spawn}),character=worldCharacters(ui.fixture)[0];
    const probe=makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName('job-lounge-0'));
    try{
      assert.equal(ui.world.sitAt('product-designer'),true);
      let reached=false;
      for(let frame=0;frame<320&&!reached;frame++){
        ui.step();probe.assertClear(character,`${cancelPhase} before cancellation frame ${frame}`);
        const hip=character.userData.rig.hips.getWorldPosition(new Vector3()).y;
        reached=cancelPhase==='lowering'
          ?character.userData.motion.poseMode==='lowering'&&hip<.63&&hip>.50
          :Math.hypot(character.position.x-spawn.x,character.position.z-spawn.z)>.25&&character.userData.motion.poseMode!=='lowering';
      }
      assert.equal(reached,true,`the visible ${cancelPhase} phase is reached before cancelling`);
      assert.equal(ui.calls.filter(([type])=>type==='ready').length,0,'a cancelled transfer has not opened the role');
      const departure=ui.world.standUp('movement');
      for(let frame=0;frame<320&&ui.world.isStandingUp();frame++){
        ui.step();probe.assertClear(character,`${cancelPhase} reversal frame ${frame}`);
        if(ui.world.isStandingUp())assert.equal(ui.world.getPlayerState().seatedJobId,'product-designer','the shared lease is held until the reverse route clears');
      }
      assert.equal(ui.world.isStandingUp(),false,'the reverse transfer eventually clears the chair');
      await departure;
      assert.equal(ui.world.getPlayerState().seatedJobId,null);
      assert.equal(ui.calls.filter(([type])=>type==='ready').length,0,'a cancelled transfer never publishes a stale seated callback');
      assert.equal(ui.calls.filter(([type])=>type==='standing').length,1);
      for(let frame=0;frame<5;frame++){ui.step();probe.assertClear(character,`${cancelPhase} after cancellation frame ${frame}`);}
    }finally{probe.dispose();ui.destroy();}
  }
});

test('a remote visitor uses the same solid chair approach and departure instead of crossing its backrest',t=>{
  const ui=setup(t),seat=seatCoordinates();
  const visitor={id:'solid-chair-guest',x:seat.x,z:seat.z+.95,rotation:Math.PI,hair:5,seatedJobId:null};
  ui.world.setVisitors([visitor]);ui.step();
  const character=worldCharacters(ui.fixture)[1];
  assert.ok(character,'the remote visitor is placed before their shared seat claim');
  const probe=makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName('job-lounge-0'));
  try{
    probe.assertClear(character,'remote visitor before entry');
    ui.world.setVisitors([{...visitor,...seat,seatedJobId:'product-designer'}]);
    let previous=character.position.clone();
    for(let frame=0;frame<320&&!character.userData.sitting;frame++){
      ui.step();probe.assertClear(character,`remote entry frame ${frame}`);
      assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,'the remote seat claim does not teleport the rendered body');
      previous.copy(character.position);
    }
    assert.equal(character.userData.sitting,true,'the remote visitor visibly completes their seat transfer');
    close(character.position.x,seat.x,'remote seated x');close(character.position.z,seat.z,'remote seated z');
    const destination={x:seat.x-1.1,z:seat.z-SEAT_FRONT_LANE};
    ui.world.setVisitors([{...visitor,...destination,seatedJobId:null}]);
    for(let frame=0;frame<320&&(character.userData.sitting||character.position.distanceTo(new Vector3(destination.x,0,destination.z))>.061);frame++){
      ui.step();probe.assertClear(character,`remote departure frame ${frame}`);
      assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,'the remote visitor gets up and leaves at walking speed');
      previous.copy(character.position);
    }
    assert.equal(character.userData.sitting,false);
    assert.ok(Math.hypot(character.position.x-destination.x,character.position.z-destination.z)<.061,'the remote visitor reaches the clear front-side destination');
    assert.equal(ui.calls.filter(([type])=>type==='ready').length,0,'another visitor never opens the local job sidebar');
  }finally{probe.dispose();}
});

test('both beanbag facings keep actual feet and body outside the furniture throughout lowering and rising',async t=>{
  for(const seat of SOCIAL_SEATS.filter(seat=>!seat.occupiedBy).slice(0,2)){
    const ui=setup(t,{spawn:seat.approach}),character=worldCharacters(ui.fixture)[0];
    const probe=makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName(seat.colliderId));
    try{
      probe.assertClear(character,`${seat.id} standing approach`);
      assert.equal(ui.world.sitAt(seat.id),true);
      let previous=character.position.clone();
      for(let frame=0;frame<240&&!ui.world.isSeatReady(seat.id);frame++){
        ui.step();probe.assertClear(character,`${seat.id} entry frame ${frame}`);
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,'beanbag entry keeps a continuous walking-speed body');
        previous.copy(character.position);
      }
      assert.equal(ui.world.isSeatReady(seat.id),true);
      const departure=ui.world.standUp('movement');
      previous.copy(character.position);
      for(let frame=0;frame<240&&ui.world.isStandingUp();frame++){
        ui.step();probe.assertClear(character,`${seat.id} exit frame ${frame}`);
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,'beanbag departure keeps a continuous walking-speed body');
        previous.copy(character.position);
      }
      assert.equal(ui.world.isStandingUp(),false);
      await departure;
      assert.equal(ui.world.getPlayerState().seatedJobId,null);
      assert.equal(ui.calls.filter(([type])=>type==='ready').length,1);
      assert.equal(ui.calls.filter(([type])=>type==='standing').length,1);
    }finally{probe.dispose();ui.destroy();}
  }
});

test('one complete garden encounter has two solid fighters, three expressive watchers, and actual close-range contacts',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots,socialGenerator:getSocialBots}),origin=ui.fixture.fightState.clock;
  const contacts=new Set(),watcherSpeech=new Set(),stages=new Set(),audioContacts=[];
  const punchTimes=[5150,6150,7150,8150],kickTimes=[10975,12175];
  const samples=new Set([3200,...punchTimes,9300,9700,10100,...kickTimes,13400,14200,15000]);
  let frames=0;
  while(ui.fixture.fightState.clock<origin+FIGHT_CYCLE_MS&&frames++<1600){
    ui.step(25);
    const time=ui.fixture.fightState.clock-origin,actors=[...ui.fixture.crowdActors.values()];
    assert.equal(actors.length,BOT_COUNT+SOCIAL_BOT_COUNT,'all nineteen ambient actors remain in the scene');
    const fighters=actors.filter(actor=>actor.desired.fightRole==='fighter'),watchers=actors.filter(actor=>actor.desired.fightRole==='spectator');
    const audioFrame=ui.fightFrames.at(-1),player=worldCharacters(ui.fixture)[0];
    close(audioFrame.listener.x,player.position.x,'fight listener follows the rendered local x');
    close(audioFrame.listener.z,player.position.z,'fight listener follows the rendered local z');
    close(audioFrame.source.x,(fighters[0].character.position.x+fighters[1].character.position.x)/2,'fight source uses the actual fighter midpoint x');
    close(audioFrame.source.z,(fighters[0].character.position.z+fighters[1].character.position.z)/2,'fight source uses the actual fighter midpoint z');
    assert.equal(audioFrame.paused,ui.fixture.fightState.paused);
    for(const impact of audioFrame.impacts){
      const actor=ui.fixture.crowdActors.get(impact.attackerId),pose=actor.desired.fightPose;
      const limb=impact.type==='punch'?`${pose.punchSide}Hand`:'rightFoot';
      const position=actor.character.userData.rig[limb].getWorldPosition(new Vector3());
      close(impact.position.x,position.x,'impact x is sampled after the actual striking limb is posed');
      close(impact.position.y,position.y,'impact y is sampled after the actual striking limb is posed');
      close(impact.position.z,position.z,'impact z is sampled after the actual striking limb is posed');
      assert.equal(impact.clockMs-origin,time,'the audible event crosses the shared visible contact clock');
      audioContacts.push(impact);
    }
    assert.deepEqual(fighters.map(actor=>actor.desired.id).sort(),[...FIGHTER_IDS].sort());
    assert.deepEqual(watchers.map(actor=>actor.desired.id).sort(),[...SPECTATOR_IDS].sort());
    assert.equal(actors.filter(actor=>actor.desired.tableTennis).length,4,'both table-tennis games continue');
    assert.equal(actors.filter(actor=>actor.desired.seatedJobId).length,3,'the three job chairs retain their bots');
    assert.equal(actors.filter(actor=>actor.desired.social).length,4,'the couch conversations retain their companions');
    assertSeparated(worldCharacters(ui.fixture));
    stages.add(fighters[0].desired.fightStage);
    for(const watcher of watchers)if(!watcher.label.hidden&&watcher.label.textContent)watcherSpeech.add(watcher.desired.id);
    if(samples.has(time)&&!contacts.has(time)){
      contacts.add(time);
      for(const actor of fighters)assertFallenBodyClear(actor.character,
        worldCharacters(ui.fixture).filter(character=>!fighters.some(fighter=>fighter.character===character)),undefined,time,ui.fixture.physicalBounds);
      if(punchTimes.includes(time)){
        const attacker=fighters.find(actor=>actor.desired.fightPose.punch>0),receiver=fighters.find(actor=>actor!==attacker);
        const gap=limbSurfaceGap(attacker.character,receiver.character,[`${attacker.desired.fightPose.punchSide}Hand`]);
        assert.ok(gap<.10,`the punch reaches the opponent instead of empty air at ${time}ms; skin gap ${gap}`);
      }
      if(time===9300){
        const attacker=ui.fixture.crowdActors.get(FIGHTER_IDS[0]),receiver=ui.fixture.crowdActors.get(FIGHTER_IDS[1]);
        assert.ok(limbSurfaceGap(attacker.character,receiver.character,['leftHand','rightHand'])<.10,'the visible shove reaches the other character');
      }
      if(kickTimes.includes(time)){
        const attacker=ui.fixture.crowdActors.get(FIGHTER_IDS[0]),receiver=ui.fixture.crowdActors.get(FIGHTER_IDS[1]);
        const gap=limbSurfaceGap(attacker.character,receiver.character,['rightFoot']);
        assert.ok(gap<.10,`the low kick reaches the grounded body at ${time}ms; skin gap ${gap}`);
        assert.ok(receiver.character.userData.rig.head.getWorldPosition(new Vector3()).y<.9,'the recipient is visibly on the lawn');
      }
      if(time===6150)for(const actor of fighters){
        const expression=actor.character.getObjectByName('fighter-angry-expression');
        assert.ok(expression?.visible,'only the actual fighters show a visible angry expression');
        assert.ok(expression.getObjectByName('fighter-head-blush').material.opacity>.3,'the existing head skin gains its subtle red tint');
      }
    }
  }
  assert.ok(ui.fixture.fightState.clock>=origin+FIGHT_CYCLE_MS,`the unobstructed encounter completes without a permanent collision stall: ${ui.fixture.fightState.clock-origin}ms`);
  assert.equal(audioContacts.length,6,'the complete visible encounter emits exactly six audible contacts');
  assert.equal(new Set(audioContacts.map(impact=>impact.id)).size,6,'every contact has a unique cycle and slot identity');
  assert.deepEqual(audioContacts.map(impact=>impact.type),['punch','punch','punch','punch','kick','kick']);
  assert.deepEqual(audioContacts.map(impact=>impact.clockMs-origin),[...punchTimes,...kickTimes]);
  assert.deepEqual([...watcherSpeech].sort(),[...SPECTATOR_IDS].sort(),'all three spectators show their actual reaction clouds');
  assert.ok(['walking','bump','punch','shove','fall','kick','recover','leave'].every(stage=>stages.has(stage)));
  for(const time of samples)assert.ok(contacts.has(time),`the shared clock reaches the geometry sample at ${time}ms`);
});

test('a person entering the exchange pauses its shared choreography while the rest of the garden keeps moving',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots,socialGenerator:getSocialBots}),origin=ui.fixture.fightState.clock;
  for(let frame=0;frame<90;frame++)ui.step();
  ui.world.setVisitors([{id:'inside-the-exchange',x:-4.8,z:9,hair:5,seatedJobId:null}]);
  ui.step();
  assert.equal(ui.fixture.fightState.paused,true,'the actors stop their exchange when a visitor steps between them');
  const paused=ui.fixture.fightState.clock,positions=FIGHTER_IDS.map(id=>ui.fixture.crowdActors.get(id).character.position.clone());
  const tennis=ui.fixture.crowdActors.get('bot-5').desired.swing;
  const initialListener={...ui.fightFrames.at(-1).listener};
  ui.key('keydown','ArrowRight');
  for(let frame=0;frame<30;frame++){
    if(frame===10)ui.key('keyup','ArrowRight');
    ui.step();assert.equal(ui.fixture.fightState.clock,paused,'fight progress is held, rather than advancing behind frozen roots');
    assertSeparated(worldCharacters(ui.fixture));
    const audioFrame=ui.fightFrames.at(-1),player=worldCharacters(ui.fixture)[0];
    assert.equal(audioFrame.paused,true);assert.equal(audioFrame.impacts.length,0,'a held fight never retriggers an impact');
    close(audioFrame.listener.x,player.position.x,'paused audio listener still follows the moving local body x');
    close(audioFrame.listener.z,player.position.z,'paused audio listener still follows the moving local body z');
    close(audioFrame.source.x,(positions[0].x+positions[1].x)/2,'paused source retains the actual fighter roots');
  }
  assert.ok(Math.hypot(ui.fightFrames.at(-1).listener.x-initialListener.x,ui.fightFrames.at(-1).listener.z-initialListener.z)>.1,'distance updates continue while the local user moves past a paused encounter');
  FIGHTER_IDS.forEach((id,index)=>assert.ok(ui.fixture.crowdActors.get(id).character.position.distanceTo(positions[index])<.001));
  assert.notEqual(ui.fixture.crowdActors.get('bot-5').desired.swing,tennis,'the table-tennis rally still uses the advancing garden clock');
  ui.world.setVisitors([]);
  for(let frame=0;frame<20;frame++)ui.step();
  assert.ok(ui.fixture.fightState.clock>paused,'the same scene resumes after the person walks away');
  assert.ok(ui.fixture.fightState.clock-origin<ui.clock,'the interruption does not skip forward to a later action');
});

test('a visitor arriving beside the falling head pauses the fall before the body reaches them',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots}),origin=ui.fixture.fightState.clock;
  for(let frame=0;frame<190;frame++)ui.step();
  assert.ok(ui.fixture.fightState.clock-origin>=9400,'the visitor arrives during the visible fall');
  const fallen=getFightScene(origin+10100).states.find(state=>state.id===FIGHTER_IDS[1]);
  const head=getFightBodyVolumes(fallen)[2];
  ui.world.setVisitors([{id:'beside-falling-head',x:head.x,z:head.z-.30,hair:5,seatedJobId:null}]);
  let paused=false;
  for(let frame=0;frame<40;frame++){
    ui.step(25);paused||=ui.fixture.fightState.paused;
    const actor=ui.fixture.crowdActors.get(FIGHTER_IDS[1]);
    assertFallenBodyClear(actor.character,worldCharacters(ui.fixture).filter(character=>character!==ui.fixture.crowdActors.get(FIGHTER_IDS[0]).character),undefined,ui.clock,ui.fixture.physicalBounds);
  }
  assert.equal(paused,true,'the wider falling-body footprint protects the nearby visitor');
  const held=ui.fixture.fightState.clock;
  ui.world.setVisitors([]);
  for(let frame=0;frame<40;frame++)ui.step(25);
  assert.ok(ui.fixture.fightState.clock>held,'the fall continues when the landing area is clear');
});

test('the local user can double-click into the open audience area and watch without an invisible encounter wall',t=>{
  const ui=setup(t,{jobs:allJobs,botGenerator:getBots,socialGenerator:getSocialBots}),canvas=ui.fixture.canvas;
  const event={button:0,pointerId:1,target:canvas,clientX:600,clientY:450,preventDefault(){}};
  canvas.fire('pointerdown',event);canvas.fire('pointermove',{...event,clientX:1124});canvas.fire('pointerup',event);
  for(let frame=0;frame<12;frame++)ui.step();
  const destination={x:-4.8,z:6.9};ui.groundEvent('dblclick',destination);
  for(let frame=0;frame<200&&Math.hypot(ui.world.getPlayerState().x-destination.x,ui.world.getPlayerState().z-destination.z)>.061;frame++){
    ui.step();assertSeparated(worldCharacters(ui.fixture));
  }
  const state=ui.world.getPlayerState();
  assert.ok(Math.hypot(state.x-destination.x,state.z-destination.z)<.061,'the visitor walks right into the open audience position');
  assert.equal(state.seatedJobId,null);
  const clock=ui.fixture.fightState.clock;
  for(let frame=0;frame<20;frame++)ui.step();
  assert.ok(ui.fixture.fightState.clock>clock,'watching nearby leaves the encounter running');
});

test('chair contact seats keyboard walkers from either side or the back without clicking an approach label',async t=>{
  const seat=seatCoordinates();
  for(const approach of [
    {name:'left edge',x:seat.x-.95,z:seat.z+.45,key:'d'},
    {name:'right edge',x:seat.x+.95,z:seat.z+.45,key:'a'},
    {name:'back edge',x:seat.x+.55,z:seat.z+.9,key:'w',cooldown:true},
  ])await t.test(approach.name,sub=>{
    const ui=setup(sub,{spawn:approach}),character=worldCharacters(ui.fixture)[0];
    const probe=makeFurnitureSkinProbe(ui.fixture.scene.getObjectByName('job-lounge-0'));
    try{
      assert.equal(ui.world.getPlayerState().seatedJobId,null,'standing near the furnishing does not claim it before contact');
      if(approach.cooldown)ui.world.clearSeatRequest({allowContact:true});
      ui.key('keydown',approach.key);
      let previous=character.position.clone(),contact=null,lowered=false,previousPhase=null;
      for(let frame=0;frame<240&&!ui.world.isSeatReady('product-designer');frame++){
        ui.step();
        assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,`${approach.name}: visible entry never teleports`);
        const phase=character.userData.motion.poseMode;
        if(frame%5===0||phase!==previousPhase||ui.world.isSeatReady('product-designer'))
          probe.assertClear(character,`${approach.name}: automatic contact entry frame ${frame}`);
        previousPhase=phase;
        if(ui.world.isSittingDown()){
          contact??={x:character.position.x,z:character.position.z,clock:ui.clock};
          assert.equal(ui.calls.filter(([type])=>type==='ready').length,0,'the job description waits until lowering finishes');
        }
        if(frame===9)assert.ok(contact,`${approach.name}: physical chair contact starts seating within ten frames`);
        lowered||=character.userData.motion.poseMode==='lowering';
        previous.copy(character.position);
      }
      assert.ok(contact,`${approach.name}: touching the chair starts seating without any click`);
      assert.ok(Math.hypot(contact.x-seat.x,contact.z-seat.z)>.78,'the touched edge lies outside the old cushion-center trigger');
      for(const side of [-1,1])assert.ok(Math.hypot(contact.x-seat.x-side*1.1,contact.z-seat.z+SEAT_FRONT_LANE)>.34,
        'the touched edge lies outside both old approach-gate triggers');
      if(approach.cooldown)assert.ok(contact.clock<1800,'real chair contact responds during the generic route cooldown');
      assert.equal(lowered,true,'contact uses the gradual lowering animation');
      assert.equal(ui.world.isSeatReady('product-designer'),true,'the entire natural approach completes');
      assert.equal(ui.calls.filter(([type])=>type==='seat').length,1,'contact reserves exactly one chair');
      assert.equal(ui.calls.filter(([type])=>type==='ready').length,1,'the job description becomes ready exactly once after sitting');
    }finally{probe.dispose();}
  });
});

test('chair contact at a shared sofa back chooses the nearest cushion and walks around its solid backrest',t=>{
  const seats=FURNITURE_SEATS.filter(seat=>seat.colliderId==='cozy-sofa-6'),seat=seats[1];
  assert.equal(seats.length,2,'the furnishing has two independently usable cushions');
  const ui=setup(t,{chooseSpawn:bounds=>{
    const sofa=inflateObstacles(bounds).find(bound=>bound.id===seat.colliderId);
    assert.ok(sofa,'the spawn is based on the actual sofa collision footprint');
    return{x:seat.x,z:sofa.z-sofa.halfZ-.22};
  }}),character=worldCharacters(ui.fixture)[0],probe=furnishingProbe(ui.fixture,seat);
  try{
    assert.equal(ui.world.getPlayerState().seatedJobId,null,'the nearby sofa does not attract an idle character');
    ui.key('keydown','s');
    let previous=character.position.clone(),contact=null,lowered=false,previousPhase=null;
    for(let frame=0;frame<320&&!ui.world.isSeatReady(seat.id);frame++){
      ui.step();
      assert.ok(character.position.distanceTo(previous)<=2.25*.05+.0001,'automatic sofa entry follows continuous walking');
      const phase=character.userData.motion.poseMode;
      if(frame%5===0||phase!==previousPhase||ui.world.isSeatReady(seat.id))
        probe.assertClear(character,`shared sofa contact entry frame ${frame}`);
      previousPhase=phase;
      if(ui.world.isSittingDown()){
        contact??=character.position.clone();
        assert.equal(ui.calls.filter(([type])=>type==='ready').length,0,'a claimed cushion does not report a completed seated pose early');
      }
      if(frame===9)assert.ok(contact,'physical sofa contact starts its safe approach within ten frames');
      lowered||=character.userData.motion.poseMode==='lowering';
      previous.copy(character.position);
    }
    assert.ok(contact,'touching the back of the sofa triggers its collision-safe approach');
    assert.ok(Math.hypot(contact.x-seat.x,contact.z-seat.z)>.78,'rear contact is outside the old cushion-center trigger');
    assert.equal(ui.world.getPlayerState().seatedJobId,seat.id,'the right cushion wins because it is nearest to the actual contact');
    assert.equal(ui.world.isSeatReady(seat.id),true,'the visitor goes around the backrest and finishes lowering');
    assert.equal(lowered,true);
    assert.deepEqual(ui.calls.filter(([type])=>type==='seat').map(([,id])=>id),[seat.id],'contact never claims the farther cushion');
    assert.equal(ui.calls.filter(([type])=>type==='ready').length,1);
  }finally{probe.dispose();}
});

test('chair contact cannot claim an occupied cushion and a nearby passerby keeps walking',t=>{
  const seat=seatCoordinates();
  const occupied=setup(t,{spawn:{x:seat.x-.95,z:seat.z+.45}});
  occupied.world.setSeatOccupancy({'product-designer':'another-visitor'});
  occupied.key('keydown','d');
  for(let frame=0;frame<70;frame++)occupied.step();
  assert.equal(occupied.world.getPlayerState().seatedJobId,null,'touching another visitor’s chair cannot replace its owner');
  assert.equal(occupied.calls.filter(([type])=>type==='seat'||type==='ready').length,0,'occupied contact neither claims a seat nor opens its description');
  assert.ok(occupied.world.getPlayerState().x<=seat.x-.73,'the occupied chair remains a solid obstacle');

  const passerby=setup(t,{spawn:{x:seat.x-1.05,z:seat.z+.92}}),start=passerby.world.getPlayerState();
  passerby.key('keydown','d');
  for(let frame=0;frame<20;frame++)passerby.step();
  const finish=passerby.world.getPlayerState();
  assert.ok(finish.x>start.x+1.5,'the nearby character continues along the clear passage');
  assert.equal(finish.seatedJobId,null,'passing outside the actual chair boundary does not redirect the visitor into it');
  assert.equal(passerby.calls.filter(([type])=>type==='seat'||type==='ready').length,0);
});

test('chair contact does not immediately reseat a visitor after their complete delayed departure',async t=>{
  const seat=seatCoordinates(),ui=setup(t,{spawn:{x:seat.x-.95,z:seat.z+.45}});
  ui.key('keydown','d');
  for(let frame=0;frame<240&&!ui.world.isSeatReady('product-designer');frame++){
    ui.step();
    if(frame===9)assert.equal(ui.world.isSittingDown(),true,'initial physical contact begins its transfer promptly');
  }
  assert.equal(ui.world.isSeatReady('product-designer'),true,'the initial chair is reached by keyboard contact alone');
  const leaving=ui.world.standUp('movement');
  assert.equal(ui.world.getPlayerState().seatedJobId,'product-designer','the chair remains reserved while the character starts getting up');
  settleOutOfSeat(ui);
  assert.equal(await leaving,true);
  const stopped=ui.world.getPlayerState();
  assert.equal(stopped.seatedJobId,null,'the character releases the chair only after stepping clear');
  for(let frame=0;frame<80;frame++)ui.step();
  close(ui.world.getPlayerState().x,stopped.x,'waiting beside the vacated chair does not move the character x');
  close(ui.world.getPlayerState().z,stopped.z,'waiting beside the vacated chair does not move the character z');
  assert.equal(ui.world.getPlayerState().seatedJobId,null,'the cooldown and exited-chair protection survive beyond their initial delay');
  assert.equal(ui.calls.filter(([type])=>type==='seat').length,1,'contact does not create an automatic sit/get-up loop');
  assert.equal(ui.calls.filter(([type])=>type==='standing').length,1);
});
