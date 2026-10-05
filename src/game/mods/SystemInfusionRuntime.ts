import { SYSTEM_INFUSION_TUNING as T, SYSTEM_INFUSION_BY_ID } from './SystemInfusions.ts';
import type { SystemInfusionId } from './types.ts';

export interface InfusionPoint { x: number; y: number }
export interface InfusionDevice { sprite: InfusionPoint & { active: boolean }; }
export interface InfusionTurret extends InfusionDevice { hp: number; range: number; }
export interface InfusionMine extends InfusionDevice {
  armed: boolean; detonateAt: number; armAt: number; landedAt: number;
  beginDetonation(now: number, delay: number): void;
}
export interface InfusionFence extends InfusionDevice {
  x1: number; y1: number; x2: number; y2: number; hp: number; expiresAt: number;
  dps: number; slowFactor: number;
  destroy(): void;
}
export interface InfusionTarget extends InfusionPoint { active: boolean; isDead?(): boolean; isDefeated?: boolean }
export interface InfusionInput { pressed: boolean; held: boolean; released: boolean; prompt: string }
export interface InfusionPorts {
  has(id: SystemInfusionId): boolean;
  player: InfusionPoint;
  turrets(): readonly InfusionTurret[];
  mines(): readonly InfusionMine[];
  fences(): readonly InfusionFence[];
  targetAt(point: InfusionPoint, radius: number): InfusionTarget | null;
  validLanding(point: InfusionPoint): boolean;
  validMine(point: InfusionPoint, mine: InfusionMine): boolean;
  clearSegment(a: InfusionPoint, b: InfusionPoint): boolean;
  teleport(point: InfusionPoint): void;
  moveMine(mine: InfusionMine, point: InfusionPoint): void;
  armMine(mine: InfusionMine): void;
  createLink(a: InfusionPoint, b: InfusionPoint, first: InfusionFence, second: InfusionFence): InfusionFence;
  ascend(turrets: readonly InfusionTurret[], point: InfusionPoint, until: number): boolean;
  boostActive(now: number): boolean;
  drainBoost(amount: number): boolean;
  hazardAt(point: InfusionPoint, now: number): InfusionPoint | null;
  hijack(until: number): void;
  feedback(message: string, point?: InfusionPoint, success?: boolean): void;
}
interface FenceNode extends InfusionPoint { fence: InfusionFence; end: number }
interface GridLink { a: FenceNode; b: FenceNode; fence: InfusionFence }
interface Action { id: SystemInfusionId; target: object; point: InfusionPoint; run(now: number): boolean }
const distance = (a: InfusionPoint, b: InfusionPoint): number => Math.hypot(a.x-b.x,a.y-b.y);
export const liveInfusionTarget = (target: InfusionTarget | null): target is InfusionTarget =>
  !!target?.active && !target.isDefeated && !target.isDead?.();

/** Encounter-owned interaction arbiter and bounded deployable state. No input listeners. */
export class SystemInfusionRuntime {
  private cooldowns = new Map<SystemInfusionId, number>();
  private relocationCooldown = new WeakMap<InfusionMine, number>();
  private selectedMine: InfusionMine | null = null;
  private selectedRail: FenceNode | null = null;
  private selectionUntil = 0;
  private nodes: FenceNode[] = [];
  private sources: InfusionFence[] = [];
  private links: GridLink[] = [];
  private combatFences: InfusionFence[] = [];
  private adjacency = new Map<FenceNode, FenceNode[]>();
  private designated: InfusionTarget | null = null;
  private designationUntil = 0;
  private cascadeVisited = new WeakSet<InfusionMine>();
  private cascadeQueued = new Set<InfusionMine>();
  private cascadeCount = 0;
  private cascadeNext = 0;
  private powered = new Set<InfusionDevice>();
  private powerScanAt = 0;
  private scanAt = 0;
  private actions: Action[] = [];
  private heldAction: Action[] | null = null;
  private holdStarted = 0;
  private consumedHold = false;
  private railPath: InfusionPoint[] = [];
  private railAt = 0;
  private gridEnabled = false;
  private hint = '';
  private readonly ports: InfusionPorts;
  constructor(ports: InfusionPorts) { this.ports = ports; }

