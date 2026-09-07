import Phaser from 'phaser';
import { Player } from '../src/game/entities/Player.ts';
import { Hud } from '../src/game/systems/Hud.ts';
import { SaveSystem } from '../src/game/systems/SaveSystem.ts';
import { HeistLootPickupSystem, MAX_HEIST_LOOSE_LOOT } from '../src/game/anomalies/heist/HeistLootPickupSystem.ts';
import { HeistRewardService } from '../src/game/anomalies/heist/HeistRewardService.ts';
import { GameplayPickupPresentation } from '../src/game/loot/GameplayPickupPresentation.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { PlayerInput } from '../src/game/input/PlayerInput.ts';
import { DEFAULT_ABILITY_BINDINGS } from '../src/game/config/controls.ts';
import { DEFAULT_CONTROLLER_SETTINGS } from '../src/game/config/controllerSettings.ts';

// Runs against actual Phaser objects/plugins/textures in the DEV browser.
export async function verifyStabilization(game: Phaser.Game) {
  const checks: string[] = [];
  const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); checks.push(message); };
  const resizeBefore = game.scale.listenerCount('resize');
  const key = 'stabilization-verification';
  let resolveReady!: (scene: Phaser.Scene) => void;
  const ready = new Promise<Phaser.Scene>(resolve => resolveReady = resolve);
  game.scene.add(key, { create() { resolveReady(this as unknown as Phaser.Scene); } }, true);
  const scene = await ready;
  const player = new Player(scene, 100, 100, 'pixel', { maxHealth:100, moveSpeed:260, dashCooldownMs:1000,
    dashDistanceMultiplier:1, invulnMs:200, pickupRadius:36 } as any,
    { max:100, regenPerSecond:10 } as any, { fireRate:8, cooldownRate:1, maxHeat:100 } as any);
  const body = player.body as Phaser.Physics.Arcade.Body;
  const group = scene.physics.add.staticGroup();
  scene.physics.world.setBounds(0, 0, 800, 600);
  body.allowDrag = false;
  const wall = (x: number,y: number,w: number,h: number) => {
    const object = group.create(x+w/2,y+h/2,'pixel') as Phaser.Physics.Arcade.Image;
    object.setDisplaySize(w,h).refreshBody();
  };
  const move = (x: number,y: number,vx: number,vy: number,delta=1/15) => {
    body.reset(x,y); body.setVelocity(vx,vy);
    body.preUpdate(true,delta); body.postUpdate();
    return { x: body.center.x, y: body.center.y };
  };
  try {
    wall(300,0,20,600);
    assert(move(200,200,20000,0).x<288, 'actual body: perpendicular dash stops before thin wall');
    const shallow=move(200,100,20000,1000);
    assert(shallow.x<288&&shallow.y>160, 'actual body: shallow dash keeps tangential displacement');
    const parallel=move(287.6,100,0,4000);
    assert(Math.abs(parallel.x-287.6)<.01, `actual body: parallel dash does not snag (${parallel.x},${parallel.y})`);
    for(let i=0;i<30;i++) {
      const result=move(287.6,100,20000,100);
      if(result.x>=288) throw new Error('repeated dash tunneled');
    }
    checks.push('actual body: 30 repeated dashes remain on the near side');
    wall(0,400,300,20);
    const corner=move(200,300,10000,10000);
    assert(corner.x<288&&corner.y<388, 'actual body: dash into joined corner respects both walls');
    assert(move(100,100,-20000,-20000).x>=12&&body.center.y>=12, 'actual body: outer world bounds are swept');
    player.permanentModSpeedMultiplier=10; player.buffs.speedBoostStacks=10; player.buffs.speedBoostUntil=Infinity;
    body.reset(200,200); player.dashTowardPoint(700,200,scene.time.now); body.preUpdate(true,1/15); body.postUpdate();
    assert(body.center.x<288, 'actual player dash: stacked speed pickups and Mods cannot tunnel');
    const door = group.create(150,100,'pixel') as Phaser.Physics.Arcade.Image;
    door.setDisplaySize(10,100).refreshBody();
    assert(move(100,100,1500,0).x<133, 'actual body: closed HEIST-style static door blocks dash');
    door.disableBody(true,true);
    assert(move(100,100,1500,0).x>190, 'actual body: opened door is immediately traversable');

    body.reset(200,200); body.setVelocity(20000,100);
    body.preUpdate(true,1/60);
    for (let step=0;step<10;step++) body.update(1/60);
    body.postUpdate();
    assert(body.center.x<288&&player.x<288, 'actual body: multiple physics substeps cannot cross before sprite synchronization');

    const input = new PlayerInput(scene, DEFAULT_ABILITY_BINDINGS, DEFAULT_CONTROLLER_SETTINGS);
    const originalGamepads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    const pad = { id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index:0, connected:true,
      mapping:'standard', axes:[0,0,1,0], buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})), timestamp:0 };
    const key = (type: string) => window.dispatchEvent(new KeyboardEvent(type,
      {code:'Space',key:' ',keyCode:32,which:32,bubbles:true}));
    try {
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});
      input.update('gameplay');
      key('keydown');
      await new Promise(resolve=>setTimeout(resolve,80));
      input.update('gameplay');
      assert(input.pressed('dash'), 'real browser keyboard event reaches the shared dash action');
      body.reset(200,200);
      player.dashTowardPoint(700,200,scene.time.now);
      body.preUpdate(true,1/15); body.postUpdate();
      assert(body.center.x<288, 'keyboard-triggered boosted dash respects the wall');
      key('keyup');
      await new Promise(resolve=>setTimeout(resolve,80));
      input.update('gameplay');
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
      input.update('gameplay');
      pad.buttons[4]={pressed:true,touched:true,value:1};
      input.update('gameplay');
      assert(input.pressed('dash')&&input.activeDevice==='gamepad', 'browser gamepad polling reaches the shared dash action');
      body.reset(200,200);
      player.dashTowardPoint(700,200,scene.time.now);
      body.preUpdate(true,1/15); body.postUpdate();
      assert(body.center.x<288, 'controller-triggered boosted dash respects the wall');
    } finally {
      key('keyup');
      input.destroy();
      if (originalGamepads) Object.defineProperty(navigator,'getGamepads',originalGamepads);
      else delete (navigator as unknown as {getGamepads?:unknown}).getGamepads;
    }

    const hud=new Hud(scene,{...SaveSystem.get().settings.hud,scale:1.4,edgePosition:.2,textScale:1.2});
    for(const zoom of [1,1.08,1.18,1.4]) {
      scene.cameras.main.setZoom(zoom);
      (hud as any).syncScreenTransform();
      const root=(hud as any).root;
      const camera=scene.cameras.main;
      assert(Math.abs(root.scaleX*zoom-1)<1e-6, `HUD scale preserved at world zoom ${zoom}`);
      assert(Math.abs(camera.width/2+zoom*(root.x-camera.width/2))<1e-6, `HUD x preserved at world zoom ${zoom}`);
      assert(Math.abs(camera.height/2+zoom*(root.y-camera.height/2))<1e-6, `HUD y preserved at world zoom ${zoom}`);
    }
    hud.destroy(); hud.destroy();
    assert(game.scale.listenerCount('resize')===resizeBefore+1, 'HUD destroy is idempotent and removes its resize listener');

    const rewards=new HeistRewardService(550055,56,'supreme-leo',150);
    const loot=new HeistLootPickupSystem(scene,rewards,new GameplayPickupPresentation(scene));
    const expected=rewards.createEmpty(), collected=rewards.createEmpty();
    const mod=MOD_DEFINITIONS.find(d=>d.rarity==='supreme')!;
    for(let i=0;i<100;i++) for(const kind of ['credits','coreTokens','plasmaChips','fluxCores'] as const) {
      const reward={kind,amount:500+i}; rewards.add(expected,reward); loot.spawn(100,100,reward,i);
    }
    for(let i=0;i<80;i++) { const reward={kind:'mod' as const,amount:1 as const,modId:mod.id}; rewards.add(expected,reward); loot.spawn(100,100,reward,i+1000); }
    let maximum=0, iterations=0;
    while(loot.diagnostics().active+loot.diagnostics().pending+loot.diagnostics().collecting>0) {
      if(++iterations>1000) throw new Error('Loot queue failed to drain');
      const stats=loot.diagnostics(); maximum=Math.max(maximum,stats.active+stats.collecting);
      if(maximum>MAX_HEIST_LOOSE_LOOT) throw new Error('Physical loot visual budget exceeded');
      for(const p of (loot as any).pickups) { p.worldX=100;p.worldY=100;p.settled=true;p.z=0;p.collectibleAt=0; }
      loot.update(scene.time.now+iterations*200,0,100,100,50,50,0,(reward,x,y)=>{
        rewards.add(collected,reward); loot.showCollectionLabel(reward,x,y);
      });
    }
    assert(JSON.stringify(expected)===JSON.stringify(collected), 'real physical pool: all currency and 80 unique Mods collected exactly once');
    assert(maximum<=64&&loot.diagnostics().currencyCapacity<=48&&loot.diagnostics().labelCapacity<=8,
      'real physical pool: loose loot, retained currency capacity, and labels stay bounded');
    const capacity=loot.diagnostics().currencyCapacity;
    loot.spawn(100,100,{kind:'credits',amount:999},999);
    assert(loot.diagnostics().currencyCapacity===capacity, 'real physical pool: later reward reuses existing containers');
    loot.destroy();
    return {checks,maximumLooseLoot:maximum,currencyCapacity:capacity};
  } finally {
    game.scene.remove(key);
  }
}
