import * as THREE from 'three';
import { SEAT_FORWARD_REACH } from './seat-exit.js';

const TAU = Math.PI * 2;
const STANCE = .54;
// The compact reference body has a higher pelvis underside. Seat the actual
// supporting skin just above a .30-high cushion; leg IK keeps both soles down.
export const SEATED_HIP_HEIGHT = .485;
export const SEATED_FOOT_REACH = SEAT_FORWARD_REACH;
const SEATED_TYPING_ARM = -1.05;
const RELAXED_ARM_X = -.025;
const RELAXED_ARM_Z = .025;
const RELAXED_FOREARM_X = -.06;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = value => value * value * (3 - 2 * value);
const fraction = value => value - Math.floor(value);
const inverseEase = value => {
  let low=0,high=1;
  for(let i=0;i<16;i++){const middle=(low+high)/2;if(ease(middle)<value)low=middle;else high=middle;}
  return (low+high)/2;
};
const TUMBLE_POSE={
  hips:{position:[0,.30,0],rotation:[-.025,0,1.48]},
  torso:{rotation:[.035,0,-.035]},head:{rotation:[.035,0,-.06]},
  leftArm:{rotation:[-.3,.1,1.6]},rightArm:{rotation:[-.45,-.1,-.55]},
  leftForearm:{rotation:[-1.8,0,.15]},rightForearm:{rotation:[-1.8,0,-.12]},
  leftHand:{rotation:[.08,0,0]},rightHand:{rotation:[.08,0,0]},
  leftLeg:{rotation:[-.65,0,.08]},rightLeg:{rotation:[-.85,0,-.06]},
  leftShin:{rotation:[1.15,0,0]},rightShin:{rotation:[1.35,0,0]},
  leftFoot:{rotation:[-.3,0,0]},rightFoot:{rotation:[-.35,0,0]},
};
const TUMBLE_SUPPORTS=[['hips',.25],['torso',.27],['head',.34],['leftArm',.10],['rightArm',.10],['leftForearm',.10],['rightForearm',.10],['leftHand',.11],['rightHand',.11],['leftShin',.10],['rightShin',.10],['leftFoot',.105],['rightFoot',.105]];
const FIGHT_FLOOR_POSE={
  hips:{position:[.025,.31,-.08],rotation:[-.42,.08,1.46]},
  torso:{rotation:[.18,.04,-.055]},head:{rotation:[.12,-.08,-.05]},
  leftArm:{rotation:[-.42,.1,.4]},rightArm:{rotation:[-.35,-.1,-.55]},
  leftForearm:{rotation:[-1.2,0,.1]},rightForearm:{rotation:[-1.2,0,-.12]},
  leftHand:{rotation:[.08,0,0]},rightHand:{rotation:[.08,0,0]},
  leftLeg:{rotation:[-.55,0,.08]},rightLeg:{rotation:[-.85,0,-.06]},
  leftShin:{rotation:[1.3,0,0]},rightShin:{rotation:[1.6,0,0]},
  leftFoot:{rotation:[-.30,0,0]},rightFoot:{rotation:[-.40,0,0]},
};
const FIGHT_KNEEL_POSE={
  hips:{position:[0,.49,-.035],rotation:[-.08,0,.12]},
  torso:{rotation:[.23,0,-.08]},head:{rotation:[-.12,0,0]},
  leftArm:{rotation:[-.62,.12,.28]},rightArm:{rotation:[-.78,-.1,-.18]},
  leftForearm:{rotation:[-.68,0,.06]},rightForearm:{rotation:[-.48,0,-.06]},
  leftHand:{rotation:[.05,0,0]},rightHand:{rotation:[.05,0,0]},
  leftLeg:{rotation:[-1.02,0,.03]},rightLeg:{rotation:[-.48,0,-.03]},
  leftShin:{rotation:[1.75,0,0]},rightShin:{rotation:[1.15,0,0]},
  leftFoot:{rotation:[-.73,0,0]},rightFoot:{rotation:[-.67,0,0]},
};
const fightSupportCache=new WeakMap();

// The extrema of each skin influence are a small, reusable support cloud. It
// follows the actual blended skin as the bot rolls, rather than guessing the
// floor from the root or holding a horizontal body in the air on a foot bone.
function fightSupportVertices(geometry){
  if(fightSupportCache.has(geometry))return fightSupportCache.get(geometry);
  const vertices=geometry.attributes.position,indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const selected=new Set();
  const directions=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push([x,y,z]);
  for(let bone=0;bone<15;bone++)for(const [x,y,z] of directions){
    let maximum=-Infinity,best=-1;
    for(let index=0;index<vertices.count;index++){
      let influence=0;
      for(let axis=0;axis<4;axis++)if(indices.getComponent(index,axis)===bone)influence+=weights.getComponent(index,axis);
      if(influence<.12)continue;
      const projection=vertices.getX(index)*x+vertices.getY(index)*y+vertices.getZ(index)*z;
      if(projection>maximum){maximum=projection;best=index;}
    }
    if(best>=0)selected.add(best);
  }
  const result=[...selected];fightSupportCache.set(geometry,result);return result;
}

function restoreRig(rig) {
  for (const bone of rig.bones) {
    const rest = rig.rest[bone.name];
    if (!rest) continue;
    bone.position.fromArray(rest.position);
    bone.rotation.set(rest.rotation[0], rest.rotation[1], rest.rotation[2]);
    bone.scale.set(1, 1, 1);
  }
}

