import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { STATION_POSITIONS, getBots, getBotOccupiedJobs } from '../src/crowd.js';
import { jobs as allJobs } from '../src/application.js';

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
          .replace('const pmBumpGate=createRecruiterBumpGate();', 'globalThis.fixture.face=yaw=>{angle=yaw;player.rotation.y=yaw;follow.reset({position:player.position,yaw});};globalThis.fixture.pmDebug=()=>({encounter:pmEncounter,combat:pmCombat,home:pmHome,chairOffset:pmChairOffset,landing:pmLanding,recruiter:pmStation?.recruiter,solids:pmStaticSolids(),chairSolids:pmChairSolids,entry:pmReturnEntry?.controller.state});const pmBumpGate=createRecruiterBumpGate();')
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

function setup(t, { spawn = null, chooseSpawn = null, bots = [], botGenerator = null, socialGenerator = null, extraCallbacks = {}, jobs = [{ id: 'product-designer', title: 'Product Designer' }, { id: 'frontend-engineer', title: 'Frontend Engineer' }] } = {}) {
  globalThis.gc?.();
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
    fixture, window, document, Date: ClockDate, console, AbortController, structuredClone,
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
    ...extraCallbacks,
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

const pmIndex=allJobs.findIndex(job=>job.id==='product-manager');
const pmHome={x:STATION_POSITIONS[pmIndex][0],z:STATION_POSITIONS[pmIndex][1]-1.12};

test('three distinct chair bumps start only the PM encounter, with solid fall, fight contacts and a complete seated return',async t=>{
  let hits=0;const states=[],reports=[],audio=[];
  let ui;ui=setup(t,{jobs:allJobs.slice(0,4),spawn:{x:pmHome.x+.65,z:pmHome.z-1.3},extraCallbacks:{
    onRecruiterBump:async({contactKind})=>{hits++;assert.equal(contactKind,'chair');return {recruiterBump:{hits,required:3,started:hits===3},recruiterEncounter:hits===3?{id:'physical-pm-duel',ownerId:'test-owner',startedAt:1800000000000+ui.clock,updatedAt:1800000000000+ui.clock,combat:null}:null};},
    onRecruiterFightChange:state=>states.push(state),onMove:state=>{reports.push(state);if(state.recruiterCombat?.phase==='seated')ui.world.setRecruiterEncounter(null,'test-owner');},onRecruiterFightFrame:frame=>audio.push(frame),
  }});
  ui.world.setRecruiterEncounter(null,'test-owner');
  const run=(n,key)=>{if(key)ui.fixture.face(Math.PI);if(key)ui.key('keydown',key);for(let frame=0;frame<n;frame++)ui.step();if(key)ui.key('keyup',key);};
  for(let episode=0;episode<3;episode++){
    run(24,'s');await new Promise(setImmediate);
    assert.equal(hits,episode+1,`contact episode ${episode+1} produces one bump`);
    run(16,'s');await new Promise(setImmediate);assert.equal(hits,episode+1,'holding into the chair cannot count repeatedly');
    if(episode===2){assert.ok(ui.fixture.pmDebug().combat,JSON.stringify(states.slice(-4)));assert.equal(ui.fixture.pmDebug().combat.elapsed,0,'the chair and seated recruiter pause while a person blocks the initial slide');assert.ok(Math.abs(ui.fixture.pmDebug().chairOffset)<1e-8);assert.ok(states.some(state=>state.message?.includes('little room')),'a blocked physical transfer keeps its pause nudge visible');}
    run(18,'w');run(6);await new Promise(setImmediate);
  }
  const stages=new Set(states.map(state=>state.stage));let maxFallTravel=0;
  for(let frame=0;frame<130;frame++){
    ui.step();const debug=ui.fixture.pmDebug();const state=debug.combat;if(state){stages.add(state.phase);maxFallTravel=Math.max(maxFallTravel,Math.abs(state.x-pmHome.x));}
    if(state?.phase==='fighting')break;
  }
  assert.ok(stages.has('falling')&&stages.has('recovering'),'the actual recruiter tumbles and visibly recovers');
  assert.ok(maxFallTravel>1,'the recruiter falls onto a clear patch beside its chair');
  assert.equal(ui.world.getRecruiterFightState().stage,'fighting',JSON.stringify(ui.fixture.pmDebug().combat));
  assert.equal(ui.world.attackRecruiter('kick'),true,'the local visitor can kick while fighting');
  run(20);
  assert.ok(ui.fixture.pmDebug().combat.recruiterHealth<100,'the kick connects within the measured skinned-character reach');
  assert.ok(reports.some(report=>report.recruiterCombat?.encounterId==='physical-pm-duel'),'stationary combat publishes its shared owner state');
  assert.ok(audio.some(frame=>frame.impacts.length),'actual contact produces a distinct spatial impact');
  assert.equal(ui.world.endRecruiterFight(),true);
  for(let frame=0;frame<360&&!reports.some(report=>report.recruiterCombat?.phase==='seated');frame++)ui.step();
  assert.equal(ui.world.getRecruiterFightState().stage,'idle',JSON.stringify(ui.fixture.pmDebug().combat));
  ui.step();assert.equal(ui.world.getRecruiterFightState().stage,'idle','synchronous local presence acknowledgement cannot break the animation loop');
  assert.equal(ui.fixture.pmDebug().chairOffset,0,'the real chair returns smoothly to its starting slot');
  assert.equal(ui.fixture.pmDebug().recruiter.getWorldPosition(new Vector3()).distanceTo(new Vector3(pmHome.x,0,pmHome.z)),0);
  const final=reports.findLast(report=>report.recruiterCombat?.phase==='seated');assert.ok(final,'the final seated state remains reportable until its shared acknowledgement');
  ui.world.setRecruiterEncounter(null,'test-owner');
  assert.equal(ui.world.getRecruiterFightState().stage,'idle');assert.equal(ui.world.getPlayerState().recruiterCombat,null);
  assert.ok(states.some(state=>state.stage==='progress'),'the bottom controls show partial bump progress');
});

test('observers hear the actual encounter location and return a disconnected owner’s recruiter to the solid chair',t=>{
  const audio=[],reports=[];
  const ui=setup(t,{jobs:allJobs.slice(0,4),spawn:{x:pmHome.x+18,z:pmHome.z},extraCallbacks:{onMove:state=>reports.push(state),onRecruiterFightFrame:frame=>audio.push(frame)}});
  const encounter={id:'departing-owner',ownerId:'another-visitor',startedAt:1800000000000,updatedAt:1800000000000,combat:{phase:'fighting',elapsed:100,x:pmHome.x-1.2,z:pmHome.z-.23,rotation:0,playerHealth:100,recruiterHealth:80,playerAttack:null,recruiterAttack:null,hitSeq:1,outcome:null,chairOffset:-.45,sitProgress:null}};
  ui.world.setRecruiterEncounter(encounter,'observer');ui.step();
  const frame=audio.findLast(value=>!value.paused);assert.ok(frame);
  assert.equal(frame.source.x,encounter.combat.x,'an observer without the owner avatar uses the recruiter position instead of halving listener distance');
  assert.equal(frame.source.z,encounter.combat.z);
  assert.equal(ui.fixture.pmDebug().chairOffset,-.45,'the visible chair follows its shared offset');
  ui.world.setRecruiterEncounter(null,'observer');
  for(let frame=0;frame<260&&ui.world.getRecruiterFightState().stage!=='idle';frame++)ui.step();
  assert.equal(ui.world.getRecruiterFightState().stage,'idle',JSON.stringify(ui.fixture.pmDebug().combat));
  assert.ok(Math.abs(ui.fixture.pmDebug().chairOffset)<1e-8,'a departed owner cannot leave the NPC or chair frozen in combat');
  assert.equal(ui.world.getPlayerState().recruiterCombat,null,'the observer never publishes ownership during cleanup');
});
