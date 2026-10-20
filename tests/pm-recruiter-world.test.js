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
          .replace('const pmChairStartZ=pmChairRaw?.z??0;', 'globalThis.fixture.face=yaw=>{angle=yaw;player.rotation.y=yaw;follow.reset({position:player.position,yaw});};globalThis.fixture.place=(point,yaw)=>{if(routeBounds.some(b=>Math.abs(point.x-b.x)<b.halfX&&Math.abs(point.z-b.z)<b.halfZ)||getCharacterObstacles().some(b=>Math.hypot(point.x-b.x,point.z-b.z)<.4+b.radius))return false;playerPosition.set(point.x,0,point.z);player.position.copy(playerPosition);target.copy(playerPosition);globalThis.fixture.face(yaw);return true;};globalThis.fixture.pmDebug=()=>({encounter:pmEncounter,combat:pmCombat,home:pmHome,chairOffset:pmChairOffset,landing:pmLanding,visitors:[...visitors.values()],recruiter:pmStation?.recruiter,player,solids:pmStaticSolids(),chairSolids:pmChairSolids,entry:pmReturnEntry?.controller.state});const pmChairStartZ=pmChairRaw?.z??0;')
          .replace('pmPoint.z<box.max.z-.004)return false;', 'pmPoint.z<box.max.z-.004){globalThis.fixture.pmCollision={phase:state.phase,elapsed:state.elapsed,point:pmPoint.toArray(),box:{min:box.min.toArray(),max:box.max.toArray()}};return false;}')
          .replace('(body.radius??CHARACTER_RADIUS)-.035))return false;', '(body.radius??CHARACTER_RADIUS)-.035)){globalThis.fixture.pmCollision={phase:state.phase,elapsed:state.elapsed,point:pmPoint.toArray(),body:{...body},indices:Array.from(mesh.geometry.attributes.skinIndex.array.slice(index*4,index*4+4)),weights:Array.from(mesh.geometry.attributes.skinWeight.array.slice(index*4,index*4+4))};return false;}')
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

test('direct PM attacks connect while seated and grounded, then a solid slam and return complete',async t=>{
  const states=[],reports=[],audio=[];let starts=0,bumps=0;let ui;
  ui=setup(t,{jobs:allJobs.slice(0,4),spawn:{x:pmHome.x+.91,z:pmHome.z-.10},extraCallbacks:{
    onRecruiterBump:()=>bumps++,
    onRecruiterAttack:async({type})=>{starts++;const now=1800000000000+ui.clock;return {recruiterEncounter:{id:'direct-physical-pm',ownerId:'test-owner',startedAt:now,updatedAt:now,initialAttack:type,combat:{phase:'provoking',elapsed:0,x:pmHome.x,z:pmHome.z,rotation:0,playerHealth:100,recruiterHealth:100,playerAttack:null,recruiterAttack:null,hitSeq:0,outcome:null,chairOffset:0,sitProgress:null,slamReady:false,slamReadyAt:0,slamHits:0}}};},
    onRecruiterFightChange:state=>states.push(state),onMove:state=>{reports.push(state);if(state.recruiterCombat?.phase==='seated')ui.world.setRecruiterEncounter(null,'test-owner');},onRecruiterFightFrame:frame=>audio.push(frame),
  }});
  ui.world.setRecruiterEncounter(null,'test-owner');ui.fixture.face(Math.atan2(-.91,.10));ui.step();
  assert.equal(ui.world.getRecruiterFightState().stage,'nearby');
  ui.key('keydown','a');for(let f=0;f<20;f++)ui.step();ui.key('keyup','a');
  assert.equal(starts,0);assert.equal(bumps,0,'bumping no longer starts combat');
  assert.ok(ui.fixture.place({x:pmHome.x+.91,z:pmHome.z-.10},Math.atan2(-.91,.10)));
  assert.equal(ui.world.attackRecruiter('punch'),true);await new Promise(setImmediate);
  assert.equal(ui.world.getRecruiterFightState().stage,'provoking');
  for(let f=0;f<25&&ui.world.getRecruiterFightState().stage==='provoking';f++)ui.step();
  assert.equal(ui.world.getRecruiterFightState().stage,'falling',JSON.stringify(ui.fixture.pmDebug().combat));
  assert.equal(ui.fixture.pmDebug().combat.recruiterHealth,80,'the initial real hand contact knocks the recruiter off the chair');
  for(let f=0;f<50&&ui.world.getRecruiterFightState().stage!=='grounded';f++)ui.step();
  let combat=ui.fixture.pmDebug().combat;assert.equal(combat.phase,'grounded');
  assert.ok(ui.fixture.place({x:combat.x,z:combat.z-.92},0),'the player approaches a clear side of the fallen body');
  assert.equal(ui.world.attackRecruiter('kick'),true);
  for(let f=0;f<18;f++)ui.step();
  combat=ui.fixture.pmDebug().combat;assert.equal(combat.recruiterHealth,50,JSON.stringify(combat));
  for(let f=0;f<50&&!['approaching','fighting'].includes(ui.world.getRecruiterFightState().stage);f++)ui.step();
  assert.equal(ui.world.attackRecruiter('punch'),true);
  for(let f=0;f<15;f++)ui.step();
  combat=ui.fixture.pmDebug().combat;assert.equal(combat.recruiterHealth,30,'a standing punch after recovery charges the third real hit');
  for(let f=0;f<60&&!ui.world.getRecruiterFightState().slamReady;f++)ui.step();
  assert.equal(ui.world.getRecruiterFightState().slamReady,true,JSON.stringify({combat:ui.fixture.pmDebug().combat,collision:ui.fixture.pmCollision}));
  assert.equal(ui.world.attackRecruiter('slam'),true);
  const points=[];for(let f=0;f<60;f++){ui.step();const c=ui.fixture.pmDebug().combat;if(c?.phase==='slamming')points.push({x:c.x,z:c.z,y:ui.fixture.pmDebug().recruiter.position.y,hips:ui.fixture.pmDebug().recruiter.userData.rig.hips.quaternion.clone(),head:ui.fixture.pmDebug().recruiter.userData.rig.head.quaternion.clone()});if(c?.phase==='returning')break;}
  assert.ok(points.length>8,'the slam has a visible supported timeline');assert.ok(points.some(p=>p.y>.4),'the recruiter visibly lifts before dropping');
  for(let i=1;i<points.length;i++){assert.ok(Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z)<.25,'a throw never teleports through a prop or character');assert.ok(points[i].hips.angleTo(points[i-1].hips)<.65&&points[i].head.angleTo(points[i-1].head)<.65,'the lifted body blends continuously into its fall');}
  assert.ok(audio.some(frame=>frame.impacts.some(impact=>impact.type==='slam')),'the actual throw contact has an impact sound');
  for(let f=0;f<300&&!reports.some(r=>r.recruiterCombat?.phase==='seated');f++)ui.step();
  assert.equal(ui.world.getRecruiterFightState().stage,'idle',JSON.stringify(ui.fixture.pmDebug().combat));ui.step();
  assert.equal(starts,1,'a direct encounter is claimed once');assert.equal(ui.world.getPlayerState().recruiterCombat,null);
});