function createMotion(character) {
  const rig = character.userData.rig;
  if (!rig) return null;
  const motion = {
    rig, phase: .25, weight: 0, moving: false, seated: false, initialized: false,
    stopTime: 1, speed: 0, direction: new THREE.Vector3(0, 0, 1),
    rootPosition: new THREE.Vector3(), previousPosition: new THREE.Vector3(),
    rootQuaternion: new THREE.Quaternion(), inverseRootQuaternion: new THREE.Quaternion(),
    parentQuaternion: new THREE.Quaternion(), parentInverse: new THREE.Quaternion(),
    target: new THREE.Vector3(), hip: new THREE.Vector3(), vector: new THREE.Vector3(),
    localVelocity: new THREE.Vector3(), forward: new THREE.Vector3(),
    bend: new THREE.Vector3(), axisX: new THREE.Vector3(), axisY: new THREE.Vector3(),
    axisZ: new THREE.Vector3(), upperDirection: new THREE.Vector3(),
    basis: new THREE.Matrix4(), quaternion: new THREE.Quaternion(),
    euler: new THREE.Euler(),
    previousQuaternion: new THREE.Quaternion(),
    feet: [
      { side: -1, offset: 0, upper: rig.leftLeg, lower: rig.leftShin, ankle: rig.leftFoot },
      { side: 1, offset: .5, upper: rig.rightLeg, lower: rig.rightShin, ankle: rig.rightFoot },
    ].map(foot => ({
      ...foot, swing: false, phase: 0, swingStart: STANCE, delay: 0, settleDistance: 0,
      footfallArmed: false, touchdown: false,
      plant: new THREE.Vector3(), from: new THREE.Vector3(), end: new THREE.Vector3(),
      target: new THREE.Vector3(), restTarget: new THREE.Vector3(),
    })),
  };
  character.userData.motion = motion;
  return motion;
}

function rootTransform(character, motion) {
  character.updateWorldMatrix(true, false);
  character.getWorldPosition(motion.rootPosition);
  character.getWorldQuaternion(motion.rootQuaternion);
  motion.inverseRootQuaternion.copy(motion.rootQuaternion).invert();
  motion.forward.set(0, 0, 1).applyQuaternion(motion.rootQuaternion);
}

function restFoot(motion, foot) {
  const dimensions = motion.rig.dimensions;
  foot.restTarget.set(foot.side * dimensions.legSeparation / 2, dimensions.footHeight, 0)
    .applyQuaternion(motion.rootQuaternion).add(motion.rootPosition);
  return foot.restTarget;
}

function anchorFeet(motion) {
  for (const foot of motion.feet) {
    restFoot(motion, foot);
    foot.plant.copy(foot.restTarget);
    foot.target.copy(foot.restTarget);
    foot.from.copy(foot.restTarget);
    foot.end.copy(foot.restTarget);
    foot.swing = false;
    foot.footfallArmed = false;
    foot.touchdown = false;
  }
  motion.previousPosition.copy(motion.rootPosition);
  motion.previousQuaternion.copy(motion.rootQuaternion);
  motion.initialized = true;
}

/**
 * Two-bone leg IK keeps the support foot at its world-space plant while the
 * character moves past it. Knees bend towards the character's front, including
 * when walking backwards or sideways. The ankle counter-rotates to a flat sole.
 */
function solveLeg(motion, foot) {
  const { rig } = motion;
  const thigh = rig.dimensions.thighLength;
  const shin = Math.hypot(rig.dimensions.shinLength, .01);
  foot.upper.getWorldPosition(motion.hip);
  foot.upper.parent.getWorldQuaternion(motion.parentQuaternion);
  motion.parentInverse.copy(motion.parentQuaternion).invert();
  motion.target.copy(foot.target).sub(motion.hip).applyQuaternion(motion.parentInverse);
  const distance = clamp(motion.target.length(), .025, thigh + shin - .00015);
  motion.target.normalize();
  motion.bend.copy(motion.forward).applyQuaternion(motion.parentInverse);
  motion.bend.addScaledVector(motion.target, -motion.bend.dot(motion.target)).normalize();
  if (motion.bend.lengthSq() < .5) motion.bend.set(0, 0, 1);
  const hipAngle = Math.acos(clamp((thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance), -1, 1));
  const knee = Math.PI - Math.acos(clamp((thigh * thigh + shin * shin - distance * distance) / (2 * thigh * shin), -1, 1));
  motion.upperDirection.copy(motion.target).multiplyScalar(Math.cos(hipAngle))
    .addScaledVector(motion.bend, Math.sin(hipAngle));
  motion.axisX.crossVectors(motion.bend, motion.target).normalize();
  motion.axisY.copy(motion.upperDirection).negate();
  motion.axisZ.crossVectors(motion.axisX, motion.axisY).normalize();
  motion.basis.makeBasis(motion.axisX, motion.axisY, motion.axisZ);
  foot.upper.quaternion.setFromRotationMatrix(motion.basis);
  foot.lower.rotation.set(knee + Math.atan2(.01, rig.dimensions.shinLength), 0, 0);
  foot.lower.updateWorldMatrix(true, false);
  foot.lower.getWorldQuaternion(motion.quaternion);
  foot.ankle.quaternion.copy(motion.quaternion).invert().multiply(motion.rootQuaternion);
}

