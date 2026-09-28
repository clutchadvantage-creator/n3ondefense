import Phaser from 'phaser';
import { AnomalyCombatScene } from '../heist/HeistScene.ts';
import { SceneKeys } from '../../flow/SceneKeys.ts';
import { Enemy, baseEnemyStats } from '../../enemies/Enemy.ts';
import { ENEMY_ROBOT_FRAMES } from '../../enemies/EnemyRobotFrames.ts';
import { SkyBreachWorld } from './SkyBreachArt.ts';
import { skyBreachDifficulty } from './SkyBreachDifficulty.ts';
import { SkyBreachDirector, DreadnoughtScheduler, DREADNOUGHT_WEAPONS, attackWeapons, coreExposed,
  formationSlots, type FlightModule, type SkyRole, type HardpointId } from './SkyBreachDirector.ts';
import { createArtilleryMarker } from '../../bosses/ArtilleryMarker.ts';
import { BOSS_BALANCE, getBossRewards } from '../../config/bossBalance.ts';
import { rollModDrop } from '../../mods/ModDropService.ts';
import { AnomalyPortalVisual } from '../AnomalyPortalVisual.ts';
import { SaveSystem } from '../../systems/SaveSystem.ts';
import type { RectSpec, PickupType } from '../../types.ts';
import type { EchoDamageStamp } from '../../echo/EchoRules.ts';
import { SupremeModEffectSystem } from '../../mods/SupremeModEffectSystem.ts';
import { MOD_BALANCE } from '../../mods/modBalance.ts';

interface FlightState {
  role: SkyRole; age: number; originX: number; vx: number; vy: number; shotAt: number;
  warningAt: number; aim: number; nextDronesAt: number; warning: Phaser.GameObjects.Line;
  decorations: Phaser.GameObjects.Image[];
}
interface Hardpoint { id: HardpointId; enemy: Enemy; dx: number; dy: number; wreck: Phaser.GameObjects.Image; smoke: Phaser.GameObjects.Image }
interface Strike extends ReturnType<typeof createArtilleryMarker> {
  x:number;y:number;radius:number;damage:number;start:number;due:number;owner:Enemy|null;
}
const NO_WALLS: readonly RectSpec[] = [];
const EXPLOSION = [0xffffff,0xffc477,0xff583d,0xa53468] as const;

/** Same combat/escrow owner as HEIST; only world, mission, and enemy presentation differ. */
export class SkyBreachScene extends AnomalyCombatScene {
  private world!: SkyBreachWorld;
  private difficulty!: ReturnType<typeof skyBreachDifficulty>;
  private director = new SkyBreachDirector();
  private scheduler = new DreadnoughtScheduler();
  private readonly flights = new Map<Enemy,FlightState>();
  private readonly hardpoints: Hardpoint[] = [];
  private readonly aliveWeapons = new Set<HardpointId>();
  private readonly strikes: Strike[] = [];
  private readonly escortArt = new Map<Phaser.GameObjects.Container,Phaser.GameObjects.Image>();
  private hull: Phaser.GameObjects.Image|null = null;
  private core: Enemy|null = null;
  private coreDoors: Phaser.GameObjects.Rectangle[] = [];
  private healthBars!: Phaser.GameObjects.Graphics;
  private exhaust!: Phaser.GameObjects.Image;
  private missionTime = 0;
  private activeDelta = 0;
  private nextArtillery = 0;
  private bossStarted = false;
  private bossOpen = false;
  private destructionAt = 0;
  private destructionStep = 0;
  private rewardDropped = false;
  private readonly bossBursts: {owner: Enemy;remaining:number;at:number;angle:number;step:number;damage:number}[] = [];
  private moduleLabel = 'ENTERING HOSTILE AIRSPACE';
  private supremeEffects: SupremeModEffectSystem|null = null;
  private readonly flightTargets: Enemy[] = [];

  constructor() { super(SceneKeys.SkyBreach); }
  protected override get anomalyId(): 'skybreach' { return 'skybreach'; }
  protected override get missionName(): string { return 'SKYBREACH'; }
  protected override get missionLayoutName(): string { return 'RWG Aerial Breach Corridor'; }
  protected override worldEntryPoint() { return {x:this.pickupBounds.w/2,y:this.pickupBounds.h*.76}; }
  protected override worldCollisionGroups(): Phaser.Physics.Arcade.StaticGroup[] { return []; }
  protected override worldPickupWalls(): readonly RectSpec[] { return NO_WALLS; }
  protected override prepareWorldNavigation(): void {}

