import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeatEntry, SEAT_ENTRY_SPEED, SEAT_ALIGN_MS } from '../src/seat-entry.js';

test('the approach begins at the visible position and lowers only near the cushion', () => {
  const entry = createSeatEntry({ from: {x:0,z: .74}, to: {x:0,z:0}, fromRotation: 0, toRotation: Math.PI });
  assert.deepEqual({x:entry.state.x,z:entry.state.z}, {x:0,z:.74});
  assert.equal(entry.state.sitProgress, 0);
  let previous = entry.state, readyAt = 0;
  while (entry.active) {
    const pose = entry.update(10);
    assert.ok(Math.hypot(pose.x - previous.x,pose.z - previous.z) <= SEAT_ENTRY_SPEED*.01+.000001);
    assert.ok(pose.sitProgress >= previous.sitProgress);
    if (pose.sitProgress>0) assert.ok(pose.z<.35, 'lowering starts close to the chair');
    previous = pose; readyAt += 10;
  }
  assert.ok(readyAt >= 800 && readyAt <= 950);
  assert.equal(entry.state.sitProgress, 1);
  assert.equal(entry.state.z, 0);
  assert.ok(Math.abs(entry.state.rotation-Math.PI)<1e-10);
});

test('a blocked transfer holds position and progress until the obstruction clears', () => {
  const entry = createSeatEntry({from:{x:1,z:1},to:{x:1,z:0}});
  const before=entry.update(200);
  assert.ok(entry.peek(100).z<before.z);
  const held=entry.update(100,{blocked:true});
  assert.deepEqual(held,before);
  assert.ok(entry.update(100).z<held.z);
});

test('waiting for a previous occupant preserves the actual current position', () => {
  const entry=createSeatEntry({from:{x:2,z:1},to:{x:2,z:0},waitMs:2500});
  const wait=entry.update(2400);
  assert.equal(wait.x,2);assert.equal(wait.z,1);assert.equal(wait.sitProgress,0);assert.equal(wait.phase,'waiting');
  assert.ok(entry.update(200).z<1);
});

test('far transfers follow waypoints with walking speed and cannot teleport', () => {
  const entry=createSeatEntry({from:{x:0,z:5},via:[{x:2,z:5},{x:2,z:1}],to:{x:0,z:1}});
  let previous=entry.state;
  while(entry.active){
    const pose=entry.update(16);
    assert.ok(Math.hypot(pose.x-previous.x,pose.z-previous.z)<=SEAT_ENTRY_SPEED*.016+.000001);
    assert.ok(pose.z>=1&&pose.z<=5);
    previous=pose;
  }
  assert.equal(entry.state.x,0);assert.equal(entry.state.z,1);
});

test('invalid intervals do not rewind a seat entry', () => {
  const entry=createSeatEntry({from:{x:0,z:1},to:{x:0,z:0}});
  const pose=entry.update(100);
  for(const dt of [-10,NaN,Infinity])assert.deepEqual(entry.update(dt),pose);
  assert.throws(()=>createSeatEntry({from:{x:NaN,z:0},to:{x:0,z:0}}),TypeError);
  assert.throws(()=>createSeatEntry({from:{x:0,z:0},to:{x:0,z:0},speed:0}),RangeError);
});

test('the real character rig lowers continuously with grounded feet and keeps the same body', async () => {
  const [{createCharacterFactory},{animateCharacter,SEATED_HIP_HEIGHT},{Vector3}]=await Promise.all([
    import('../src/character.js'),import('../src/character-motion.js'),import('three'),
  ]);
  const factory=createCharacterFactory(),character=factory.create({hair:5}),rig=character.userData.rig;
  try {
    const body=character.children.find(child=>child.isSkinnedMesh);
    let previous=Infinity;
    for(let frame=0;frame<=100;frame++){
      animateCharacter(character,{dt:.01,sitProgress:frame/100,lounging:true});
      assert.ok(rig.hips.position.y<=previous+.000001,'the pelvis lowers monotonically');
      previous=rig.hips.position.y;
      const soles=[rig.leftFoot,rig.rightFoot].map(foot=>foot.getWorldPosition(new Vector3()).y);
      assert.ok(Math.min(...soles)<.111,'one foot stays planted through the transfer');
      assert.ok(Math.min(...soles)>.109,'the soles stay above the ground');
      assert.equal(character.children.find(child=>child.isSkinnedMesh),body);
    }
    assert.ok(Math.abs(rig.hips.position.y-SEATED_HIP_HEIGHT)<1e-10);
    const before=rig.rightArm.rotation.clone();
    animateCharacter(character,{dt:.01,seated:true,lounging:true});
    assert.ok(Math.abs(rig.rightArm.rotation.x-before.x)<.001,'settling into the cushion does not pop the arm');
  } finally { factory.dispose(); }
});

