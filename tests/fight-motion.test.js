import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter, resetCharacterPose } from '../src/character-motion.js';

const dt=1/60;
const position=bone=>bone.getWorldPosition(new THREE.Vector3());
const span=values=>Math.max(...values)-Math.min(...values);

function make(t){
  const factory=createCharacterFactory();t.after(()=>factory.dispose());
  const create=()=>{const character=factory.create();resetCharacterPose(character);return character;};
  return {factory,create,character:create()};
}

function skin(character,select=()=>true,outline=false){
  character.updateMatrixWorld(true);
  const mesh=outline?character.getObjectByName('continuous-body-outline'):character.userData.mesh;
  const vertices=mesh.geometry.attributes.position,points=[];
  for(let index=0;index<vertices.count;index++){
    if(!select(vertices.getX(index),vertices.getY(index),vertices.getZ(index)))continue;
    const point=new THREE.Vector3().fromBufferAttribute(vertices,index);
    mesh.applyBoneTransform(index,point);mesh.localToWorld(point);points.push(point);
  }
  return points;
}

function finite(character){
  character.updateMatrixWorld(true);
  character.traverse(object=>assert.ok(object.matrixWorld.elements.every(Number.isFinite),`${object.name} transform is finite`));
}

function pose(character,fight,time=0){animateCharacter(character,{dt,time,fight});character.updateMatrixWorld(true);}

function closest(points,other){
  let distance=Infinity;
  for(const point of points)for(const target of other)distance=Math.min(distance,point.distanceTo(target));
  return distance;
}

test('guard raises bent fists and alternating punches reach the opponent with grounded feet',t=>{
  const {character,create}=make(t),target=create(),rig=character.userData.rig;
  target.position.z=.905;target.rotation.y=Math.PI;pose(target,{guard:1});
  pose(character,{guard:1});
  const feet=[position(rig.leftFoot),position(rig.rightFoot)];
  for(const side of ['left','right']){
    const guard=position(rig[`${side}Hand`]);
    assert.ok(guard.y>1.15,'fists should guard the chest rather than dangle');
    assert.ok(Math.abs(rig[`${side}Forearm`].rotation.x)>.9,'guard elbows stay bent');
    const handTrack=[];
    for(let frame=0;frame<=42;frame++){
      pose(character,{guard:1,punch:frame/42,punchSide:side},frame*dt);
      finite(character);handTrack.push(position(rig[`${side}Hand`]));
      assert.ok(position(rig.leftFoot).distanceTo(feet[0])<.001);
      assert.ok(position(rig.rightFoot).distanceTo(feet[1])<.001);
      if(frame===21){
        const fist=skin(character,(x,y)=>y>.65&&y<.90&&(side==='left'?x<-.32:x>.32));
        const chest=skin(target,(_x,y)=>y>1&&y<1.55);
        assert.ok(closest(fist,chest)<.04,`${side} punch should meet the other bot's skin`);
      }
    }
    assert.ok(span(handTrack.map(point=>point.z))>.15,'the elbow must extend into a visible punch');
    assert.ok(position(rig[`${side}Hand`]).distanceTo(guard)<.006,'each strike returns to the guard apart from idle breathing');
  }
});

test('bump and two-handed shove use torso recoil and articulate both arms without lifting the soles',t=>{
  const {character}=make(t),rig=character.userData.rig;
  pose(character,{guard:1});
  const feet=[position(rig.leftFoot),position(rig.rightFoot)];
  const hands=[position(rig.leftHand),position(rig.rightHand)];
  pose(character,{guard:1,bump:1});
  assert.ok(rig.torso.rotation.x<-.08,'walking contact produces a small backward reaction');
  for(let frame=0;frame<=60;frame++){
    pose(character,{guard:1,shove:frame/60});finite(character);
    assert.ok(position(rig.leftFoot).distanceTo(feet[0])<.001);
    assert.ok(position(rig.rightFoot).distanceTo(feet[1])<.001);
    if(frame===30)for(const [index,side] of ['left','right'].entries()){
      assert.ok(position(rig[`${side}Hand`]).z>hands[index].z+.1,'both palms should reach forward together');
      assert.ok(Math.abs(rig[`${side}Forearm`].rotation.x)<.15,'shove extends both elbows');
    }
  }
});

