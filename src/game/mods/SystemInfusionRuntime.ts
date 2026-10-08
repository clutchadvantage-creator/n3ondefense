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
export interface InfusionInput { pressed: boolean; held: boolean; released: boolean; prompt: string; aimDirection?: InfusionPoint | null }
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
  railMove?(point: InfusionPoint): void;
  railState?(active: boolean): void;
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
interface Action { id: SystemInfusionId; target: object; point: InfusionPoint; valid(now: number): boolean; run(now: number): boolean }
export interface InfusionSelection { id: SystemInfusionId; target: object; point: InfusionPoint; radius: number }
interface RailStep { point: InfusionPoint; fence: InfusionFence | null }
const distance = (a: InfusionPoint, b: InfusionPoint): number => Math.hypot(a.x-b.x,a.y-b.y);
export const liveInfusionTarget = (target: InfusionTarget | null): target is InfusionTarget =>
  !!target?.active && !target.isDefeated && !target.isDead?.();

/** Encounter-owned interaction arbiter and bounded deployable state. No input listeners. */
export class SystemInfusionRuntime {
  private cooldowns = new Map<SystemInfusionId, number>();
  private relocationCooldown = new WeakMap<InfusionMine, number>();
  private selectedMine: InfusionMine | null = null;
  private selectionUntil = 0;
  private nodes: FenceNode[] = [];
  private sources: InfusionFence[] = [];
  private links: GridLink[] = [];
  private brokenLinks = new Map<FenceNode, Set<FenceNode>>();
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
  private railPath: RailStep[] = [];
  private railIndex = 0;
  private railLanding: InfusionPoint | null = null;
  private suppressedTarget: object | null = null;
  private consumedSelection: InfusionSelection | null = null;
  private consumedAt = -Infinity;
  private gridEnabled = false;
  private hint = '';
  private aimDirection: InfusionPoint | null | undefined;
  private readonly ports: InfusionPorts;
  constructor(ports: InfusionPorts) { this.ports = ports; }

