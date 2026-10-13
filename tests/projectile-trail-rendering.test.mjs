import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(webgl=true){
  const draws=[],quads=[],calls={bind:0,pre:0,post:0,matrix:0};
  const graphics={alpha:.5,pipeline:{},setDepth(){return this;},setBlendMode(){return this;},clear(){draws.length=0;},
    fillStyle(color,alpha){this.fill={color,alpha};},fillCircle(x,y,radius){draws.push({x,y,radius,...this.fill});},destroy(){this.destroyed=true;}};
  const frame={u0:.1,v0:.2,u1:.8,v1:.9,glTexture:{}};
  const pipeline={setGameObject(src,f){assert.equal(src,graphics);assert.equal(f,frame);return ++calls.bind;},
    batchQuad(...args){quads.push(args);return quads.length===1;}};
  const renderer={type:webgl?2:1,pipelines:{set(){return pipeline;},preBatch(){calls.pre++;},postBatch(){calls.post++;}}};
  const Phaser={WEBGL:2,BlendModes:{ADD:1},Renderer:{WebGL:{Utils:{getTintAppendFloatAlpha:(color,alpha)=>({color,alpha})}}},
    GameObjects:{GetCalcMatrix:(src,camera,parent)=>{calls.matrix++;assert.equal(src,graphics);assert.equal(parent,'parent');return {calc:{setQuad:(x,y,right,bottom)=>[x*2+10,y*2+20,x*2+10,bottom*2+20,right*2+10,bottom*2+20,right*2+10,y*2+20]}};}}};
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/game/performance/ProjectileTrailBatch.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:()=>({__esModule:true,default:Phaser})});
  const scene={game:{renderer},textures:{getFrame:key=>{assert.equal(key,'circle');return frame;}},add:{graphics:()=>graphics}};
  const batch=new exports.ProjectileTrailBatch(scene),camera={alpha:.8,roundPixels:false,addToRenderList(){}};
  return {batch,graphics,renderer,camera,draws,quads,calls,frame};
}
test('WebGL trails retain world radius, palette, fade, transform and texture binding across a flush',()=>{
  const f=fixture();f.batch.prewarm(2);f.batch.emitAccent(20,30,0xff8030,0);f.batch.emitAccent(40,50,0x30ff80,0);f.batch.render(38);
  f.graphics.renderWebGL(f.renderer,f.graphics,f.camera,'parent');
  assert.equal(f.draws.length,0);assert.equal(f.quads.length,2);assert.equal(f.calls.bind,2);
  assert.equal(f.calls.pre,1);assert.equal(f.calls.post,1);assert.equal(f.calls.matrix,1);
  const q=f.quads[0],radius=2.25*(.3+.5*.7);
  assert.equal(q[1],(20-radius)*2+10);assert.equal(q[2],(30-radius)*2+20);
  assert.deepEqual(q.slice(9,13),[.1,.2,.8,.9]);assert.equal(q[13].color,0xff8030);
  assert.equal(q[13].alpha,.62*.5*.5*.8);assert.equal(q[17],false);assert.equal(q[18],f.frame.glTexture);
  assert.equal(f.quads[1][13].color,0x30ff80);
});
test('Canvas fallback retains vector trails and expiration/reset recycle the original samples',()=>{
  const f=fixture(false);assert.equal(f.graphics.renderWebGL,undefined);
  f.batch.prewarm(2);f.batch.emitAccent(20,30,0xff8030,0);f.batch.render(38);
  assert.equal(f.draws.length,1);assert.equal(f.draws[0].color,0xff8030);assert.equal(f.draws[0].alpha,.31);
  assert.ok(Math.abs(f.draws[0].radius-2.25*.65)<1e-9);
  f.batch.beginFrame(76);assert.equal(f.batch.stats().active,0);assert.equal(f.batch.stats().retained,2);
  f.batch.emitAccent(0,0,0xffffff,100);f.batch.reset();assert.equal(f.batch.stats().active,0);assert.equal(f.batch.stats().retained,2);
  f.batch.destroy();assert.equal(f.graphics.destroyed,true);
});