  private live(device: InfusionDevice): boolean { return device.sprite.active; }
  private ready(id: SystemInfusionId, now: number): boolean { return now >= (this.cooldowns.get(id) ?? 0); }
  private cooldown(id: SystemInfusionId, now: number, duration: number): void { this.cooldowns.set(id,now+duration); }
  private near<T extends InfusionDevice>(devices: readonly T[], aim: InfusionPoint, valid: (device:T)=>boolean): T | null {
    let best:T|null=null, closest:number=T.targetRadius;
    for(const device of devices) { const d=distance(device.sprite,aim);if(d<closest && this.live(device)&&valid(device)){best=device;closest=d;} }
    return best;
  }
  safeBeside(point: InfusionPoint): InfusionPoint | null {
    for (const radius of [T.relay.landingRadius, T.relay.landingRadius+24]) for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6, candidate={x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius};
      if(this.ports.validLanding(candidate))return candidate;
    }
    return null;
  }
  relay(turret: InfusionTurret, now: number): boolean {
    if(!this.ports.has('relay-jump') || !this.ready('relay-jump',now) || !this.ports.turrets().includes(turret)
      || !this.live(turret) || turret.hp<=0 || distance(this.ports.player,turret.sprite)>T.relay.range)return false;
    const landing=this.safeBeside(turret.sprite);if(!landing)return false;
    this.ports.teleport(landing);this.cooldown('relay-jump',now,T.relay.cooldownMs);return true;
  }
  designate(target: InfusionTarget, now:number): boolean {
    if(!this.ports.has('target-designator') || !this.ready('target-designator',now) || !liveInfusionTarget(target))return false;
    this.designated=target;this.designationUntil=now+T.designator.durationMs;
    this.cooldown('target-designator',now,T.designator.cooldownMs);return true;
  }
  priorityTarget(turret: InfusionTurret, now:number): InfusionTarget|null {
    if(!this.ports.has('target-designator') || now>=this.designationUntil || !liveInfusionTarget(this.designated))this.designated=null;
    return this.designated && distance(turret.sprite,this.designated)<=turret.range
      && this.ports.clearSegment(turret.sprite,this.designated) ? this.designated : null;
  }
  get designatedTarget(): InfusionTarget|null { return liveInfusionTarget(this.designated)?this.designated:null; }
  get poweredDevices(): ReadonlySet<InfusionDevice> { return this.powered; }
  isPowered(device:InfusionDevice):boolean { return this.powered.has(device); }
  get fences(): readonly InfusionFence[] { return this.combatFences; }
  get generatedLinks(): readonly GridLink[] { return this.links; }
  get reachableNodes(): readonly InfusionPoint[] { return this.selectedRail ? [...this.reachable(this.selectedRail).keys()] : []; }

  ascend(anchor:InfusionTurret,now:number):boolean {
    if(!this.ports.has('ascension-protocol')||!this.ready('ascension-protocol',now)||!this.ports.turrets().includes(anchor)||anchor.hp<=0||!this.live(anchor))return false;
    const turrets=this.ports.turrets().filter(t=>this.live(t)&&t.hp>0).slice().sort((a,b)=>distance(a.sprite,anchor.sprite)-distance(b.sprite,anchor.sprite)).slice(0,T.ascension.turrets);
    if(turrets.length!==T.ascension.turrets)return false;
    const point=this.safeBeside(anchor.sprite);if(!point||!this.ports.ascend(turrets,point,now+T.ascension.durationMs))return false;
    for(const turret of turrets)turret.hp=0;
    this.cooldown('ascension-protocol',now,T.ascension.cooldownMs);return true;
  }
  detonate(mine:InfusionMine,now:number):boolean {
    if(!this.ports.has('detonator-link') || !this.validMine(mine,now) || mine.detonateAt>0)return false;
    this.ports.armMine(mine);mine.beginDetonation(now,0);return true;
  }
  private validMine(mine:InfusionMine,now:number):boolean { return this.live(mine)&&this.ports.mines().includes(mine)&&now>=mine.landedAt; }
  selectMine(mine:InfusionMine,now:number):boolean {
    if(!this.ports.has('magnetic-redeploy') || !this.validMine(mine,now) || mine.detonateAt>0 || now<(this.relocationCooldown.get(mine)??0))return false;
    this.selectedMine=mine;this.selectionUntil=now+T.redeploy.selectionMs;return true;
  }
  relocate(point:InfusionPoint,now:number):boolean {
    const mine=this.selectedMine;
    if(!mine || !this.validMine(mine,now) || mine.detonateAt>0){this.selectedMine=null;return false;}
    if(distance(mine.sprite,point)>T.redeploy.range || !this.ports.validMine(point,mine))return false;
    this.ports.moveMine(mine,point);this.relocationCooldown.set(mine,now+T.redeploy.cooldownMs);this.selectedMine=null;return true;
  }
  /** Called once by the existing player-mine explosion path, never by hostile mines. */
  onMineDetonated(mine:InfusionMine,now:number):void {
    this.cascadeQueued.delete(mine);
    if(!this.ports.has('cascade'))return;
    if(this.cascadeQueued.size===0 && now>this.cascadeNext+T.cascade.delayMs){this.cascadeCount=0;this.cascadeVisited=new WeakSet();}
    this.cascadeVisited.add(mine);
    for(const neighbor of this.ports.mines()) {
      if(this.cascadeCount>=T.cascade.maxMines)break;
      if(neighbor===mine||!this.validMine(neighbor,now)||neighbor.detonateAt>0||this.cascadeVisited.has(neighbor)||distance(mine.sprite,neighbor.sprite)>T.cascade.range)continue;
      this.cascadeVisited.add(neighbor);this.cascadeQueued.add(neighbor);this.cascadeCount++;
      this.cascadeNext=Math.max(this.cascadeNext,now)+T.cascade.delayMs;
      this.ports.armMine(neighbor);neighbor.beginDetonation(now,this.cascadeNext-now);
    }
  }
  refreshNetwork(now:number):void {
    const sources=this.ports.fences(), enabled=this.ports.has('gridlink');
    const changed=enabled!==this.gridEnabled || sources.length!==this.sources.length || sources.some((f,i)=>f!==this.sources[i]||f.hp<=0||!this.live(f)||now>=f.expiresAt)
      || this.links.some(link=>link.fence.hp<=0||!this.live(link.fence));
    if(!changed)return;
    for(const link of this.links)link.fence.destroy();
    this.links=[];this.nodes=[];this.adjacency.clear();this.selectedRail=null;this.railPath=[];this.gridEnabled=enabled;
    this.sources=sources.filter(f=>this.live(f)&&f.hp>0&&now<f.expiresAt);
    for(const fence of this.sources){
      const a={x:fence.x1,y:fence.y1,fence,end:0},b={x:fence.x2,y:fence.y2,fence,end:1};
      this.nodes.push(a,b);this.adjacency.set(a,[b]);this.adjacency.set(b,[a]);
    }
    if(enabled)for(let i=0;i<this.sources.length;i++)for(let j=i+1;j<this.sources.length;j++){
      if(this.links.length>=T.grid.maxLinks)break;
      let pair:[FenceNode,FenceNode]|null=null,best:number=T.grid.range;
      for(const a of this.nodes.slice(i*2,i*2+2))for(const b of this.nodes.slice(j*2,j*2+2)){
        const d=distance(a,b);if(d>8&&d<best&&this.ports.clearSegment(a,b)){pair=[a,b];best=d;}
      }
      if(!pair)continue;
      const [a,b]=pair, fence=this.ports.createLink(a,b,a.fence,b.fence);
      this.links.push({a,b,fence});this.adjacency.get(a)!.push(b);this.adjacency.get(b)!.push(a);
    }
    this.combatFences=[...this.sources,...this.links.map(link=>link.fence)];
  }
  private reachable(start:FenceNode):Map<FenceNode,FenceNode|null> {
    const parent=new Map<FenceNode,FenceNode|null>([[start,null]]),queue=[start];
    for(let i=0;i<queue.length;i++)for(const next of this.adjacency.get(queue[i])??[])if(!parent.has(next)){parent.set(next,queue[i]);queue.push(next);}
    return parent;
  }
  private rail(node:FenceNode,now:number):boolean {
    if(!this.ready('fence-rail',now)||!this.nodes.includes(node))return false;
    if(!this.selectedRail){if(distance(this.ports.player,node)>T.rail.entryRange)return false;this.selectedRail=node;this.selectionUntil=now+T.rail.selectionMs;return true;}
    if(node===this.selectedRail){this.selectedRail=null;return true;}
    const parent=this.reachable(this.selectedRail);if(!parent.has(node))return false;
    const path:InfusionPoint[]=[];let cursor:FenceNode|null=node;
    while(cursor){path.unshift(cursor);cursor=parent.get(cursor)??null;}
    const landing=this.safeBeside(node);if(!landing)return false;
    path.push(landing);
    // Check both the entry and all network edges before committing transport.
    let previous:InfusionPoint=this.ports.player;
    for(const point of path){if(!this.ports.clearSegment(previous,point))return false;previous=point;}
    this.railPath=[];previous={...this.ports.player};
    for(const point of path){const steps=Math.max(1,Math.ceil(distance(previous,point)/60));for(let i=1;i<=steps;i++)this.railPath.push({x:previous.x+(point.x-previous.x)*i/steps,y:previous.y+(point.y-previous.y)*i/steps});previous=point;}
    if(this.railPath.some(point=>!this.ports.validLanding(point))){this.railPath=[];return false;}
    this.selectedRail=null;this.railAt=now;this.cooldown('fence-rail',now,T.rail.cooldownMs);return true;
  }
  private resolve(aim:InfusionPoint,now:number):Action[] {
    if(this.selectedMine)return [{id:'magnetic-redeploy',target:this.selectedMine,point:aim,run:t=>this.relocate(aim,t)}];
    const actions:Action[]=[];
    const add=(id:SystemInfusionId,target:object,point:InfusionPoint,run:Action['run'])=>{if(this.ports.has(id))actions.push({id,target,point,run});};
    const turret=this.near(this.ports.turrets(),aim,t=>t.hp>0);
    if(turret){add('relay-jump',turret,turret.sprite,t=>this.relay(turret,t));add('ascension-protocol',turret,turret.sprite,t=>this.ascend(turret,t));}
    const mine=this.near(this.ports.mines(),aim,m=>this.validMine(m,now)&&m.detonateAt===0);
    if(mine){add('detonator-link',mine,mine.sprite,t=>this.detonate(mine,t));add('magnetic-redeploy',mine,mine.sprite,t=>this.selectMine(mine,t));}
    const target=this.ports.has('target-designator')?this.ports.targetAt(aim,T.targetRadius):null;
    if(target)add('target-designator',target,target,t=>this.designate(target,t));
    if(this.ports.has('fence-rail'))for(const node of this.nodes)if(distance(node,aim)<T.targetRadius)add('fence-rail',node,node,t=>this.rail(node,t));
    const hazard=this.ports.has('hazard-hijack')?this.ports.hazardAt(aim,now):null;
    if(hazard)add('hazard-hijack',hazard,hazard,t=>{
      if(!this.ready('hazard-hijack',t)||!this.ports.hazardAt(aim,t)||distance(this.ports.player,hazard)>T.hijack.range)return false;
      this.ports.hijack(t+T.hijack.durationMs);this.cooldown('hazard-hijack',t,T.hijack.cooldownMs);return true;
    });
    actions.sort((a,b)=>distance(a.point,aim)-distance(b.point,aim));
    const first=actions[0];return first?actions.filter(a=>a.target===first.target):[];
  }
  private execute(action:Action,now:number):void {
    const ok=action.run(now);this.ports.feedback(ok?SYSTEM_INFUSION_BY_ID.get(action.id)!.name:'Unavailable — check range, cooldown and destination',action.point,ok);
    this.scanAt=0;
  }
  /** Returns true while this arbiter owns interact; planting must not also consume it. */
  update(now:number,dt:number,aim:InfusionPoint,input:InfusionInput,blocked=false):boolean {
    this.refreshNetwork(now);
    if(!liveInfusionTarget(this.designated)||now>=this.designationUntil)this.designated=null;
    for(const mine of this.cascadeQueued)if(!this.live(mine))this.cascadeQueued.delete(mine);
    if(now>=this.selectionUntil){this.selectedMine=null;this.selectedRail=null;}
    if(this.selectedMine&&(!this.live(this.selectedMine)||this.selectedMine.detonateAt>0))this.selectedMine=null;
    if(this.railPath.length && now>=this.railAt){
      const next=this.railPath.shift()!;if(this.ports.validLanding(next))this.ports.teleport(next);else this.railPath=[];
      this.railAt=now+16;
    }
    if(this.ports.has('power-bus')&&this.ports.boostActive(now)){
      if(now>=this.powerScanAt){
        this.powered.clear();this.powerScanAt=now+T.scanMs;
        const devices:InfusionDevice[]=[...this.ports.turrets().filter(t=>t.hp>0),...this.ports.mines().filter(m=>this.validMine(m,now)),...this.sources];
        devices.sort((a,b)=>distance(a.sprite,this.ports.player)-distance(b.sprite,this.ports.player));
        for(const device of devices)if(this.powered.size<T.power.maxDevices&&this.live(device)&&distance(device.sprite,this.ports.player)<=T.power.range)this.powered.add(device);
      }
      for(const device of this.powered)if(!this.live(device)||('hp' in device&&Number(device.hp)<=0)||distance(device.sprite,this.ports.player)>T.power.range)this.powered.delete(device);
      if(!this.ports.drainBoost(this.powered.size*T.power.energyPerDevicePerSecond*dt))this.powered.clear();
      for(const mine of this.ports.mines())if(this.powered.has(mine))this.ports.armMine(mine);
    }else{this.powered.clear();this.powerScanAt=0;}
    if(blocked){this.heldAction=null;this.actions=[];this.hint='';return false;}
    if(now>=this.scanAt||input.pressed||input.released){this.actions=this.resolve(aim,now);this.scanAt=now+T.scanMs;}
    const actions=this.actions, first=actions[0];
    const hold=actions[1]??(first?.id==='ascension-protocol'?first:undefined);
    const label=(action:Action)=>`${SYSTEM_INFUSION_BY_ID.get(action.id)!.name}${this.ready(action.id,now)?'':` (${Math.ceil(((this.cooldowns.get(action.id)??now)-now)/1000)}s)`}`;
    this.hint=this.selectedMine?`${input.prompt}: place mine · 500 range · selection expires in ${Math.ceil((this.selectionUntil-now)/1000)}s`
      :first?`${first.id==='ascension-protocol'?'Hold':'Tap'} ${input.prompt}: ${label(first)}${hold&&hold!==first?` / Hold: ${label(hold)}`:''}`
      :this.selectedRail?'Aim at a connected fence endpoint and interact':'';
    if(input.pressed&&first){this.consumedHold=false;this.heldAction=actions;this.holdStarted=now;if(!hold){this.execute(first,now);this.consumedHold=true;}}
    if(this.heldAction){
      const original=this.heldAction[0], second=this.heldAction[1]??(original.id==='ascension-protocol'?original:undefined);
      if(input.held&&second&&!this.consumedHold&&now-this.holdStarted>=T.holdMs){if(distance(second.point,aim)<T.targetRadius)this.execute(second,now);this.consumedHold=true;}
      if(input.released){if(!this.consumedHold&&original.id!=='ascension-protocol'&&distance(original.point,aim)<T.targetRadius)this.execute(original,now);this.heldAction=null;return true;}
    }
    return !!first||!!this.heldAction||this.railPath.length>0||!!this.selectedRail;
  }
  get contextHint():string { return this.hint; }
  get contextPoint():InfusionPoint|null { return this.actions[0]?.point??null; }
  get placementValid():boolean {
    const point=this.contextPoint;
    return !this.selectedMine || !!point && distance(this.selectedMine.sprite,point)<=T.redeploy.range && this.ports.validMine(point,this.selectedMine);
  }
  reset():void {
    for(const link of this.links)link.fence.destroy();
    this.links=[];this.sources=[];this.nodes=[];this.combatFences=[];this.adjacency.clear();this.powered.clear();
    this.designated=null;this.selectedMine=null;this.selectedRail=null;this.railPath=[];this.cooldowns.clear();
    this.cascadeVisited=new WeakSet();this.cascadeQueued.clear();this.cascadeCount=0;this.cascadeNext=0;
    this.relocationCooldown=new WeakMap();this.heldAction=null;this.actions=[];this.hint='';this.scanAt=0;
    this.powerScanAt=0;
    this.ports.hijack(0);
  }
}