test('a downward punch hits the grounded recruiter from a collision-clear approach',t=>{
  const x=pmHome.x-1.2,z=pmHome.z-.23;
  const ui=setup(t,{jobs:allJobs.slice(0,4),spawn:{x,z:z-.92}});
  ui.world.setRecruiterEncounter({id:'grounded-punch',ownerId:'test-owner',startedAt:1800000000000,updatedAt:1800000000000,combat:{phase:'grounded',elapsed:0,x,z,rotation:0,playerHealth:100,recruiterHealth:100,playerAttack:null,recruiterAttack:null,hitSeq:0,outcome:null,chairOffset:-.45,sitProgress:null,slamReady:false,slamReadyAt:0,slamHits:0}},'test-owner');
  ui.step();assert.ok(ui.fixture.place({x,z:z-.92},0));assert.equal(ui.world.attackRecruiter('punch'),true);
  for(let f=0;f<8;f++)ui.step();
  assert.equal(ui.fixture.pmDebug().combat.recruiterHealth,80,JSON.stringify(ui.fixture.pmDebug().combat));
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
  const owner={id:'another-visitor',x:encounter.combat.x,z:encounter.combat.z-.92,rotation:0,hair:5,name:'Other candidate',seatedJobId:null};
  ui.world.setVisitors([owner]);
  ui.world.setRecruiterEncounter({...encounter,combat:{...encounter.combat,phase:'slamming',elapsed:500,slamOrigin:{x:encounter.combat.x,z:encounter.combat.z},slamLanding:{x:encounter.combat.x-1.15,z:encounter.combat.z},slamReady:false,slamReadyAt:1800000008000,slamHits:0}},'observer');ui.step();
  const remote=ui.fixture.pmDebug().visitors[0];assert.ok(remote?.placed);assert.ok(remote.character.userData.rig.rightArm.rotation.x<-1.4,'other candidates see the owner hold the grab through the lift');assert.ok(ui.fixture.pmDebug().recruiter.position.y>.4,'other candidates see the recruiter lift');
  ui.world.setVisitors([]);ui.world.setRecruiterEncounter(null,'observer');
  for(let frame=0;frame<260&&ui.world.getRecruiterFightState().stage!=='idle';frame++)ui.step();
  assert.equal(ui.world.getRecruiterFightState().stage,'idle',JSON.stringify(ui.fixture.pmDebug().combat));
  assert.ok(Math.abs(ui.fixture.pmDebug().chairOffset)<1e-8,'a departed owner cannot leave the NPC or chair frozen in combat');
  assert.equal(ui.world.getPlayerState().recruiterCombat,null,'the observer never publishes ownership during cleanup');
});