function seatedPose(motion, time, talking, lounging = false) {
  const rig = motion.rig;
  // Seat dimensions match these short-legged characters: ankles near .11,
  // with the underside of the actual pelvis skin resting on the cushion.
  rig.hips.position.y = SEATED_HIP_HEIGHT;
  rig.hips.rotation.x = -.025;
  rig.torso.rotation.x = .035;
  for (const foot of motion.feet) {
    restFoot(motion, foot);
    foot.target.copy(foot.restTarget).addScaledVector(motion.forward, SEATED_FOOT_REACH);
  }
  // A bent elbow and hands above the desk are part of the base pose. The
  // shoulders stay relaxed rather than leaving straight arms dangling.
  rig.leftArm.rotation.set(SEATED_TYPING_ARM, .20, .20);
  rig.rightArm.rotation.set(SEATED_TYPING_ARM, -.20, -.20);
  rig.leftForearm.rotation.set(-.90, 0, .12);
  rig.rightForearm.rotation.set(-.90, 0, -.12);
  rig.leftHand.rotation.x = .12;
  rig.rightHand.rotation.x = .12;
  if (lounging) {
    rig.leftArm.rotation.set(-.24, .1, .12);
    rig.rightArm.rotation.set(-.24, -.1, -.12);
    rig.leftForearm.rotation.set(-1.02, 0, .08);
    rig.rightForearm.rotation.set(-1.02, 0, -.08);
    rig.leftHand.rotation.x = rig.rightHand.rotation.x = .025;
  }
  rig.head.rotation.x = .035;
  if (talking) {
    const gesture = .5 - .5 * Math.cos(time * 3.2);
    rig.rightArm.rotation.x -= gesture * .17;
    rig.rightForearm.rotation.x -= gesture * .17;
    rig.rightHand.rotation.z = Math.sin(time * 3.2) * .08;
    rig.head.rotation.x += Math.sin(time * 2.8) * .045;
    rig.head.rotation.y = Math.sin(time * 1.4) * .025;
    rig.torso.rotation.y = Math.sin(time * 1.6) * .018;
  } else if (!lounging) {
    // Small alternating finger/forearm movements read as typing without moving
    // the whole arm through the laptop.
    rig.leftForearm.rotation.x += Math.sin(time * 2.7) * .018;
    rig.rightForearm.rotation.x += Math.sin(time * 2.7 + Math.PI) * .018;
  }
  rig.hips.updateWorldMatrix(true, true);
  for (const foot of motion.feet) solveLeg(motion, foot);
}

function risingPose(motion, progress, lounging = false, seatSlide = null) {
  const rig = motion.rig;
  const rise = ease(progress);
  rig.hips.position.y = SEATED_HIP_HEIGHT + (rig.rest.hips.position[1] - .012 - SEATED_HIP_HEIGHT) * rise;
  rig.hips.position.z = Math.sin(progress * Math.PI) * .07;
  rig.hips.rotation.x = -.025 * (1 - rise);
  rig.torso.rotation.x = .035 * (1 - rise) + Math.sin(progress * Math.PI) * .09;
  rig.head.rotation.x = .035 * (1 - rise);
  // A full seat exit plants both feet while its root shifts forward. The
  // default recovery path adjusts one foot at a time, retaining a support sole.
  motion.feet.forEach((foot, index) => {
    restFoot(motion, foot);
    if (Number.isFinite(seatSlide)) {
      // A seated visitor shifts their root towards the already planted feet
      // before standing. Counter the caller's actual forward root offset so
      // neither shoe retracts through the cushion while the pelvis rises.
      foot.target.copy(foot.restTarget).addScaledVector(motion.forward, SEATED_FOOT_REACH - seatSlide);
    } else {
      const step = clamp((progress - (.12 + index * .38)) / .30, 0, 1);
      foot.target.copy(foot.restTarget).addScaledVector(motion.forward, SEATED_FOOT_REACH * (1 - ease(step)));
      foot.target.y += Math.sin(step * Math.PI) * .035;
    }
    foot.plant.copy(foot.target);
  });
  rig.leftArm.rotation.set(RELAXED_ARM_X + (SEATED_TYPING_ARM - RELAXED_ARM_X) * (1 - rise), -.025 + .225 * (1 - rise), RELAXED_ARM_Z + (.20 - RELAXED_ARM_Z) * (1 - rise));
  rig.rightArm.rotation.set(RELAXED_ARM_X + (SEATED_TYPING_ARM - RELAXED_ARM_X) * (1 - rise), .025 - .225 * (1 - rise), -RELAXED_ARM_Z - (.20 - RELAXED_ARM_Z) * (1 - rise));
  rig.leftForearm.rotation.x = RELAXED_FOREARM_X + (-.90 - RELAXED_FOREARM_X) * (1 - rise);
  rig.rightForearm.rotation.x = RELAXED_FOREARM_X + (-.90 - RELAXED_FOREARM_X) * (1 - rise);
  rig.leftForearm.rotation.z = .12 * (1 - rise);
  rig.rightForearm.rotation.z = -.12 * (1 - rise);
  rig.leftHand.rotation.x = rig.rightHand.rotation.x = .12 * (1 - rise);
  if (!lounging) {
    // Bring the long mittens back over the open seat edge before the arms
    // relax. Lowering straight from the typing reach would sweep through the
    // desktop as the visitor shifts their weight forward to stand.
    const tuck = Math.sin(rise * Math.PI);
    rig.leftArm.rotation.x += tuck * .65;
    rig.rightArm.rotation.x += tuck * .65;
    rig.leftForearm.rotation.x -= tuck * .30;
    rig.rightForearm.rotation.x -= tuck * .30;
  }
  if (lounging) {
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = RELAXED_ARM_X + (-.24 - RELAXED_ARM_X) * (1 - rise);
    rig.leftArm.rotation.y = -.025 + .125 * (1 - rise); rig.rightArm.rotation.y = .025 - .125 * (1 - rise);
    rig.leftArm.rotation.z = RELAXED_ARM_Z + (.12 - RELAXED_ARM_Z) * (1 - rise); rig.rightArm.rotation.z = -RELAXED_ARM_Z - (.12 - RELAXED_ARM_Z) * (1 - rise);
    rig.leftForearm.rotation.x = rig.rightForearm.rotation.x = RELAXED_FOREARM_X + (-1.02 - RELAXED_FOREARM_X) * (1 - rise);
    rig.leftForearm.rotation.z = .08 * (1 - rise); rig.rightForearm.rotation.z = -.08 * (1 - rise);
    rig.leftHand.rotation.x = rig.rightHand.rotation.x = .025 * (1 - rise);
  }
  rig.hips.updateWorldMatrix(true, true);
  for (const foot of motion.feet) solveLeg(motion, foot);
}

