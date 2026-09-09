import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSweptCircleMotion } from '../src/game/physics/SweptCircleCollision.ts';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import { normalizeHeistWallJunctions } from '../src/game/anomalies/heist/HeistWallRuntime.ts';

const clearance = (p,r) => Math.hypot(Math.max(r.x-p.x,0,p.x-r.x-r.w), Math.max(r.y-p.y,0,p.y-r.y-r.h));

test('a circular player can pass outside a wall corner inside its conservative box', () => {
  for(const sx of [-1,1]) for(const sy of [-1,1]) {
    const wall={x:100,y:100,w:58,h:200}, x=sx<0?100:158, y=sy<0?100:300;
    const result=resolveSweptCircleMotion(x+sx*20,y+sy*10,x+sx*8,y+sy*10,12,[wall]);
    assert.equal(result.hit,false);
    assert.equal(result.x,x+sx*8);
    assert.ok(clearance(result,wall)>12);
  }
});

test('corner contacts retain a mechanical slide and cannot tunnel at boosted speeds', () => {
  const wall={x:100,y:100,w:58,h:200};
  for(const distance of [10,30,100,900,3000]) for(let angle=0;angle<Math.PI*2;angle+=.071) {
    const start={x:129+Math.cos(angle)*200,y:200+Math.sin(angle)*200};
    if(clearance(start,wall)<13) continue;
    const dx=129-start.x,dy=200-start.y,len=Math.hypot(dx,dy);
    const result=resolveSweptCircleMotion(start.x,start.y,start.x+dx/len*distance,start.y+dy/len*distance,12,[wall]);
    assert.ok(clearance(result,wall)>=12-1e-6, `penetration at ${distance}/${angle}`);
    if(result.tangentX!==undefined) assert.ok(Math.hypot(result.tangentX,result.tangentY)<=distance+1e-6);
  }
  const slide=resolveSweptCircleMotion(80,91,110,91,12,[wall]);
  assert.equal(slide.hit,true);
  assert.ok(slide.x>100 && slide.y<88);
  assert.ok(slide.tangentX>0 && slide.tangentY<0);
});

test('all graph corridors remain traversable with player-radius clearance and joined walls remain solid', () => {
  for(const seed of [17,81337,550055,194911]) {
    const layout=generateHeistFacilityLayout(seed),walls=normalizeHeistWallJunctions(layout.wallRects);
    const nodes=new Map(layout.nodes.map(n=>[n.id,n]));
    for(const [a,b] of layout.edges) for(const offset of [-65,0,65]) {
      const first=nodes.get(a),last=nodes.get(b),horizontal=first.y===last.y;
      const x=horizontal?0:offset,y=horizontal?offset:0;
      const result=resolveSweptCircleMotion(first.x+x,first.y+y,last.x+x,last.y+y,12,walls);
      assert.ok(Math.hypot(result.x-last.x-x,result.y-last.y-y)<1e-5);
    }
    for(const wall of walls) {
      const x=wall.x-40,y=wall.y+wall.h/2;
      if(walls.some(r=>clearance({x,y},r)<13))continue;
      const result=resolveSweptCircleMotion(x,y,wall.x+wall.w+40,y,12,walls);
      assert.ok(result.hit && result.x<=wall.x-12);
    }
  }
});
