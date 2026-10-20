import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { STATION_POSITIONS, BOT_SEATED_JOB_INDICES, getBots, getSocialBots, getBotOccupiedJobs } from './crowd.js';
import { createCharacterFactory } from './character.js';
import { animateCharacter, SEATED_HIP_HEIGHT, SEATED_FOOT_REACH } from './character-motion.js';
import { createThirdPersonController } from './third-person.js';
import { getSeatArrival } from './seat-arrival.js';
import { createCozySpace } from './cozy-space.js';
import { bindMovementInput } from './movement-input.js';
import { createGardenSpace } from './garden-space.js';
import { findWalkRoute } from './navigation.js';
import { inflateObstacles } from './collision.js';
import { getStationColliders } from './station-layout.js';
import { CHARACTER_RADIUS, findCharacterPlacement, moveWithCharacters } from './character-collision.js';
import { createSeatExit } from './seat-exit.js';
import { createSeatEntry } from './seat-entry.js';
import { getSeatTransitionBounds, moveSeatTransfer, seatEntryGates, seatDepartureOptions, seatRouteLength, rankSeatRoutes, SEAT_FRONT_LANE } from './seat-transition.js';
import { createSocialSpace } from './social-space.js';
import { SOCIAL_SEATS } from './social-layout.js';
import { FURNITURE_SEATS } from './furniture-seats.js';
import { createInfoRoom } from './info-room.js';
import { getInfoInteraction } from './info-content.js';
import { BOT_PUSH_HANDOFF_MS, BOT_PUSH_LANDING_OFFSET, BOT_PUSH_MAX_BODY_RADIUS } from './bot-push.js';
import { FIGHTER_IDS, getFightScene, getFightBodyVolumes } from './fight-choreography.js';
import { createCharacterEmotion } from './character-emotion.js';
import { createFightImpactTracker, getFightSource } from './fight-impacts.js';
import { createOfficeMaterial } from './render-materials.js';
import { normalizeVisitorName } from './visitor-profile.js';

const DESK_LABEL_DISTANCE = 3;
// Begin the transfer before a walking hand enters the chair's turning lane.
// The sweep must actually hit that chair; nearby parallel walking stays free.
const SEAT_CONTACT_REACH = .44;

/** Names are plain text, including any markup a visitor enters. */
export function setVisitorNameLabel(label, name, { local = false } = {}) {
  const value = normalizeVisitorName(name);
  label.textContent = value ? `${value}${local ? ' · YOU' : ''}` : local ? 'YOU' : 'VISITOR';
}