test('lowering out of a live walking stride preserves ankle and wrist continuity', async () => {
  const [{createCharacterFactory},{animateCharacter},{Vector3}]=await Promise.all([
    import('../src/character.js'),import('../src/character-motion.js'),import('three'),
  ]);
  const factory=createCharacterFactory(),character=factory.create({hair:5}),rig=character.userData.rig;
  try {
    for(let frame=0;frame<14;frame++){
      character.position.z+=.1125;
      animateCharacter(character,{dt:.05,time:frame*.05,velocityZ:2.25});
    }
    const bones=[rig.leftFoot,rig.rightFoot,rig.leftHand,rig.rightHand];
    const previous=bones.map(bone=>bone.getWorldPosition(new Vector3()));
    const movement=new Vector3(0,0,.065);
    character.position.add(movement);
    animateCharacter(character,{dt:.05,time:.75,velocityZ:1.3,sitProgress:.003});
    bones.forEach((bone,index)=>{
      const relative=bone.getWorldPosition(new Vector3()).sub(previous[index]).sub(movement).length();
      assert.ok(relative<(index<2?.09:.01),`the ${index<2?'ankle':'wrist'} blends from its current gait pose (${relative})`);
    });
  } finally { factory.dispose(); }
});

test('a grounded entry walks around the backrest, reaches each bend, and settles before backing onto the cushion', () => {
  const entry = createSeatEntry({ from:{x:0,z:1}, to:{x:0,z:0}, via:[{x:1.1,z:1},{x:1.1,z:-.5}],
    finalApproachFrom:{x:0,z:-.5}, loweringFrom:{x:0,z:-.29}, fromRotation:Math.PI, toRotation:Math.PI });
  const visited = new Set();
  let previous=entry.state, alignAt=null, lowerAt=null;
  while(entry.active){
    const pose=entry.update(10);visited.add(pose.phase);
    assert.ok(Math.hypot(pose.x-previous.x,pose.z-previous.z)<=SEAT_ENTRY_SPEED*.01+1e-7,'the whole transfer stays at walking speed');
    // A backrest expanded by the torso's rear clearance. The open front and
    // side route must never cut through it, even on a frame crossing a corner.
    assert.ok(pose.z<=.011||pose.z>=.635||Math.abs(pose.x)>=.665,'the backrest remains solid during the transfer');
    if(pose.phase==='approaching')assert.equal(pose.sitProgress,0,'the visitor walks upright around the chair');
    if(pose.phase==='aligning'){
      alignAt??=pose.elapsedMs;
      assert.ok(Math.abs(pose.x)<1e-8&&Math.abs(pose.z+.29)<1e-8);
      assert.equal(pose.sitProgress,0);
      assert.deepEqual(pose.walkTarget,{x:0,z:-.29},'the final approach endpoint also bounds the last moving frame as the feet settle');
    }
    if(pose.phase==='lowering'){
      lowerAt??=pose.elapsedMs;
      assert.ok(Math.abs(pose.x)<1e-8);
      assert.ok(pose.z>=-.29&&pose.z<=0);
      assert.ok(Math.abs(pose.seatSlide+pose.z)<1e-8,'the root offset and planted-foot pose use the same backing motion');
      assert.ok(Math.abs(pose.rotation-Math.PI)<1e-8,'the front-lane backstep faces the table');
    }
    for(const [x,z] of [[1.1,1],[1.1,-.5],[0,-.5]])if(Math.hypot(pose.x-x,pose.z-z)<1e-8)visited.add(`${x},${z}`);
    previous=pose;
  }
  for(const phase of ['approaching','aligning','lowering','seated','1.1,1','1.1,-0.5','0,-0.5'])assert.ok(visited.has(phase),`${phase} is reached before the next segment`);
  assert.ok(lowerAt-alignAt>=SEAT_ALIGN_MS-10,'feet have time to settle at the front before lowering');
  assert.equal(entry.state.seatSlide,0);
  assert.equal(entry.state.sitProgress,1);
  assert.equal(entry.state.x,0);assert.equal(entry.state.z,0);
});

