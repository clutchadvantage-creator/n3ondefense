import test from 'node:test';
import assert from 'node:assert/strict';
import {FenceObstruction,sweepFence,fenceDistance} from '../src/game/abilities/FenceObstruction.ts';
import {GridPathfinder} from '../src/game/systems/GridPathfinder.ts';
const fence=(x1=256,y1=160,x2=256,y2=352)=>({x1,y1,x2,y2,hp:100,expiresAt:10000,sprite:{active:true}});

test('swept fence collisions stop both sides, fast crossings, angled crossings and endpoint clips',()=>{
 const f=fence();
 for(const [ax,ay,bx,by] of [[100,256,400,256],[400,256,100,256],[100,150,400,300],[230,100,270,220]]){
  const hit=sweepFence(ax,ay,bx,by,20,f);assert.ok(hit);assert.ok(hit.t>=0&&hit.t<1);
  assert.ok(fenceDistance(hit.x,hit.y,f)>=19.9);
 }
 assert.equal(sweepFence(100,50,400,50,20,f),null);
 assert.equal(sweepFence(240,256,220,256,20,f),null,'can leave an overlap');
});
test('dynamic path queries route around fences; ordinary queries and smoothing retain static behavior',()=>{
 const f=fence(),barriers=new FenceObstruction(32),grid=new GridPathfinder(512,512,32,[]);
 assert.equal(barriers.refresh([f],0),true);assert.equal(barriers.refresh([f],1),false);
 const staticPath=grid.findPath(64,256,448,256,{smooth:true});
 const route=grid.findPath(64,256,448,256,{smooth:true,cellBlocked:barriers.cellBlocked});
 assert.ok(route.length>staticPath.length);assert.ok(route.some(p=>p.y<120||p.y>392));
 let previous={x:64,y:256};for(const p of route){assert.equal(sweepFence(previous.x,previous.y,p.x,p.y,20,f),null);previous=p;}
 assert.deepEqual(grid.findPath(64,256,448,256,{smooth:true}),staticPath);
 assert.equal(grid.hasLineOfSightWorld(64,256,448,256,barriers.cellBlocked),false);
 assert.equal(grid.hasLineOfSightWorld(64,256,448,256),true);
 f.hp=0;assert.equal(barriers.refresh([f],2),true);assert.equal(grid.hasLineOfSightWorld(64,256,448,256,barriers.cellBlocked),true);
});
test('a sealed passage has no enemy route until its blocking fence expires',()=>{
 const f=fence(256,0,256,512),barriers=new FenceObstruction(32),grid=new GridPathfinder(512,512,32,[]);
 barriers.refresh([f],0);assert.equal(grid.findPath(64,256,448,256,{cellBlocked:barriers.cellBlocked}).length,0);
 assert.ok(barriers.firstHit(64,256,448,256,18,1));
 barriers.refresh([f],10000);assert.ok(grid.findPath(64,256,448,256,{cellBlocked:barriers.cellBlocked}).length);
});
test('changed connected segments invalidate cached obstruction; dead segments never block motion',()=>{
 const a=fence(),b=fence(256,352,448,448),barriers=new FenceObstruction(32);
 barriers.refresh([a],0);const revision=barriers.revision;
 for(let i=1;i<500;i++)barriers.refresh([a],i);assert.equal(barriers.revision,revision);
 barriers.refresh([a,b],500);assert.equal(barriers.revision,revision+1);
 b.sprite.active=false;assert.equal(barriers.firstHit(352,300,352,500,12,501),null);
 barriers.clear();assert.equal(barriers.cellBlocked(8,8),false);
});