  protected override createEnvironment(): void {
    this.director=new SkyBreachDirector();this.scheduler=new DreadnoughtScheduler();
    this.missionTime=0;this.nextArtillery=0;this.bossStarted=false;this.bossOpen=false;
    this.destructionAt=0;this.destructionStep=0;this.rewardDropped=false;this.bossBursts.length=0;
    this.core=null;this.hull=null;this.coreDoors=[];this.moduleLabel='ENTERING HOSTILE AIRSPACE';
    this.difficulty=skyBreachDifficulty(this.session);
    this.pickupBounds.w=1200;this.pickupBounds.h=Math.max(720,Math.min(1050,1200*this.scale.height/this.scale.width));
    this.physics.world.setBounds(30,110,this.pickupBounds.w-60,this.pickupBounds.h-145);
    this.cameras.main.setBackgroundColor(0x081423);
    this.world=new SkyBreachWorld(this,this.pickupBounds.w,this.pickupBounds.h);
    this.healthBars=this.add.graphics().setDepth(12);
  }
  protected override createPlayer():void {
    super.createPlayer();
    this.player.setAppearanceResolver(()=>({textureKey:'sky-player',tint:null}));
    this.player.restoreOperativeAppearance(this.time.now,true);
    this.player.setDisplaySize(68,68);
    this.player.setCircle(12/this.player.scaleX,80-12/this.player.scaleX,80-12/this.player.scaleY);
    this.player.setCollideWorldBounds(true);
    this.exhaust=this.add.image(this.player.x,this.player.y,'sky-exhaust').setDisplaySize(20,58)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
    this.resizeWorld();
  }
  protected override resizeWorld():void {
    if(!this.player)return;
    const c=this.cameras.main;c.stopFollow();c.removeBounds();
    c.setZoom(Math.min(this.scale.width/this.pickupBounds.w,this.scale.height/this.pickupBounds.h));
    c.centerOn(this.pickupBounds.w/2,this.pickupBounds.h/2);
  }
  protected override initializeMission():void {
    this.supremeEffects=new SupremeModEffectSystem(this,this.modRuntime,{playPulseCue:()=>this.coreAudio.playSfx('shieldOn')});
    this.announce('SKYBREACH // FLIGHT LINK ESTABLISHED','BREACH THE AIR CORRIDOR // ALL EARNINGS REMAIN PROVISIONAL');
  }
  protected override updateWorld(_now:number,dt:number):void {
    this.activeDelta=dt;this.missionTime+=dt*1000;this.world.update(dt,this.pickupBounds.h);
    const angle=this.player.rotation-Math.PI/2;
    this.exhaust.setPosition(this.player.x-Math.cos(angle)*26,this.player.y-Math.sin(angle)*26)
      .setRotation(this.player.rotation).setAlpha(.65+Math.sin(this.missionTime*.035)*.15)
      .setDisplaySize(20,this.time.now<this.player.dashUntil?105:52);
  }
  protected override pointBlocked(x:number,y:number):boolean {
    return x<24||x>this.pickupBounds.w-24||y<20||y>this.pickupBounds.h-24;
  }
  protected override isValidPlacement(x:number,y:number):boolean { return !this.pointBlocked(x,y)&&y>110; }
  protected override missionObjective(_now:number):string {
    if(this.returning)return 'ARENA LINK RESTORING';
    if(this.extractionPortal)return `${this.inputController.prompt('interact','E')} // RETURN TO ARENA — BANK PENDING HAUL`;
    if(this.rewardDropped)return 'DREADNOUGHT DESTROYED // COLLECT BOSS LOOT';
    if(this.destructionAt)return 'REACTOR FAILURE // STAND CLEAR';
    if(this.bossStarted)return this.bossOpen?'CORE EXPOSED // DESTROY THE REACTOR':`DREADNOUGHT // DISARM ${this.aliveWeapons.size} WEAPON SYSTEMS`;
    return `${this.moduleLabel} // SECTOR ${Math.min(11,this.director.index+1)} / 11`;
  }
  protected override missionObjectiveTarget():{x:number;y:number}|null {
    return this.extractionPortal?{x:this.pickupBounds.w/2,y:this.pickupBounds.h*.74}:null;
  }
  protected override liveEnemyCount():number { return this.flights.size+this.aliveWeapons.size+(this.core?.active?1:0); }
  protected override updateMission(_now:number):void {
    if(!this.bossStarted){
      this.director.update(this.activeDelta,(module)=>{
        this.moduleLabel=module.name;this.announce('SKYBREACH',module.name);
        if(module.recovery){this.retireFlights();this.clearThreats();this.recoveryPickups();}
        this.nextArtillery=this.missionTime+3200;
      },(module,sequence)=>this.spawnModule(module,sequence));
      const module=this.director.complete?null:importModule(this.director.index);
      if(module?.artillery&&this.missionTime>=this.nextArtillery){
        this.nextArtillery=this.missionTime+6000;
        this.scheduleStrike(this.player.x,this.player.y,68,BOSS_BALANCE.artillery.superDamage*this.difficulty.damage,null);
      }
      if(this.director.complete)this.startDreadnought();
    }else this.updateDreadnought();
    this.updateStrikes();
    if(this.rewardDropped&&!this.extractionPortal&&this.lootPickups.activeCount===0&&this.lootPickups.diagnostics().pending===0)this.openExtraction();
    if(this.extractionPortal&&this.inputController.pressed('interact')){
      const target=this.missionObjectiveTarget()!;
      if(Phaser.Math.Distance.Between(this.player.x,this.player.y,target.x,target.y)<96)this.completeHeist();
    }
  }
  private spawnModule(module:FlightModule,sequence:number):void {
    if(!module.role)return;
    this.spawnFormation(module.role,module.formation??'line',module.role==='zeppelin'?1:this.difficulty.formationCount,sequence%2===1);
    if(module.secondary)this.spawnFormation(module.secondary,'split',Math.max(2,this.difficulty.formationCount-2),sequence%2===0);
  }
  private spawnFormation(role:SkyRole,pattern:Parameters<typeof formationSlots>[0],count:number,mirror=false):void {
    for(const slot of formationSlots(pattern,count,this.pickupBounds.w,this.pickupBounds.h,mirror)) {
      if(this.flights.size>=this.difficulty.activeCap)break;
      this.spawnAircraft(role,slot.x,slot.y,slot.vx,slot.vy);
    }
  }
  private spawnAircraft(role:SkyRole,x:number,y:number,vx=0,vy=1):Enemy {
    const base=baseEnemyStats[role==='drone'?'drone':role==='tank'||role==='zeppelin'?'tank':'shooter'];
    const factor=role==='zeppelin'?5:role==='strike'?2:1;
    const stats={...base,hp:Math.round(base.hp*this.difficulty.health*factor),damage:base.damage*this.difficulty.damage,
      speed:base.speed*this.difficulty.speed,size:role==='zeppelin'?104:role==='strike'?33:base.size,
      valueCredits:Math.round(base.valueCredits*this.difficulty.rewardMultiplier*this.modRuntime.multiplier('creditValue'))};
    const key=role==='drone'||role==='tank'?ENEMY_ROBOT_FRAMES[role].textureKey:`sky-${role}`;
    const enemy=new Enemy(this,x,y,key,stats).setVisualTintOverride(null);
    if(role==='zeppelin')enemy.setDisplaySize(210,146);
    else if(role==='interceptor'||role==='strike')enemy.setDisplaySize(role==='strike'?78:64,role==='strike'?78:64);
    enemy.setName(`sky-${role}`);
    this.enemies.push(enemy);
    this.flights.set(enemy,{role,age:0,originX:x,vx,vy,shotAt:this.missionTime+1800,warningAt:0,aim:0,
      nextDronesAt:this.missionTime+6500,warning:this.add.line(0,0,0,0,0,0,0xffb55c,.7).setOrigin(0).setDepth(8).setVisible(false),
      decorations:role==='zeppelin'?[-1,1].map(()=>this.add.image(x,y,'sky-rotor').setDisplaySize(32,32).setDepth(8)):[]});
    return enemy;
  }
  protected override updateEnemies(now:number,dt:number):void {
    this.healthBars.clear();
    this.flightTargets.length=0;
    for(const enemy of this.flights.keys())this.flightTargets.push(enemy);
    this.supremeEffects?.update(now,this.flightTargets,[],this.player);
    for(let i=this.enemies.length-1;i>=0;i--){
      const enemy=this.enemies[i];
      if(enemy===this.core||this.hardpoints.some(h=>h.enemy===enemy))continue;
      const f=this.flights.get(enemy);if(!f)continue;
      if(!enemy.active||enemy.hp<=0){f.warning.destroy();for(const d of f.decorations)d.destroy();this.flights.delete(enemy);super.removeEnemy(enemy,i);continue;}
      f.age+=dt;enemy.updateDamageFlash(now);enemy.updateMechanicalPresentation(now);
      if(f.age>34||enemy.y>this.pickupBounds.h+90||enemy.x<-110||enemy.x>this.pickupBounds.w+110){
        f.warning.destroy();for(const d of f.decorations)d.destroy();this.flights.delete(enemy);enemy.destroy();this.enemies.splice(i,1);continue;
      }
      const dx=this.player.x-enemy.x,dy=this.player.y-enemy.y;
      const aim=Math.atan2(dy,dx),speed=enemy.effectiveSpeed(enemy.stats.speed,now);
      if(now<enemy.disabledUntil){enemy.setVelocity(0,0);f.warning.setVisible(false);f.warningAt=0;continue;}
      if(f.role==='drone')enemy.setVelocity(Math.cos(aim)*speed*.8,Math.sin(aim)*speed*.8);
      else if(f.role==='tank')enemy.setVelocity(0,enemy.effectiveSpeed(34,now));
      else if(f.role==='zeppelin')enemy.setVelocity(enemy.effectiveSpeed(Math.sin(f.age*.5)*20,now),enemy.effectiveSpeed(enemy.y<220?35:8,now));
      else if(f.role==='strike')enemy.setVelocity(enemy.effectiveSpeed(Math.sin(f.age*1.3+f.originX)*32,now),enemy.y<210?speed*.65:enemy.effectiveSpeed(20,now));
      else {
        // Two sweeps across the corridor, then leave; formations never accumulate offscreen.
        const vx=f.vx*speed*.7+Math.cos(f.age*1.5+f.originX*.005)*speed*.65;
        enemy.setVelocity(vx,speed*(f.age<2?.75:.22)*f.vy);
      }
      enemy.setRotation(f.role==='zeppelin'?0:aim+Math.PI/2);
      f.decorations.forEach((d,i)=>d.setPosition(enemy.x+(i?1:-1)*46,enemy.y+20).setRotation(this.missionTime*.022));
      if(Math.hypot(dx,dy)<enemy.stats.size*.5+12&&now-enemy.lastAttackMs>850){enemy.lastAttackMs=now;this.damagePlayer(enemy.stats.damage);}
      if(f.role!=='drone'&&enemy.y>100&&this.missionTime>=f.shotAt){
        if(f.role==='strike'&&!f.warningAt){f.warningAt=this.missionTime+900;f.aim=aim;f.warning.setVisible(true);}
        else if(!f.warningAt||this.missionTime>=f.warningAt){
          const angle=f.warningAt?f.aim:aim;const count=f.role==='zeppelin'?3:f.role==='strike'?2:1;
          for(let j=0;j<count;j++)this.spawnProjectile('enemy',enemy.x,enemy.y,angle+(j-(count-1)/2)*.15,
            f.role==='strike'?270:220,enemy.stats.damage,f.role==='strike'?0xffb653:0xff658b,3500);
          f.shotAt=this.missionTime+(f.role==='zeppelin'?2100:2800)/Math.min(1.4,this.difficulty.pressure);
          f.warningAt=0;f.warning.setVisible(false);
        }
      }
      if(f.warningAt)f.warning.setTo(enemy.x,enemy.y,enemy.x+Math.cos(f.aim)*350,enemy.y+Math.sin(f.aim)*350);
      if(f.role==='zeppelin'&&this.missionTime>f.nextDronesAt){
        f.nextDronesAt=this.missionTime+8000;
        if(this.flights.size+2<=this.difficulty.activeCap)for(const s of [-1,1])this.spawnAircraft('drone',enemy.x+s*70,enemy.y+45);
      }
      if(enemy.hp<enemy.stats.hp||f.role==='zeppelin')this.drawHealth(enemy,enemy.stats.size+12,0xff985b);
    }
    for(const h of this.hardpoints)if(h.enemy.active&&h.enemy.hp>0){h.enemy.updateDamageFlash(now);this.drawHealth(h.enemy,52,0xffac67);}
    if(this.core?.active&&this.bossOpen)this.drawHealth(this.core,110,0x62faff);
  }
  private drawHealth(enemy:Enemy,width:number,color:number):void {
    this.healthBars.fillStyle(0x020812,.9).fillRect(enemy.x-width/2,enemy.y+enemy.displayHeight/2+6,width,5);
    this.healthBars.fillStyle(color,1).fillRect(enemy.x-width/2,enemy.y+enemy.displayHeight/2+7,width*Math.max(0,enemy.hp/enemy.stats.hp),3);
  }
  protected override updateTurrets(now:number):void {
    for(let i=0;i<this.turrets.length;i++){
      const root=this.turrets[i].sprite;
      if(!this.escortArt.has(root)){
        for(const child of root.list)(child as Phaser.GameObjects.Image).setVisible(false);
        const art=this.add.image(0,0,'sky-escort').setDisplaySize(44,44);root.add(art);this.escortArt.set(root,art);
      }
      root.x=Phaser.Math.Clamp(this.player.x+(i%2?1:-1)*(52+Math.floor(i/2)*32),35,this.pickupBounds.w-35);
      root.y=Phaser.Math.Clamp(this.player.y+32+Math.sin(this.missionTime*.003+i)*5,120,this.pickupBounds.h-40);
      this.escortArt.get(root)!.setRotation(this.player.rotation);
    }
    super.updateTurrets(now);
    for(const [root]of this.escortArt)if(!root.active)this.escortArt.delete(root);
  }
  protected override damageEnemy(enemy:Enemy,amount:number,echo?:EchoDamageStamp):void {
    if(enemy===this.core&&!this.bossOpen)return;
    // Keep shared Split Current/Echo handling and all projectile damage calculations.
    super.damageEnemy(enemy,amount,echo);
  }
  protected override weaponContextMultiplier(now:number):number { return this.modRuntime.supremePickupSurgeDamageMultiplier(now); }
  protected override onGameplayPickupCollected(type:PickupType,now:number):void {
    if(this.modRuntime.triggerSupremePickupSurge(now,type))this.supremeEffects?.showPickupSurge(now,this.player.x,this.player.y);
  }
  protected override updateMines(now:number):void {
    super.updateMines(now);
    // Attached ship weapons cannot be dragged away from their hull by ordnance.
    for(const h of this.hardpoints)if(h.enemy.active)h.enemy.setVelocity(0,0);
    if(this.core?.active)this.core.setVelocity(0,0);
  }
  protected override blast(x:number,y:number,radius:number,damage:number):void {
    super.blast(x,y,radius,damage);
    if(!this.modRuntime.has('magnetic-payload')||this.modRuntime.rank('magnetic-payload')!==3)return;
    for(const e of this.flights.keys())if(e.hp>0&&(e.x-x)**2+(e.y-y)**2<=radius*radius){
      e.slowFactor=MOD_BALANCE.magneticPayload.rank3SlowFactor;
      e.slowedUntil=this.time.now+MOD_BALANCE.magneticPayload.rank3SlowDurationMs;
    }
  }
  protected override updateFences(now:number,dt:number):void {
    super.updateFences(now,dt);
    for(const fence of this.fences)for(const e of this.flights.keys()){
      if(this.distanceToSegment(e.x,e.y,fence.x1,fence.y1,fence.x2,fence.y2)>=e.stats.size*.5+7)continue;
      e.slowFactor=Math.min(e.slowedUntil>now?e.slowFactor:1,fence.slowFactor);e.slowedUntil=Math.max(e.slowedUntil,now+120);
    }
  }
  protected override nearestEnemy(x:number,y:number,range:number):Enemy|null {
    let best:Enemy|null=null,dist=range*range;
    for(const e of this.enemies){if(!e.active||e.hp<=0||e===this.core&&!this.bossOpen)continue;
      const d=(e.x-x)**2+(e.y-y)**2;if(d<dist){dist=d;best=e;}}
    return best;
  }
  private startDreadnought():void {
    if(this.bossStarted)return;
    this.bossStarted=true;this.retireFlights();this.clearThreats();
    this.hull=this.add.image(this.pickupBounds.w/2,245,'sky-dreadnought').setDisplaySize(710,331).setDepth(5);
    const offsets=[[-95,99],[95,99],[-240,22],[240,22],[-169,-49],[169,-49],[0,-83]];
    DREADNOUGHT_WEAPONS.forEach((id,i)=>{
      const [dx,dy]=offsets[i];const kind=id.startsWith('missile')?'missile':'cannon';
      const e=new Enemy(this,this.hull!.x+dx,this.hull!.y+dy,`sky-${kind}`,{
        ...baseEnemyStats.tank,hp:Math.max(20,Math.round(this.difficulty.bossHealth*.09)),size:44,speed:0,valueCredits:0,valueCoreTokens:0
      }).setDisplaySize(65,65).setVisualTintOverride(null).setDepth(8);
      const wreck=this.add.image(e.x,e.y,`sky-${kind}`).setDisplaySize(65,65).setTint(0x28303a).setDepth(6).setVisible(false);
      const smoke=this.add.image(e.x,e.y,'sky-smoke').setDisplaySize(60,95).setDepth(9).setAlpha(0);
      e.setName(id);this.enemies.push(e);this.hardpoints.push({id,enemy:e,dx,dy,wreck,smoke});this.aliveWeapons.add(id);
    });
    this.core=new Enemy(this,this.hull.x,this.hull.y,'sky-core',{
      ...baseEnemyStats.tank,hp:Math.round(this.difficulty.bossHealth*.5),size:66,speed:0,valueCredits:0,valueCoreTokens:0
    }).setDisplaySize(92,92).setVisualTintOverride(null).setDepth(7).setName('dreadnought-core');
    this.enemies.push(this.core);
    this.coreDoors=[-1,1].map(s=>this.add.rectangle(this.hull!.x+s*22,this.hull!.y,43,76,0x1b3043)
      .setStrokeStyle(2,0x7cacc1).setDepth(8));
    this.announce('SKYBREACH DREADNOUGHT','CORE SHIELDED // DESTROY ALL SEVEN EXTERNAL WEAPONS');
    this.coreAudio.playSfx('miniBossSpawn');
  }
  private updateDreadnought():void {
    if(!this.hull||!this.core)return;
    if(this.destructionAt){this.updateDestruction();return;}
    this.hull.x=this.pickupBounds.w/2+Math.sin(this.missionTime*.0005)*64;
    this.core.setPosition(this.hull.x,this.hull.y);
    for(const h of this.hardpoints){
      h.wreck.setPosition(this.hull.x+h.dx,this.hull.y+h.dy);
      h.smoke.setPosition(h.wreck.x+Math.sin(this.missionTime*.002)*9,h.wreck.y-22)
        .setAlpha((1-Math.max(0,h.enemy.hp/h.enemy.stats.hp))*.6).setRotation(Math.sin(this.missionTime*.001)*.12);
      if(h.enemy.hp<=0&&this.aliveWeapons.delete(h.id)){
        h.wreck.setVisible(true);h.enemy.setVisible(false).setActive(false);(h.enemy.body as Phaser.Physics.Arcade.Body).enable=false;
        this.mineExplosionVfx.emit(h.wreck.x,h.wreck.y,52,EXPLOSION,this.time.now,false);
        this.coreAudio.playSfx('enemyDeath');
      }
      if(h.enemy.active)h.enemy.setPosition(this.hull.x+h.dx,this.hull.y+h.dy);
    }
    if(!this.bossOpen&&coreExposed(this.aliveWeapons)){
      this.bossOpen=true;this.announce('CORE EXPOSED','REACTOR ARMOR OPEN // FINISH THE DREADNOUGHT');this.clearThreats();
    }
    this.coreDoors.forEach((door,i)=>door.setPosition(this.hull!.x+(i?1:-1)*(this.bossOpen?66:22),this.hull!.y));
    if(this.core.hp<=0){
      this.destructionAt=this.missionTime;this.core.setActive(false).setVisible(false);
      this.clearThreats();this.retireFlights();this.announce('REACTOR FAILURE','DREADNOUGHT BREAKING APART');return;
    }
    const attack=this.scheduler.next(this.missionTime,this.aliveWeapons,this.difficulty.pressure);
    if(attack==='escorts')this.spawnFormation(this.bossOpen?'strike':'drone','split',Math.min(4,this.difficulty.formationCount));
    else if(attack){
      const weapons=attackWeapons(attack,this.aliveWeapons);
      for(const id of weapons){
        const e=this.hardpoints.find(h=>h.id===id)!.enemy;
        const aim=Math.atan2(this.player.y-e.y,this.player.x-e.x);
        if(attack==='artillery'||attack==='missile'){
          const radius=attack==='artillery'?BOSS_BALANCE.artillery.superRadius:54;
          this.scheduleStrike(this.player.x+(id.endsWith('left')?-48:id.endsWith('right')?48:0),this.player.y,radius,
            BOSS_BALANCE.artillery.superDamage*this.difficulty.bossDamage,e);
        }else if(attack==='broadside'){
          for(let j=-2;j<=2;j++)this.spawnProjectile('enemy',e.x,e.y,Math.PI/2+j*.18,200,
            BOSS_BALANCE.artillery.projectileDamage*this.difficulty.bossDamage,0xff6987,4000);
        }else this.bossBursts.push({owner:e,remaining:7,at:this.missionTime+650,angle:aim-.3,step:.1,
          damage:BOSS_BALANCE.artillery.projectileDamage*this.difficulty.bossDamage});
      }
    }
    for(let i=this.bossBursts.length-1;i>=0;i--){
      const burst=this.bossBursts[i];
      if(!burst.owner.active||burst.owner.hp<=0){this.bossBursts.splice(i,1);continue;}
      if(this.missionTime<burst.at)continue;
      this.spawnProjectile('enemy',burst.owner.x,burst.owner.y,burst.angle,260,burst.damage,0xffac62,3400);
      burst.angle+=burst.step;burst.at=this.missionTime+170;if(--burst.remaining<=0)this.bossBursts.splice(i,1);
    }
  }
  private scheduleStrike(x:number,y:number,radius:number,damage:number,owner:Enemy|null):void {
    if(this.strikes.length>=4||this.returning)return;
    x=Phaser.Math.Clamp(x,radius+30,this.pickupBounds.w-radius-30);
    y=Phaser.Math.Clamp(y,140,this.pickupBounds.h-radius-30);
    this.strikes.push({...createArtilleryMarker(this,x,y,radius,0xffaf59),x,y,radius,damage,
      start:this.missionTime,due:this.missionTime+BOSS_BALANCE.artillery.superTelegraphMs,owner});
  }
  private updateStrikes():void {
    for(let i=this.strikes.length-1;i>=0;i--){
      const s=this.strikes[i];
      if(s.owner&&(!s.owner.active||s.owner.hp<=0)){s.marker.destroy(true);this.strikes.splice(i,1);continue;}
      const t=Phaser.Math.Clamp((this.missionTime-s.start)/(s.due-s.start),0,1);
      s.timingRing.setScale(1.5-t*.82);s.reticle.rotation=this.missionTime*.001;s.targetRing.setFillStyle(0xffaf59,.04+t*.09);
      s.payload.setY(-270*(1-t*t*t)).setAlpha(.4+t*.6);
      if(this.missionTime<s.due)continue;
      if(Phaser.Math.Distance.Between(this.player.x,this.player.y,s.x,s.y)<s.radius+12)this.damagePlayer(s.damage);
      this.mineExplosionVfx.emit(s.x,s.y,s.radius,EXPLOSION,this.time.now,false);this.coreAudio.playSfx('bossArtilleryExplosion');
      s.marker.destroy(true);this.strikes.splice(i,1);
    }
  }
  private updateDestruction():void {
    if(this.rewardDropped)return;
    const elapsed=this.missionTime-this.destructionAt;
    if(elapsed>this.destructionStep*360&&this.destructionStep<7){
      const i=this.destructionStep++,x=this.hull!.x+Math.sin(i*2.4)*245,y=this.hull!.y+Math.cos(i*1.7)*80;
      this.mineExplosionVfx.emit(x,y,i===6?210:72,EXPLOSION,this.time.now,i===6?'mine':false);this.coreAudio.playSfx('bossArtilleryExplosion');
      this.hull!.setTint(0xffffff).setAlpha(1-i*.09);
    }
    if(elapsed<2900)return;
    this.hull!.setVisible(false);for(const h of this.hardpoints){h.wreck.setVisible(false);h.smoke.setVisible(false);}for(const d of this.coreDoors)d.setVisible(false);
    this.dropBossLoot();
  }
  private dropBossLoot():void {
    if(this.rewardDropped)return;this.rewardDropped=true;
    const rewards=getBossRewards(this.difficulty.rewardPosition),m=this.difficulty.rewardMultiplier;
    const x=this.pickupBounds.w/2,y=this.pickupBounds.h*.46;
    this.lootPickups.spawn(x-55,y,{kind:'credits',amount:Math.round(rewards.credits*m*this.modRuntime.multiplier('creditValue'))},9100);
    this.lootPickups.spawn(x,y,{kind:'coreTokens',amount:Math.max(1,Math.round(rewards.coreTokens*m))},9101);
    this.lootPickups.spawn(x+55,y,{kind:'plasmaChips',amount:Math.max(1,Math.round(rewards.plasmaChips*m))},9102);
    const mod=rollModDrop({source:'boss',round:this.difficulty.rewardPosition,seed:this.session.seed,sequence:9103,
      protocol:this.session.protocol,focus:this.session.modFocus,contract:this.session.contract,guaranteed:true});
    if(mod)this.lootPickups.spawn(x,y+65,{kind:'mod',amount:1,modId:mod.id},9103);
    this.announce('DREADNOUGHT DESTROYED','COLLECT THE PROVISIONAL BOSS HAUL // RETURN LINK FOLLOWS');
  }
  protected override openExtraction():void {
    if(this.extractionPortal)return;
    this.extractionPortal=new AnomalyPortalVisual(this,this.pickupBounds.w/2,this.pickupBounds.h*.74,SaveSystem.get().settings.particles);
    this.extractionPortal.transformToPortal();this.audio.play('extraction-activation');this.emitMetric('anomaly_extraction_started');
    this.announce('ARENA RETURN LINK OPEN','ENTER THE PORTAL AND INTERACT TO BANK YOUR HAUL');
  }
  private recoveryPickups():void {
    for(const [i,kind] of (['health','energy'] as PickupType[]).entries())this.pickups.push({kind,
      root:this.createGameplayPickup(kind,this.pickupBounds.w*(.42+i*.16),this.pickupBounds.h*.56),
      expiresAt:this.time.now+22000,source:'enemy'});
  }
  private retireFlights():void {
    for(const [enemy,f]of this.flights){f.warning.destroy();for(const d of f.decorations)d.destroy();enemy.destroy();const i=this.enemies.indexOf(enemy);if(i>=0)this.enemies.splice(i,1);}
    this.flights.clear();
  }
  private clearThreats():void {
    for(const strike of this.strikes)strike.marker.destroy(true);this.strikes.length=0;this.bossBursts.length=0;
    for(let i=this.projectiles.length-1;i>=0;i--)if(this.projectiles[i].owner==='enemy')this.retireProjectile(this.projectiles[i],i);
  }
  protected override cleanup():void {
    // Phaser has already destroyed scene-owned render objects and Arcade bodies.
    this.flights.clear();this.escortArt.clear();this.hardpoints.length=0;this.aliveWeapons.clear();this.strikes.length=0;
    this.coreDoors.length=0;this.hull=null;this.core=null;this.bossBursts.length=0;
    this.flightTargets.length=0;this.supremeEffects=null;
    super.cleanup();
  }
}
// Kept outside update so the authored table is one immutable shared object.
import { SKY_FLIGHT } from './SkyBreachDirector.ts';
const importModule=(index:number)=>SKY_FLIGHT[index];
