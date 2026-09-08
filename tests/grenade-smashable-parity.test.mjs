import test from 'node:test';
import assert from 'node:assert/strict';
import {circleTouchesSmashable, grenadeTouchesSmashable} from '../src/game/arena/SmashableCombatQuery.ts';
import {TEMPORARY_AMMO_BALANCE} from '../src/game/player/TemporaryAmmoMode.ts';

test('smart prop fuse reaches the closest face without arming outside splash reach', () => {
  const box = {
    hasTargetAt:(x,y,padding)=>Math.abs(x-100)<=38+padding&&Math.abs(y-100)<=30+padding,
    hasTargetInRadius:(x,y,radius)=>circleTouchesSmashable(x,y,radius,100,100,76,60)
  };
  assert.equal(grenadeTouchesSmashable(165,100,false,box),false);
  assert.equal(grenadeTouchesSmashable(165,100,true,box),true);
  assert.equal(grenadeTouchesSmashable(171,100,true,box),false);
  assert.equal(grenadeTouchesSmashable(143,100,false,box),true);
  assert.equal(grenadeTouchesSmashable(165,100,true,null,box),true);
  assert.equal(grenadeTouchesSmashable(100,100,true,null),false);
  assert.equal(TEMPORARY_AMMO_BALANCE.grenade.splashRadius,32);
});

test('rotated smashable corners use the same circle contract as the blast', () => {
  assert.equal(circleTouchesSmashable(100,165,27,100,100,76,60,Math.PI/2),true);
  assert.equal(circleTouchesSmashable(100,166,27,100,100,76,60,Math.PI/2),false);
  assert.equal(circleTouchesSmashable(168,160,32,100,100,76,60),false);
});