// A gentle side tumble uses the existing articulated skin, rather than a
// replacement model or a disappearing occupant. The bent limbs stay relaxed;
// the lower arm braces the landing and the head remains above the lawn.
function tumblePose(character, motion, fallProgress, recoveryProgress, pushSide) {
  const rig=motion.rig, side=pushSide<0?-1:1;
  const fall=ease(fallProgress), recovery=ease(recoveryProgress);
  if(recoveryProgress>0)risingPose(motion,1);
  else seatedPose(motion,0,false);
  for(const [name,target] of Object.entries(TUMBLE_POSE)){
    const bone=rig[name];
    if(target.position){
      motion.vector.fromArray(target.position);
      if(recoveryProgress>0)bone.position.lerpVectors(motion.vector,bone.position,recovery);
      else bone.position.lerp(motion.vector,fall);
    }
    motion.euler.set(target.rotation[0],target.rotation[1],target.rotation[2]*side);
    motion.quaternion.setFromEuler(motion.euler);
    if(recoveryProgress>0){motion.previousQuaternion.copy(bone.quaternion);bone.quaternion.copy(motion.quaternion).slerp(motion.previousQuaternion,recovery);}
    else bone.quaternion.slerp(motion.quaternion,fall);
  }
  rig.hips.updateWorldMatrix(true,true);
  // Conservative limb envelopes keep the lowest supporting arm/foot above
  // the ground throughout recovery. This costs a few bone lookups, no meshes
  // or physics engine, and fades continuously into the normal standing pose.
  let lowest=Infinity;
  for(const [name,radius] of TUMBLE_SUPPORTS){
    rig[name].getWorldPosition(motion.vector);lowest=Math.min(lowest,motion.vector.y-radius);
  }
  if(lowest<motion.rootPosition.y)rig.hips.position.y+=motion.rootPosition.y-lowest;
  rig.hips.position.y+=.022*Math.sin(fallProgress*Math.PI)*(1-recovery)+.034*Math.sin(recoveryProgress*Math.PI);
  rig.hips.updateWorldMatrix(true,true);
  // The reference's longer mittens can extend beyond the small joint support
  // envelopes while tipping. Use the shared skin extrema for the final floor
  // contact, just as the standing fight fall does, without changing its path.
  const mesh=character.userData.mesh;
  if(mesh){
    const support=fightSupportVertices(mesh.geometry),vertices=mesh.geometry.attributes.position;
    let lowestSkin=Infinity;
    for(const index of support){
      motion.vector.fromBufferAttribute(vertices,index);
      mesh.applyBoneTransform(index,motion.vector);mesh.localToWorld(motion.vector);
      lowestSkin=Math.min(lowestSkin,motion.vector.y);
    }
    const floor=motion.rootPosition.y+.003;
    if(lowestSkin<floor)rig.hips.position.y+=floor-lowestSkin;
    rig.hips.updateWorldMatrix(true,true);
  }
}

function capturePoseTransition(motion, mode) {
  const names=['hips','torso','head','leftArm','rightArm','leftForearm','rightForearm','leftHand','rightHand'];
  motion.poseTransition={mode,elapsed:0,bones:names.map(name=>({bone:motion.rig[name],position:motion.rig[name].position.clone(),quaternion:motion.rig[name].quaternion.clone()})),
    feet:motion.feet.map(foot=>foot.ankle.getWorldPosition(new THREE.Vector3()))};
  if(mode==='lowering')motion.loweringOrigin={hips:motion.rig.hips.position.y,feet:motion.poseTransition.feet.map(foot=>foot.clone())};
}

function blendPoseTransition(motion, mode, dt) {
  const transition=motion.poseTransition;
  if(!transition||transition.mode!==mode)return;
  const blend=ease(clamp(transition.elapsed/.20,0,1));
  if(blend<1){
    for(const from of transition.bones){
      from.bone.position.lerpVectors(from.position,from.bone.position,blend);
      motion.quaternion.copy(from.bone.quaternion);
      from.bone.quaternion.copy(from.quaternion).slerp(motion.quaternion,blend);
    }
    if(mode!=='lowering')motion.feet.forEach((foot,index)=>foot.target.lerpVectors(transition.feet[index],foot.target,blend));
    // Keep one support sole on the floor while the other small step settles.
    const support=motion.feet[0].target.y<motion.feet[1].target.y?motion.feet[0]:motion.feet[1];
    support.target.y=Math.min(support.target.y,motion.rootPosition.y+motion.rig.dimensions.footHeight);
    motion.rig.hips.updateWorldMatrix(true,true);
    for(const foot of motion.feet){foot.plant.copy(foot.target);solveLeg(motion,foot);}
  }
  transition.elapsed+=dt;
  if(transition.elapsed>.20+dt)motion.poseTransition=null;
}

function interactionPose(rig, strike, recoil, pushing=false) {
  // `strike` is a complete 0..1 gesture: draw a bent arm up, extend an open
  // hand, then return. It only changes the upper body, leaving planted feet.
  const lift = Math.pow(Math.sin(strike * Math.PI), .65);
  const extension = ease(clamp((strike - .22) / .26, 0, 1))
    * (1 - ease(clamp((strike - .60) / .30, 0, 1)));
  if(pushing&&lift>1e-6){
    for(const side of ['left','right']){
      rig[`${side}Arm`].rotation.x-=lift*1.15;
      rig[`${side}Forearm`].rotation.x+=-.95*lift+extension*.95;
      rig[`${side}Hand`].rotation.x=.12*lift;
    }
    rig.torso.rotation.x+=extension*.12;
    rig.head.rotation.x-=extension*.05;
    return;
  }
  if (lift > 1e-6) {
    rig.rightArm.rotation.x -= lift;
    rig.rightArm.rotation.z -= lift * .17;
    rig.rightForearm.rotation.x += -.95 * lift + extension;
    rig.rightHand.rotation.x = .10 * lift;
    rig.leftArm.rotation.x -= lift * .3;
    rig.leftForearm.rotation.x -= lift * .45;
    rig.torso.rotation.y -= lift * .10;
    rig.torso.rotation.x += extension * .10;
  }
  if (recoil > 0) {
    rig.torso.rotation.x -= recoil * .15;
    rig.torso.rotation.z += recoil * .065;
    rig.head.rotation.x += recoil * .10;
    rig.leftForearm.rotation.x -= recoil * .13;
    rig.rightForearm.rotation.x -= recoil * .13;
  }
}

