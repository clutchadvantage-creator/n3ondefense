import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as art from '../src/game/cosmetics/TugLifeWhistleArt.ts';
import { COSMETICS } from '../src/data/cosmetics.ts';
import { BOMB_EXPLOSION_COSMETIC_DEFINITIONS as definitions } from '../src/game/cosmetics/BombExplosionCosmeticDefinitions.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

test('Tug Life ownership and equipment survive a save reload, with sound timed to steam release', () => {
  const item = COSMETICS.find(x => x.id === 'bomb-tug-life');
  assert.equal(item.bombExplosionEffect, 'tug-life');
  assert.equal(item.category, 'bombColor');
  const save = createDefaultLocalSave('tug-test', 'Tug');
  save.cosmetics.owned.push(item.id); save.cosmetics.equipped.bombColor = item.id;
  assert.equal(normalizeLocalSave(save).cosmetics.equipped.bombColor, item.id);
  assert.equal(definitions['tug-life'].soundDelayMs, art.TUG_WHISTLE_BURST_MS);
  assert.equal(definitions['tug-life'].sound, 'bombsiteTugLife');
  assert.ok(readFileSync(new URL('../public/assets/audio/soundeffects/tuglifebombexplosion.mp3', import.meta.url)).length > 0);
});

test('steam starts at the burst, grows, respects reduced detail and clears at expiry without allocations', () => {
  const nodes=[];
  const node=()=>{
    const n={visible:true,alpha:1,scaleX:1,scaleY:1};
    for(const method of ['setDepth','setOrigin','setPosition','setAngle','add'])n[method]=()=>n;
    n.setVisible=v=>(n.visible=v,n);n.setAlpha=v=>(n.alpha=v,n);
    n.setScale=(x,y)=>(n.scaleX=x,n.scaleY=y,n);n.destroy=()=>{n.destroyed=true;};
    nodes.push(n);return n;
  };
  const source=ts.transpileModule(readFileSync(new URL('../src/game/cosmetics/TugLifeWhistleVisual.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(source,{exports,require:id=>id==='phaser'?{Math:{Clamp:(v,min,max)=>Math.max(min,Math.min(max,v))}}:art});
  const visual=new exports.TugLifeWhistleVisual({add:{container:node,image:node}});
  const count=nodes.length;
  visual.update(0,0,240,art.TUG_WHISTLE_BURST_MS-1,false);
  assert.equal(visual.steam.filter(p=>p.visible).length,0);
  const compressed=visual.whistle.scaleY;
  visual.update(0,0,240,900,false);
  assert.ok(visual.steam.some(p=>p.visible&&p.alpha>0));
  assert.ok(visual.whistle.scaleY>=compressed);
  visual.update(0,0,240,1600,true);
  assert.ok(visual.steam.filter(p=>p.visible).length<=8);
  visual.update(0,0,240,art.TUG_WHISTLE_LIFETIME_MS,false);
  assert.equal(visual.root.visible,false);assert.equal(nodes.length,count);
  visual.hide();visual.destroy();assert.equal(visual.root.destroyed,true);
});

