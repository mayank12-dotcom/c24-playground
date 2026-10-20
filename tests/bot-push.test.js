import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter } from '../src/character-motion.js';
import { BOT_PUSH_FALL_MS, BOT_PUSH_GROUND_MS, BOT_PUSH_RECOVER_MS, BOT_PUSH_TURN_MS,
  BOT_PUSH_HANDOFF_MS, BOT_PUSH_LANDING_OFFSET, BOT_PUSH_MAX_BODY_RADIUS, botPushSeatClear, getBotPushPose } from '../src/bot-push.js';

const seat={x:13,z:-1.5,rotation:Math.PI};
const groundAt=BOT_PUSH_FALL_MS;
const recoverAt=groundAt+BOT_PUSH_GROUND_MS;
const turnAt=recoverAt+BOT_PUSH_RECOVER_MS;

test('one deterministic push timeline includes falling, a grounded pause, recovery and departure',()=>{
  assert.equal(BOT_PUSH_HANDOFF_MS,BOT_PUSH_FALL_MS+BOT_PUSH_GROUND_MS+BOT_PUSH_RECOVER_MS+BOT_PUSH_TURN_MS);
  const expected=[[0,'falling'],[groundAt,'grounded'],[recoverAt,'recovering'],[turnAt,'turning'],[BOT_PUSH_HANDOFF_MS,'departing']];
  for(const [elapsed,stage] of expected){
    const pose=getBotPushPose(seat,elapsed);
    assert.equal(pose.pushStage,stage);
    assert.equal(pose.seatedJobId,null);
    assert.equal(pose.moving,false);
    assert.deepEqual(pose,getBotPushPose({...seat},elapsed));
    assert.equal(botPushSeatClear(elapsed),elapsed>=BOT_PUSH_HANDOFF_MS);
  }
  const grounded=getBotPushPose(seat,groundAt);
  assert.equal(grounded.x,seat.x+BOT_PUSH_LANDING_OFFSET.x);
  assert.equal(grounded.z,seat.z+BOT_PUSH_LANDING_OFFSET.z);
  assert.equal(grounded.bodyRadius,BOT_PUSH_MAX_BODY_RADIUS);
  assert.equal(getBotPushPose(seat,BOT_PUSH_HANDOFF_MS).bodyRadius,.4);
  assert.deepEqual(seat,{x:13,z:-1.5,rotation:Math.PI});
});

test('side displacement and pose stay continuous at every stage seam',()=>{
  let before=getBotPushPose(seat,0);
  for(let ms=5;ms<=BOT_PUSH_HANDOFF_MS+100;ms+=5){
    const pose=getBotPushPose(seat,ms);
    assert.ok(Math.hypot(pose.x-before.x,pose.z-before.z)<.015,'the sideways fall must remain below the collision movement cap');
    assert.ok(Math.abs(pose.rotation-before.rotation)<.08);
    assert.ok(pose.fallProgress>=before.fallProgress&&pose.recoveryProgress>=before.recoveryProgress);
    assert.ok(pose.bodyRadius>=.4&&pose.bodyRadius<=BOT_PUSH_MAX_BODY_RADIUS);
    for(const field of ['x','z','rotation','fallProgress','recoveryProgress','bodyRadius'])assert.ok(Number.isFinite(pose[field]));
    before=pose;
  }
  for(const seam of [groundAt,recoverAt,turnAt,BOT_PUSH_HANDOFF_MS]){
    const a=getBotPushPose(seat,seam-.001),b=getBotPushPose(seat,seam+.001);
    for(const field of ['x','z','rotation','fallProgress','recoveryProgress','bodyRadius'])assert.ok(Math.abs(a[field]-b[field])<.0001);
  }
});

test('the pushed occupant clears the open front before crossing the chair legs',()=>{
  for(let ms=0;ms<=BOT_PUSH_FALL_MS;ms+=5){
    const pose=getBotPushPose(seat,ms);
    assert.ok(pose.z<=seat.z,'a shove must never move the seated body backward into its backrest');
  }
  const clearing=getBotPushPose(seat,BOT_PUSH_FALL_MS*.30);
  assert.ok(clearing.z<seat.z-.25,'the early fall moves the short feet beyond the front leg row');
  assert.ok(clearing.x<seat.x+.30,'front clearance comes before the body crosses the side of the chair');
  const landing=getBotPushPose(seat,BOT_PUSH_FALL_MS);
  assert.ok(landing.z>clearing.z,'the bot eases slightly back onto the clear landing patch');
  assert.equal(landing.z,seat.z+BOT_PUSH_LANDING_OFFSET.z);
});