  private live(device: InfusionDevice): boolean { return device.sprite.active; }
  private ready(id: SystemInfusionId, now: number): boolean { return now >= (this.cooldowns.get(id) ?? 0); }
  private cooldown(id: SystemInfusionId, now: number, duration: number): void { this.cooldowns.set(id,now+duration); }
  private near<T extends InfusionDevice>(devices: readonly T[], aim: InfusionPoint, valid: (device:T)=>boolean): T | null {
    let best:T|null=null, closest:number=T.targetRadius;
    for(const device of devices) { const d=this.aimDistance(device.sprite,aim);if(d<closest && this.live(device)&&valid(device)){best=device;closest=d;} }
    return best;
  }
  private aimDistance(point:InfusionPoint,aim:InfusionPoint):number {
    if(this.aimDirection===null)return Infinity; // Neutral stick retains the selected object.
    if(!this.aimDirection)return distance(point,aim);
    const dx=point.x-this.ports.player.x,dy=point.y-this.ports.player.y,d=Math.hypot(dx,dy);
    const forward=dx*this.aimDirection.x+dy*this.aimDirection.y;
    const side=Math.abs(dx*this.aimDirection.y-dy*this.aimDirection.x);
    return forward>0&&side<=T.targetRadius+d*T.targeting.controllerCone?side/(1+d*T.targeting.controllerCone/T.targetRadius):Infinity;
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
      || !this.live(turret) || turret.hp<=0)return false;
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
  get railActive(): boolean { return this.railPath.length > 0; }
  get railRoute(): readonly InfusionPoint[] { return this.railPath.map(step=>step.point); }

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
    const sources=this.ports.fences().filter(f=>this.fenceLive(f,now)), enabled=this.ports.has('gridlink');
    const sourcesChanged=sources.length!==this.sources.length||sources.some((f,i)=>f!==this.sources[i]);
    const changed=enabled!==this.gridEnabled || sourcesChanged || this.links.some(link=>!this.fenceLive(link.fence,now));
    if(!changed)return;
    const oldNodes=this.nodes, oldLinks=this.links;
    if(sourcesChanged||enabled!==this.gridEnabled)this.brokenLinks.clear();
    this.nodes=[];this.links=[];this.adjacency.clear();this.gridEnabled=enabled;
    this.sources=sources;
    for(const fence of this.sources){
      const a=oldNodes.find(n=>n.fence===fence&&n.end===0)??{x:fence.x1,y:fence.y1,fence,end:0};
      const b=oldNodes.find(n=>n.fence===fence&&n.end===1)??{x:fence.x2,y:fence.y2,fence,end:1};
      this.nodes.push(a,b);this.adjacency.set(a,[b]);this.adjacency.set(b,[a]);
    }
    if(enabled)for(let i=0;i<this.sources.length;i++)for(let j=i+1;j<this.sources.length;j++){
      if(this.links.length>=T.grid.maxLinks)break;
      let pair:[FenceNode,FenceNode]|null=null,best:number=T.grid.range;
      for(const a of this.nodes.slice(i*2,i*2+2))for(const b of this.nodes.slice(j*2,j*2+2)){
        const d=distance(a,b);if(d>8&&d<best&&this.ports.clearSegment(a,b)){pair=[a,b];best=d;}
      }
      if(!pair)continue;
      const [a,b]=pair, old=oldLinks.find(link=>link.a===a&&link.b===b);
      // A destroyed connection stays broken until a source is placed/removed.
      if(old&&!this.fenceLive(old.fence,now)&&!sourcesChanged){
        if(!this.brokenLinks.has(a))this.brokenLinks.set(a,new Set());
        this.brokenLinks.get(a)!.add(b);
      }
      if(this.brokenLinks.get(a)?.has(b))continue;
      const fence=old&&this.fenceLive(old.fence,now)?old.fence:this.ports.createLink(a,b,a.fence,b.fence);
      this.links.push({a,b,fence});this.adjacency.get(a)!.push(b);this.adjacency.get(b)!.push(a);
    }
    // Coincident placed endpoints are real junctions, even without a generated link.
    for(let i=0;i<this.nodes.length;i++)for(let j=i+1;j<this.nodes.length;j++)if(distance(this.nodes[i],this.nodes[j])<=8){
      this.adjacency.get(this.nodes[i])!.push(this.nodes[j]);this.adjacency.get(this.nodes[j])!.push(this.nodes[i]);
    }
    for(const link of oldLinks)if(!this.links.some(next=>next.fence===link.fence)&&this.live(link.fence))link.fence.destroy();
    this.combatFences=[...this.sources,...this.links.map(link=>link.fence)];
  }
  private reachable(start:FenceNode):Map<FenceNode,FenceNode|null> {
    const parent=new Map<FenceNode,FenceNode|null>([[start,null]]),queue=[start];
    for(let i=0;i<queue.length;i++)for(const next of this.adjacency.get(queue[i])??[])if(!parent.has(next)){parent.set(next,queue[i]);queue.push(next);}
    return parent;
  }
  private rail(node:FenceNode,now:number):boolean {
    if(!this.ports.has('fence-rail')||this.railActive||!this.ready('fence-rail',now)||!this.nodes.includes(node)
      ||distance(this.ports.player,node)>T.rail.entryRange||!this.ports.clearSegment(this.ports.player,node))return false;
    const parent=this.reachable(node);
    // Stable breadth-first connection order: prefer the furthest terminal;
    // a closed loop ends at the last reachable node without repeating edges.
    const ordered=[...parent.keys()], terminals=ordered.filter(n=>n!==node&&(this.adjacency.get(n)?.length??0)===1);
    const end=terminals.at(-1)??ordered.at(-1);if(!end||end===node)return false;
    const path:FenceNode[]=[];let cursor:FenceNode|null=end;
    while(cursor){path.unshift(cursor);cursor=parent.get(cursor)??null;}
    const landing=this.safeBeside(end);if(!landing||!this.ports.clearSegment(end,landing))return false;
    const steps:RailStep[]=[];
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];if(!this.ports.clearSegment(a,b))return false;
      const fence=a.fence===b.fence?a.fence:this.links.find(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a))?.fence??null;
      if(!fence&&distance(a,b)>8)return false;
      steps.push({point:{x:b.x,y:b.y},fence});
    }
    this.railPath=steps;this.railIndex=0;this.railLanding=landing;this.ports.railState?.(true);
    (this.ports.railMove??this.ports.teleport)(node);
    this.cooldown('fence-rail',now,T.rail.cooldownMs);return true;
  }
  private fenceLive(fence:InfusionFence,now:number):boolean { return this.live(fence)&&fence.hp>0&&now<fence.expiresAt; }
  cancelRail():void {
    const active=this.railActive;this.railPath=[];this.railIndex=0;this.railLanding=null;
    if(active)this.ports.railState?.(false);
  }
  private updateRail(now:number,dt:number):void {
    if(!this.railActive)return;
    if(!this.ports.has('fence-rail')){this.cancelRail();return;}
    let budget=T.rail.speed*Math.max(0,dt);
    while(this.railIndex<this.railPath.length){
      const step=this.railPath[this.railIndex];
      if(step.fence&&(!this.fenceLive(step.fence,now)||!this.combatFences.includes(step.fence))){this.cancelRail();return;}
      const p=this.ports.player,d=distance(p,step.point);
      if(d>budget){
        (this.ports.railMove??this.ports.teleport)({x:p.x+(step.point.x-p.x)*budget/d,y:p.y+(step.point.y-p.y)*budget/d});return;
      }
      (this.ports.railMove??this.ports.teleport)(step.point);budget-=d;this.railIndex++;
    }
    const landing=this.railLanding;
    if(landing&&this.ports.validLanding(landing))(this.ports.railMove??this.ports.teleport)(landing);
    this.cancelRail();
  }
  private resolve(aim:InfusionPoint,now:number):Action[] {
    if(this.selectedMine)return [{id:'magnetic-redeploy',target:this.selectedMine,point:aim,
      valid:t=>!!this.selectedMine&&this.ports.has('magnetic-redeploy')&&this.validMine(this.selectedMine,t)&&this.selectedMine.detonateAt===0,
      run:t=>this.relocate(aim,t)}];
    const actions:Action[]=[];
    const add=(id:SystemInfusionId,target:object,point:InfusionPoint,valid:Action['valid'],run:Action['run'])=>{
      const available=(t:number)=>this.ports.has(id)&&this.ready(id,t)&&valid(t);
      if(available(now))actions.push({id,target,point,valid:available,run});
    };
    const turret=this.near(this.ports.turrets(),aim,t=>t.hp>0);
    if(turret){
      const live=()=>this.live(turret)&&turret.hp>0&&this.ports.turrets().includes(turret);
      add('relay-jump',turret,turret.sprite,live,t=>this.relay(turret,t));
      add('ascension-protocol',turret,turret.sprite,()=>live()&&this.ports.turrets().filter(t=>this.live(t)&&t.hp>0).length>=T.ascension.turrets,t=>this.ascend(turret,t));
    }
    const mine=this.near(this.ports.mines(),aim,m=>this.validMine(m,now)&&m.detonateAt===0);
    if(mine){const live=(t:number)=>this.validMine(mine,t)&&mine.detonateAt===0;
      add('detonator-link',mine,mine.sprite,live,t=>this.detonate(mine,t));
      add('magnetic-redeploy',mine,mine.sprite,t=>live(t)&&t>=(this.relocationCooldown.get(mine)??0),t=>this.selectMine(mine,t));}
    const target=this.ports.has('target-designator')?this.ports.targetAt(aim,T.targetRadius):null;
    if(target)add('target-designator',target,target,()=>liveInfusionTarget(target),t=>this.designate(target,t));
    if(this.ports.has('fence-rail'))for(const node of this.nodes)if(this.aimDistance(node,aim)<T.targetRadius)
      add('fence-rail',node,node,t=>this.nodes.includes(node)&&this.fenceLive(node.fence,t)&&distance(this.ports.player,node)<=T.rail.entryRange,t=>this.rail(node,t));
    const hazard=this.ports.has('hazard-hijack')?this.ports.hazardAt(aim,now):null;
    if(hazard)add('hazard-hijack',hazard,hazard,t=>!!this.ports.hazardAt(hazard,t)&&distance(this.ports.player,hazard)<=T.hijack.range,t=>{
      if(!this.ready('hazard-hijack',t)||!this.ports.hazardAt(hazard,t)||distance(this.ports.player,hazard)>T.hijack.range)return false;
      this.ports.hijack(t+T.hijack.durationMs);this.cooldown('hazard-hijack',t,T.hijack.cooldownMs);return true;
    });
    actions.sort((a,b)=>this.aimDistance(a.point,aim)-this.aimDistance(b.point,aim));
    const first=actions[0];return first?actions.filter(a=>a.target===first.target):[];
  }
  private execute(action:Action,now:number):void {
    const ok=action.valid(now)&&action.run(now);
    if(ok){this.consumedSelection={id:action.id,target:action.target,point:{x:action.point.x,y:action.point.y},radius:this.selectionRadius(action)};
      this.consumedAt=now;this.suppressedTarget=action.target;this.actions=[];this.hint='';}
    this.ports.feedback(ok?SYSTEM_INFUSION_BY_ID.get(action.id)!.name:'Unavailable — check range, cooldown and destination',action.point,ok);
    this.scanAt=0;
  }
  /** Returns true for an available or active Infusion interaction; selection alone must not block planting. */
  update(now:number,dt:number,aim:InfusionPoint,input:InfusionInput,blocked=false):boolean {
    this.refreshNetwork(now);
    if(!liveInfusionTarget(this.designated)||now>=this.designationUntil)this.designated=null;
    for(const mine of this.cascadeQueued)if(!this.live(mine))this.cascadeQueued.delete(mine);
    if(now>=this.selectionUntil)this.selectedMine=null;
    if(this.selectedMine&&(!this.live(this.selectedMine)||this.selectedMine.detonateAt>0))this.selectedMine=null;
    if(blocked)this.cancelRail();else this.updateRail(now,dt);
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
    if(blocked||this.railActive){this.heldAction=null;this.actions=[];this.hint='';return this.railActive;}
    const previous=this.actions[0];
    this.actions=this.actions.filter(action=>action.valid(now));
    if(this.heldAction?.some(action=>!action.valid(now)))this.heldAction=null;
    this.aimDirection=input.aimDirection;
    if(now>=this.scanAt||input.pressed||input.released||this.selectedMine||(previous&&!this.actions.length)){
      const acquired=this.resolve(aim,now);
      if(acquired[0]?.target!==this.suppressedTarget)this.suppressedTarget=null;
      if(acquired.length&&acquired[0].target!==this.suppressedTarget){
        if(this.heldAction&&this.heldAction[0].target!==acquired[0].target)this.heldAction=null;
        this.actions=acquired;
      }
      else if(previous?.id==='relay-jump'&&!this.actions.length&&!previous.valid(now)){
        const replacement=this.ports.turrets().find(t=>this.live(t)&&t.hp>0&&t!==previous.target);
        if(replacement){const direction=this.aimDirection;this.aimDirection=undefined;
          this.actions=this.resolve(replacement.sprite,now);this.aimDirection=direction;}
      }
      this.scanAt=now+T.scanMs;
    }
    const actions=this.actions, first=actions[0];
    const hold=actions[1]??(first?.id==='ascension-protocol'?first:undefined);
    const label=(action:Action)=>`${SYSTEM_INFUSION_BY_ID.get(action.id)!.name}${this.ready(action.id,now)?'':` (${Math.ceil(((this.cooldowns.get(action.id)??now)-now)/1000)}s)`}`;
    this.hint=this.selectedMine?`${input.prompt}: place mine · 500 range · selection expires in ${Math.ceil((this.selectionUntil-now)/1000)}s`
      :first?`${first.id==='ascension-protocol'?'Hold':'Tap'} ${input.prompt}: ${label(first)}${hold&&hold!==first?` / Hold: ${label(hold)}`:''}`
      :'';
    if(input.pressed&&first){this.consumedHold=false;this.heldAction=actions;this.holdStarted=now;if(!hold){this.execute(first,now);this.consumedHold=true;}}
    if(this.heldAction){
      const original=this.heldAction[0], second=this.heldAction[1]??(original.id==='ascension-protocol'?original:undefined);
      if(input.held&&second&&!this.consumedHold&&now-this.holdStarted>=T.holdMs){this.execute(second,now);this.consumedHold=true;}
      if(input.released){if(!this.consumedHold&&original.id!=='ascension-protocol')this.execute(original,now);this.heldAction=null;return true;}
    }
    return !!first||!!this.heldAction||this.railActive;
  }
  private selectionRadius(action:Action):number { return action.id==='fence-rail'?34:action.id==='target-designator'?48:42; }
  get selection():InfusionSelection|null { const action=this.actions[0];return action?{id:action.id,target:action.target,point:this.selectedMine?.sprite??action.point,radius:this.selectionRadius(action)}:null; }
  get placementPoint():InfusionPoint|null { return this.selectedMine?this.contextPoint:null; }
  get activation():{selection:InfusionSelection;at:number}|null { return this.consumedSelection?{selection:this.consumedSelection,at:this.consumedAt}:null; }
  get contextHint():string { return this.hint; }
  get contextPoint():InfusionPoint|null { return this.actions[0]?.point??null; }
  get placementValid():boolean {
    const point=this.contextPoint;
    return !this.selectedMine || !!point && distance(this.selectedMine.sprite,point)<=T.redeploy.range && this.ports.validMine(point,this.selectedMine);
  }
  reset():void {
    for(const link of this.links)link.fence.destroy();
    this.links=[];this.sources=[];this.nodes=[];this.combatFences=[];this.adjacency.clear();this.powered.clear();
    this.brokenLinks.clear();
    this.cancelRail();this.designated=null;this.selectedMine=null;this.cooldowns.clear();
    this.cascadeVisited=new WeakSet();this.cascadeQueued.clear();this.cascadeCount=0;this.cascadeNext=0;
    this.relocationCooldown=new WeakMap();this.heldAction=null;this.actions=[];this.hint='';this.scanAt=0;
    this.powerScanAt=0;this.suppressedTarget=null;this.consumedSelection=null;
    this.ports.hijack(0);
  }
}
