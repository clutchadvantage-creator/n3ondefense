import test from 'node:test';
import assert from 'node:assert/strict';
import { BossWalkingAudio, BOSS_WALKING_AUDIO } from '../src/game/systems/BossWalkingAudio.ts';
import { createDefaultSoundVolumes, SFX_CATEGORIES } from '../src/game/config/audio.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;}});
function context(){return {state:'running',currentTime:0,destination:{},sources:[],
  createGain:()=>({gain:param(),connect(){},disconnect(){this.disconnected=true;}}),
  createStereoPanner:()=>({pan:param(),connect(){},disconnect(){this.disconnected=true;}}),
  decodeAudioData:async()=>({duration:4}),
  createBufferSource(){const s={starts:0,stops:0,connect(){},start(){this.starts++;},stop(){this.stops++;},disconnect(){this.disconnected=true;}};this.sources.push(s);return s;}
};}
const boss=()=>({x:0,y:0,hp:100,active:true,visible:true});
async function setup(t){
  const original=globalThis.fetch;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
  t.after(()=>globalThis.fetch=original);const c=context(),audio=new BossWalkingAudio(c,'test');await audio.ready;
  return {c,audio,tick:(owners,volume=1)=>{c.currentTime+=.05;audio.update(owners,0,0,volume);}};
}

test('actual travel starts a single loop; idle aiming or blocked movement starts none',async t=>{
  const {audio,c,tick}=await setup(t),b=boss();tick([b]);tick([b]);assert.equal(audio.stats().active,0);
  for(let i=0;i<8;i++){b.x+=4;tick([b]);}
  assert.equal(c.sources.length,1);assert.equal(c.sources[0].loop,true);assert.equal(c.sources[0].starts,1);
});
test('stopping fades then releases playback; restarting during fade preserves the source and restores gain',async t=>{
  const {audio,c,tick}=await setup(t),b=boss();tick([b]);b.x+=4;tick([b]);
  tick([b]);assert.equal(audio.stats().fading,1);assert.equal(c.sources[0].stops,0);
  b.x+=4;tick([b]);assert.equal(audio.stats().fading,0);assert.equal(c.sources.length,1);
  tick([b]);for(let i=0;i<7;i++)tick([b]);
  assert.equal(audio.stats().active,0);assert.equal(c.sources[0].stops,1);assert.ok(c.sources[0].disconnected);
  b.x+=4;tick([b]);assert.equal(audio.stats().active,1);assert.equal(c.sources.length,2);
  assert.ok(BOSS_WALKING_AUDIO.fadeOutSeconds>.1);
});
test('simultaneous enemy/player bosses are independent; death and removal release only their own voice',async t=>{
  const {audio,c,tick}=await setup(t),a=boss(),b=boss(),d=boss();tick([a,b,d]);
  for(const owner of [a,b,d])owner.x+=5;tick([a,b,d]);assert.equal(audio.stats().active,3);
  a.hp=0;b.x+=5;d.x+=5;tick([a,b,d]);assert.equal(audio.stats().active,2);
  b.x+=5;tick([b]);assert.equal(audio.stats().owners,1);
  audio.stop();assert.equal(audio.stats().owners,0);assert.ok(c.sources.every(s=>s.disconnected));
});
test('mute, suspended audio context, visibility and teleport samples cannot leak walking sounds',async t=>{
  const {audio,c,tick}=await setup(t),b=boss();tick([b]);b.x+=500;tick([b]);assert.equal(audio.stats().active,0);
  b.x+=5;tick([b]);tick([b],0);assert.equal(audio.stats().active,0);
  tick([b]);b.x+=5;tick([b]);c.state='suspended';tick([b]);assert.equal(audio.stats().owners,0);
  c.state='running';tick([b]);b.x+=5;tick([b]);b.visible=false;tick([b]);assert.equal(audio.stats().active,0);
});
test('late decoding after stop never starts an orphaned loop',async t=>{
  const {c}=await setup(t);let resolve;c.decodeAudioData=()=>new Promise(r=>resolve=r);
  const audio=new BossWalkingAudio(c,'late');await new Promise(r=>setImmediate(r));audio.stop();
  resolve({duration:4});await audio.ready;assert.equal(c.sources.length,0);assert.equal(audio.stats().active,0);
});
test('Options mixer includes Boss Walking and old saves gain its default without changing existing volume choices',()=>{
  assert.ok(SFX_CATEGORIES.find(c=>c.id==='enemies').keys.includes('bossWalking'));
  const save=createDefaultLocalSave('audio','Audio');delete save.settings.soundVolumes.bossWalking;save.settings.soundVolumes.droneFlight=.73;
  const loaded=normalizeLocalSave(save);assert.equal(loaded.settings.soundVolumes.bossWalking,createDefaultSoundVolumes().bossWalking);
  assert.equal(loaded.settings.soundVolumes.droneFlight,.73);loaded.settings.soundVolumes.bossWalking=.17;
  assert.equal(normalizeLocalSave(loaded).settings.soundVolumes.bossWalking,.17);
});