test('invalid timing and positions never create a broken tumble or prematurely clear a chair',()=>{
  for(const ms of [NaN,Infinity,undefined,-100])assert.deepEqual(getBotPushPose(seat,ms),getBotPushPose(seat,0));
  for(const value of [null,{}, {x:NaN,z:1}, {x:1,z:Infinity}])assert.equal(getBotPushPose(value,0),null);
  for(const ms of [NaN,Infinity,undefined,-100,BOT_PUSH_HANDOFF_MS-1])assert.equal(botPushSeatClear(ms),false);
});

function skinBounds(character){
  const bounds=new THREE.Box3(),v=new THREE.Vector3(),mesh=character.userData.mesh;
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    v.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,v);bounds.expandByPoint(mesh.localToWorld(v));
  }
  return bounds;
}

test('the actual continuous skin visibly falls sideways to the ground and gets up without replacement',t=>{
  const factory=createCharacterFactory();t.after(()=>factory.dispose());
  const character=factory.create();character.rotation.y=Math.PI;
  animateCharacter(character,{seated:true});character.updateMatrixWorld(true);
  const rig=character.userData.rig,mesh=character.userData.mesh;
  const seatedPose=rig.bones.map(bone=>bone.matrixWorld.clone());
  animateCharacter(character,{...getBotPushPose({x:0,z:0},0)});character.updateMatrixWorld(true);
  rig.bones.forEach((bone,index)=>assert.ok(bone.matrixWorld.elements.every((value,axis)=>Math.abs(value-seatedPose[index].elements[axis])<1e-7),'fall starts from the exact seated skeleton'));
  let previousHead=rig.head.getWorldPosition(new THREE.Vector3());
  let groundedHead=0, recoveredHead=0;
  for(let elapsed=0;elapsed<=BOT_PUSH_HANDOFF_MS;elapsed+=25){
    const pose=getBotPushPose({x:0,z:0},elapsed);
    character.position.set(pose.x,0,pose.z);character.rotation.y=pose.rotation;
    animateCharacter(character,{...pose,dt:.025});character.updateMatrixWorld(true);
    const head=rig.head.getWorldPosition(new THREE.Vector3()),bounds=skinBounds(character);
    assert.ok(head.distanceTo(previousHead)<.19,'the head must travel continuously through falling and recovery');
    assert.ok(bounds.min.y>-.012,`skin should stay above the garden floor at ${elapsed}: ${bounds.min.y}`);
    assert.ok(bounds.max.y<2.10,'the character should never pop upward while tumbling');
    character.traverse(node=>assert.ok(node.matrixWorld.elements.every(Number.isFinite)));
    if(elapsed===groundAt){groundedHead=head.y;assert.ok(Math.abs(rig.hips.rotation.z)>1.4);assert.ok(bounds.max.y<.85,'a genuine grounded fall must lower the entire body');}
    if(elapsed===turnAt)recoveredHead=head.y;
    previousHead=head;
  }
  assert.ok(groundedHead<.55&&recoveredHead>1.6);
  assert.equal(character.userData.mesh,mesh,'the same light skin is articulated throughout the action');
});

test('the applicant pushes with both open hands while ordinary bot sparring remains one handed',t=>{
  const factory=createCharacterFactory();t.after(()=>factory.dispose());
  const push=factory.create(),jab=factory.create();
  animateCharacter(push,{strike:.5,pushing:true});animateCharacter(jab,{strike:.5});
  const p=push.userData.rig,j=jab.userData.rig;
  assert.ok(Math.abs(p.leftArm.rotation.x-p.rightArm.rotation.x)<.01);
  assert.ok(p.leftArm.rotation.x<-.8&&p.rightArm.rotation.x<-.8);
  assert.ok(Math.abs(j.leftArm.rotation.x-j.rightArm.rotation.x)>.5,'existing playful sparring retains its alternating jab');
});
