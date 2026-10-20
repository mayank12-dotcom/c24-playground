// CPU-only furniture access verification. Prints every candidate route as JSON.
// Run from the project: node scripts/check-furniture-access.mjs > access-audit.json
import * as THREE from 'three';
import {createCozySpace} from '../src/cozy-space.js';
import {createInfoRoom} from '../src/info-room.js';
import {FURNITURE_SEATS} from '../src/furniture-seats.js';
import {SOCIAL_COLLIDERS} from '../src/social-layout.js';
import {GARDEN_COLLIDERS,GARDEN_WORKSPACES} from '../src/garden-layout.js';
import {getStationColliders} from '../src/station-layout.js';
import {inflateObstacles,segmentObstacleEntry} from '../src/collision.js';
import {getSeatTransitionBounds,moveSeatTransfer,seatEntryGates} from '../src/seat-transition.js';
import {findWalkRoute} from '../src/navigation.js';
const scene=new THREE.Scene(),box=new THREE.BoxGeometry(),allResources=new Set([box]);
const ink=new THREE.MeshBasicMaterial({side:THREE.BackSide});allResources.add(ink);
function shape(parent,geometry,material,position,scale,outlined=true){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);if(outlined){const outline=new THREE.Mesh(geometry,ink);outline.scale.set(1+.014/scale[0],1+.014/scale[1],1+.014/scale[2]);mesh.add(outline);}return mesh;}
const cozy=createCozySpace({scene,shape,box,allResources}),info=createInfoRoom({scene,shape,box,allResources});
const original=[...GARDEN_COLLIDERS,...getStationColliders(GARDEN_WORKSPACES.map(({x,z})=>[x,z])),...SOCIAL_COLLIDERS,...cozy.colliders,...info.colliders],bounds=inflateObstacles(original);
const report=[];
for(const seat of FURNITURE_SEATS){const station={job:{...seat,kind:'lounge',seatType:seat.kind},seat,rotation:seat.rotation,colliderId:seat.colliderId,approach:seat.approach,exit:seat.exit};const own=bounds.find(b=>b.id===seat.colliderId),turn=seat.kind==='beanbag'?0:.36,wide={...own,halfX:own.halfX+turn,halfZ:own.halfZ+turn},transfer=getSeatTransitionBounds(station,bounds);const routing=[...bounds.filter(b=>b!==own),wide,...transfer.filter(b=>b.id?.startsWith('seat-structure:'))];const gates=seatEntryGates(station,wide);const checks=gates.map(g=>{const obstacles=routing.filter(b=>segmentObstacleEntry(g.gate,g.gate,b)!==null);let previous=g.gate,obstacle=null;for(const p of g.via){const m=moveSeatTransfer(previous,p,station,transfer,[],{fromRotation:seat.rotation,toRotation:seat.rotation});if(m.blocked){obstacle=m.obstacle;break;}previous=p;}const lower=moveSeatTransfer(g.stage,seat,station,transfer,[],{fromRotation:seat.rotation,toRotation:seat.rotation,fromSlide:.29,toSlide:0});const isBlocked=(x,z)=>routing.some(b=>Math.abs(x-b.x)<b.halfX&&Math.abs(z-b.z)<b.halfZ);const clear=!obstacles.length&&!obstacle&&!lower.blocked;const route=clear?findWalkRoute({x:0,z:4.8},g.gate,{isBlocked,obstacles:routing}):null;return {gate:g.gate,blocked:obstacles.map(o=>o.id??o.kind),transfer:obstacle?.id??obstacle?.kind,lower:lower.blocked?lower.obstacle?.id??lower.obstacle?.kind:null,lobbyRoute:route===null?null:[...route,g.gate]};});report.push({id:seat.id,checks});}
console.log(JSON.stringify({seats:report.length,reachable:report.filter(row=>row.checks.some(c=>c.lobbyRoute!==null)).length,blocked:report.filter(row=>row.checks.every(c=>c.lobbyRoute===null)),audit:report},null,2));
for(const r of allResources)r.dispose();
process.exitCode=report.every(row=>row.checks.some(check=>Array.isArray(check.lobbyRoute)))?0:1;
