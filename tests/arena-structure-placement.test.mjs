import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_ARCHETYPES, ARENA_GENERATION_CONFIG as C } from '../src/game/config/arenaGeneration.ts';
import { generateArenaTopology } from '../src/game/systems/ArenaTopology.ts';
import { placeArenaEquipment, arenaRectClearance } from '../src/game/systems/ArenaObstaclePlacement.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';
import { repairNarrowPassages } from '../src/game/systems/ArenaTraversal.ts';

test('600 seeded archetypes keep full equipment footprints and diagonal corners a group corridor apart',()=>{
  let placed=0;
  for(const type of ARENA_ARCHETYPES)for(let seed=1;seed<=50;seed++){
    const d=generateArenaTopology(type,seed*7919),walls=repairNarrowPassages(d.walls,C.minimumCorridorWidth,C.boundaryThickness).walls;
    const points=[...d.objectiveCandidates,...d.playerCandidates,...d.enemySpawns];
    const equipment=placeArenaEquipment(new SeededRandom(seed),d.bounds,walls,points,type,26);
    assert.deepEqual(equipment,placeArenaEquipment(new SeededRandom(seed),d.bounds,walls,points,type,26));
    const occupied=[...walls];
    for(const o of equipment){
      const rect={x:o.x-o.w/2,y:o.y-o.h/2,w:o.w,h:o.h};
      assert.ok(o.w>=64&&o.h>=64);
      assert.ok(occupied.every(other=>arenaRectClearance(rect,other)>=C.minimumCorridorWidth));
      assert.ok(points.every(p=>arenaRectClearance(rect,{...p,w:0,h:0})>=C.objectiveClearance));
      occupied.push(rect);placed++;
    }
  }
  assert.ok(placed>600,'retain useful equipment variety instead of removing all cover');
});

test('cluster archetype uses substantial connected installations instead of tiny ring fragments',()=>{
  const signatures=new Set();
  for(let seed=1;seed<=100;seed++){
    const d=generateArenaTopology('asymmetric-clusters',seed*7919),inside=d.walls.slice(4);
    assert.ok(inside.length>=5&&inside.length<=12);
    assert.ok(inside.every(w=>Math.max(w.w,w.h)>=100));
    assert.ok(d.majorStructureCount>=3);
    signatures.add(JSON.stringify(inside));
  }
  assert.equal(signatures.size,100);
});
