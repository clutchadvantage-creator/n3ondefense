import Phaser from 'phaser';
import { AnomalyCombatScene, type HeistProjectile } from '../heist/HeistScene.ts';
import { SceneKeys } from '../../flow/SceneKeys.ts';
import { Enemy, baseEnemyStats } from '../../enemies/Enemy.ts';
import { ENEMY_ROBOT_FRAMES } from '../../enemies/EnemyRobotFrames.ts';
import { SkyBreachWorld } from './SkyBreachArt.ts';
import { skyBreachDifficulty, scaleArenaEnemyStats } from './SkyBreachDifficulty.ts';
import { SkyBreachDirector, DreadnoughtCrossfire, DREADNOUGHT_WEAPONS, attackWeapons, coreExposed,
  formationSlots, tankGroupSlots, skyReinforcementPlan, type DreadnoughtAttack, type FlightModule, type SkyRole, type HardpointId } from './SkyBreachDirector.ts';
import { createArtilleryMarker } from '../../bosses/ArtilleryMarker.ts';
import { BOSS_BALANCE, getBossRewards } from '../../config/bossBalance.ts';
import { rollModDrop } from '../../mods/ModDropService.ts';
import { AnomalyPortalVisual } from '../AnomalyPortalVisual.ts';
import { SaveSystem } from '../../systems/SaveSystem.ts';
import type { RectSpec, PickupType } from '../../types.ts';
import type { EchoDamageStamp } from '../../echo/EchoRules.ts';
import { SupremeModEffectSystem } from '../../mods/SupremeModEffectSystem.ts';
import { MOD_BALANCE } from '../../mods/modBalance.ts';
import { createFlightSteering, droneSeparation, steerFlight, skyForwardAim, SKY_DURABILITY, flightBank, dreadnoughtPosition, type FlightSteering } from './SkyBreachMotion.ts';
import { DroneBurstWeapon } from '../../enemies/drone/DroneFlight.ts';
import { getTankHomingMissileSpeed, steerTankHomingMissile } from '../../enemies/HomingMissile.ts';
import { ENEMY_BALANCE, TANK_HOMING_MISSILE_BALANCE } from '../../config/balance/index.ts';
import { getModeSpawnCadence, applyEnemyDamageMode } from '../../config/modeBalance.ts';
import { MechanicalDestructionVfx } from '../../vfx/MechanicalDestructionVfx.ts';
import { HeistPerformanceProfiler } from '../heist/HeistPerformanceProfiler.ts';
import type { Formation } from './SkyBreachDirector.ts';