function fightPose(motion, fight){
  const rig=motion.rig;
  const guard=Math.max(fight.guard,fight.bump*.35);
  for(const [side,sign] of [['left',1],['right',-1]]){
    const upper=rig[`${side}Arm`],lower=rig[`${side}Forearm`];
    upper.rotation.x+=(-1.05-upper.rotation.x)*guard;
    upper.rotation.y+=(sign*.18-upper.rotation.y)*guard;
    upper.rotation.z+=(sign*.22-upper.rotation.z)*guard;
    lower.rotation.x+=(-1.25-lower.rotation.x)*guard;
    lower.rotation.z+=(sign*.10-lower.rotation.z)*guard;
    rig[`${side}Hand`].rotation.x=.10*guard;
  }
  rig.hips.position.y-=guard*.018+fight.bump*.022;
  rig.torso.rotation.x+=guard*.025-fight.bump*.14-fight.flinch*.12;
  rig.torso.rotation.z+=fight.flinch*.045;
  rig.head.rotation.x+=fight.bump*.08+fight.flinch*.085;
  const reach=progress=>ease(clamp((progress-.12)/.32,0,1))*(1-ease(clamp((progress-.56)/.36,0,1)));
  if(fight.punch>0&&fight.punch<1){
    const amount=reach(fight.punch),side=fight.punchSide,sign=side==='left'?1:-1;
    const upper=rig[`${side}Arm`],lower=rig[`${side}Forearm`];
    upper.rotation.x+=(-1.60-upper.rotation.x)*amount;
    upper.rotation.y+=(sign*.025-upper.rotation.y)*amount;
    upper.rotation.z+=(sign*.36-upper.rotation.z)*amount;
    lower.rotation.x+=(-.08-lower.rotation.x)*amount;
    rig.torso.rotation.y+=sign*.10*amount;
    rig.torso.rotation.x+=amount*.18;
    rig.head.rotation.y-=sign*.04*amount;
  }
  if(fight.shove>0&&fight.shove<1){
    const amount=reach(fight.shove);
    for(const [side,sign] of [['left',1],['right',-1]]){
      const upper=rig[`${side}Arm`],lower=rig[`${side}Forearm`];
      upper.rotation.x+=(-1.38-upper.rotation.x)*amount;
      upper.rotation.y+=(sign*.04-upper.rotation.y)*amount;
      upper.rotation.z+=(sign*.11-upper.rotation.z)*amount;
      lower.rotation.x+=(.025-lower.rotation.x)*amount;
      rig[`${side}Hand`].rotation.x=.06;
    }
    rig.torso.rotation.x+=amount*.10;
    rig.head.rotation.x-=amount*.05;
  }
  if(fight.kick>0&&fight.kick<1){
    // Plant the left sole, lift the right knee, then extend a low kick. Using
    // the same leg solver as walking keeps the ankle and knee articulated.
    const lift=Math.sin(fight.kick*Math.PI)**1.25;
    const extension=Math.sin(fight.kick*Math.PI)**3;
    const foot=motion.feet[1];
    restFoot(motion,foot);
    foot.target.copy(foot.restTarget).addScaledVector(motion.forward,.50*extension);
    foot.target.y+=.32*lift;
    rig.hips.position.x-=.033*lift;
    rig.hips.position.y-=.008*lift;
    rig.torso.rotation.x-=.08*lift;
    rig.torso.rotation.z-=.045*lift;
    rig.head.rotation.x+=.035*lift;
  }
}

function fightFloorPose(character,motion,fight){
  const rig=motion.rig;
  const fall=fight.fallProgress??(fight.grounded||fight.recoverProgress!==null?1:0);
  const recovery=fight.recoverProgress??0;
  if(!motion.fightStanding){
    motion.fightStanding=rig.bones.map(bone=>({bone,position:new THREE.Vector3(),quaternion:new THREE.Quaternion()}));
  }
  for(const entry of motion.fightStanding){entry.position.copy(entry.bone.position);entry.quaternion.copy(entry.bone.quaternion);}
  for(const entry of motion.fightStanding){
    const {bone}=entry,target=FIGHT_FLOOR_POSE[bone.name];
    if(!target)continue;
    motion.euler.fromArray(target.rotation);motion.quaternion.setFromEuler(motion.euler);
    if(recovery>0){
      bone.quaternion.copy(motion.quaternion);
      if(target.position)bone.position.fromArray(target.position);
      const kneeling=FIGHT_KNEEL_POSE[bone.name];
      if(recovery<=.52){
        const amount=ease(recovery/.52);
        motion.euler.fromArray(kneeling.rotation);motion.quaternion.setFromEuler(motion.euler);
        bone.quaternion.slerp(motion.quaternion,amount);
        if(kneeling.position){motion.vector.fromArray(kneeling.position);bone.position.lerp(motion.vector,amount);}
      }else{
        const amount=ease((recovery-.52)/.48);
        motion.euler.fromArray(kneeling.rotation);bone.quaternion.setFromEuler(motion.euler).slerp(entry.quaternion,amount);
        if(kneeling.position)bone.position.fromArray(kneeling.position).lerp(entry.position,amount);
      }
    }else{
      bone.quaternion.slerp(motion.quaternion,ease(fall));
      if(target.position){motion.vector.fromArray(target.position);bone.position.lerp(motion.vector,ease(fall));}
    }
  }
  if(recovery===0){
    rig.torso.rotation.x-=fight.flinch*.055;
    rig.head.rotation.x+=fight.flinch*.065;
    rig.leftForearm.rotation.x-=fight.flinch*.15;
    rig.rightForearm.rotation.x-=fight.flinch*.15;
  }
  character.updateMatrixWorld(true);
  const mesh=character.userData.mesh;
  if(mesh){
    const support=fightSupportVertices(mesh.geometry),vertices=mesh.geometry.attributes.position;
    let lowest=Infinity;
    for(const index of support){
      motion.vector.fromBufferAttribute(vertices,index);
      mesh.applyBoneTransform(index,motion.vector);mesh.localToWorld(motion.vector);
      lowest=Math.min(lowest,motion.vector.y);
    }
    // A slight margin includes the black outline without making a fallen bot
    // hover above the lawn. The correction is continuous through the rise.
    const floor=motion.rootPosition.y+.009;
    if(lowest<floor)rig.hips.position.y+=floor-lowest;
  }
  character.updateMatrixWorld(true);
  motion.feet.forEach(foot=>{foot.ankle.getWorldPosition(foot.target);foot.plant.copy(foot.target);});
}