test('waiting, approach, alignment and lowering all pause together at an occupied next step', () => {
  const entry=createSeatEntry({from:{x:0,z:1},to:{x:0,z:0},loweringFrom:{x:0,z:.29},waitMs:100});
  const checked=new Set();
  while(entry.active){
    const before=entry.state;
    if(!checked.has(before.phase)){
      entry.peek(50);
      assert.deepEqual(entry.state,before,'a collision proposal cannot commit time');
      assert.deepEqual(entry.update(500,{blocked:true}),before,`a person or object pauses ${before.phase}`);
      checked.add(before.phase);
    }
    entry.update(10);
  }
  for(const phase of ['waiting','approaching','aligning','lowering'])assert.ok(checked.has(phase));
  assert.throws(()=>createSeatEntry({from:{x:0,z:1},to:{x:0,z:0},loweringFrom:{x:NaN,z:0}}),TypeError);
  assert.throws(()=>createSeatEntry({from:{x:0,z:1},to:{x:0,z:0},loweringFrom:{x:0,z:.29},alignMs:-1}),RangeError);
  assert.throws(()=>createSeatEntry({from:{x:0,z:1},to:{x:0,z:0},loweringFrom:{x:0,z:.29},lowerMs:0}),RangeError);
});

test('a visitor close behind a backrest steps away before turning their shoulders', () => {
  const entry=createSeatEntry({from:{x:0,z:.72},to:{x:0,z:0},
    via:[{x:0,z:1},{x:1.1,z:1},{x:1.1,z:-.43}],initialFacingTo:{x:0,z:1},
    finalApproachFrom:{x:0,z:-.43},loweringFrom:{x:0,z:-.29},fromRotation:Math.PI,toRotation:Math.PI});
  let cleared=false,turned=false;
  while(entry.active){
    const pose=entry.update(10);
    if(!cleared){
      assert.ok(Math.abs(pose.rotation-Math.PI)<1e-8,'the near-chair escape keeps the arms facing away from the backrest');
      if(Math.hypot(pose.x,pose.z-1)<1e-8)cleared=true;
    }else if(Math.abs(Math.atan2(Math.sin(pose.rotation-Math.PI),Math.cos(pose.rotation-Math.PI)))>.1)turned=true;
  }
  assert.ok(cleared,'the first clearance point is reached exactly');
  assert.ok(turned,'ordinary route turns resume after clearing the backrest');
});

test('the staged controller and actual rig back onto the seat with planted feet in both lounge directions', async () => {
  const [{createCharacterFactory},{animateCharacter,SEATED_HIP_HEIGHT},{Vector3}]=await Promise.all([
    import('../src/character.js'),import('../src/character-motion.js'),import('three'),
  ]);
  const factory=createCharacterFactory();
  try{
    for(const rotation of [0,Math.PI/2]){
      const stage={x:Math.sin(rotation)*.29,z:Math.cos(rotation)*.29};
      const entry=createSeatEntry({from:stage,to:{x:0,z:0},loweringFrom:stage,fromRotation:rotation,toRotation:rotation});
      const character=factory.create(),rig=character.userData.rig;
      character.position.set(stage.x,0,stage.z);character.rotation.y=rotation;
      let previous={...stage},planted=null,previousHeight=Infinity;
      while(entry.active){
        const pose=entry.update(10);
        character.position.set(pose.x,0,pose.z);character.rotation.y=pose.rotation;
        animateCharacter(character,{dt:.01,time:pose.elapsedMs/1000,velocityX:(pose.x-previous.x)/.01,velocityZ:(pose.z-previous.z)/.01,
          sitProgress:pose.sitProgress,seatSlide:pose.seatSlide,walkTarget:pose.walkTarget,seated:pose.complete,lounging:true});
        const feet=[rig.leftFoot,rig.rightFoot].map(foot=>foot.getWorldPosition(new Vector3()));
        if(pose.phase==='aligning')planted=feet.map(foot=>foot.clone());
        if(pose.phase==='lowering'||pose.complete){
          assert.ok(planted,'the shoes settle before the pelvis lowers');
          feet.forEach((foot,index)=>assert.ok(foot.distanceTo(planted[index])<.0001,'the root backs onto the cushion without dragging the shoes through it'));
          assert.ok(rig.hips.position.y<=previousHeight+.001,'lowering never reverses or pops upwards');
          previousHeight=rig.hips.position.y;
        }
        previous=pose;
      }
      assert.ok(Math.abs(rig.hips.position.y-SEATED_HIP_HEIGHT)<1e-8);
      assert.equal(character.userData.sitting,true);
    }
  }finally{factory.dispose();}
});