/** Procedural scene geometry; the application owns playback for local footfalls. */
export function createWorld({ container, jobs = [], playerName, onNear = () => {}, onBotNear = () => {}, onSelect = () => {}, onMove = () => {}, onNavigateIntent = () => {}, onSeatRequest, onSeat = () => {}, onSeatReady = () => {}, onInfoSelect = () => {}, onStandUpStart = () => {}, onStandUp = () => {}, onFootstep = () => {}, onFightFrame = () => {} }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6d2ca');
  scene.fog = new THREE.Fog('#d6d2ca', 70, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor('#d6d2ca');
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline:none';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '3D hiring world. Use arrow keys or WASD to walk, double-click the ground to walk there, drag to look, and scroll to zoom.');
  container.append(renderer.domElement);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2';
  container.append(overlay);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 180);
  let span = 14, angle = Math.PI, running = true, seated = null, talking = false, nearest = null, lastTime = performance.now(), frame;
  const focus = new THREE.Vector3(0, 0, 0);
  const target = new THREE.Vector3(0, 0, 4.8);
  const playerPosition = new THREE.Vector3(0, 0, 4.8);
  const follow = createThirdPersonController({ yaw: angle, position: playerPosition, distance: span });
  let keyboardWalking = false;
  const keys = new Set();
  let waypoints = [], pendingSeat = null, intendedSeat = null, seatCooldownUntil = 0, seatContactCooldownUntil = 0, serverTimeOffset = 0;
  const failedAutomaticSeatPlans=new Map();
  let botDefeats = {}, nearbyBot = null, ignoredBot = null, strike = null;
  let blockingObject = null, bumpStarted = -Infinity;
  let seatReady = false, recentlyExitedSeat = null;
  let seatExit = null, seatEntry = null, navigationGeneration = 0;
  const visitors = new Map();
  const occupiedSeats = new Map();
  const botCharacters = new Map();
  const scuffleEffects = new Map();
  let fightClockMs = null, fightPaused = false, fightProposals = [];
  const fightImpacts = createFightImpactTracker();
  const expressionAnchor = new THREE.Vector3();
  const fightContactPoint = new THREE.Vector3();
  const white = createOfficeMaterial('#fffef8');
  const black = createOfficeMaterial('#30363d');
  const pale = createOfficeMaterial('#a7bdcd');
  const deskMaterial = createOfficeMaterial('#c4aa89');
  const frameMaterial = createOfficeMaterial('#596577');
  const timberMaterial = createOfficeMaterial('#aa805d');
  const upholsteryMaterials = ['#7899b6', '#c88470', '#a698bd', '#cfac63', '#c69aa6', '#7ca6a1'].map(color => createOfficeMaterial(color));
  const characterFactory = createCharacterFactory();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const roundedBox = new RoundedBoxGeometry(1, 1, 1, 2, .10);
  const tube = new THREE.CylinderGeometry(1, 1, 1, 8);
  const oval = new THREE.CylinderGeometry(1, 1, 1, 32);
  const cupGeometry = new THREE.CylinderGeometry(.09, .075, .19, 12);
  const allResources = new Set([white, black, pale, deskMaterial, frameMaterial, timberMaterial, ...upholsteryMaterials, box, roundedBox, tube, oval, cupGeometry]);
  function shape(parent, geometry, material, position, scale, outlined = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    // Furnishings read through their shape, light and contact shadows. The
    // character factory keeps its own white body and drawn silhouette.
    return mesh;
  }
  function person(options = {}) {
    // Initialize foot anchors on the next animation tick, after the character
    // has its final world position and parent (including seated recruiters).
    return characterFactory.create(options);
  }
  scene.add(new THREE.HemisphereLight('#fffaf2', '#bcb4a7', 2));
  const sun = new THREE.DirectionalLight('#fff5e7', 2.1);
  sun.position.set(-16, 28, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 85 });
  sun.shadow.normalBias = .04; sun.shadow.bias = -.0002; sun.shadow.radius = 4;
  scene.add(sun); scene.add(sun.target);
  const floorGeometry = new THREE.PlaneGeometry(350, 350); allResources.add(floorGeometry);
  const floorMaterial = createOfficeMaterial('#c7c1b7'); allResources.add(floorMaterial);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -.12; floor.receiveShadow = true; scene.add(floor);
  const gardenSpace=createGardenSpace({scene,shape,box,allResources});
  function chair(parent, z, rotation = 0, upholstery = pale) {
    const group = new THREE.Group(); group.name = 'upholstered-job-chair'; group.position.z = z; group.rotation.y = rotation; parent.add(group);
    // Shallow cushions support the pelvis while the bent knees and shins stay
    // beyond the front edge. Seat anchors and the shared footprint stay fixed.
    shape(group, roundedBox, upholstery, [0, .20, -.09], [.77, .13, .48]);
    shape(group, roundedBox, upholstery, [0, .27, -.075], [.65, .06, .45], false);
    const back = shape(group, roundedBox, upholstery, [0, .68, -.323], [.79, .64, .075]); back.rotation.x = -.035;
    shape(group, roundedBox, upholstery, [0, .575, -.29], [.59, .31, .035], false);
    for (const x of [-.33, .33]) {
      for (const zz of [-.23, .23]) shape(group, tube, timberMaterial, [x, .075, zz], [.027, .15, .027], false);
    }
    return group;
  }
  const positions = STATION_POSITIONS;
  const stations = jobs.map((job, index) => {
    const [x,z] = positions[index % positions.length];
    const group = new THREE.Group(); group.name = `job-lounge-${index}`; group.position.set(x + Math.floor(index / positions.length)*30,0,z); scene.add(group);
    // Rounded oak worktops and slim supports give each hiring station an
    // office-desk silhouette inside its existing solid walking footprint.
    shape(group, roundedBox, deskMaterial, [0, .91, 0], [2.36, .08, 1.24]);
    for (const xx of [-.62, .62]) {
      shape(group, tube, timberMaterial, [xx, .445, 0], [.085, .85, .085], false);
      shape(group, roundedBox, frameMaterial, [xx, .035, 0], [.38, .07, .72], false);
    }
    const upholstery = upholsteryMaterials[index % upholsteryMaterials.length];
    chair(group,-1.12,0,upholstery); chair(group,1.5,Math.PI,upholstery);
    const recruiter = person({ tie:true, hair:5, sitting:true }); recruiter.position.set(0,0,-1.12); group.add(recruiter);
    shape(group, box, black, [0,.99,-.02], [.77,.055,.48]);
    const screen = shape(group, box, black, [0,1.25,.14], [.77,.48,.045]); screen.rotation.x = -.16;
    shape(screen, box, pale, [0,0,.55], [.88,.82,.06], false);
    // A small cup and a single sheet make tables feel occupied.
    shape(group,oval,timberMaterial,[.79,.959,-.23],[.145,.016,.145],false);
    shape(group,cupGeometry,white,[.79,1.062,-.23],[1,1,1]);
    shape(group,box,white,[-.75,.965,.08],[.40,.008,.48],false).rotation.y=.14;
    const label = document.createElement('button');
    label.className = 'world-role-label';
    label.hidden = true;
    label.style.cssText = 'position:absolute;pointer-events:auto;transform:translate(-50%,-100%);border:1px solid #d8d7ce;border-radius:8px;padding:7px 11px;background:#fffef9ed;color:#252921;font-family:inherit;font-weight:500;font-size:11px;line-height:1.3;white-space:nowrap;cursor:pointer;box-shadow:0 3px 9px #24272408;transition:opacity .2s,border-color .2s';
    const title = document.createElement('span'); title.textContent=job.title;
    const availability = document.createElement('span');
    availability.style.cssText='display:block;font-size:9px;color:#7b806e;margin-top:3px';
    label.append(title,availability); label.setAttribute('aria-label',`${job.title}: walk to chair`);label.addEventListener('click',()=>{onSelect(job);goToJob(job.id);}); overlay.append(label);
    return {job,group,recruiter,label,availability,position:group.position, seat: new THREE.Vector3(group.position.x,0,z+1.5),
      approach:new THREE.Vector3(group.position.x-1.1,0,z+1.5-SEAT_FRONT_LANE),rotation:Math.PI,
      exit:{x:group.position.x+1.1,z:z+1.5-SEAT_FRONT_LANE},stationIndex:index};
  });
  const cozySpace=createCozySpace({scene,shape,box,allResources});
  const socialSpace=createSocialSpace({scene,shape,box,allResources});
  const infoRoom=createInfoRoom({scene,shape,box,allResources});
  const loungeStations=[...SOCIAL_SEATS,...FURNITURE_SEATS].map(seat=>({
    job:{...seat,seatType:seat.kind,kind:'lounge',title:seat.kind==='beanbag'?'A quiet beanbag':seat.kind==='armchair'?'A comfortable chair':seat.kind==='ottoman'?'A little place to rest':'A place to catch up'},
    seat:new THREE.Vector3(seat.x,0,seat.z),approach:new THREE.Vector3(seat.approach.x,0,seat.approach.z),
    exit:seat.exit,rotation:seat.rotation,colliderId:seat.colliderId,
  }));
  const seating=[...stations,...loungeStations];
  const seatById=id=>seating.find(station=>station.job.id===id);
  const furnitureBounds=[
    ...getStationColliders(stations.map(station=>[station.position.x,station.position.z])),
    ...cozySpace.colliders,
    ...gardenSpace.colliders,
    ...socialSpace.colliders,
    ...infoRoom.colliders,
  ];
  // Manual walking and chair routing share clearance, so walking up against a
  // railing cannot leave the visitor inside the route planner's obstacles.
  const routeBounds=inflateObstacles(furnitureBounds);
  const transitionBoundsBySeat=new Map(),walkingBoundsBySeat=new Map();
  function blockedByFurniture(x,z){
    return routeBounds.some(object=>Math.abs(x-object.x)<object.halfX&&Math.abs(z-object.z)<object.halfZ);
  }
  const paddleGeometry=new THREE.CylinderGeometry(1,1,1,16);
  const paddleFace=createOfficeMaterial('#ba7564');
  const paddleGrip=createOfficeMaterial('#d8b888');
  for(const resource of [paddleGeometry,paddleFace,paddleGrip])allResources.add(resource);
  function addPaddle(character,state){
    if(!state.tableTennis||!character.userData.rig?.rightHand)return;
    const paddle=new THREE.Group();paddle.name='table-tennis-paddle';
    shape(paddle,box,paddleGrip,[0,-.08,.04],[.045,.15,.045]);
    const face=shape(paddle,paddleGeometry,paddleFace,[0,0,.07],[.135,.035,.15]);face.rotation.x=Math.PI/2;
    character.userData.rig.rightHand.add(paddle);
  }
  let playerHair = 5;
  let player = person({hair:playerHair}); player.position.copy(playerPosition);player.rotation.y=angle; scene.add(player);
  const localBody={id:'local-player',x:player.position.x,z:player.position.z,radius:CHARACTER_RADIUS};
  const recruiterBodies=stations.map(station=>({id:`recruiter:${station.job.id}`,x:station.position.x,z:station.position.z-1.12,radius:CHARACTER_RADIUS}));
  function pushReservations(now=Date.now()+serverTimeOffset){
    return stations.flatMap(station=>{
      const defeated=botDefeats[station.job.id],index=BOT_SEATED_JOB_INDICES.indexOf(station.stationIndex);
      const ownerId=`bot:bot-${index}`;
      const delay=botCharacters.get(`bot-${index}`)?.pushDelay||0;
      if(index<0||!Number.isFinite(defeated)||now-defeated-delay>=BOT_PUSH_HANDOFF_MS)return [];
      return [
        {id:`push-landing:${station.job.id}`,ownerId,seatId:station.job.id,x:station.seat.x+BOT_PUSH_LANDING_OFFSET.x,z:station.seat.z+BOT_PUSH_LANDING_OFFSET.z,radius:BOT_PUSH_MAX_BODY_RADIUS},
        {id:`push-corridor:${station.job.id}`,ownerId,x:station.seat.x+BOT_PUSH_LANDING_OFFSET.x/2,z:station.seat.z+BOT_PUSH_LANDING_OFFSET.z/2,radius:.55},
      ];
    });
  }
  // Stable records make a sustained body contact one bump rather than a new
  // impact every animation frame. Only resolved, visible positions are solid.
  function getCharacterObstacles(ignoreId=null) {
    return [...recruiterBodies,...[...botCharacters.values(),...visitors.values()].filter(actor=>actor.placed).flatMap(actor=>[actor.body,...(actor.fightVolumes||[])]),...fightProposals,...pushReservations()]
      .filter(body=>body.id!==ignoreId&&body.ownerId!==ignoreId&&!(ignoreId===null&&body.seatId===seated));
  }
  function updateFightFootprint(actor,pose) {
    actor.fightVolumes=pose.fightRole==='fighter'
      ?getFightBodyVolumes({...pose,x:actor.body.x,z:actor.body.z,rotation:actor.character.rotation.y}).slice(1)
        .map((volume,index)=>({...volume,id:`fight-body:${actor.state.id}:${index}`,ownerId:actor.body.id}))
      :[];
  }
  function crowdObstacles(actor) {
    localBody.x=player.position.x;localBody.z=player.position.z;localBody.radius=seatById(seated)?.job.kind==='lounge'?.52:CHARACTER_RADIUS;
    return [...getCharacterObstacles(actor.body.id),localBody];
  }
  function seatBounds(station) {
    if(!station)return routeBounds;
    if(!transitionBoundsBySeat.has(station.job.id))transitionBoundsBySeat.set(station.job.id,getSeatTransitionBounds(station,routeBounds));
    return transitionBoundsBySeat.get(station.job.id);
  }
  function seatWalkBounds(station,bounds=seatBounds(station)) {
    if(walkingBoundsBySeat.has(station.job.id))return walkingBoundsBySeat.get(station.job.id);
    const own=routeBounds.find(bound=>station.colliderId?bound.id===station.colliderId:bound.kind==='applicant-chair'&&bound.stationIndex===station.stationIndex);
    // The hands sweep a wider arc than the hips during a turn. Keep this
    // clearance on the selected destination's walk as well as its transfer.
    const turnMargin=station.job.seatType==='beanbag'?0:.36;
    const wide=own?{...own,halfX:own.halfX+turnMargin,halfZ:own.halfZ+turnMargin}:null;
    const geometry={wide,entrances:seatEntryGates(station,wide),routingBounds:[...routeBounds.filter(bound=>bound!==own),...(wide?[wide]:[]),...bounds.filter(bound=>bound.id?.startsWith('seat-structure:'))]};
    walkingBoundsBySeat.set(station.job.id,geometry);
    return geometry;
  }
  function findSeatWalkRoute(from,to,routingBounds){
    const isBlocked=(x,z)=>routingBounds.some(bound=>Math.abs(x-bound.x)<bound.halfX&&Math.abs(z-bound.z)<bound.halfZ);
    // A selected free cushion may have only the narrow front lane available
    // beside an occupied cushion. Refine a failed plan once; every smoothed
    // segment still uses the complete physical bounds.
    return findWalkRoute(from,to,{isBlocked,obstacles:routingBounds})
      ??findWalkRoute(from,to,{isBlocked,obstacles:routingBounds,step:.20});
  }
  function seatAccessRoutes(station,from,occupied=false) {
    const {entrances,routingBounds}=seatWalkBounds(station);
    const bounds=seatBounds(station),characters=station.job.kind==='lounge'?getCharacterObstacles():[];
    const candidates=entrances.filter(entrance=>{
      if(station.job.kind!=='lounge')return true;
      const points=[entrance.gate,...entrance.via];
      return points.slice(1).every((point,index)=>!moveSeatTransfer(points[index],point,station,bounds,characters,{fromRotation:station.rotation,toRotation:station.rotation}).blocked);
    }).map(entrance=>occupied&&station.job.kind!=='lounge'
      ?{x:entrance.gate.x,z:station.seat.z+1.3}:entrance.gate);
    return rankSeatRoutes(from,candidates.flatMap(to=>{
      const route=findSeatWalkRoute(from,to,routingBounds);
      return route===null?[]:[{to,via:route}];
    }));
  }
  function planSeatEntry(station,from,fromRotation=station.rotation,characters=getCharacterObstacles()) {
    const bounds=seatBounds(station),plans=[];
    // A shared sofa needs a route around the occupied cushion before its
    // approach is reserved. Job push arrivals retain their clearing handoff.
    const bodies=station.job.kind==='lounge'?characters:[];
    const fx=Math.sin(station.rotation),fz=Math.cos(station.rotation),dx=from.x-station.seat.x,dz=from.z-station.seat.z;
    const ahead=dx*fx+dz*fz,side=dx*fz-dz*fx;
    // A received visitor can already be standing safely in the open front
    // strip, inside the ordinary chair's deliberately broad walking bounds.
    // Keep the structure solid while allowing the short centered backstep.
    if(ahead>=.28&&ahead<=.8&&Math.abs(side)<.12){
      const stage={x:station.seat.x+fx*SEATED_FOOT_REACH,z:station.seat.z+fz*SEATED_FOOT_REACH};
      if(!moveSeatTransfer(from,stage,station,bounds,bodies,{fromRotation:station.rotation,toRotation:station.rotation}).blocked)
        plans.push({bounds,via:[],stage,finalApproachFrom:from,distance:Math.hypot(stage.x-from.x,stage.z-from.z)});
    }
    const {wide,entrances,routingBounds}=seatWalkBounds(station,bounds);
    const blocked=(x,z)=>routingBounds.some(bound=>Math.abs(x-bound.x)<bound.halfX&&Math.abs(z-bound.z)<bound.halfZ);
    let starts=[{routeStart:from,initialFacingTo:null}];
    if(wide&&Math.abs(from.x-wide.x)<wide.halfX&&Math.abs(from.z-wide.z)<wide.halfZ){
      const exits=[
        {x:wide.x-wide.halfX-.03,z:from.z},{x:wide.x+wide.halfX+.03,z:from.z},
        {x:from.x,z:wide.z-wide.halfZ-.03},{x:from.x,z:wide.z+wide.halfZ+.03},
      ].filter(point=>!blocked(point.x,point.z)&&!moveSeatTransfer(from,point,station,bounds,bodies,{fromRotation,toRotation:fromRotation}).blocked)
        .sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z));
      if(exits.length)starts=exits.map(routeStart=>({routeStart,initialFacingTo:routeStart}));
    }
    for(const {routeStart,initialFacingTo} of starts)for(const entrance of entrances){
      const route=findSeatWalkRoute(routeStart,entrance.gate,routingBounds);
      if(route===null)continue;
      const via=[...(initialFacingTo?[initialFacingTo]:[]),...route,entrance.gate];
      const points=[from,...via,...entrance.via];
      // Only the front lane uses the owned cushion's support exception. The
      // route to that lane retains the chair's complete ordinary footprint.
      let valid=true;
      for(let index=1;index<points.length;index++){
        if(moveSeatTransfer(points[index-1],points[index],station,bounds,bodies,{fromRotation:station.rotation,toRotation:station.rotation}).blocked){valid=false;break;}
      }
      if(!valid)continue;
      const distance=seatRouteLength(from,points.slice(1));
      plans.push({bounds,via,stage:entrance.stage,finalApproachFrom:entrance.finalApproachFrom,initialFacingTo,distance});
    }
    return plans.sort((a,b)=>a.distance-b.distance)[0]||null;
  }
  const poseSeatId=pose=>pose.loungeSeatId||pose.seatedJobId||pose.logicalSeatedJobId||null;
  function crowdBounds(actor,pose) {
    // Only an occupant may cross their own cushion while settling or rising.
    return seatBounds(seatById(poseSeatId(pose)||actor.leavingSeat));
  }
  function placeCrowdCharacter(actor,pose) {
    const placement=findCharacterPlacement(pose,crowdBounds(actor,pose),crowdObstacles(actor),{ignoreId:actor.body.id,maxDistance:4,radius:actor.body.radius});
    actor.placed=!!placement;actor.character.visible=actor.placed;
    if(!placement)return false;
    actor.character.position.set(placement.x,0,placement.z);
    actor.animationPrevious.copy(actor.character.position);
    actor.body.x=placement.x;actor.body.z=placement.z;
    updateFightFootprint(actor,pose);
    return true;
  }
  function crowdCharacter(state, kind) {
    const arrival=kind==='visitor'?getSeatArrival(state,Date.now()+serverTimeOffset,botDefeats):state;
    // A newly observed won-chair arrival begins at its clear waiting side.
    // It follows the same front-side route as a visitor already on screen.
    const pose=arrival.arriving?{...arrival,x:state.x-1.2,z:state.z,rotation:Math.PI/2}:arrival;
    const character = person({hair: state.hair ?? 5, sitting: !!poseSeatId(pose)&&!pose.arriving});
    addPaddle(character,state);
    character.position.set(pose.x, 0, pose.z); character.rotation.y = pose.rotation ?? 0; scene.add(character);
    const label = document.createElement('div');
    if (kind === 'visitor') setVisitorNameLabel(label, state.name);
    else label.textContent = '';
    label.hidden = kind === 'bot';
    label.style.cssText=state.social||state.fightRole?'position:absolute;transform:translate(-50%,-100%);max-width:180px;background:#fffef9;color:#353b30;border:1.2px solid #555d48;border-radius:12px;padding:8px 11px;font:400 11px/1.4 sans-serif;box-shadow:2px 3px 0 #24272410;pointer-events:none;text-align:center':'position:absolute;transform:translate(-50%,-100%);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 8px/1 sans-serif;letter-spacing:1px;color:#7c8176;background:#fffef8bd;border-radius:4px;padding:4px 5px;pointer-events:none';
    if(state.fightRole==='fighter')label.className='fight-speech-cloud';
    overlay.append(label);
    const actor={ character, label, kind, state: {...state}, desired: {...state}, animationPrevious: character.position.clone(),
      body:{id:`${kind}:${state.id}`,x:pose.x,z:pose.z,radius:seatById(poseSeatId(pose))?.job.kind==='lounge'?.52:CHARACTER_RADIUS},placed:false,
      leavingSeat:kind==='bot'&&(state.botPush||Number.isFinite(state.standProgress))?jobs[BOT_SEATED_JOB_INDICES[Number(state.id.slice(4))]]?.id:null,detour:null,seatEntry:null,seatExit:null,pushDelay:0 };
    if(state.fightRole==='fighter')actor.emotion=createCharacterEmotion(character,{allResources});
    placeCrowdCharacter(actor,pose);
    if(kind==='visitor'&&pose.arriving&&actor.placed){
      const station=seatById(poseSeatId(pose));
      const from={x:character.position.x,z:character.position.z},plan=station&&planSeatEntry(station,from,character.rotation.y,crowdObstacles(actor));
      if(plan){
        const waitMs=Math.max(0,(botDefeats[station.job.id]??0)+BOT_PUSH_HANDOFF_MS-Date.now()-serverTimeOffset);
        actor.seatEntry={id:station.job.id,station,bounds:plan.bounds,controller:createSeatEntry({from,to:station.seat,via:plan.via,
          loweringFrom:plan.stage,finalApproachFrom:plan.finalApproachFrom,initialFacingTo:plan.initialFacingTo,
          fromRotation:character.rotation.y,toRotation:station.rotation,waitMs})};
      }
    }
    return actor;
  }
  function updateCrowdCharacter(actor, state) {
    const previousSeat=poseSeatId(actor.state),nextSeat=poseSeatId(state);
    if(previousSeat&&!nextSeat)actor.leavingSeat=previousSeat;
    if(nextSeat)actor.leavingSeat=null;
    // A heartbeat preserves the transfer already in progress. Only a changed
    // logical seat starts or cancels it, using the visitor's visible position.
    if(actor.kind==='visitor'&&previousSeat!==nextSeat){
      const interrupted=actor.seatEntry?.controller.state;
      actor.seatEntry=null;actor.detour=null;
      const station=seatById(nextSeat);
      if(station&&actor.placed){
        const from={x:actor.character.position.x,z:actor.character.position.z},plan=planSeatEntry(station,from,actor.character.rotation.y,crowdObstacles(actor));
        const now=Date.now()+serverTimeOffset;
        const waitMs=Number.isFinite(botDefeats[nextSeat])?Math.max(0,botDefeats[nextSeat]+BOT_PUSH_HANDOFF_MS-now):0;
        if(plan){actor.seatExit=null;actor.seatEntry={id:nextSeat,station,bounds:plan.bounds,controller:createSeatEntry({from,to:station.seat,via:plan.via,loweringFrom:plan.stage,finalApproachFrom:plan.finalApproachFrom,initialFacingTo:plan.initialFacingTo,
          fromRotation:actor.character.rotation.y,toRotation:station.rotation,waitMs})};}
      }else if(previousSeat&&actor.placed){
        const previousStation=seatById(previousSeat);
        if(previousStation)actor.seatExit=makeSeatExit(previousStation,{x:actor.character.position.x,z:actor.character.position.z},
          actor.character.rotation.y,interrupted,interrupted?false:true,actor.character,crowdObstacles(actor),state);
      }
    }
    if(actor.state.hair !== state.hair) {
      actor.emotion?.dispose();actor.emotion=null;
      const previous = actor.character; scene.remove(previous);previous.userData.dispose?.();
      actor.character = person({hair:state.hair ?? 5,sitting:!!nextSeat&&!actor.seatEntry});
      addPaddle(actor.character,state);
      actor.character.position.copy(previous.position); actor.character.rotation.copy(previous.rotation); scene.add(actor.character);
      if(state.fightRole==='fighter')actor.emotion=createCharacterEmotion(actor.character,{allResources});
    }
    actor.state = {...state}; actor.desired = {...state};
    if (actor.kind === 'visitor') setVisitorNameLabel(actor.label, state.name);
    actor.body.radius=seatById(nextSeat||actor.leavingSeat)?.job.kind==='lounge'?.52:CHARACTER_RADIUS;
  }
  function fightCanAdvance(scene) {
    if(!FIGHTER_IDS.every(id=>botCharacters.get(id)?.desired.fightRole==='fighter'))return true;
    const fighters=scene.states.filter(state=>state.fightRole==='fighter');
    localBody.x=player.position.x;localBody.z=player.position.z;localBody.radius=seatById(seated)?.job.kind==='lounge'?.52:CHARACTER_RADIUS;
    for(const pose of fighters){
      const actor=botCharacters.get(pose.id);
      if(!actor?.placed||Math.hypot(actor.body.x-actor.desired.x,actor.body.z-actor.desired.z)>.10)return false;
      const others=[...getCharacterObstacles(actor.body.id),localBody];
      if(moveWithCharacters(actor.character.position,pose,crowdBounds(actor,pose),others).blocked)return false;
      for(const volume of getFightBodyVolumes(pose).slice(1)){
        if(furnitureBounds.some(bound=>Math.abs(volume.x-bound.x)<bound.halfX+volume.radius&&Math.abs(volume.z-bound.z)<bound.halfZ+volume.radius))return false;
        if(others.some(body=>Math.hypot(volume.x-body.x,volume.z-body.z)<volume.radius+body.radius-.0001))return false;
      }
    }
    // Leave the audience gaps open. Only pause the choreography when someone
    // steps into the actual exchange, rather than putting a wall around it.
    if(fighters.some(state=>state.fighting)){
      const x=(fighters[0].x+fighters[1].x)/2,z=(fighters[0].z+fighters[1].z)/2;
      const bystanders=[...getCharacterObstacles(),localBody].filter(body=>!FIGHTER_IDS.some(id=>body.id===`bot:${id}`||body.ownerId===`bot:${id}`));
      if(bystanders.some(body=>Math.hypot(x-body.x,z-body.z)<.65+body.radius))return false;
    }
    return true;
  }
  function prepareCrowd(nowMs,dt=0) {
    const nextClock=fightClockMs===null?nowMs:fightClockMs+dt*1000;
    fightPaused=!fightCanAdvance(getFightScene(nextClock));
    if(!fightPaused)fightClockMs=nextClock;
    const states=[...getBots(nowMs,jobs,botDefeats,fightClockMs??nowMs),...getSocialBots(nowMs)];
    for(const state of states){
      const actor=botCharacters.get(state.id);
      if(actor)updateCrowdCharacter(actor,state);
      else botCharacters.set(state.id,crowdCharacter(state,'bot'));
    }
    // Reserve only this frame's next physical silhouettes. Movement input is
    // resolved before bot animation, so a visitor cannot step into a falling
    // head in the short interval between the clearance check and the pose.
    fightProposals=states.filter(state=>state.fightRole==='fighter').flatMap(state=>
      getFightBodyVolumes(state).map((volume,index)=>({...volume,id:`fight-next:${state.id}:${index}`,ownerId:`bot:${state.id}`})));
    return states;
  }
  function moveCrowdCharacter(actor,pose,dt,nowMs) {
    if(actor.kind==='bot'&&actor.desired.pushJobId&&actor.pushDelay>0){
      const id=actor.desired.pushJobId;
      pose=getBots(nowMs,jobs,{...botDefeats,[id]:botDefeats[id]+actor.pushDelay}).find(state=>state.id===actor.desired.id)||pose;
    }
    actor.body.radius=seatById(poseSeatId(pose)||actor.leavingSeat)?.job.kind==='lounge'?.52:CHARACTER_RADIUS;
    if(!actor.placed){if(!placeCrowdCharacter(actor,pose))return pose;}
    const character=actor.character,bounds=crowdBounds(actor,pose),characters=crowdObstacles(actor);
    if(actor.seatExit){
      const exit=actor.seatExit,proposal=exit.controller.peek(dt*1000);
      const previous=exit.controller.state;
      const movement=moveSeatTransfer(character.position,proposal,exit.station,exit.bounds,characters,{
        fromRotation:character.rotation.y,toRotation:exit.yaw,fromSlide:transferFootSlide(previous),toSlide:transferFootSlide(proposal),
      });
      const transfer=exit.controller.update(dt*1000,{blocked:movement.blocked});
      character.position.set(transfer.x,0,transfer.z);character.rotation.y=exit.yaw;
      actor.body.x=transfer.x;actor.body.z=transfer.z;
      if(transfer.complete){actor.seatExit=null;actor.leavingSeat=null;}
      return {...pose,...transfer,rotation:exit.yaw,seatedJobId:null,loungeSeatId:null,logicalSeatedJobId:exit.previousSeat};
    }
    if(actor.seatEntry){
      const entry=actor.seatEntry,proposal=entry.controller.peek(dt*1000);
      const previous=entry.controller.state;
      const movement=moveSeatTransfer(character.position,proposal,entry.station,entry.bounds,characters,{
        fromRotation:character.rotation.y,toRotation:proposal.rotation,fromSlide:transferFootSlide(previous),toSlide:transferFootSlide(proposal),
      });
      // The root and lowering clock advance together. A passing character
      // cannot make this visitor finish sitting before the cushion is reached.
      const pushStillClearing=entry.controller.state.phase!=='waiting'&&pushReservations().some(reservation=>reservation.seatId===entry.id);
      const transfer=entry.controller.update(dt*1000,{blocked:movement.blocked||pushStillClearing});
      character.position.set(transfer.x,0,transfer.z);character.rotation.y=transfer.rotation;
      actor.body.x=transfer.x;actor.body.z=transfer.z;
      if(transfer.complete)actor.seatEntry=null;
      return {...pose,...transfer,seatedJobId:transfer.complete?actor.desired.seatedJobId:null,
        loungeSeatId:transfer.complete?actor.desired.loungeSeatId:null,logicalSeatedJobId:entry.id};
    }
    let goal=pose;
    if(actor.detour){
      if(nowMs>actor.detour.until||Math.hypot(character.position.x-actor.detour.x,character.position.z-actor.detour.z)<.12)actor.detour=null;
      else goal=actor.detour;
    }
    const dx=goal.x-character.position.x,dz=goal.z-character.position.z,distance=Math.hypot(dx,dz);
    // Falling is a short, visible sideways root movement. Walking still uses
    // the usual speed cap; every tumble step keeps the same solid-body sweep.
    const travel=Math.min(distance,(pose.botPush&&pose.pushStage==='falling'?4:3)*dt);
    let movement={x:character.position.x,z:character.position.z,blocked:false};
    if(distance>.00001){
      const next={x:character.position.x+dx/distance*travel,z:character.position.z+dz/distance*travel};
      movement=moveWithCharacters(character.position,next,bounds,characters);
      // Background walkers may choose a clear way around somebody. The local
      // player never uses this steering and must explicitly move aside.
      if(movement.blocked&&actor.kind==='bot'&&!pose.botPush&&!poseSeatId(pose)&&!(Number.isFinite(pose.standProgress)&&pose.standProgress<1)&&!pose.tableTennis&&!pose.fightRole){
        if(!actor.detour){
          const ux=dx/distance,uz=dz/distance;
          for(const sign of [1,-1]){
            const detour={x:character.position.x+uz*.9*sign,z:character.position.z-ux*.9*sign,until:nowMs+1000};
            if(!moveWithCharacters(character.position,detour,bounds,characters).blocked){actor.detour=detour;break;}
          }
        }else if(Math.hypot(movement.x-character.position.x,movement.z-character.position.z)<.00001)actor.detour=null;
      }
    }
    if(pose.botPush&&movement.blocked){
      actor.pushDelay+=dt*1000;
      const id=actor.desired.pushJobId;
      pose=getBots(nowMs,jobs,{...botDefeats,[id]:botDefeats[id]+actor.pushDelay}).find(state=>state.id===actor.desired.id)||pose;
    }
    character.position.set(movement.x,0,movement.z);
    actor.body.x=movement.x;actor.body.z=movement.z;
    if(actor.leavingSeat){
      const owner=seatById(actor.leavingSeat);
      const furnishing=owner&&routeBounds.find(bound=>owner.colliderId?bound.id===owner.colliderId:bound.kind==='applicant-chair'&&bound.stationIndex===owner.stationIndex);
      if(!furnishing||Math.abs(character.position.x-furnishing.x)>=furnishing.halfX+.0001||Math.abs(character.position.z-furnishing.z)>=furnishing.halfZ+.0001)actor.leavingSeat=null;
    }
    const desiredYaw=actor.detour?Math.atan2(actor.detour.x-character.position.x,actor.detour.z-character.position.z):(pose.rotation??0);
    character.rotation.y+=Math.atan2(Math.sin(desiredYaw-character.rotation.y),Math.cos(desiredYaw-character.rotation.y))*(1-Math.exp(-dt*12));
    updateFightFootprint(actor,pose);
    return pose;
  }
  function setVisitors(nextVisitors = []) {
    const seen = new Set();
    for(const state of nextVisitors) {
      if(!state?.id || !Number.isFinite(state.x) || !Number.isFinite(state.z))continue;
      seen.add(state.id);
      if(!visitors.has(state.id))visitors.set(state.id,crowdCharacter(state,'visitor'));
      else updateCrowdCharacter(visitors.get(state.id),state);
    }
    for(const [id,actor] of visitors)if(!seen.has(id)){scene.remove(actor.character);actor.character.userData.dispose?.();actor.label.remove();visitors.delete(id);}
  }
  function setSeatOccupancy(occupancy = {}) {
    occupiedSeats.clear();
    if(occupancy instanceof Map)for(const [id,occupant] of occupancy)occupiedSeats.set(id,occupant);
    else if(Array.isArray(occupancy))for(const value of occupancy)occupiedSeats.set(typeof value==='string'?value:value.jobId,value);
    else for(const [id,occupant] of Object.entries(occupancy))if(occupant)occupiedSeats.set(id,occupant);
  }
  function seatIsOccupied(id) {
    return !!seatById(id)?.job.occupiedBy || getBotOccupiedJobs(Date.now()+serverTimeOffset,jobs,botDefeats).includes(id) || occupiedSeats.has(id) || [...visitors.values()].some(actor=>actor.state.seatedJobId===id);
  }
  function setBotDefeats(defeats = {}) { botDefeats = { ...defeats }; }
  function cancelBotChallenge() { ignoredBot = nearbyBot?.job.id ?? null; }
  function isNearBotSeat(id) { const station=stations.find(s=>s.job.id===id);return !seated&&!!station&&playerPosition.distanceTo(station.seat)<=2.4; }
  function canPushBot(id){
    const station=stations.find(candidate=>candidate.job.id===id);
    if(!station||!isNearBotSeat(id))return false;
    if(occupiedSeats.has(id)||[...visitors.values()].some(actor=>actor.state.seatedJobId===id))return false;
    const index=BOT_SEATED_JOB_INDICES.indexOf(station.stationIndex);
    if(index<0)return false;
    const botId=`bot:bot-${index}`,landing={x:station.seat.x+BOT_PUSH_LANDING_OFFSET.x,z:station.seat.z+BOT_PUSH_LANDING_OFFSET.z};
    const bodies=getCharacterObstacles(botId);
    if(bodies.some(body=>Math.hypot(body.x-landing.x,body.z-landing.z)<BOT_PUSH_MAX_BODY_RADIUS+(body.radius??CHARACTER_RADIUS)))return false;
    // The person doing the push waits on the front or left, clear of the
    // actual falling silhouette. They need not clear its wider crowd bubble.
    if(player.position.x>station.seat.x+.19&&player.position.x<station.seat.x+2.94
      &&player.position.z>station.seat.z-.63&&player.position.z<station.seat.z+.89)return false;
    // The cartoon body's side silhouette also needs room beyond its circular
    // root. Keep its landing patch free of physical props before confirming.
    return !furnitureBounds.some(bound=>!(bound.kind==='applicant-chair'&&bound.stationIndex===station.stationIndex)
      &&bound.x+bound.halfX>station.seat.x+.2&&bound.x-bound.halfX<station.seat.x+2.80
      &&bound.z+bound.halfZ>station.seat.z-.55&&bound.z-bound.halfZ<station.seat.z+.95);
  }
  function pushBot(id){
    const station=stations.find(candidate=>candidate.job.id===id);
    if(!running||!station||seatExit)return false;
    keys.clear();stopKeyboardMovement();waypoints=[];target.copy(playerPosition);destinationRing.visible=false;
    strike={jobId:id,started:performance.now()/1000,yaw:Math.atan2(station.seat.x-player.position.x,station.seat.z-player.position.z),duration:.65,confirmed:true};
    return true;
  }
  function bumpBot(id) {
    if(!isNearBotSeat(id))return false;
    const station=stations.find(s=>s.job.id===id);
    keys.clear();stopKeyboardMovement();waypoints=[];target.copy(playerPosition);destinationRing.visible=false;
    strike={jobId:id,started:performance.now()/1000,yaw:Math.atan2(station.seat.x-playerPosition.x,station.seat.z-playerPosition.z),duration:.45};
    return true;
  }
  function setServerTime(timeMs){if(Number.isFinite(timeMs)){const offset=timeMs-Date.now();if(fightClockMs!==null)fightClockMs+=offset-serverTimeOffset;serverTimeOffset=offset;}}
  function getPlayerState(){return {x:playerPosition.x,z:playerPosition.z,hair:playerHair,rotation:player.rotation.y,seated:!!seated,seatedJobId:seated};}
  function publishMovement(){onMove(getPlayerState());}
  const ringGeometry=new THREE.RingGeometry(.49,.55,40); allResources.add(ringGeometry);
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#cb7965',side:THREE.DoubleSide});allResources.add(ringMaterial);
  const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.025;scene.add(ring);
  const speech = document.createElement('div');
  speech.style.cssText='position:absolute;transform:translate(-50%,-100%);max-width:210px;min-width:45px;background:#fffef9;color:#242724;border:1.5px solid #242724;border-radius:12px;padding:10px 13px;font-family:inherit;font-size:11px;line-height:1.5;box-shadow:2px 3px 0 #24272418;text-align:center;pointer-events:none';
  speech.hidden=true;overlay.append(speech);let speechTimer;let speechSpeaker='player';
  function say(text,speaker='player'){speechSpeaker=speaker;clearTimeout(speechTimer);const value=String(text??'').trim();speech.textContent=value.length>100?value.slice(0,97)+'…':value;speech.hidden=!value;speechTimer=setTimeout(()=>{speech.hidden=true;},5000);}
  const youLabel=document.createElement('div');setVisitorNameLabel(youLabel,playerName,{local:true});youLabel.style.cssText='position:absolute;transform:translate(-50%,-100%);max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 9px/1 sans-serif;letter-spacing:1.7px;color:#3d5276;pointer-events:none;background:#dce6f5;padding:5px 8px;border-radius:5px';overlay.append(youLabel);
  const destinationRing=new THREE.Mesh(ringGeometry,ringMaterial);destinationRing.rotation.x=-Math.PI/2;destinationRing.position.y=.03;destinationRing.visible=false;scene.add(destinationRing);
  const projected=new THREE.Vector3();
  function resize(){const {width,height}=container.getBoundingClientRect(); renderer.setSize(width||1,height||1,false);camera.aspect=(width||1)/(height||1);camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function projectLabel(el,position,y=2.9){projected.copy(position);projected.y=y;projected.project(camera); const w=container.clientWidth,h=container.clientHeight;el.style.left=`${(projected.x*.5+.5)*w}px`;el.style.top=`${(-projected.y*.5+.5)*h}px`;el.style.visibility=projected.z < -1 || projected.z > 1 || Math.abs(projected.x)>1.15||Math.abs(projected.y)>1.15?'hidden':'visible';}
  function stopKeyboardMovement() {
    if (keyboardWalking) {
      target.copy(playerPosition);
      waypoints = [];
      destinationRing.visible = false;
    }
    keyboardWalking = false;
    follow.endInput();
  }
  const unbindMovementInput=bindMovementInput({window,document,keys,
    onMoveKey(key){navigationGeneration++;onNavigateIntent(null);if(seated){
      const pressed=new Set([...keys,key]);
      const inputX=(pressed.has('d')||pressed.has('arrowright')?1:0)-(pressed.has('a')||pressed.has('arrowleft')?1:0);
      const inputZ=(pressed.has('w')||pressed.has('arrowup')?1:0)-(pressed.has('s')||pressed.has('arrowdown')?1:0);
      const direction=follow.getInputDirection(inputX,inputZ);
      standUp('movement',{x:player.position.x+direction.x*3,z:player.position.z+direction.z*3});
    }if(!keys.size&&!seatExit)follow.beginInput();keyboardWalking=true;},
    onStop:stopKeyboardMovement,
    onEditableFocus(){waypoints=[];target.copy(playerPosition);destinationRing.visible=false;}
  });
  let drag=null, lastDragAt=-Infinity;
  const groundRaycaster=new THREE.Raycaster(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),groundPoint=new THREE.Vector3(),pointerPosition=new THREE.Vector2();
  function pointerDown(e){if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,last:e.clientX,moved:false};renderer.domElement.setPointerCapture(e.pointerId);}
  function pointerMove(e){if(!drag)return;const dx=e.clientX-drag.last;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(drag.moved&&!seated){follow.turn(dx*.006);}drag.last=e.clientX;}
  function pointerUp(){if(drag?.moved)lastDragAt=performance.now();drag=null;}
  function pointerCancel(){lastDragAt=performance.now();drag=null;}
  function castPointer(e){
    const {left,top,width,height}=renderer.domElement.getBoundingClientRect();
    const x=e.clientX-left,y=e.clientY-top;
    if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||x<0||x>width||y<0||y>height)return false;
    pointerPosition.set(x/width*2-1,1-y/height*2);
    groundRaycaster.setFromCamera(pointerPosition,camera);
    return true;
  }
  function click(e){
    if(e.button!==0||!running||drag?.moved||performance.now()-lastDragAt<500||!castPointer(e))return;
    const object=infoRoom.pick(groundRaycaster);
    if(!object)return;
    e.preventDefault();
    if(seated||seatExit||!getInfoInteraction(object,player.position).allowed){say('Walk closer to explore this.');return;}
    onInfoSelect(object);
  }
  function doubleClick(e){
    if(e.button!==0||!running||drag?.moved||performance.now()-lastDragAt<500||!castPointer(e))return;
    // Exhibit clicks keep their meaning, including the second click of a
    // double click. Only a clear piece of ground becomes a walking target.
    if(infoRoom.pick(groundRaycaster))return;
    if(!groundRaycaster.ray.intersectPlane(groundPlane,groundPoint))return;
    const depth=groundPoint.clone().project(camera).z;
    if(![groundPoint.x,groundPoint.z,depth].every(Number.isFinite)||depth < -1||depth > 1)return;
    if(walkToGround(groundPoint.clone()))e.preventDefault();
  }
  function wheel(e){e.preventDefault();zoom(e.deltaY*.014);}
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',pointerCancel);renderer.domElement.addEventListener('click',click);renderer.domElement.addEventListener('dblclick',doubleClick);renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  function zoom(delta){span=THREE.MathUtils.clamp(span+delta,8,24);follow.setDistance(span);}
  // Explicit destinations route through the garden pockets' open gates.
  // Routes are planned when selected, never inside the animation loop.
  function routeTo(goal,obstacles=routeBounds) {
    const isBlocked=(x,z)=>obstacles.some(bound=>Math.abs(x-bound.x)<bound.halfX&&Math.abs(z-bound.z)<bound.halfZ);
    const route=findWalkRoute(playerPosition,goal,{isBlocked,obstacles});
    if(route===null){target.copy(playerPosition);return [];}
    return route.map(point=>new THREE.Vector3(point.x,0,point.z));
  }
  function clearSeatRequest({allowContact=false}={}){
    pendingSeat=null;intendedSeat=null;seatCooldownUntil=Date.now()+1800;
    seatContactCooldownUntil=allowContact?0:seatCooldownUntil;
  }
  function clearGroundPoint(goal){
    return !blockedByFurniture(goal.x,goal.z)&&!getCharacterObstacles().some(body=>Math.hypot(goal.x-body.x,goal.z-body.z)<CHARACTER_RADIUS+(body.radius??CHARACTER_RADIUS));
  }
  function startGroundRoute(goal){
    if(!running||seated||seatExit||!clearGroundPoint(goal))return false;
    const route=findWalkRoute(playerPosition,goal,{isBlocked:blockedByFurniture,obstacles:routeBounds});
    if(route===null)return false;
    target.copy(goal);waypoints=route.map(point=>new THREE.Vector3(point.x,0,point.z));
    destinationRing.position.set(goal.x,.03,goal.z);destinationRing.visible=true;
    return true;
  }
  function walkToGround(goal){
    if(!clearGroundPoint(goal))return false;
    const generation=++navigationGeneration;
    onNavigateIntent(null);keys.clear();stopKeyboardMovement();clearSeatRequest({allowContact:true});waypoints=[];target.copy(playerPosition);destinationRing.visible=false;
    renderer.domElement.focus({preventScroll:true});
    if(seated||seatExit){
      standUp('navigation',goal).then(completed=>{if(completed&&running&&generation===navigationGeneration)startGroundRoute(goal);});
      return true;
    }
    return startGroundRoute(goal);
  }
  function touchesSeat(station,contact){
    return !!contact&&(station.colliderId?contact.id===station.colliderId:
      contact.kind==='applicant-chair'&&contact.stationIndex===station.stationIndex);
  }
  function automaticSeatAllowed(station,contact,now){
    if((intendedSeat&&intendedSeat!==station.job.id)||station.job.id===recentlyExitedSeat||seatIsOccupied(station.job.id))return false;
    const touching=touchesSeat(station,contact);
    return now>=(touching?seatContactCooldownUntil:seatCooldownUntil)&&(touching||isAtSeatApproach(station));
  }
  function recentlyFailedSeatPlan(station,now=Date.now()){
    const failed=failedAutomaticSeatPlans.get(station.job.id);
    return failed&&now-failed.at<300&&Math.hypot(player.position.x-failed.x,player.position.z-failed.z)<.12;
  }
  function requestSit(station,{contact=null}={}){
    const cooldown=station&&touchesSeat(station,contact)?seatContactCooldownUntil:seatCooldownUntil;
    if(!station||seated||seatExit||pendingSeat||Date.now()<cooldown)return false;
    if(seatIsOccupied(station.job.id)){clearSeatRequest();say('Someone is already here. Try a free seat nearby.');return false;}
    const now=Date.now();
    if(recentlyFailedSeatPlan(station,now))return false;
    if(!planSeatEntry(station,player.position,player.rotation.y)){
      failedAutomaticSeatPlans.set(station.job.id,{at:now,x:player.position.x,z:player.position.z});
      return false;
    }
    failedAutomaticSeatPlans.delete(station.job.id);
    pendingSeat=station.job.id;keys.clear();stopKeyboardMovement();waypoints=[];target.copy(playerPosition);destinationRing.visible=false;
    if(onSeatRequest)onSeatRequest(station.job);else sitAt(station.job.id);
    return true;
  }
  function isAtSeatApproach(station){
    const {entrances}=seatWalkBounds(station);
    return entrances.some(({gate})=>Math.hypot(playerPosition.x-gate.x,playerPosition.z-gate.z)<.34)||playerPosition.distanceTo(station.seat)<.78
      ||intendedSeat===station.job.id&&playerPosition.distanceTo(target)<.34;
  }
  function goToJob(id){
    const generation=++navigationGeneration;
    onNavigateIntent(id);
    if(ignoredBot===id)ignoredBot=null;
    if(recentlyExitedSeat===id)recentlyExitedSeat=null;
    if(nearbyBot?.job.id===id)nearbyBot=null;
    keys.clear();stopKeyboardMovement();
    const s=seatById(id);if(!s)return false;
    renderer.domElement.focus({preventScroll:true});
    if(seated===id&&!seatExit)return true;
    if(seated||seatExit){
      standUp('navigation',{station:s}).then(completed=>{if(completed&&running&&generation===navigationGeneration)startJobRoute(s);});
      return !seatIsOccupied(id);
    }
    return startJobRoute(s);
  }
  function startJobRoute(s){
    if(!running||seated||seatExit)return false;
    const id=s.job.id;
    pendingSeat=null;seatCooldownUntil=0;seatContactCooldownUntil=0;
    const occupied=seatIsOccupied(id);intendedSeat=occupied?null:id;
    // Start from the nearest clear access, rather than first walking around
    // to a fixed side. A nearby open front can begin its transfer directly.
    if(!occupied&&isAtSeatApproach(s)&&requestSit(s)){
      return true;
    }
    const routes=seatAccessRoutes(s,playerPosition,occupied),bodies=getCharacterObstacles();
    const clear=route=>{const points=[playerPosition,...route.via,route.to];return points.slice(1).every((point,index)=>!moveWithCharacters(points[index],point,routeBounds,bodies).blocked);};
    const access=routes.find(clear)||routes[0];
    if(!access){target.copy(playerPosition);waypoints=[];intendedSeat=null;say('Walk around to the open side of this seat.');return false;}
    target.set(access.to.x,0,access.to.z);waypoints=access.via.map(point=>new THREE.Vector3(point.x,0,point.z));
    destinationRing.position.set(target.x,.03,target.z);destinationRing.visible=true;
    if(occupied)say(getBotOccupiedJobs(Date.now()+serverTimeOffset,jobs,botDefeats).includes(id)?'Give me a playful push to take this seat!':'This chair is occupied. You can explore another role.');
    return !occupied;
  }
  function sitAt(id){
    if(!running||seatExit)return false;
    const station=seatById(id);if(!station)return false;
    if(seated===id){pendingSeat=null;return true;}
    if(seatIsOccupied(id)){clearSeatRequest();say('Someone is already sitting here. Try a free seat nearby.');return false;}
    if(seated)return false;
    const now=Date.now()+serverTimeOffset;
    const botIndex=BOT_SEATED_JOB_INDICES.indexOf(station.stationIndex);
    const waitMs=Number.isFinite(botDefeats[id])?Math.max(0,botDefeats[id]+BOT_PUSH_HANDOFF_MS-now):0;
    const from={x:player.position.x,z:player.position.z},plan=planSeatEntry(station,from,player.rotation.y);
    if(!plan){clearSeatRequest();say('Walk around to the open side of this seat.');return false;}
    const next=plan.via[0]||plan.stage;
    // A just-won chair still contains its falling bot. Reserve the human's
    // transfer now, hold outside, and keep checking all bodies on each tick.
    const entryBodies=getCharacterObstacles().filter(body=>!(waitMs>0&&(body.id===`bot:bot-${botIndex}`||body.seatId===id||body.id===`push-corridor:${id}`)));
    if(moveSeatTransfer(from,next,station,plan.bounds,entryBodies,{fromRotation:player.rotation.y,toRotation:player.rotation.y}).blocked){
      clearSeatRequest();say('Give the person beside this chair a little room.');return false;
    }
    seatEntry={station,bounds:plan.bounds,controller:createSeatEntry({from,to:station.seat,via:plan.via,loweringFrom:plan.stage,finalApproachFrom:plan.finalApproachFrom,initialFacingTo:plan.initialFacingTo,fromRotation:player.rotation.y,toRotation:station.rotation,waitMs})};
    keys.clear();stopKeyboardMovement();waypoints=[];pendingSeat=null;intendedSeat=null;seated=id;seatReady=false;
    // The shared lease uses the canonical cushion, while the visible root keeps
    // walking continuously. Neither the character nor camera is reset here.
    playerPosition.copy(station.seat);target.copy(playerPosition);destinationRing.visible=false;
    publishMovement();onSeat(station.job);
    return true;
  }
  function announceSeated(station){
    if(seatExit||seatEntry||seatReady||!station||seated!==station.job.id)return;
    seatReady=true;
    say(station.job.kind==='lounge'?'Take a breather. Stay as long as you like.':'Welcome! Take a look at the role. Apply when you’re ready.',station.job.kind==='lounge'?'player':'recruiter');
    onSeatReady(station.job);
  }
  function makeSeatExit(station,from,yaw,entryState,fullySeated,character=player,characters=null,destination=null){
    const bounds=seatBounds(station),previousSeat=station.job.id;
    let initialStand=fullySeated?0:1;
    if(Number.isFinite(entryState?.sitProgress)&&entryState.sitProgress>0){
      const height=character.userData.rig?.hips.position.y;
      const upright=(character.userData.rig?.rest.hips.position[1]??.70)-.012;
      const rise=Math.max(0,Math.min(1,(height-SEATED_HIP_HEIGHT)/(upright-SEATED_HIP_HEIGHT)));
      let low=0,high=1;
      for(let i=0;i<16;i++){const middle=(low+high)/2;if(middle*middle*(3-2*middle)<rise)low=middle;else high=middle;}
      initialStand=(low+high)/2;
    }
    const lowered=fullySeated||Number.isFinite(entryState?.sitProgress)&&entryState.sitProgress>0;
    const exitYaw=lowered?station.rotation:yaw;
    const startingSlide=lowered?Math.min(SEATED_FOOT_REACH,Math.max(0,entryState?.seatSlide??0)):SEATED_FOOT_REACH;
    const forward={x:Math.sin(station.rotation),z:Math.cos(station.rotation)};
    const riseTo=lowered?{x:station.seat.x+forward.x*SEATED_FOOT_REACH,z:station.seat.z+forward.z*SEATED_FOOT_REACH}:{...from};
    const own=routeBounds.find(bound=>station.colliderId?bound.id===station.colliderId:bound.kind==='applicant-chair'&&bound.stationIndex===station.stationIndex);
    const alreadyClear=!lowered&&(!own||Math.abs(from.x-own.x)>=own.halfX||Math.abs(from.z-own.z)>=own.halfZ);
    const options=alreadyClear?[{to:{...from},via:[]}]:seatDepartureOptions(station,own);
    const bodies=characters??getCharacterObstacles();
    const clear=(option,others=bodies)=>{
      if(moveSeatTransfer(from,riseTo,station,bounds,others,{fromRotation:yaw,toRotation:exitYaw,fromSlide:startingSlide,toSlide:SEATED_FOOT_REACH}).blocked)return false;
      const points=[riseTo,...option.via,option.to];
      return points.slice(1).every((point,index)=>!moveSeatTransfer(points[index],point,station,bounds,others,{fromRotation:exitYaw,toRotation:exitYaw}).blocked);
    };
    const remainingDistance=point=>{
      if(destination?.station){
        const next=seatAccessRoutes(destination.station,point,seatIsOccupied(destination.station.job.id))[0];
        return next?seatRouteLength(point,[...next.via,next.to]):Infinity;
      }
      if(Number.isFinite(destination?.x)&&Number.isFinite(destination?.z)){
        const route=findWalkRoute(point,destination,{isBlocked:blockedByFurniture,obstacles:routeBounds});
        return route===null?Math.hypot(destination.x-point.x,destination.z-point.z):seatRouteLength(point,[...route,destination]);
      }
      return 0;
    };
    const option=rankSeatRoutes(riseTo,options,{isClear:clear,remainingDistance})[0]
      ||rankSeatRoutes(riseTo,options,{isClear:clear})[0]
      ||rankSeatRoutes(riseTo,options,{isClear:option=>clear(option,[])})[0]||options[0];
    return {controller:createSeatExit({from,to:option.to,via:option.via,riseTo,initialStand,startingSlide,riseMs:750*(1-initialStand)}),
      from,to:option.to,previousSeat,station,bounds,yaw:exitYaw};
  }
  function standUp(reason='navigation',destination=null){
    if(!running)return Promise.resolve(false);
    if(seatExit)return seatExit.promise;
    if(!seated){clearSeatRequest();return Promise.resolve(true);}
    const previousSeat=seated,station=seatById(previousSeat);
    const from={x:player.position.x,z:player.position.z};
    let resolve;const promise=new Promise(finish=>{resolve=finish;});
    seatExit={...makeSeatExit(station,from,player.rotation.y,seatEntry?.controller.state,seatReady,player,null,destination),reason,promise,resolve};
    seatEntry=null;waypoints=[];seatReady=false;clearSeatRequest();stopKeyboardMovement();
    blockingObject=null;bumpStarted=-Infinity;
    target.copy(playerPosition);destinationRing.visible=false;speech.hidden=true;talking=false;
    onStandUpStart(previousSeat,reason);
    if(reason==='movement')renderer.domElement.focus({preventScroll:true});
    return promise;
  }
  function visibleExitPose(exit,pose){
    return {...pose,rotation:exit.yaw,seatedJobId:null,logicalSeatedJobId:exit.previousSeat};
  }
  const transferFootSlide=pose=>pose?.phase==='rising'||pose?.phase==='lowering'||pose?.phase==='seated'?pose.seatSlide:null;
  function finishSeatExit(exit,pose){
    if(seatExit!==exit)return;
    playerPosition.set(pose.x,0,pose.z);player.position.copy(playerPosition);target.copy(playerPosition);
    seatExit=null;seated=null;seatReady=false;recentlyExitedSeat=exit.previousSeat;clearSeatRequest({allowContact:true});
    publishMovement();
    try{onStandUp(exit.previousSeat,exit.reason);}finally{exit.resolve(true);}
  }
  function randomizeHair(){playerHair=(playerHair+1+Math.floor(Math.random()*5))%6;const rotation=player.rotation.y,position=player.position.clone();scene.remove(player);player.userData.dispose?.();player=person({hair:playerHair,sitting:!!seated&&!seatEntry&&!seatExit});player.position.copy(position);player.rotation.y=rotation;scene.add(player);publishMovement();}
  function recenter(){focus.copy(player.position);follow.reset({position:player.position,yaw:angle});}
  function tick(now){if(!running)return;frame=requestAnimationFrame(tick);const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;const time=now/1000;const previousX=playerPosition.x,previousZ=playerPosition.z,previousYaw=angle,previousVisualX=player.position.x,previousVisualZ=player.position.z;
    const wallTime=Date.now(),crowdTime=(wallTime+serverTimeOffset)/1000;
    const crowdStates=prepareCrowd(wallTime+serverTimeOffset,dt);
    const inputX=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    const inputZ=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
    const keyboardInput=!!(inputX||inputZ);
    let exitPose=null;
    if(seatExit){
      const exit=seatExit,proposal=exit.controller.peek(dt*1000);
      const movement=moveSeatTransfer(player.position,proposal,exit.station,exit.bounds,getCharacterObstacles(),{
        fromRotation:player.rotation.y,toRotation:exit.yaw,fromSlide:transferFootSlide(exit.controller.state),toSlide:transferFootSlide(proposal),
      });
      // The root, feet and rise all pause at contact, keeping the lease until
      // the visitor has stood and walked through the chair's open front side.
      const pose=exit.controller.update(dt*1000,{blocked:movement.blocked});
      exitPose=visibleExitPose(exit,pose);
      if(pose.complete)finishSeatExit(exit,pose);
    }
    if(keyboardInput&&!exitPose){
      follow.beginInput();
      keyboardWalking=true;waypoints=[];intendedSeat=null;
      const direction=follow.getInputDirection(inputX,inputZ);
      const input=new THREE.Vector3(direction.x,0,direction.z).normalize();
      target.copy(playerPosition).add(input);destinationRing.visible=false;
    } else if(!keyboardInput&&keyboardWalking) stopKeyboardMovement();
    // Reach each routed turn before starting the next segment; rounding a
    // corner early could otherwise walk back into the obstacle it avoids.
    while(waypoints.length && playerPosition.distanceTo(waypoints[0])<.001)waypoints.shift();
    const destination=waypoints[0]||target;
    const difference=destination.clone().sub(playerPosition);
    let requestedDirection=null;
    let contact=null;
    const stopDistance=waypoints.length ? .0001 : intendedSeat ? .01 : .06;
    if(!seated && !exitPose && difference.length()>stopDistance){
      requestedDirection=difference.clone().normalize();
      const walkScale=follow.prepareWalk(requestedDirection,dt);
      if(walkScale>0){
        const step=requestedDirection.clone().multiplyScalar(Math.min(2.25*walkScale*dt,playerPosition.distanceTo(destination)));
        const next=playerPosition.clone().add(step);
        const movement=moveWithCharacters(playerPosition,next,routeBounds,getCharacterObstacles());
        // A turn needs more room than an upright walking torso. Anticipate
        // only a chair on this actual movement line, and verify a safe entry
        // before allowing the stride to enter its arm/backrest clearance.
        const reach=playerPosition.clone().addScaledVector(requestedDirection,Math.min(SEAT_CONTACT_REACH,playerPosition.distanceTo(destination)));
        const ahead=moveWithCharacters(playerPosition,reach,routeBounds,getCharacterObstacles());
        const approached=!pendingSeat&&ahead.blocked&&seating.find(station=>{
          if(!touchesSeat(station,ahead.obstacle)||!automaticSeatAllowed(station,ahead.obstacle,wallTime)||recentlyFailedSeatPlan(station,wallTime))return false;
          if(planSeatEntry(station,player.position,player.rotation.y))return true;
          failedAutomaticSeatPlans.set(station.job.id,{at:wallTime,x:player.position.x,z:player.position.z});
          return false;
        });
        if(approached)contact=ahead.obstacle;
        else playerPosition.set(movement.x,0,movement.z);
        if(movement.blocked&&!approached){
          contact=movement.obstacle;
          if(contact!==blockingObject)bumpStarted=time;
          waypoints=[];target.copy(playerPosition);destinationRing.visible=false;
        }
      }
    }else{follow.prepareWalk(null,dt);destinationRing.visible=false;}
    blockingObject=contact;
    const displacementX=playerPosition.x-previousX,displacementZ=playerPosition.z-previousZ;
    const actuallyMoving=Math.hypot(displacementX,displacementZ)>.00001;
    // The body turns toward each intention while walking continues. Actual
    // displacement still drives the gait and the camera's gradual follow.
    const facingDirection=exitPose?null:requestedDirection;
    const strikeProgress=strike?(time-strike.started)/(strike.duration||.45):0;
    const striking=!!strike&&strikeProgress>=0&&strikeProgress<1&&(!seated||strike.confirmed);
    cozySpace.update(wallTime+serverTimeOffset);
    let entryPose=null;
    if(seatEntry&&!exitPose){
      const entry=seatEntry,proposal=entry.controller.peek(dt*1000);
      const movement=moveSeatTransfer(player.position,proposal,entry.station,entry.bounds,getCharacterObstacles(),{
        fromRotation:player.rotation.y,toRotation:proposal.rotation,fromSlide:transferFootSlide(entry.controller.state),toSlide:transferFootSlide(proposal),
      });
      const pushStillClearing=entry.controller.state.phase!=='waiting'&&pushReservations().some(reservation=>reservation.seatId===seated);
      const pose=entry.controller.update(dt*1000,{blocked:movement.blocked||pushStillClearing});
      entryPose={...pose,seatedJobId:pose.complete?seated:null,logicalSeatedJobId:seated};
      if(pose.complete)seatEntry=null;
    }
    const currentStation=seatById(seated);
    const playerPose=exitPose||entryPose||{x:playerPosition.x,z:playerPosition.z,rotation:currentStation?.rotation??angle,seatedJobId:seated};
    const view=follow.update({dt,position:playerPose,direction:facingDirection,moving:actuallyMoving,seated:!!seated,yaw:seated?playerPose.rotation:striking?strike.yaw:undefined});
    angle=view.yaw;player.rotation.y=entryPose||exitPose?playerPose.rotation:angle;
    if(actuallyMoving || Math.abs(Math.atan2(Math.sin(angle-previousYaw),Math.cos(angle-previousYaw)))>.0001)publishMovement();
    player.position.set(playerPose.x,0,playerPose.z);
    const bumpAge=time-bumpStarted;
    const bumpRecoil=!seated&&bumpAge>=0&&bumpAge<.24?Math.sin(Math.PI*bumpAge/.24)*.65:0;
    animateCharacter(player, { dt, time, velocityX: dt ? (player.position.x-previousVisualX)/dt : 0, velocityZ: dt ? (player.position.z-previousVisualZ)/dt : 0, seated: !!playerPose.seatedJobId, talking, standProgress:exitPose?.standProgress??null, seatSlide:exitPose?.seatSlide??entryPose?.seatSlide??null, sitProgress:entryPose?.sitProgress??null, walkTarget:playerPose.walkTarget??null, lounging:currentStation?.job.kind==='lounge', strike:striking?strikeProgress:0, pushing:striking&&strike.confirmed, recoil:bumpRecoil, onFootstep });
    // A won bot chair is reserved before its stand-and-leave animation ends.
    // Reveal the role only after the visitor's visible pose is actually seated.
    if(playerPose.seatedJobId&&!seatReady)announceSeated(seatById(seated));
    stations.forEach((station,index)=>animateCharacter(station.recruiter, { dt, time, seated: true, talking: seated===station.job.id&&talking, phaseOffset: index*.7 }));
    const renderedFighters = [];
    for(const actor of [...botCharacters.values(),...visitors.values()]){
      const {character,desired}=actor;
      const desiredPose=actor.kind==='visitor'&&!actor.seatEntry?getSeatArrival(desired,wallTime+serverTimeOffset,botDefeats):desired;
      const pose=moveCrowdCharacter(actor,desiredPose,dt,wallTime+serverTimeOffset);
      if(!actor.placed)continue;
      const velocityX=dt ? (character.position.x-actor.animationPrevious.x)/dt : 0;
      const velocityZ=dt ? (character.position.z-actor.animationPrevious.z)/dt : 0;
      const challengeRecoil=striking&&actor.kind==='bot'&&desired.seatedJobId===strike.jobId?Math.sin(Math.PI*strikeProgress):0;
      const visiblySeated=!!(pose.seatedJobId||pose.loungeSeatId)&&Math.hypot(character.position.x-pose.x,character.position.z-pose.z)<.06;
      animateCharacter(character, { dt, time: desired.fightRole?(fightClockMs??wallTime+serverTimeOffset)/1000:crowdTime, velocityX, velocityZ, seated: visiblySeated, talking: desired.social||desired.watching?!!desired.talking:visiblySeated, lounging:!!desired.loungeSeatId||seatById(poseSeatId(pose))?.job.kind==='lounge', phaseOffset: (Number(String(desired.id).replace(/\D/g,''))||0)*.6, standProgress:pose.standProgress,seatSlide:pose.seatSlide??null,sitProgress:pose.sitProgress??null,walkTarget:pose.walkTarget??null,fallProgress:pose.fallProgress??null,recoveryProgress:pose.recoveryProgress??null,pushSide:pose.pushSide??1, strike:actor.kind==='bot'?(desired.strike||0):0, recoil:Math.max(challengeRecoil,actor.kind==='bot'&&!desired.fightRole?(desired.recoil||0):0), paddleSwing:desired.tableTennis?desired.swing:null, fight:pose.fightPose??null });
      actor.emotion?.update(pose.anger??0);
      actor.animationPrevious.copy(character.position);
      if(actor.kind==='bot'&&FIGHTER_IDS.includes(desired.id)&&desired.fightRole==='fighter'){
        const rig=character.userData.rig;
        rig[`${pose.fightPose?.punchSide==='right'?'right':'left'}Hand`].getWorldPosition(fightContactPoint);
        const punchPosition={x:fightContactPoint.x,y:fightContactPoint.y,z:fightContactPoint.z};
        rig.rightFoot.getWorldPosition(fightContactPoint);
        renderedFighters.push({id:desired.id,placed:actor.placed,visible:character.visible&&character.parent===scene,
          fightRole:desired.fightRole,position:{x:character.position.x,y:character.position.y,z:character.position.z},
          target:{x:pose.x,z:pose.z},fightPose:pose.fightPose,punchPosition,
          kickPosition:{x:fightContactPoint.x,y:fightContactPoint.y,z:fightContactPoint.z}});
      }
    }
    onFightFrame({dt,listener:{x:player.position.x,z:player.position.z},source:getFightSource(renderedFighters),
      impacts:fightImpacts.update({clockMs:fightClockMs,paused:fightPaused,fighters:renderedFighters}),paused:fightPaused});
    ring.position.set(playerPosition.x,.025,playerPosition.z);ring.visible=!seated;
    focus.copy(player.position);floor.position.set(focus.x,-.12,focus.z);
    camera.position.set(view.camera.x,view.camera.y,view.camera.z);
    camera.lookAt(view.lookAt.x,view.lookAt.y,view.lookAt.z);camera.updateMatrixWorld();
    sun.position.set(focus.x-16,28,focus.z+15);sun.target.position.copy(focus);
    let close=null,dist=DESK_LABEL_DISTANCE;stations.forEach(s=>{const d=s.position.distanceTo(player.position);if(d<dist){close=s;dist=d;}});if((close?.job.id??null)!==(nearest?.job.id??null)){nearest=close;onNear(close?.job??null);}
    const botSeats=getBotOccupiedJobs(wallTime+serverTimeOffset,jobs,botDefeats);
    if(ignoredBot&&!isNearBotSeat(ignoredBot))ignoredBot=null;
    let closeBot=null,botDistance=2.4;
    if(!seated)for(const station of stations){const distance=station.seat.distanceTo(playerPosition);if(botSeats.includes(station.job.id)&&!occupiedSeats.has(station.job.id)&&station.job.id!==ignoredBot&&distance<botDistance){closeBot=station;botDistance=distance;}}
    if((closeBot?.job.id??null)!==(nearbyBot?.job.id??null)){nearbyBot=closeBot;onBotNear(closeBot?.job??null);}
    if(recentlyExitedSeat){
      const exited=seatById(recentlyExitedSeat);
      if(!exited||playerPosition.distanceTo(exited.seat)>1.65)recentlyExitedSeat=null;
    }
    if(!seated&&!seatExit&&!pendingSeat){
      // Contact with the actual chair works from any side, not just the small
      // route gates. The existing entry planner still walks around solid arms
      // and backrests before lowering. Adjacent cushions remain independent.
      const chair=seating.filter(s=>automaticSeatAllowed(s,contact,wallTime)&&!recentlyFailedSeatPlan(s,wallTime))
        .sort((a,b)=>Number(touchesSeat(b,contact))-Number(touchesSeat(a,contact))
        ||playerPosition.distanceTo(touchesSeat(a,contact)?a.seat:a.approach)-playerPosition.distanceTo(touchesSeat(b,contact)?b.seat:b.approach))[0];
      if(chair)requestSit(chair,{contact});
    }
    stations.forEach(s=>{const active=s===nearest,occupied=seatIsOccupied(s.job.id);s.label.hidden=!active;if(active)projectLabel(s.label,s.position,2.7);s.label.style.borderColor='#8fa8c5';s.label.style.opacity='1';s.availability.textContent=seated===s.job.id?'You’re seated':botSeats.includes(s.job.id)?'Push the bot · Take this seat':occupied?'Chair occupied':'Pull up a chair';});
    for(const actor of [...botCharacters.values(),...visitors.values()]){
      const speechCloud=!!(actor.desired.social||actor.desired.fightRole);
      actor.label.hidden=!actor.placed||(speechCloud?!actor.desired.speech:actor.kind==='bot');
      if(speechCloud)actor.label.textContent=actor.desired.speech||'';
      if(actor.desired.fightRole==='fighter'){
        actor.character.userData.rig.head.getWorldPosition(expressionAnchor);
        projectLabel(actor.label,expressionAnchor,expressionAnchor.y+.62);
      }else projectLabel(actor.label,actor.character.position,speechCloud?2.6:2.38);
      actor.label.style.opacity=span>20?'.65':speechCloud?'1':'.8';
    }
    const encounters=new Map();
    for(const state of crowdStates){
      if(!state.encounterId||!state.opponentId)continue;
      const actor=botCharacters.get(state.id),opponent=botCharacters.get(state.opponentId);
      if(!actor?.placed||!opponent?.placed)continue;
      const previous=encounters.get(state.encounterId);
      const close=actor.character.position.distanceTo(opponent.character.position)<1.8;
      const impact=close?state.impact||0:0;
      if(!previous||impact>previous.impact){
        const ratio=state.fightPose?.kick>0?.72:.5;
        encounters.set(state.encounterId,{x:actor.body.x+(opponent.body.x-actor.body.x)*ratio,z:actor.body.z+(opponent.body.z-actor.body.z)*ratio,impact,height:state.impactHeight??1.25});
      }
    }
    for(const [id,encounter] of encounters){
      let effect=scuffleEffects.get(id);
      if(!effect){effect=document.createElement('span');effect.className='scuffle-impact';effect.textContent='✦';effect.setAttribute('aria-hidden','true');overlay.append(effect);scuffleEffects.set(id,effect);}
      effect.hidden=encounter.impact<=.01;
      if(!effect.hidden){projectLabel(effect,new THREE.Vector3(encounter.x,0,encounter.z),encounter.height);effect.style.opacity=String(encounter.impact);effect.style.transform=`translate(-50%,-50%) scale(${.7+encounter.impact*.45}) rotate(-12deg)`;}
    }
    for(const [id,effect] of scuffleEffects)if(!encounters.has(id))effect.hidden=true;
    projectLabel(youLabel,player.position,2.45);if(!speech.hidden){const station=stations.find(s=>s.job.id===seated);projectLabel(speech,station&&speechSpeaker==='recruiter'?station.recruiter.getWorldPosition(new THREE.Vector3()):player.position,3.1);}
    renderer.render(scene,camera);
  }
  frame=requestAnimationFrame(tick);
  const visibility=()=>{keys.clear();stopKeyboardMovement();cancelAnimationFrame(frame);if(!document.hidden&&running){lastTime=performance.now();frame=requestAnimationFrame(tick);}};
  document.addEventListener('visibilitychange',visibility);
  return {say,randomizeHair,goToJob,sitAt,standUp,zoom,recenter,setVisitors,setSeatOccupancy,setServerTime,setBotDefeats,bumpBot,canPushBot,pushBot,cancelBotChallenge,isNearBotSeat,getPlayerState,clearSeatRequest,isSeatReady(id){return !seatExit&&!seatEntry&&seated===id&&seatReady;},isSittingDown(){return !!seatEntry;},goToInfoRoom(){return walkToGround(new THREE.Vector3(0,0,25.5));},isStandingUp(){return !!seatExit;},setTalking(value){talking=!!value;},destroy(){running=false;navigationGeneration++;if(seatExit){seatExit.resolve(false);seatExit=null;}cancelAnimationFrame(frame);clearTimeout(speechTimer);unbindMovementInput();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',pointerCancel);renderer.domElement.removeEventListener('click',click);renderer.domElement.removeEventListener('dblclick',doubleClick);renderer.domElement.removeEventListener('wheel',wheel);document.removeEventListener('visibilitychange',visibility);observer.disconnect();cozySpace.dispose();gardenSpace.dispose();socialSpace.dispose?.();infoRoom.dispose?.();renderer.dispose();for(const actor of [...botCharacters.values(),...visitors.values()])actor.emotion?.dispose();characterFactory.dispose();allResources.forEach(resource=>resource.dispose());overlay.remove();renderer.domElement.remove();}};
}
