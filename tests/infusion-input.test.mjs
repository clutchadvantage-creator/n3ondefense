import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as actions from '../src/game/input/ActionInput.ts';
import { DEFAULT_ABILITY_BINDINGS } from '../src/game/config/controls.ts';
import { DEFAULT_CONTROLLER_SETTINGS } from '../src/game/config/controllerSettings.ts';

test('the keyboard adapter keeps E planting separate from C Infusion presses and holds', () => {
  const keys={}, listeners=new Map(), exports={};
  const source=ts.transpileModule(readFileSync(new URL('../src/game/input/PlayerInput.ts',import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  vm.runInNewContext(source,{exports,require:id=>id==='./ActionInput.ts'?actions:{},performance:{now:()=>1},
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    navigator:{getGamepads:()=>[]}});
  const scene={sys:{isActive:()=>true},input:{keyboard:{addKey:name=>keys[name]={isDown:false}},on(){},off(){}}};
  const input=new exports.PlayerInput(scene,DEFAULT_ABILITY_BINDINGS,DEFAULT_CONTROLLER_SETTINGS);
  keys.E.isDown=true;input.update('gameplay');
  assert.equal(input.pressed('interact'),true);assert.equal(input.held('infusion'),false);
  input.update('gameplay');assert.equal(input.held('interact'),true);assert.equal(input.pressed('infusion'),false);
  keys.E.isDown=false;input.update('gameplay');assert.equal(input.released('interact'),true);assert.equal(input.released('infusion'),false);
  keys.C.isDown=true;input.update('gameplay');
  assert.equal(input.pressed('infusion'),true);assert.equal(input.held('interact'),false);
  input.update('gameplay');assert.equal(input.held('infusion'),true);assert.equal(input.pressed('infusion'),false);
  keys.C.isDown=false;input.update('gameplay');assert.equal(input.released('infusion'),true);
  listeners.get('keydown')({code:'KeyC',repeat:false,preventDefault(){}});input.update('gameplay');
  assert.equal(input.pressed('infusion'),true,'quick C taps survive between frames');assert.equal(input.pressed('interact'),false);
  keys.C.isDown=true;input.update('paused');assert.equal(input.held('infusion'),false);
  input.update('gameplay');assert.equal(input.pressed('infusion'),false,'held C does not reactivate when a menu closes');
  input.destroy();assert.equal(listeners.size,0);
});
