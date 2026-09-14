import test from 'node:test';
import assert from 'node:assert/strict';
import { DroneAudioPool, DRONE_AUDIO } from '../src/game/systems/DroneAudioPool.ts';
import { ENEMY_BALANCE } from '../src/game/config/balance/index.ts';
import { SUPREME_STAGE_DEFINITIONS, SUPREME_ENEMY_HEALTH_TUNING } from '../src/game/progression/SupremeProgression.ts';

const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value=v; }, setTargetAtTime(v) { this.value=v; } });
const context = () => ({
  state: 'running', currentTime: 0, destination: {}, sources: [],
  createGain: () => ({ gain:param(),connect() {} }),
  createStereoPanner: () => ({ pan:param(),connect() {} }),
  decodeAudioData: async () => ({ duration:48.6 }),
  createBufferSource() { const s={startCount:0,stopCount:0,disconnected:false,connect(){},start(){this.startCount++;},stop(){this.stopCount++;},disconnect(){this.disconnected=true;}};this.sources.push(s);return s; }
});
const owner = x => ({x,y:0,active:true,hp:100,airborne:true});
const setup = async t => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
  t.after(()=>{globalThis.fetch=original;});
  const c=context(),p=new DroneAudioPool(c,'local-test');await p.ready;return {c,p};
};

test('drone durability approaches tank health; speed gains 10–20%; Supreme health changes only modestly',()=>{
  assert.ok(ENEMY_BALANCE.drone.hp>=ENEMY_BALANCE.tank.hp*.7&&ENEMY_BALANCE.drone.hp<ENEMY_BALANCE.tank.hp);
  assert.ok(ENEMY_BALANCE.drone.speed/145>=1.1&&ENEMY_BALANCE.drone.speed/145<=1.2);
  assert.equal(SUPREME_ENEMY_HEALTH_TUNING,1.08);
  for(const [i,stage] of SUPREME_STAGE_DEFINITIONS.entries()){
    assert.equal(stage.difficulty.enemyHealthMultiplier,(1.35+i*.08)*1.08);
    assert.equal(stage.difficulty.bossHealthMultiplier,1.4+i*.095);
  }
});
test('five spatial channels select close drones, attenuate and pan, with no same-owner stacking',async t=>{
  const {c,p}=await setup(t), enemies=[owner(-30),owner(100),owner(200),owner(300),owner(400),owner(600),owner(900)];
  p.update(0,enemies,0,0,1);
  assert.equal(p.stats().active,5);assert.equal(c.sources.length,5);
  assert.deepEqual(p.voices.map(v=>v.owner),enemies.slice(0,5));
  assert.ok(p.voices[0].gain.gain.value>p.voices[4].gain.gain.value);
  assert.ok(p.voices[0].pan.pan.value<0&&p.voices[1].pan.pan.value>0);
  for(let i=1;i<10;i++)p.update(i*100,enemies,0,0,1);
  assert.equal(c.sources.length,5);
  const first=p.voices[0].source;first.onended();p.update(1000,enemies,0,0,1);
  assert.equal(c.sources.length,6);assert.ok(first.disconnected);assert.equal(p.stats().active,5);
});
test('death releases its own channel immediately; radius exit fades; shutdown cannot retain owners or voices',async t=>{
  const {c,p}=await setup(t),a=owner(10),b=owner(200);
  p.update(0,[a,b],0,0,1);const deadSource=p.voices[0].source;
  p.release(a);assert.equal(p.stats().owners,1);assert.equal(deadSource.stopCount,1);assert.ok(deadSource.disconnected);
  b.x=DRONE_AUDIO.radius+1;p.update(100,[b],0,0,1);
  assert.ok(p.voices.some(v=>v.retiring));p.update(200,[],0,0,1);
  assert.equal(p.stats().owners,0);assert.equal(p.stats().active,0);
  a.active=true;p.update(300,[a],0,0,1);p.stop();
  assert.equal(p.stats().owners,0);assert.equal(p.stats().active,0);
  assert.ok(c.sources.every(s=>s.disconnected));
});
test('priority changes are bounded, mute releases channels, and pending decode cannot restart stopped audio',async t=>{
  const {c,p}=await setup(t), enemies=Array.from({length:6},(_,i)=>owner(100+i*70));
  p.update(0,enemies,0,0,1);enemies[5].x=10;p.update(100,enemies,0,0,1);
  p.update(200,enemies,0,0,1);assert.ok(p.voices.some(v=>v.owner===enemies[5]));assert.ok(p.stats().active<=5);
  p.update(300,enemies,0,0,0);assert.equal(p.stats().active,0);
  let resolve;c.decodeAudioData=()=>new Promise(r=>resolve=r);
  const late=new DroneAudioPool(c,'local-test');await new Promise(r=>setImmediate(r));late.stop();
  const before=c.sources.length;resolve({duration:48.6});await late.ready;
  assert.equal(c.sources.length,before);assert.equal(late.stats().active,0);
});