test('a standing bot falls continuously onto its side with actual skin supported by the floor',t=>{
  const {character}=make(t),rig=character.userData.rig;
  let previous=null,largestFrame=0;
  for(let frame=0;frame<=48;frame++){
    pose(character,{guard:1,fallProgress:frame/48});finite(character);
    const points=skin(character),outline=skin(character,()=>true,true);
    assert.ok(Math.min(...points.map(point=>point.y))>-.018,'the continuous white skin should stay above the lawn');
    assert.ok(Math.min(...outline.map(point=>point.y))>-.045,'the black outline should not sink through the lawn');
    assert.ok(Math.min(...points.map(point=>point.y))<.055,'a falling body should retain readable floor contact');
    if(previous)for(let index=0;index<points.length;index++)largestFrame=Math.max(largestFrame,points[index].distanceTo(previous[index]));
    previous=points;
  }
  assert.ok(largestFrame<.13,`the skin should tip continuously, largest frame ${largestFrame}`);
  assert.ok(position(rig.head).y<.65,'the same head reaches the floor with the torso');
  assert.ok(Math.max(...previous.map(point=>point.y))<.95,'fallen bot must be lying down rather than standing at a lower root');
  assert.equal(character.userData.sitting,false,'a standing fall must not borrow the chair pose');
});

test('low kicks articulate a lifted knee and meet the fallen torso while the other sole stays planted',t=>{
  const {character,create}=make(t),target=create(),rig=character.userData.rig;
  target.position.z=.88;target.rotation.y=Math.PI;pose(target,{guard:1,fallProgress:1,grounded:true});
  pose(character,{guard:1});const support=position(rig.leftFoot),feet=[];
  for(let frame=0;frame<=45;frame++){
    const progress=frame/45;pose(character,{guard:1,kick:progress});finite(character);
    feet.push(position(rig.rightFoot));
    assert.ok(position(rig.leftFoot).distanceTo(support)<.001,'the support sole must remain planted during every kick');
    assert.ok(Math.min(...skin(character).map(point=>point.y))>-.025,'the support leg must not penetrate the floor');
  }
  assert.ok(span(feet.map(point=>point.y))>.28,'the kicking knee must lift');
  assert.ok(span(feet.map(point=>point.z))>.45,'the shin must extend forward rather than swing an entire rigid leg');
  pose(character,{guard:1,kick:.5});
  const toe=skin(character,(x,y)=>x>.01&&y<.24);
  const torso=skin(target,(_x,y)=>y>.6&&y<1.45);
  assert.ok(closest(toe,torso)<.03,'the fully extended low kick should meet actual fallen torso skin');
});

test('grounded flinches curl the arms and recovery passes through a supported kneel into the original guard',t=>{
  const {character}=make(t),rig=character.userData.rig;
  pose(character,{guard:1});const standing=skin(character);
  pose(character,{guard:1,fallProgress:1,grounded:true});const restingElbow=rig.leftForearm.rotation.x;
  pose(character,{guard:1,fallProgress:1,grounded:true,flinch:1});
  assert.ok(rig.leftForearm.rotation.x<restingElbow-.1,'grounded reaction draws the forearm in protectively');
  let previous=null,largestFrame=0;
  for(let frame=0;frame<=96;frame++){
    pose(character,{guard:1,fallProgress:1,recoverProgress:frame/96});finite(character);
    const points=skin(character);
    assert.ok(Math.min(...points.map(point=>point.y))>-.018,'recovery must not push a hand or foot through the lawn');
    if(previous)for(let index=0;index<points.length;index++)largestFrame=Math.max(largestFrame,points[index].distanceTo(previous[index]));
    previous=points;
    if(frame===50)assert.ok(rig.rightShin.rotation.x>1,'a bent knee should support the middle of the rise');
  }
  assert.ok(largestFrame<.095,`getting up should not snap between poses: ${largestFrame}`);
  for(let index=0;index<standing.length;index++)assert.ok(standing[index].distanceTo(previous[index])<.013,'recovery ends in the original standing guard');
});

test('fight guards retain the actual walking gait and malformed optional inputs remain finite',t=>{
  const {character}=make(t),rig=character.userData.rig,heights=[];
  for(let frame=0;frame<120;frame++){
    character.position.z+=1.2*dt;
    animateCharacter(character,{dt,time:frame*dt,velocityZ:1.2,fight:{guard:.4}});
    finite(character);heights.push(position(rig.leftFoot).y);
  }
  assert.ok(span(heights)>.07,'approaching fighters must still take visible steps');
  pose(character,{guard:NaN,punch:Infinity,shove:-12,kick:undefined,fallProgress:Infinity,recoverProgress:NaN});
  finite(character);
});