function sanitizeFight(fight){
  if(!fight||typeof fight!=='object')return null;
  const unit=name=>clamp(Number.isFinite(fight[name])?fight[name]:0,0,1);
  return {guard:unit('guard'),punch:unit('punch'),punchSide:fight.punchSide==='left'?'left':'right',
    shove:unit('shove'),kick:unit('kick'),bump:unit('bump'),flinch:unit('flinch'),grounded:fight.grounded===true,
    fallProgress:Number.isFinite(fight.fallProgress)?unit('fallProgress'):null,
    recoverProgress:Number.isFinite(fight.recoverProgress)?unit('recoverProgress'):null};
}

function tableTennisPose(rig, phase) {
  // A complete forehand moves through ready, backswing, contact, follow-through
  // and ready again. The shared rally clock puts the ball at the paddle at .5.
  // All rotations stay below a quarter turn, with a bent elbow throughout.
  const sweep = Math.sin(phase * TAU);
  const drive = Math.sin(phase * Math.PI) ** 2;
  rig.torso.rotation.x += .035 + drive * .015;
  rig.torso.rotation.y -= sweep * .055;
  rig.head.rotation.x -= .015;
  // The reference's longer forearm folds through the stroke. A straight reach
  // would overshoot the shared rally point; the small backswing gives it room.
  rig.rightArm.rotation.set(-.15 + drive * .175 + sweep * .22, -.12 + sweep * .45, -.18 - drive * .12 + sweep * .05);
  rig.rightForearm.rotation.set(-.80 - drive * .75, 0, -.035);
  rig.rightHand.rotation.set(.08, sweep * .06, .08 - sweep * .15);
  rig.leftArm.rotation.set(-.16, .10, .07);
  rig.leftForearm.rotation.set(-.66, 0, .035);
  rig.leftHand.rotation.x = .05;
}

function beginSettle(motion) {
  const first = motion.feet[0].target.y > motion.feet[1].target.y ? 0 : 1;
  for (let index = 0; index < motion.feet.length; index++) {
    const foot = motion.feet[index];
    restFoot(motion, foot);
    foot.from.copy(foot.target);
    foot.end.copy(foot.restTarget);
    foot.settleDistance = foot.from.distanceTo(foot.end);
    foot.delay = index === first ? 0 : .15;
    foot.swing = false;
  }
  motion.stopTime = 0;
}

/** Reset after a spawn, hairstyle replacement, seat change or teleport. */
export function resetCharacterPose(character, { seated = false } = {}) {
  const motion = createMotion(character);
  if (!motion) return;
  restoreRig(motion.rig);
  rootTransform(character, motion);
  anchorFeet(motion);
  motion.seated = seated;
  character.userData.sitting = seated;
  if (seated) seatedPose(motion, 0, false);
  else {
    motion.rig.hips.position.y -= .012;
    character.updateWorldMatrix(true, true);
    for (const foot of motion.feet) solveLeg(motion, foot);
    motion.rig.leftArm.rotation.set(RELAXED_ARM_X, -.025, RELAXED_ARM_Z);
    motion.rig.rightArm.rotation.set(RELAXED_ARM_X, .025, -RELAXED_ARM_Z);
    motion.rig.leftForearm.rotation.x = RELAXED_FOREARM_X;
    motion.rig.rightForearm.rotation.x = RELAXED_FOREARM_X;
  }
  character.updateWorldMatrix(true, true);
  motion.rig.skeleton?.update();
}

/**
 * Animate actual travelled distance rather than a wall-clock walk loop. The
 * caller moves/turns the root first and supplies that frame's world velocity.
 * Every animated character uses the same pose, from visitors to recruiters.
 * Optional footstep events follow visibly lifted feet landing in this gait;
 * they never run from a separate cadence clock or the caller's input intent.
 */