interface FlightState {
  role: SkyRole; pattern: Formation; age: number; originX: number; vx: number; vy: number; shotAt: number;
  warningAt: number; aim: number; nextDronesAt: number; warning: Phaser.GameObjects.Image;
  decorations: Phaser.GameObjects.Image[];
  steering: FlightSteering; lane: number; laneOffset: number; weapon: DroneBurstWeapon; volleys: number;
}
interface Hardpoint { id: HardpointId; enemy: Enemy; dx: number; dy: number; wreck: Phaser.GameObjects.Image; smoke: Phaser.GameObjects.Image; power: Phaser.GameObjects.Image; fired: number }
type SkyShot = 'shell'|'kinetic'|'plasma'|'flak'|'missile';
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
  private scheduler = new DreadnoughtCrossfire();
  private bossStartedAt = 0;
  private bossCues: { family:DreadnoughtAttack; at:number }[] = [];
  private reinforcementPlan: readonly SkyRole[] = [];
  private reinforcementIndex = 0;
  private airshipAt = 0;
  private seekers = new Map<HeistProjectile,{owner:Enemy;hp:number;nextTrailAt:number}>();
  private readonly skyShots = new Map<HeistProjectile,SkyShot>();
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
  private nextCoreVolley = 0;
  private destructionAt = 0;
  private destructionStep = 0;
  private rewardDropped = false;
  private readonly bossBursts: {owner: Enemy;remaining:number;at:number;angle:number;step:number;damage:number;kind?:SkyShot}[] = [];
  private moduleLabel = 'ENTERING HOSTILE AIRSPACE';
  private supremeEffects: SupremeModEffectSystem|null = null;
  private readonly flightTargets: Enemy[] = [];
  private mechanicalDestruction!: MechanicalDestructionVfx;
  private flightSequence = 0;
  private nextHitSound = 0;

  constructor() { super(SceneKeys.SkyBreach); }
  protected override get anomalyId(): 'skybreach' { return 'skybreach'; }
  protected override get missionName(): string { return 'SKYBREACH'; }
  protected override get missionLayoutName(): string { return 'RWG Aerial Breach Corridor'; }
  protected override get supportsFences(): boolean { return false; }
  protected override getAimPoint(): {x:number;y:number} {
    return skyForwardAim(this.player.x,this.player.y,this.inputController.move.x);
  }
  protected override updateCrosshair():void { this.crosshair.setVisible(false); }
  protected override worldEntryPoint() { return {x:this.pickupBounds.w/2,y:this.pickupBounds.h*.76}; }
  protected override worldCollisionGroups(): Phaser.Physics.Arcade.StaticGroup[] { return []; }
  protected override worldPickupWalls(): readonly RectSpec[] { return NO_WALLS; }
  protected override prepareWorldNavigation(): void {}

  protected override createEnvironment(): void {
    this.director=new SkyBreachDirector(this.session.seed);this.scheduler=new DreadnoughtCrossfire();
    this.missionTime=0;this.nextArtillery=0;this.bossStarted=false;this.bossOpen=false;
    this.nextCoreVolley=0;this.airshipAt=0;this.bossStartedAt=0;this.bossCues=[];
    this.reinforcementPlan=skyReinforcementPlan(this.session.seed);this.reinforcementIndex=0;
    this.seekers.clear();this.skyShots.clear();
    this.flightSequence=0;this.nextHitSound=0;
    this.destructionAt=0;this.destructionStep=0;this.rewardDropped=false;this.bossBursts.length=0;
    this.core=null;this.hull=null;this.coreDoors=[];this.moduleLabel='ENTERING HOSTILE AIRSPACE';
    this.difficulty=skyBreachDifficulty(this.session);
    this.pickupBounds.w=1440;this.pickupBounds.h=Math.max(900,Math.min(1260,1440*this.scale.height/this.scale.width));
    this.physics.world.setBounds(30,110,this.pickupBounds.w-60,this.pickupBounds.h-145);
    this.cameras.main.setBackgroundColor(0x081423);
    this.world=new SkyBreachWorld(this,this.pickupBounds.w,this.pickupBounds.h);
    this.healthBars=this.add.graphics().setDepth(12);
  }
  protected override createPlayer():void {
    super.createPlayer();
    this.player.setAppearanceResolver(()=>({textureKey:'sky-player',tint:null}));
    this.player.restoreOperativeAppearance(this.time.now,true);
    this.player.setDisplaySize(62,62);
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
    this.world.resize(this.scale.width/c.zoom,this.scale.height/c.zoom);
  }
  protected override initializeMission():void {
    this.mechanicalDestruction=new MechanicalDestructionVfx(this,this.fxCirclePool,SaveSystem.get().settings.particles);
    this.mechanicalDestruction.prewarm(48);
    this.supremeEffects=new SupremeModEffectSystem(this,this.modRuntime,{playPulseCue:()=>this.coreAudio.playSfx('shieldOn')});
    if(import.meta.env.DEV) {
      this.performanceProfiler=new HeistPerformanceProfiler();
      this.input.keyboard?.on('keydown-F6',this.toggleDevPerformanceOverlay,this);
      this.events.on(Phaser.Scenes.Events.PRE_RENDER,this.onDevPreRender,this);
      this.events.on(Phaser.Scenes.Events.RENDER,this.onDevRender,this);
      this.events.on(Phaser.Scenes.Events.PRE_UPDATE,this.onDevPreUpdate,this);
      this.events.on(Phaser.Scenes.Events.UPDATE,this.onDevPhysicsUpdateComplete,this);
    }
    this.announce('SKYBREACH // FLIGHT LINK ESTABLISHED','FORWARD FIRE // FENCES OFFLINE // EARNINGS PROVISIONAL');
  }
  protected override updateWorld(_now:number,dt:number):void {
    this.activeDelta=dt;this.missionTime+=dt*1000;this.world.update(dt,this.pickupBounds.h);
    this.mechanicalDestruction?.update(this.missionTime,dt*1000);
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
      const module=this.director.complete?null:this.director.modules[this.director.index];
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
    if(module.emplacements&&sequence%2===0&&this.flights.size+2<=this.difficulty.activeCap){
      for(const side of [.12,.88])this.spawnAircraft('aa',this.pickupBounds.w*side,80);
    }
    if(module.role!=='zeppelin'||this.canSpawnAirship()){
      this.spawnFormation(module.role,module.formation??'line',module.role==='zeppelin'?1:this.difficulty.formationCount,sequence%2===1);
    }
    if(module.airship&&this.canSpawnAirship())this.spawnFormation('zeppelin','line',1,sequence%2===1);
    if(module.secondary)this.spawnFormation(module.secondary,'split',Math.max(2,this.difficulty.formationCount-2),sequence%2===0);
  }
  private canSpawnAirship():boolean {
    return this.missionTime>=this.airshipAt && ![...this.flights.values()].some(f=>f.role==='zeppelin')
      && this.flights.size<this.difficulty.activeCap;
  }
  private spawnFormation(role:SkyRole,pattern:Parameters<typeof formationSlots>[0],count:number,mirror=false):void {
    if(role==='tank'){
      const lane=mirror?1:-1,slots=tankGroupSlots(this.pickupBounds.h);
      // Keep each patrol intact and leave a visible gap before another uses its road.
      if(this.flights.size+slots.length>this.difficulty.activeCap)return;
      for(const [enemy,f] of this.flights)if(f.role==='tank'&&f.lane===lane&&enemy.active&&enemy.hp>0
        &&enemy.y<slots[0].y+240)return;
      for(const slot of slots){
        const enemy=this.spawnAircraft(role,this.world.groundLaneX(lane),slot.y);
        this.flights.get(enemy)!.laneOffset=slot.offsetX;
        enemy.x+=slot.offsetX;
      }
      return;
    }
    for(const slot of formationSlots(pattern,count,this.pickupBounds.w,this.pickupBounds.h,mirror)) {
      if(this.flights.size>=this.difficulty.activeCap)break;
      const enemy=this.spawnAircraft(role,role==='zeppelin'?this.pickupBounds.w*(mirror?.68:.32):slot.x,slot.y,slot.vx,slot.vy,pattern);
      const steering=this.flights.get(enemy)!.steering;steering.group=slot.group;steering.slot=slot.slot;
    }
  }
  private spawnAircraft(role:SkyRole,x:number,y:number,vx=0,vy=1,pattern:Formation='line'):Enemy {
    const base=baseEnemyStats[role==='drone'?'drone':role==='tank'||role==='zeppelin'||role==='aa'?'tank':'shooter'];
    const factor=SKY_DURABILITY[role];
    const stats={...scaleArenaEnemyStats(base,this.difficulty,factor),size:role==='zeppelin'?104:role==='strike'?33:base.size,
      valueCredits:Math.round(base.valueCredits*this.difficulty.rewardMultiplier*this.modRuntime.multiplier('creditValue'))};
    const key=role==='drone'||role==='tank'?ENEMY_ROBOT_FRAMES[role].textureKey:`sky-${role}`;
    const enemy=new Enemy(this,x,y,key,stats).setVisualTintOverride(null);
    const lane=x<this.pickupBounds.w/2?-1:1;
    if(role==='tank')enemy.setPosition(this.world.groundLaneX(lane),y).setDepth(-19);
    else enemy.setDepth(role==='aa'?4:6);
    if(role==='zeppelin')enemy.setDisplaySize(210,146);
    else if(role==='aa')enemy.setDisplaySize(72,72);
    else if(role==='interceptor'||role==='strike')enemy.setDisplaySize(role==='strike'?78:64,role==='strike'?78:64);
    enemy.setName(`sky-${role}`);
    this.enemies.push(enemy);
    this.flights.set(enemy,{role,pattern,age:0,originX:x,vx,vy,lane,laneOffset:0,steering:createFlightSteering(++this.flightSequence*2.399963,vx),shotAt:this.missionTime+1100,warningAt:0,aim:0,
      weapon:new DroneBurstWeapon(),volleys:0,
      nextDronesAt:this.missionTime+6500,warning:this.add.image(x,y,'sky-lock').setDisplaySize(42,42).setDepth(8).setVisible(false),
      decorations:role==='zeppelin'?[-1,1].map(()=>this.add.image(x,y,'sky-rotor').setDisplaySize(32,32).setDepth(8))
        :role==='aa'?[this.add.image(x,y,'sky-aa-platform').setDisplaySize(136,172).setDepth(3)]:[]});
    if(role==='zeppelin')this.airshipAt=this.missionTime+28000;
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
      if(!enemy.active||enemy.hp<=0){
        if(enemy.hp<=0)this.mechanicalDestruction.emitEnemy(enemy.stats.type,enemy.x,enemy.y,enemy.stats.color,this.missionTime);
        f.warning.destroy();for(const d of f.decorations)d.destroy();this.flights.delete(enemy);super.removeEnemy(enemy,i);continue;
      }
      f.age+=dt;enemy.updateDamageFlash(now);enemy.updateMechanicalPresentation(now);
      // Ground emplacements pass with the scrolling terrain. Aircraft always return.
      if((f.role==='tank'||f.role==='aa')&&enemy.y>this.pickupBounds.h+110){
        f.warning.destroy();for(const d of f.decorations)d.destroy();this.flights.delete(enemy);enemy.destroy();this.enemies.splice(i,1);continue;
      }
      if(f.role==='tank')enemy.x=this.world.groundLaneX(f.lane)+f.laneOffset;
      const dx=this.player.x-enemy.x,dy=this.player.y-enemy.y;
      const aim=Math.atan2(dy,dx),speed=enemy.effectiveSpeed(enemy.stats.speed,now);
      if(now<enemy.disabledUntil){
        enemy.setVelocity(0,0);f.steering.velocityX=0;f.steering.velocityY=0;
        f.warning.setVisible(false);f.warningAt=0;continue;
      }
      let separateX=0,separateY=0;
      if(f.role==='drone')for(const other of this.flightTargets){
        if(other===enemy||!other.active||other.hp<=0)continue;
        const peer=this.flights.get(other);if(peer?.role!=='drone')continue;
        const separation=droneSeparation(enemy.x,enemy.y,other.x,other.y,f.steering.phase-peer.steering.phase);
        separateX+=separation.x;separateY+=separation.y;
      }
      const motion=steerFlight(f.steering,f.role,f.pattern,dt,enemy.x,enemy.y,this.player.x,this.player.y,
        this.pickupBounds.w,this.pickupBounds.h,speed,separateX,separateY);
      enemy.setVelocity(motion.x,motion.y);
      enemy.setRotation(f.role==='zeppelin'?0:f.role==='tank'?aim+Math.PI/2:f.role==='aa'?aim-Math.PI/2:Math.atan2(motion.y,motion.x)+Math.PI/2);
      if(f.role==='interceptor'||f.role==='strike') {
        const bank=flightBank(f.steering,f.pattern,dt),frame=Math.max(-2,Math.min(2,Math.round(bank*2)));
        enemy.setTexture(`sky-${f.role}-bank-${frame}`);
        const size=f.role==='strike'?78:64;enemy.setDisplaySize(size,size*(1-Math.abs(bank)*.08));
      }
      f.decorations.forEach((d,i)=>f.role==='aa'?d.setPosition(enemy.x,enemy.y):d.setPosition(enemy.x+(i?1:-1)*46,enemy.y+20).setRotation(this.missionTime*.022));
      if(Math.hypot(dx,dy)<enemy.stats.size*.5+12&&now-enemy.lastAttackMs>850){enemy.lastAttackMs=now;this.damagePlayer(enemy.stats.damage);}
      if(f.role==='drone') {
        f.weapon.update(f.age*1000,aim,Math.hypot(dx,dy)<=ENEMY_BALANCE.drone.attackRange&&f.steering.stage==='attack',
          getModeSpawnCadence(ENEMY_BALANCE.drone.attackCooldownMs,this.session.protocol),angle=>{
            if(this.fireSkyShot('kinetic',enemy,angle,320,enemy.stats.damage))f.volleys++;
          });
      }else if(f.role==='tank') {
        if(this.missionTime>=f.shotAt&&Math.hypot(dx,dy)<=TANK_HOMING_MISSILE_BALANCE.launchRange
          && ![...this.seekers.values()].some(s=>s.owner===enemy)) {
          if(this.fireSkyShot('missile',enemy,aim,getTankHomingMissileSpeed(this.player.speed),
            applyEnemyDamageMode(TANK_HOMING_MISSILE_BALANCE.damage,this.session.protocol))) {
            f.shotAt=this.missionTime+TANK_HOMING_MISSILE_BALANCE.cooldownMs;f.volleys++;
          }
        }
      }else if(enemy.y>100&&this.missionTime>=f.shotAt){
        if((f.role==='strike'||f.role==='aa')&&!f.warningAt){f.warningAt=this.missionTime+900;f.aim=aim;f.warning.setVisible(true);}
        else if(!f.warningAt||this.missionTime>=f.warningAt){
          const angle=f.warningAt?f.aim:aim;const count=f.role==='zeppelin'||f.role==='aa'?3:f.role==='strike'?2:1;
          const kind:SkyShot=f.role==='zeppelin'?(['plasma','missile','flak'] as const)[f.volleys%3]
            :f.role==='aa'?'flak':f.role==='strike'?'shell':'kinetic';
          for(let j=0;j<(kind==='missile'?2:count);j++)this.fireSkyShot(kind,enemy,angle+(j-(count-1)/2)*.18,
            kind==='shell'?210:kind==='kinetic'?340:230,enemy.stats.damage);
          f.volleys++;
          f.shotAt=this.missionTime+(f.role==='zeppelin'?1800:2200)/Math.min(1.4,this.difficulty.pressure);
          f.warningAt=0;f.warning.setVisible(false);
        }
      }
      if(f.warningAt)f.warning.setPosition(enemy.x+Math.cos(f.aim)*65,enemy.y+Math.sin(f.aim)*65)
        .setAlpha(.55+.35*Math.sin(this.missionTime*.02)).setRotation(this.missionTime*.001);
      if(f.role==='zeppelin'&&this.missionTime>f.nextDronesAt){
        f.nextDronesAt=this.missionTime+8000;
        if(this.flights.size+2<=this.difficulty.activeCap)for(const s of [-1,1])this.spawnAircraft('drone',enemy.x+s*70,enemy.y+45);
      }
      if(enemy.hp<enemy.stats.hp||f.role==='zeppelin')this.drawHealth(enemy,enemy.stats.size+12,0xff985b);
    }
    for(const h of this.hardpoints)if(h.enemy.active&&h.enemy.hp>0){h.enemy.updateDamageFlash(now);this.drawHealth(h.enemy,52,0xffac67);}
    if(this.core?.active&&this.bossOpen)this.drawHealth(this.core,110,0x62faff);
  }
  /** Reuse anomaly projectile pooling/collisions and Arena missile steering, art and trails. */
  private fireSkyShot(kind:SkyShot,owner:Enemy,angle:number,speed:number,damage:number):boolean {
    if(this.returning||!owner.active||owner.hp<=0||this.skyShots.size>=160||(kind==='missile'&&this.seekers.size>=12))return false;
    const offset=owner===this.core?48:owner.stats.size*.65;
    const x=owner.x+Math.cos(angle)*offset,y=owner.y+Math.sin(angle)*offset;
    const [width,height]=kind==='shell'?[30,15]:kind==='plasma'?[34,23]:kind==='missile'?[30,14]:kind==='flak'?[18,12]:[17,8];
    const projectile=this.projectilePool.obtain({owner:'enemy',texture:kind==='missile'?'tank-homing-missile':`sky-shot-${kind}`,
      width,height,tint:0xffffff,rotation:angle,velocityX:Math.cos(angle)*speed,velocityY:Math.sin(angle)*speed,
      damage,lifeMs:kind==='missile'?TANK_HOMING_MISSILE_BALANCE.lifetimeMs:4500,
      trailColor:kind==='plasma'?0x62dfff:0xffba73,critical:false,ricochetsRemaining:0,ammoMode:'normal',previousX:x,previousY:y});
    projectile.nextTrailAt=Infinity; // Physical rounds have a body; only seekers need continuous exhaust.
    this.projectiles.push(projectile);this.skyShots.set(projectile,kind);
    if(kind==='missile')this.seekers.set(projectile,{owner,hp:TANK_HOMING_MISSILE_BALANCE.health,nextTrailAt:0});
    const hardpoint=this.hardpoints.find(h=>h.enemy===owner);if(hardpoint)hardpoint.fired++;
    this.muzzleFlashVfx.emit(x,y,angle,kind==='plasma'?0x62dfff:0xffba73,this.time.now,kind==='shell'?1.3:.7);
    return true;
  }

  protected override updateProjectiles(now:number,delta:number):void {
    for(const [projectile,seeker] of this.seekers) {
      const sprite=projectile.sprite;
      const angle=steerTankHomingMissile(sprite.rotation,Math.atan2(this.player.y-sprite.y,this.player.x-sprite.x),Math.min(delta,100));
      const speed=getTankHomingMissileSpeed(this.player.speed);
      sprite.setRotation(angle).setVelocity(Math.cos(angle)*speed,Math.sin(angle)*speed);
      if(now>=seeker.nextTrailAt){this.projectileImpactVfx.emitMissileTrail(sprite.x-Math.cos(angle)*14,sprite.y-Math.sin(angle)*14,angle,now);seeker.nextTrailAt=now+50;}
      for(let i=this.projectiles.length-1;i>=0;i--) {
        const shot=this.projectiles[i];if(shot.owner==='enemy'||shot.ammoMode==='grenade')continue;
        if(Math.hypot(shot.sprite.x-sprite.x,shot.sprite.y-sprite.y)<22){seeker.hp-=shot.damage;this.retireProjectile(shot,i);if(seeker.hp<=0)break;}
      }
      const distance=Math.hypot(this.player.x-sprite.x,this.player.y-sprite.y);
      if(seeker.hp<=0||distance<19||projectile.lifeMs<=delta) {
        if(seeker.hp>0&&distance<TANK_HOMING_MISSILE_BALANCE.blastRadius)this.damagePlayer(projectile.damage);
        const i=this.projectiles.indexOf(projectile);if(i>=0)this.retireProjectile(projectile,i);
      }
    }
    super.updateProjectiles(now,delta);
  }

  protected override retireProjectile(projectile:HeistProjectile,index:number):void {
    const kind=this.skyShots.get(projectile);
    if(kind==='missile')this.projectileImpactVfx.emitMissileImpact(projectile.sprite.x,projectile.sprite.y,projectile.sprite.rotation,this.time.now);
    else if(kind==='shell'||kind==='plasma')this.mineExplosionVfx.emit(projectile.sprite.x,projectile.sprite.y,kind==='shell'?22:16,EXPLOSION,this.time.now,false);
    this.seekers.delete(projectile);this.skyShots.delete(projectile);
    super.retireProjectile(projectile,index);
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
    const before=enemy.hp;
    super.damageEnemy(enemy,amount,echo);
    if(enemy.hp<before&&this.missionTime>=this.nextHitSound){
      this.nextHitSound=this.missionTime+85;this.coreAudio.playSfx('hit');
    }
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
    this.bossStarted=true;this.bossStartedAt=this.missionTime;this.retireFlights();this.clearThreats();
    this.scheduler=new DreadnoughtCrossfire();this.airshipAt=this.missionTime+12000;
    this.hull=this.add.image(this.pickupBounds.w/2,245,'sky-dreadnought').setDisplaySize(710,331).setDepth(5);
    const offsets=[[-95,99],[95,99],[-240,22],[240,22],[-169,-49],[169,-49],[0,-83]];
    DREADNOUGHT_WEAPONS.forEach((id,i)=>{
      const [dx,dy]=offsets[i];const kind=id.startsWith('missile')?'missile':'cannon';
      const e=new Enemy(this,this.hull!.x+dx,this.hull!.y+dy,`sky-${kind}`,{
        ...baseEnemyStats.tank,hp:this.difficulty.bossHealth,size:44,speed:0,valueCredits:0,valueCoreTokens:0
      }).setDisplaySize(65,65).setVisualTintOverride(null).setDepth(8);
      const wreck=this.add.image(e.x,e.y,'sky-wreck').setDisplaySize(110,110).setDepth(6).setVisible(false);
      const power=this.add.image(e.x,e.y,'sky-wreck-power').setDisplaySize(110,110).setDepth(8).setVisible(false);
      const smoke=this.add.image(e.x,e.y,'sky-smoke').setDisplaySize(60,95).setDepth(9).setAlpha(0);
      e.setName(id);this.enemies.push(e);this.hardpoints.push({id,enemy:e,dx,dy,wreck,smoke,power,fired:0});this.aliveWeapons.add(id);
    });
    this.core=new Enemy(this,this.hull.x,this.hull.y,'sky-core',{
      ...baseEnemyStats.tank,hp:this.difficulty.bossHealth*2,size:66,speed:0,valueCredits:0,valueCoreTokens:0
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
    const drift=dreadnoughtPosition(this.missionTime-this.bossStartedAt,this.pickupBounds.w);
    this.hull.setPosition(drift.x,drift.y);
    this.core.setPosition(this.hull.x,this.hull.y);
    for(const h of this.hardpoints){
      h.wreck.setPosition(this.hull.x+h.dx,this.hull.y+h.dy);
      const damaged=!this.aliveWeapons.has(h.id),phase=this.missionTime*.013+h.dx;
      h.power.setPosition(h.wreck.x,h.wreck.y).setVisible(damaged)
        .setAlpha(Math.sin(phase)> .65?.85:.09+Math.max(0,Math.sin(phase*.31))*.15);
      h.smoke.setPosition(h.wreck.x+Math.sin(this.missionTime*.002)*9,h.wreck.y-22)
        .setAlpha((1-Math.max(0,h.enemy.hp/h.enemy.stats.hp))*.6).setRotation(Math.sin(this.missionTime*.001)*.12);
      if(h.enemy.hp<=0&&this.aliveWeapons.delete(h.id)){
        this.mechanicalDestruction.emitEnemy('tank',h.enemy.x,h.enemy.y,h.enemy.stats.color,this.missionTime);
        h.wreck.setVisible(true);h.enemy.setVisible(false).setActive(false);(h.enemy.body as Phaser.Physics.Arcade.Body).enable=false;
        this.mineExplosionVfx.emit(h.wreck.x,h.wreck.y,52,EXPLOSION,this.time.now,false);
        this.coreAudio.playSfx('enemyDeath');
      }
      if(h.enemy.active)h.enemy.setPosition(this.hull.x+h.dx,this.hull.y+h.dy);
    }
    if(!this.bossOpen&&coreExposed(this.aliveWeapons)){
      this.bossOpen=true;this.announce('CORE EXPOSED','REACTOR ARMOR OPEN // FINISH THE DREADNOUGHT');this.clearThreats();
      this.nextCoreVolley=this.missionTime+1400;
    }
    this.coreDoors.forEach((door,i)=>door.setPosition(this.hull!.x+(i?1:-1)*(this.bossOpen?66:22),this.hull!.y));
    if(this.core.hp<=0){
      this.destructionAt=this.missionTime;this.core.setActive(false).setVisible(false);
      this.clearThreats();this.retireFlights();this.announce('REACTOR FAILURE','DREADNOUGHT BREAKING APART');return;
    }
    if(this.bossOpen&&this.missionTime>=this.nextCoreVolley){
      this.nextCoreVolley=this.missionTime+2200/Math.min(1.3,this.difficulty.pressure);
      const aim=Math.atan2(this.player.y-this.core.y,this.player.x-this.core.x);
      for(let j=-2;j<=2;j++)this.fireSkyShot('plasma',this.core,aim+j*.22,230,
        BOSS_BALANCE.artillery.projectileDamage*this.difficulty.bossDamage);
    }
    for(const cue of this.scheduler.next(this.missionTime,this.aliveWeapons,this.difficulty.pressure))
      if(this.bossCues.length<4)this.bossCues.push({family:cue.family,at:this.missionTime+cue.delayMs});
    for(let i=this.bossCues.length-1;i>=0;i--)if(this.missionTime>=this.bossCues[i].at) {
      this.castBossFamily(this.bossCues[i].family);this.bossCues.splice(i,1);
    }
    for(let i=this.bossBursts.length-1;i>=0;i--){
      const burst=this.bossBursts[i];
      if(!burst.owner.active||burst.owner.hp<=0){this.bossBursts.splice(i,1);continue;}
      if(this.missionTime<burst.at)continue;
      this.fireSkyShot(burst.kind??'kinetic',burst.owner,burst.angle,burst.kind==='shell'?195:385,burst.damage);
      burst.angle+=burst.step;burst.at=this.missionTime+(burst.kind==='shell'?420:170);if(--burst.remaining<=0)this.bossBursts.splice(i,1);
    }
  }
  private castBossFamily(attack:DreadnoughtAttack):void {
    if(attack==='escorts') {
      const role=this.reinforcementPlan[this.reinforcementIndex++%this.reinforcementPlan.length];
      if(role==='zeppelin'&&!this.canSpawnAirship())return;
      if(role==='aa') {
        for(const x of [.12,.88])if(this.flights.size<this.difficulty.activeCap)this.spawnAircraft('aa',this.pickupBounds.w*x,120);
      }else this.spawnFormation(role,role==='interceptor'?'corkscrew':'split',role==='zeppelin'?1:Math.min(4,this.difficulty.formationCount),this.reinforcementIndex%2===0);
      return;
    }
    for(const id of attackWeapons(attack,this.aliveWeapons)) {
      const hardpoint=this.hardpoints.find(h=>h.id===id)!,e=hardpoint.enemy;
      if(!e.active||e.hp<=0)continue;
      const aim=Math.atan2(this.player.y-e.y,this.player.x-e.x),damage=BOSS_BALANCE.artillery.projectileDamage*this.difficulty.bossDamage;
      if(attack==='artillery') {
        this.scheduleStrike(this.player.x,this.player.y,BOSS_BALANCE.artillery.superRadius,
          BOSS_BALANCE.artillery.superDamage*this.difficulty.bossDamage,e);hardpoint.fired++;
      }else if(attack==='missile') {
        this.fireSkyShot('missile',e,aim,220,damage);
      }else if(attack==='broadside') {
        for(let j=-2;j<=2;j++)this.fireSkyShot(id.endsWith('left')?'plasma':'flak',e,aim+j*.24,210,damage);
      }else if(this.bossBursts.length<8) {
        const heavy=id==='cannon-left';
        this.bossBursts.push({owner:e,remaining:heavy?3:7,at:this.missionTime+400,angle:aim-(heavy?.12:.24),
          step:heavy?.12:.08,damage,kind:heavy?'shell':'kinetic'});
        this.muzzleFlashVfx.emit(e.x,e.y+26,aim,0xffb46b,this.time.now,1.2);
      }
    }
  }

  /** Readable DEV evidence; all values originate in the captured Arena context. */
  getScalingDiagnostics() {
    return {mode:this.difficulty.mode,entryRound:this.session.round,protocol:this.session.protocol,
      difficultyPosition:this.difficulty.difficultyPosition,entryCurve:this.difficulty.entryCurve,
      enemyScaling:{health:this.difficulty.health,damage:this.difficulty.damage,speed:this.difficulty.speed},
      bossBenchmark:this.difficulty.bossBenchmark,hardpointHealth:this.difficulty.bossHealth,coreHealth:2*this.difficulty.bossHealth,
      bossDamageMultiplier:this.difficulty.bossDamage,reinforcements:this.reinforcementPlan,
      weapons:this.hardpoints.map(h=>({id:h.id,hp:h.enemy.hp,maxHp:h.enemy.stats.hp,fired:h.fired})),
      activeShots:this.skyShots.size,seekers:this.seekers.size,destruction:this.mechanicalDestruction.stats()};
  }
  protected override updateDevPerformanceOverlay(now:number):void {
    if(!this.devPerformanceOverlay?.visible||now<this.nextDevPerformanceOverlayAt)return;
    this.nextDevPerformanceOverlayAt=now+500;
    const d=this.difficulty,p=this.performanceProfiler?.snapshot();
    this.devPerformanceOverlay.setText(`SKYBREACH (F6) // ${d.mode.toUpperCase()} ${this.session.round}\n`
      + `Enemy HP x${d.health.toFixed(3)} DMG x${d.damage.toFixed(3)} SPEED x${d.speed.toFixed(3)}\n`
      + `Arena Boss ${d.bossBenchmark.round} / ${d.bossBenchmark.protocol}: ${d.bossHealth} HP\n`
      + `Hardpoint ${d.bossHealth} each / Core ${d.bossHealth*2}\n`
      + `Enemy ${this.flights.size}/${d.activeCap} Shot ${this.skyShots.size}/160 Seeker ${this.seekers.size}/12\n`
      + `Frame ${p?.frameTime.averageMs.toFixed(2)??'-'}ms / update ${p?.updateWork.averageMs.toFixed(2)??'-'}ms\n`
      + `Render ${p?.renderWork.averageMs.toFixed(2)??'-'}ms / damage stays at entry round`);
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
    this.hull!.setVisible(false);for(const h of this.hardpoints){h.wreck.setVisible(false);h.smoke.setVisible(false);h.power.setVisible(false);}for(const d of this.coreDoors)d.setVisible(false);
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
    this.replenishResourcePickups();
  }

  protected override createSupportPickups(): void {
    this.replenishResourcePickups();
  }

  protected override createGameplayPickup(type: PickupType, x: number, y: number): Phaser.GameObjects.Container {
    const root = super.createGameplayPickup(type, x, y);
    // Flight supplies scroll with the world instead of bouncing off Arena bounds.
    if (type === 'health' || type === 'energy') this.pickupMotion.delete(root);
    return root;
  }

  protected override updatePickups(now: number, dt: number): void {
    if (this.returning) return;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      if (pickup.kind !== 'health' && pickup.kind !== 'energy') continue;
      pickup.root.y += Math.max(0, dt) * 49;
      if (pickup.root.y <= this.pickupBounds.y + this.pickupBounds.h + 32) continue;
      pickup.root.destroy(true);
      this.pickups.splice(i, 1);
    }
    super.updatePickups(now, dt);
    this.replenishResourcePickups();
  }

  private replenishResourcePickups(): void {
    if (this.returning) return;
    for (const [typeIndex, kind] of (['health', 'energy'] as const).entries()) {
      let count = 0;
      // Enemy drops count toward supply too; keep the total bounded during long runs.
      for (let i = 0; i < this.pickups.length;) {
        const pickup = this.pickups[i];
        if (pickup.kind !== kind) { i++; continue; }
        if (pickup.root.active && count < 2) { count++; i++; continue; }
        pickup.root.destroy(true);
        this.pickups.splice(i, 1);
      }
      while (count < 2) {
        const x = this.pickupBounds.x + this.pickupBounds.w * (0.16 + typeIndex * 0.4 + Math.random() * 0.28);
        const y = this.pickupBounds.y + 190 + count * 100;
        this.pickups.push({ kind, root: this.createGameplayPickup(kind, x, y),
          expiresAt: Number.POSITIVE_INFINITY, source: 'enemy' });
        count++;
      }
    }
  }
  private retireFlights():void {
    for(const [enemy,f]of this.flights){f.warning.destroy();for(const d of f.decorations)d.destroy();enemy.destroy();const i=this.enemies.indexOf(enemy);if(i>=0)this.enemies.splice(i,1);}
    this.flights.clear();
  }
  private clearThreats():void {
    for(const strike of this.strikes)strike.marker.destroy(true);this.strikes.length=0;this.bossBursts.length=0;this.bossCues.length=0;
    for(let i=this.projectiles.length-1;i>=0;i--)if(this.projectiles[i].owner==='enemy')this.retireProjectile(this.projectiles[i],i);
  }
  protected override cleanup():void {
    // Phaser has already destroyed scene-owned render objects and Arcade bodies.
    this.mechanicalDestruction?.discardReferences();
    this.flights.clear();this.escortArt.clear();this.hardpoints.length=0;this.aliveWeapons.clear();this.strikes.length=0;
    this.coreDoors.length=0;this.hull=null;this.core=null;this.bossBursts.length=0;
    this.flightTargets.length=0;this.supremeEffects=null;
    this.seekers.clear();this.skyShots.clear();this.bossCues.length=0;
    this.input.keyboard?.off('keydown-F6',this.toggleDevPerformanceOverlay,this);
    this.events.off(Phaser.Scenes.Events.PRE_RENDER,this.onDevPreRender,this);
    this.events.off(Phaser.Scenes.Events.RENDER,this.onDevRender,this);
    this.events.off(Phaser.Scenes.Events.PRE_UPDATE,this.onDevPreUpdate,this);
    this.events.off(Phaser.Scenes.Events.UPDATE,this.onDevPhysicsUpdateComplete,this);
    super.cleanup();
  }
}
