import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game-core.mjs';
import {MatterSimulation, PARTICLE_COUNT, PARTICLE_RADIUS} from '../physics.mjs';

const fixture={start:{x:170,y:280},width:1280,exit:{x:1200,y:505,w:40,h:95},blocks:[{x:0,y:600,w:1280,h:80,kind:'ground'},{x:0,y:60,w:40,h:540},{x:1240,y:60,w:40,h:540},{x:0,y:60,w:1280,h:20}],molds:[],ice:[],sparks:[]};
const sandbox=()=>new MatterSimulation([fixture]);
const run=(g,seconds,input={},dt=1/120)=>{for(let i=0;i<Math.round(seconds/dt);i++)g.step(dt,input);};
const until=(g,predicate,input={},seconds=20)=>{for(let i=0;i<seconds*120;i++){if(predicate())return;g.step(1/120,input);}assert.ok(predicate(),'Material should reach its intended destination');};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

test('changing phase keeps every particle, its identity, position, and momentum',()=>{
  const g=sandbox();run(g,.3);const particles=g.particles;
  for(const phase of ['liquid','gas','solid']){
    const before=g.particles.map(p=>({...p}));assert.equal(g.shift(phase),true);
    assert.equal(g.particles,particles);assert.deepEqual(g.particles,before);assert.equal(g.particles.length,PARTICLE_COUNT);run(g,.2);
  }
});
test('liquid genuinely changes its distribution and settles into a shallow puddle',()=>{
  const g=sandbox();g.shift('liquid');const width=g.player.w,height=g.player.h;
  run(g,3);assert.ok(g.player.w>width*1.5);assert.ok(g.player.h<height*.75);
  assert.ok(g.particles.some(p=>Math.abs(p.vx-g.player.vx)>1));
});
test('splash transfers momentum to the fluid and preserves mass',()=>{
  const g=sandbox();g.shift('liquid');run(g,2);const y=g.center.y;
  g.action();run(g,.15);assert.ok(g.center.y<y-8);assert.equal(g.particles.length,PARTICLE_COUNT);
});
test('vapor expands, rises and has independent turbulent velocities',()=>{
  const g=sandbox();const y=g.center.y,w=g.player.w;g.shift('gas');run(g,1);
  assert.ok(g.center.y<y-50);assert.ok(g.player.w>w*1.1);
  assert.ok(Math.max(...g.particles.map(p=>p.vx))-Math.min(...g.particles.map(p=>p.vx))>20);
  const high=g.center.y;run(g,1.5,{down:true});assert.ok(g.center.y>high+30);
});
test('freezing captures the actual settled coordinates without resizing into a template',()=>{
  const g=sandbox();g.shift('liquid');run(g,2);
  const before=g.particles.map(p=>({x:p.x,y:p.y})),width=g.player.w,height=g.player.h;
  assert.equal(g.shift('solid'),true);
  assert.equal(g.player.w,width);assert.equal(g.player.h,height);
  assert.deepEqual(g.particles.map(p=>({x:p.x,y:p.y})),before);
  assert.ok(width>100&&height<30);
});
test('a frozen crystal preserves distances while moving through open air',()=>{
  const g=sandbox();const before=distance(g.particles[0],g.particles[127]);
  run(g,.35,{right:true});assert.ok(Math.abs(distance(g.particles[0],g.particles[127])-before)<.001);
  assert.ok(g.center.x>190);
});
test('off-center terrain contacts rotate solid matter',()=>{
  const level={...fixture,start:{x:170,y:350},blocks:[...fixture.blocks,{x:218,y:420,w:60,h:180}]};
  const g=new MatterSimulation([level]);run(g,1);
  assert.ok(Math.abs(g.angle)>.08,'The solid should tip rather than stay an axis-aligned box');
});
test('separated liquid freezes into separate rigid pieces rather than invisible bridges',()=>{
  const g=sandbox();g.shift('liquid');
  for(let i=64;i<128;i++)g.particles[i].x+=180;
  g.shift('solid');assert.ok(g.clusters.length>1);
  assert.equal(g.clusters.flatMap(c=>c.indices).length,PARTICLE_COUNT);
});
test('grates have physical pore bars for liquid, and block gas and ice',()=>{
  const g=new Game();const grate=g.level.blocks.find(b=>b.kind==='grate');
  const gap={x:grate.x+14,y:grate.y+12};
  assert.equal(g.pointBlocked(gap,'liquid'),false);
  assert.equal(g.pointBlocked(gap,'gas'),true);assert.equal(g.pointBlocked(gap,'solid'),true);
  assert.equal(g.pointBlocked({x:grate.x+14,y:grate.y+2},'liquid'),true);
});
test('matter cannot freeze or evaporate while inside a liquid-only pore',()=>{
  const g=new Game();const grate=g.level.blocks.find(b=>b.kind==='grate');
  Object.assign(g.particles[0],{x:grate.x+14,y:grate.y+12});
  const before=g.particles.map(p=>({...p}));assert.equal(g.shift('solid'),false);
  assert.equal(g.player.phase,'liquid');assert.deepEqual(g.particles,before);
});
test('the dry filter blocks liquid but lets a frozen particle through',()=>{
  const g=new Game(1),b=g.level.blocks.find(b=>b.kind==='sieve'),point={x:b.x+5,y:590};
  assert.equal(g.pointBlocked(point,'liquid'),true);assert.equal(g.pointBlocked(point,'solid'),false);
});
test('mouse stirring applies forces without teleporting the material',()=>{
  const g=sandbox();g.shift('liquid');const start={...g.particles[60]};
  g.step(1/120,{grab:{index:60,x:start.x+80,y:start.y-50}});
  assert.ok(g.particles[60].vx>0);assert.ok(distance(start,g.particles[60])<6);
});
test('fixed substeps give consistent simulation at 30 and 120 update calls per second',()=>{
  const a=sandbox(),b=sandbox();a.shift('liquid');b.shift('liquid');
  run(a,2,{right:true},1/30);run(b,2,{right:true},1/120);
  for(let i=0;i<PARTICLE_COUNT;i++)assert.ok(distance(a.particles[i],b.particles[i])<.001);
});
test('mass remains finite and inside terrain boundaries through repeated phase changes',()=>{
  const g=sandbox();
  for(let cycle=0;cycle<4;cycle++)for(const phase of ['liquid','gas','solid']){g.shift(phase);run(g,.6,{right:cycle%2===0,left:cycle%2!==0});}
  assert.equal(g.particles.length,PARTICLE_COUNT);
  for(const p of g.particles){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.vx)&&Number.isFinite(p.vy));assert.ok(p.x>=40+PARTICLE_RADIUS-.01&&p.x<=1240-PARTICLE_RADIUS+.01);assert.ok(p.y>=80+PARTICLE_RADIUS-.01&&p.y<=600-PARTICLE_RADIUS+.01);}
});
test('room 1 completes by rising over the wall and flowing through the grate',()=>{
  const g=new Game();g.shift('gas');run(g,3);until(g,()=>g.player.x>550,{right:true});
  assert.equal(g.shift('liquid'),true);until(g,()=>g.won,{right:true});assert.equal(g.particles.length,PARTICLE_COUNT);
});
test('room 2 completes with live settling, freeze and a slide through the low tunnel',()=>{
  const g=new Game(1);g.shift('gas');run(g,1);until(g,()=>g.center.x>375,{right:true});run(g,.5,{left:true});
  g.shift('liquid');run(g,3);assert.ok(g.inMold);assert.ok(g.player.h<28);
  const captured=g.particles.map(p=>({x:p.x,y:p.y}));g.shift('solid');assert.deepEqual(g.particles.map(p=>({x:p.x,y:p.y})),captured);
  run(g,.1);g.action();until(g,()=>g.won,{right:true});
});
test('room 3 completes through buoyancy, pores and genuine mold shaping',()=>{
  const g=new Game(2);g.shift('gas');run(g,3);until(g,()=>g.player.x>480,{right:true});
  g.shift('liquid');until(g,()=>g.player.x>680,{right:true});assert.equal(g.shift('gas'),true);
  run(g,1);until(g,()=>g.center.x>910,{right:true});run(g,.5,{left:true});
  g.shift('liquid');run(g,3);assert.ok(g.inMold);assert.ok(g.player.h<28);g.shift('solid');run(g,.1);g.action();until(g,()=>g.won,{right:true});
});
test('restarting restores mass, material state and collectible progress',()=>{
  const g=new Game();run(g,.4);assert.ok(g.collected.size>0);g.shift('gas');run(g,.5);g.load(0);
  assert.equal(g.player.phase,'liquid');assert.equal(g.collected.size,0);assert.equal(g.shifts,0);assert.equal(g.particles.length,PARTICLE_COUNT);assert.equal(g.won,false);
});