export function animateCharacter(character, {
  dt = 1 / 60, time = 0, velocityX = 0, velocityZ = 0,
  seated = false, talking = false, phaseOffset = 0,
  strike = 0, recoil = 0, standProgress = null, sitProgress = null, seatSlide = null, walkTarget = null, lounging = false, paddleSwing = null,
  fallProgress = null, recoveryProgress = null, pushSide = 1,
  pushing = false, fight = null, onFootstep = null,
} = {}) {
  let motion = character.userData.motion;
  if (!motion) motion = createMotion(character);
  if (!motion) return;
  dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
  time = Number.isFinite(time) ? time : 0;
  velocityX = Number.isFinite(velocityX) ? velocityX : 0;
  velocityZ = Number.isFinite(velocityZ) ? velocityZ : 0;
  strike = clamp(Number.isFinite(strike) ? strike : 0, 0, 1);
  recoil = clamp(Number.isFinite(recoil) ? recoil : 0, 0, 1);
  paddleSwing = Number.isFinite(paddleSwing) ? clamp(paddleSwing, 0, 1) : null;
  seatSlide = Number.isFinite(seatSlide) ? clamp(seatSlide, 0, SEATED_FOOT_REACH) : null;
  if (!Number.isFinite(walkTarget?.x) || !Number.isFinite(walkTarget?.z)) walkTarget = null;
  fight=sanitizeFight(fight);
  const rig = motion.rig;
  const poseMode=seated?'seated':Number.isFinite(standProgress)&&standProgress<1?'rising':Number.isFinite(sitProgress)&&sitProgress>0?'lowering':'walking';
  if(motion.initialized&&poseMode!==motion.poseMode&&(poseMode==='lowering'||(poseMode==='rising'&&motion.poseMode==='lowering')))capturePoseTransition(motion,poseMode);
  else if(poseMode!==motion.poseMode)motion.poseTransition=null;
  motion.poseMode=poseMode;
  restoreRig(rig);
  rootTransform(character, motion);
  const displacement = motion.rootPosition.distanceTo(motion.previousPosition);
  const teleported = !motion.initialized || displacement > .8 || Math.hypot(velocityX, velocityZ) > 12;
  if (teleported || seated !== motion.seated) {
    motion.phase = .25;
    motion.weight = 0;
    motion.moving = false;
    motion.stopTime = 1;
    anchorFeet(motion);
  }
  motion.seated = seated;
  character.userData.sitting = seated;
  const horizontalTravel = Math.hypot(motion.rootPosition.x - motion.previousPosition.x,
    motion.rootPosition.z - motion.previousPosition.z);
  const footfallsAllowed = !teleported && dt > 0 && horizontalTravel > 1e-6
    && poseMode === 'walking' && !fight && paddleSwing === null
    && !pushing && strike === 0 && recoil === 0
    && !(Number.isFinite(fallProgress) && Number.isFinite(recoveryProgress) && recoveryProgress < 1);
  for (const foot of motion.feet) {
    foot.touchdown = false;
    if (!footfallsAllowed) foot.footfallArmed = false;
  }
  if(Number.isFinite(fallProgress)&&Number.isFinite(recoveryProgress)&&recoveryProgress<1){
    tumblePose(character,motion,clamp(fallProgress,0,1),clamp(recoveryProgress,0,1),pushSide);
    motion.previousPosition.copy(motion.rootPosition);
    motion.moving=false;motion.weight=0;
    character.updateWorldMatrix(true,true);
    rig.skeleton?.update();
    return;
  }
  if (seated) {
    seatedPose(motion, time + phaseOffset, talking, lounging);
    interactionPose(rig, strike, recoil,pushing);
    motion.previousPosition.copy(motion.rootPosition);
    character.updateWorldMatrix(true, true);
    rig.skeleton?.update();
    return;
  }
  if (Number.isFinite(standProgress) && standProgress < 1) {
    risingPose(motion, clamp(standProgress, 0, 1), lounging, seatSlide);
    blendPoseTransition(motion,'rising',dt);
    interactionPose(rig, strike, recoil,pushing);
    motion.previousPosition.copy(motion.rootPosition);
    character.updateWorldMatrix(true, true);
    rig.skeleton?.update();
    return;
  }

  if (Number.isFinite(sitProgress) && sitProgress > 0) {
    // Reverse the same grounded rise used for getting up, preserving a single
    // articulated body throughout approach, lowering, and seated breathing.
    const lowering=clamp(sitProgress,0,1);
    risingPose(motion,inverseEase(1-lowering),lounging,seatSlide);
    if(motion.loweringOrigin){
      rig.hips.position.y=motion.loweringOrigin.hips+(SEATED_HIP_HEIGHT-motion.loweringOrigin.hips)*lowering;
      if(!Number.isFinite(seatSlide))motion.feet.forEach((foot,index)=>{
          restFoot(motion,foot);
          motion.target.copy(foot.restTarget).addScaledVector(motion.forward,SEATED_FOOT_REACH);
          foot.target.lerpVectors(motion.loweringOrigin.feet[index],motion.target,lowering);
          foot.target.y=motion.loweringOrigin.feet[index].y+(foot.restTarget.y-motion.loweringOrigin.feet[index].y)*lowering;
          foot.plant.copy(foot.target);
        });
      rig.hips.updateWorldMatrix(true,true);
      for(const foot of motion.feet)solveLeg(motion,foot);
    }
    blendPoseTransition(motion,'lowering',dt);
    interactionPose(rig, strike, recoil,pushing);
    motion.previousPosition.copy(motion.rootPosition);
    character.updateWorldMatrix(true, true);
    rig.skeleton?.update();
    return;
  }

  const speed = teleported ? 0 : Math.hypot(velocityX, velocityZ);
  const moving = speed > .035;
  // Do not mistake a blocked avatar for a walking one. The published velocity
  // comes from collision-resolved movement, not keyboard intent.
  if (moving) {
    motion.direction.set(velocityX / speed, 0, velocityZ / speed);
    const stride = clamp(.76 + speed * .085, .79, .98);
    const distance = speed * dt;
    motion.phase += distance / stride;
    motion.speed = speed;
    motion.stopTime = 0;
    for (const foot of motion.feet) {
      const phase = fraction(motion.phase + foot.offset);
      const swinging = phase >= STANCE;
      restFoot(motion, foot);
      if (swinging) {
        if (!foot.swing) {
          foot.from.copy(foot.target);
          foot.swingStart = phase;
        }
        // The first step can start midway through the cycle. Its interpolation
        // still begins at the ground rather than snapping a foot into the air.
        const swing = (phase - foot.swingStart) / (1 - foot.swingStart);
        const remaining = (1 - phase) * stride / speed;
        // Predict the next plant, then arc a clearly lifted foot into it.
        let reach = speed * remaining + stride * STANCE * .5;
        if (walkTarget) {
          const ahead = (walkTarget.x - motion.rootPosition.x) * motion.direction.x
            + (walkTarget.z - motion.rootPosition.z) * motion.direction.z;
          // Keep the normal lateral stance, but never plant a predicted stride
          // through the end of a short approach or the next routed corner.
          if (ahead >= -1e-8) reach = Math.min(reach, Math.max(0, ahead));
        }
        foot.end.copy(foot.restTarget).addScaledVector(motion.direction, reach);
        foot.target.lerpVectors(foot.from, foot.end, ease(swing));
        foot.target.y = foot.restTarget.y + Math.sin(swing * Math.PI) * .115;
        // Only a foot observed above the floor may produce an impact. This
        // excludes first-frame plants, phase skips and resumed seated poses.
        if (footfallsAllowed && foot.target.y > foot.restTarget.y + .008) foot.footfallArmed = true;
      } else {
        if (foot.swing) {
          foot.plant.copy(foot.end);
          foot.touchdown = footfallsAllowed && foot.footfallArmed;
        }
        foot.footfallArmed = false;
        foot.target.copy(foot.plant);
      }
      foot.swing = swinging;
      foot.phase = phase;
    }
  } else {
    for (const foot of motion.feet) foot.footfallArmed = false;
    const turned = motion.previousQuaternion.angleTo(motion.rootQuaternion) > .28;
    if (motion.moving || (turned && motion.stopTime > .4)) beginSettle(motion);
    motion.stopTime += dt;
    for (const foot of motion.feet) {
      if (motion.stopTime < .36) {
        const progress = clamp((motion.stopTime - foot.delay) / .18, 0, 1);
        foot.target.lerpVectors(foot.from, foot.end, ease(progress));
        foot.target.y += Math.sin(progress * Math.PI) * Math.min(.045, foot.settleDistance * .2);
        if (progress === 1) foot.plant.copy(foot.end);
      } else {
        foot.target.copy(foot.plant);
      }
    }
  }
  const settling = !moving && motion.stopTime < .33;
  const targetWeight = moving ? 1 : settling ? .7 : 0;
  motion.weight += (targetWeight - motion.weight) * (1 - Math.exp(-dt * 15));
  motion.localVelocity.copy(motion.direction).applyQuaternion(motion.inverseRootQuaternion);
  const cycle = motion.phase * TAU;
  const sway = Math.sin(cycle);
  const weight = motion.weight;
  const hipRest = rig.rest.hips.position;
  rig.hips.position.y = hipRest[1] - .012 - weight * .053 + Math.cos(cycle * 2) * .007 * weight;
  rig.hips.position.x = hipRest[0] - sway * .020 * weight;
  rig.torso.rotation.y = sway * .035 * weight;
  rig.torso.rotation.z = sway * .018 * weight;
  rig.torso.rotation.x = -.035 * weight * motion.localVelocity.z;
  rig.head.rotation.y = -rig.torso.rotation.y * .65;
  rig.head.rotation.z = -rig.torso.rotation.z * .6;
  const swing = Math.cos(cycle) * .29 * weight;
  const forward = motion.localVelocity.z;
  const lateral = motion.localVelocity.x;
  rig.leftArm.rotation.set(RELAXED_ARM_X + swing * forward, -.025, RELAXED_ARM_Z + swing * lateral * .4);
  rig.rightArm.rotation.set(RELAXED_ARM_X - swing * forward, .025, -RELAXED_ARM_Z - swing * lateral * .4);
  rig.leftForearm.rotation.x = RELAXED_FOREARM_X - Math.max(0, -swing * forward) * .25;
  rig.rightForearm.rotation.x = RELAXED_FOREARM_X - Math.max(0, swing * forward) * .25;
  if (!moving && !settling) {
    // Breathing is confined to the upper body; soles stay on the floor.
    rig.torso.rotation.x = Math.sin((time + phaseOffset) * 1.6) * .005;
    if (talking) {
      rig.head.rotation.x = Math.sin((time + phaseOffset) * 3) * .035;
      rig.rightForearm.rotation.x -= .12 + Math.sin((time + phaseOffset) * 3) * .065;
    }
  }
  if (paddleSwing !== null) tableTennisPose(rig, paddleSwing);
  interactionPose(rig, strike, recoil,pushing);
  if(fight)fightPose(motion,fight);
  const onFightFloor=fight&&(fight.fallProgress!==null||fight.grounded||fight.recoverProgress!==null);
  if(onFightFloor){
    for(const foot of motion.feet){restFoot(motion,foot);foot.target.copy(foot.restTarget);}
  }
  character.updateWorldMatrix(true, true);
  for (const foot of motion.feet) solveLeg(motion, foot);
  if(onFightFloor){
    fightFloorPose(character,motion,fight);
  }
  motion.moving = moving;
  motion.previousPosition.copy(motion.rootPosition);
  // Keep the previous orientation until a turn is large enough to warrant a
  // small corrective step. Walking already replaces each foot's next plant.
  if (moving || settling || motion.previousQuaternion.angleTo(motion.rootQuaternion) > .28) {
    motion.previousQuaternion.copy(motion.rootQuaternion);
  }
  character.updateWorldMatrix(true, true);
  rig.skeleton?.update();
  if (typeof onFootstep === 'function') for (const foot of motion.feet) {
    if (!foot.touchdown) continue;
    // Read the solved ankle after posing, so the event follows what is
    // rendered, including world rotation. The sole sits below this joint.
    foot.ankle.getWorldPosition(motion.vector);
    onFootstep({ side: foot.side < 0 ? 'left' : 'right',
      position: { x: motion.vector.x, y: motion.vector.y - rig.dimensions.footHeight, z: motion.vector.z },
      speed, time });
  }
}
