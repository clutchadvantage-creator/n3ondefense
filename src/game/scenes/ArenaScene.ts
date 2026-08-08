import Phaser from 'phaser';
import { starterWeapon } from '../../data/weapons';
import { getUpgradeLevel } from '../../data/upgrades';
import { COLORS, WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { OBJECTIVE_CONFIG } from '../config/gameplay';
import { ABILITY_BALANCE, ENEMY_BALANCE, OBJECTIVE_BALANCE, PICKUP_BALANCE, PLAYER_BALANCE, REWARD_BALANCE, WEAPON_BALANCE, getDefuseAssigneeCount, getDifficultyCurve, getSpawnCadenceMultiplier, getSpawnProfile } from '../config/balance';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { Mine } from '../abilities/Mine';
import { Turret } from '../abilities/Turret';
import { Fence } from '../abilities/Fence';
import { Player } from '../entities/Player';
import { baseEnemyStats, Enemy } from '../enemies/Enemy';
import { BombSiteState, RoundState, type AbilityType, type ArenaLayout, type ArenaReward, type ArenaSessionState, type ArenaTemplate, type BombSiteRuntime, type EnemyType, type PickupType, type RectSpec, type RoundFinishedPayload } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { BombSiteManager } from '../systems/BombSiteManager';
import { GameStateMachine } from '../systems/GameStateMachine';
import { GridPathfinder } from '../systems/GridPathfinder';
import { Hud } from '../systems/Hud';
import type { HudPayload } from '../systems/Hud';
import { RoundManager } from '../systems/RoundManager';
import { SaveSystem } from '../systems/SaveSystem';
import { ArenaGenerator } from '../systems/ArenaGenerator';
import { LaserSecuritySystem } from '../systems/LaserSecuritySystem';
import { startArenaLoad } from '../utils/runFlow';
import { createButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { GameplayPointerLock } from '../input/GameplayPointerLock';
import { ABILITY_ACTIONS, compactBindingLabel, type AbilityAction, type AbilityBindings } from '../config/controls';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import { isGuaranteedMilestone, rollModDrop } from '../mods/ModDropService.ts';
import type { ModDropSource, ModRewardRecord, ModSlot, RunProtocolId } from '../mods/types.ts';
import { magneticResistanceForEnemy, prioritizeTurretTargets, splitCurrentSecondaryDamage } from '../mods/ModRules.ts';
import { createModCardView } from '../mods/ModCardView.ts';

interface Projectile {
  sprite: Phaser.Physics.Arcade.Image;
  damage: number;
  from: 'player' | 'enemy' | 'turret';
  lifeMs: number;
  trailColor: number;
  splitCurrentEligible?: boolean;
}

interface Pickup {
  type: PickupType;
  sprite: Phaser.GameObjects.Container;
  expiresAt: number;
}

interface DeathMine {
  sprite: Phaser.GameObjects.Arc;
  detonateAt: number;
  damage: number;
  radius: number;
}

interface NavState {
  path: Phaser.Math.Vector2[];
  waypointIndex: number;
  nextRepathAt: number;
  targetKey: string;
  lastSampleX: number;
  lastSampleY: number;
  lastSampleAt: number;
  stuckTicks: number;
}

interface PatrolPoint {
  x: number;
  y: number;
}

interface TurretTargetDecision {
  turret: Turret | null;
  reconsiderAt: number;
}

interface PauseMenuElements {
  backdrop: Phaser.GameObjects.Rectangle;
  panel: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
  buttons: Phaser.GameObjects.Container[];
}

export class ArenaScene extends Phaser.Scene {
  private readonly state = new GameStateMachine(RoundState.PrePlant);
  private readonly audio = AudioManager.get();

  private player!: Player;
  private hud!: Hud;
  private bannerText!: Phaser.GameObjects.Text;

  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private wallRects: RectSpec[] = [];

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private fences: Fence[] = [];
  private turrets: Turret[] = [];
  private mines: Mine[] = [];
  private deathMines: DeathMine[] = [];
  private readonly defuseAssignees = new Set<Enemy>();
  private defuserMarkedUntil = new WeakMap<Enemy, number>();
  private modRuntime!: ModRuntime;
  private protocol: RunProtocolId = 'normal';
  private modsEarned: ModRewardRecord[] = [];
  private modDropSequence = 0;
  private runStartedAt = Date.now();
  private readonly enemyTurretTargets = new WeakMap<Enemy, TurretTargetDecision>();

  private roundManager!: RoundManager;
  private layout!: ArenaLayout;
  private pathfinder!: GridPathfinder;
  private bombSites!: BombSiteManager;
  private laserSecurity: LaserSecuritySystem | null = null;

  private roundCredits = 0;
  private roundCoreTokens = 0;
  private totalCreditsCollected = 0;

  private activePlantingSite: BombSiteRuntime | null = null;
  private plantingProgressMs = 0;
  private lastPlayerShotMs = 0;
  private pointerDown = false;
  private pointerLock: GameplayPointerLock | null = null;
  private abilityBindings!: AbilityBindings;
  private readonly pressedAbilityActions = new Set<AbilityAction>();

  private nextSpawnAt = 0;
  private nextArenaHealthDropAt = 0;
  private lastSpecialSpawnAt = -99_999;
  private lastDefuserSpawnAt = -99_999;

  private pauseMenu: PauseMenuElements | null = null;
  private equippedModsViewer: Phaser.GameObjects.Container | null = null;
  private siteActionText!: Phaser.GameObjects.Text;
  private crosshair!: Phaser.GameObjects.Graphics;
  private balanceTelemetry: Phaser.GameObjects.Text | null = null;

  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    one: Phaser.Input.Keyboard.Key;
    two: Phaser.Input.Keyboard.Key;
    three: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    f8: Phaser.Input.Keyboard.Key;
    f7: Phaser.Input.Keyboard.Key;
  };

  private selectedAbility: AbilityType = 'fence';
  private abilityCooldownUntil: Record<AbilityType, number> = { fence: 0, turret: 0, mine: 0 };
  private shieldCooldownUntil = 0;
  private shieldActiveUntil = 0;
  private shieldOrb: Phaser.GameObjects.Arc | null = null;
  private shieldPulseTween: Phaser.Tweens.Tween | null = null;
  private readonly hudBuffs: string[] = [];
  private readonly hudPayload: HudPayload = {
    hp: 0,
    maxHp: 1,
    energy: 0,
    maxEnergy: 1,
    level: 1,
    enemies: 0,
    credits: 0,
    phase: 'PRE-PLANT',
    objective: 'NO ACTIVE CHARGE',
    defuseAlert: false,
    bombUrgent: false,
    bombActive: false,
    bombProgress: 0,
    buffs: this.hudBuffs,
    abilities: [
      { id: 'fence', keybind: 'Q', icon: '⛔', label: 'FENCE', cooldownMs: 0, selected: false, hasEnergy: true, underLimit: true },
      { id: 'turret', keybind: 'F', icon: '⌖', label: 'TURRET', cooldownMs: 0, selected: false, hasEnergy: true, underLimit: true },
      { id: 'mine', keybind: 'R', icon: '✹', label: 'MINE', cooldownMs: 0, selected: false, hasEnergy: true, underLimit: true },
      { id: 'shield', keybind: 'MMB', icon: '◉', label: 'SHIELD', cooldownMs: 0, active: false, selected: false, hasEnergy: true, underLimit: true }
    ]
  };

  private navState = new WeakMap<Enemy, NavState>();
  private patrolTargets = new WeakMap<Enemy, PatrolPoint>();
  private readonly onPointerDown = (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[] = []): void => {
    if (this.state.state === RoundState.Paused) return;
    if (pointer.button === 0 && this.pointerLock?.locked) {
      const aim = this.pointerLock.screenPoint();
      if (this.hud.activateMusicControlAt(aim.x, aim.y)) {
        this.pointerDown = false;
        return;
      }
    }
    if (currentlyOver.some((gameObject) => gameObject.getData('hudMusicControl') === true)) return;
    if (pointer.button === 0) {
      this.pointerDown = true;
      return;
    }
    const action = this.actionForBinding(`Mouse:${pointer.button}`);
    if (action) {
      pointer.event?.preventDefault();
      this.pressedAbilityActions.add(action);
    }
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.button === 0) {
      this.pointerDown = false;
    }
  };
  private readonly onResumeFromOptions = (): void => {
    this.refreshAbilityBindings();
    this.resumeGameplay();
  };
  private readonly onAbilityKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !this.scene.isActive() || this.state.state === RoundState.Paused) return;
    const action = this.actionForBinding(`Keyboard:${event.code}`);
    if (action) this.pressedAbilityActions.add(action);
  };

  constructor() {
    super(SceneKeys.Arena);
  }

  create(data?: ArenaSessionState | { session?: ArenaSessionState }): void {
    RunTransitionManager.markStep(this, 'arena-create-enter');
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const sessionFromData = this.parseSessionData(this.extractSessionData(data));
    const sessionFromRegistry = this.registry.get('arena-session') as ArenaSessionState | undefined;
    const session = sessionFromData ?? sessionFromRegistry;
    this.protocol = session?.protocol ?? 'normal';
    this.modsEarned = [...(session?.modsEarned ?? [])];
    this.runStartedAt = session?.runStartedAt ?? Date.now();
    this.modRuntime = new ModRuntime(SaveSystem.getModCollection(), session?.equippedMods);
    if (session) {
      this.roundManager = new RoundManager(session.baseSeed, session.objectiveMode, session.round);
      this.registry.set('arena-session', session);
    } else {
      this.roundManager = new RoundManager(Phaser.Math.Between(1, 999_999_999), OBJECTIVE_CONFIG.defaultMode, 1);
      this.registry.remove('arena-session');
    }

    this.createInput();
    this.createCrosshair();
    try {
      this.createRoundFromDefinition(this.roundManager.currentDefinition());
      RunTransitionManager.markArenaStarted(this);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('ArenaScene create failed', error);
      RunTransitionManager.fail(this, error);
      this.scene.start(SceneKeys.MainMenu);
      return;
    }

    this.scale.on('resize', this.handleResize, this);
    this.events.on('resume-from-options', this.onResumeFromOptions);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.pointerLock = new GameplayPointerLock(this.game, {
      onLocked: () => this.resumeFromPointerLock(),
      onLost: (reason) => this.pauseForPointerLock(reason)
    });
    this.pauseForPointerLock('initial');
    this.pointerLock.showInitial();
    if(import.meta.env.DEV){
      const debugGlobal=globalThis as typeof globalThis&{forceArenaType?:(type:ArenaTemplate|null)=>void;regenerateArena?:()=>void};
      debugGlobal.forceArenaType=(type)=>{ArenaGenerator.forceArenaType(type);this.createRoundFromDefinition(this.roundManager.currentDefinition());};
      debugGlobal.regenerateArena=()=>this.createRoundFromDefinition(this.roundManager.currentDefinition());
    }
  }

  private parseSessionData(data: unknown): ArenaSessionState | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const candidate = data as Partial<ArenaSessionState>;
    if (typeof candidate.baseSeed !== 'number' || !Number.isFinite(candidate.baseSeed)) return undefined;
    if (typeof candidate.round !== 'number' || !Number.isFinite(candidate.round)) return undefined;
    if (candidate.objectiveMode !== 'open' && candidate.objectiveMode !== 'sequential') return undefined;
    return {
      baseSeed: Math.floor(candidate.baseSeed),
      round: Math.max(1, Math.floor(candidate.round)),
      objectiveMode: candidate.objectiveMode,
      protocol: candidate.protocol === 'overdrive' ? 'overdrive' : 'normal',
      runStartedAt: typeof candidate.runStartedAt === 'number' ? candidate.runStartedAt : Date.now(),
      equippedMods: Array.isArray(candidate.equippedMods) ? candidate.equippedMods : undefined,
      modsEarned: Array.isArray(candidate.modsEarned) ? candidate.modsEarned : []
    };
  }

  private extractSessionData(data: ArenaSessionState | { session?: ArenaSessionState } | undefined): ArenaSessionState | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const wrapper = data as { session?: ArenaSessionState };
    if (wrapper.session) return wrapper.session;
    return data as ArenaSessionState;
  }

  private createRoundFromDefinition(def: ReturnType<RoundManager['currentDefinition']>): void {
    this.cleanupRoundObjects();
    this.hidePauseMenu();
    this.physics.resume();

    this.layout = ArenaGenerator.generate(def.seed, def.template, def.round, def.siteCount);
    this.drawProceduralArena(this.layout);
    this.pathfinder = new GridPathfinder(WORLD_WIDTH, WORLD_HEIGHT, 40, this.getBlockers());

    this.createOrMovePlayer();
    this.modRuntime.beginRound(1);
    this.defuserMarkedUntil = new WeakMap<Enemy, number>();
    this.createHudLayer();

    this.bombSites = new BombSiteManager(def.objectiveMode, OBJECTIVE_CONFIG.maxActiveBombs);
    this.bombSites.initialize(this, this.layout.bombSites, this.layout.theme);
    this.laserSecurity = new LaserSecuritySystem(this, def.round, this.layout.theme);

    this.registerBombSiteEvents();

    this.nextSpawnAt = this.time.now + 2500;
    this.nextArenaHealthDropAt = this.time.now + Phaser.Math.Between(PICKUP_BALANCE.arenaHealthFirstMinMs, PICKUP_BALANCE.arenaHealthFirstMaxMs);
    this.lastSpecialSpawnAt = -99_999;
    this.lastDefuserSpawnAt = -99_999;
    this.shieldActiveUntil = 0;
    this.shieldCooldownUntil = 0;
    this.destroyShieldOrb();
    this.activePlantingSite = null;
    this.plantingProgressMs = 0;
    this.roundCredits = 0;
    this.roundCoreTokens = 0;

    this.state.set(RoundState.PrePlant);

    this.showBanner(`ROUND ${def.round} - ${def.template.toUpperCase()}\nSeed ${def.seed}`);
  }

  private drawProceduralArena(layout: ArenaLayout): void {
    this.add.rectangle(WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5, WORLD_WIDTH, WORLD_HEIGHT, 0x090d14, 1).setDepth(0);

    const floor = this.add.graphics();
    floor.lineStyle(1, 0x131d2f, 0.6);
    for (let x = 0; x < WORLD_WIDTH; x += 100) floor.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y < WORLD_HEIGHT; y += 100) floor.lineBetween(0, y, WORLD_WIDTH, y);

    this.walls = this.physics.add.staticGroup();
    this.wallRects = [];

    for (const wall of layout.walls) {
      this.add.rectangle(wall.x + wall.w * 0.5, wall.y + wall.h * 0.5, wall.w, wall.h, 0x0c1119, 1)
        .setStrokeStyle(2, layout.theme.primary, 0.92)
        .setDepth(2);
      const body = this.walls.create(wall.x + wall.w * 0.5, wall.y + wall.h * 0.5, 'pixel');
      body.setDisplaySize(wall.w, wall.h);
      body.refreshBody();
      this.wallRects.push({ ...wall });
    }

    for (const obstacle of layout.obstacles) {
      this.drawObstacle(obstacle, layout.theme.primary, layout.theme.secondary);
      const rect = {
        x: obstacle.x - obstacle.w * 0.5,
        y: obstacle.y - obstacle.h * 0.5,
        w: obstacle.w,
        h: obstacle.h
      };
      const body = this.walls.create(obstacle.x, obstacle.y, 'pixel');
      body.setDisplaySize(rect.w, rect.h);
      body.refreshBody();
      this.wallRects.push(rect);
    }

    for (const deco of layout.decorativeNeon) {
      const color = Math.random() < 0.5 ? layout.theme.primary : layout.theme.secondary;
      const line = this.add.rectangle(deco.x, deco.y, deco.w, deco.h, color, 0.15).setDepth(1);
      this.tweens.add({ targets: line, alpha: { from: 0.08, to: 0.3 }, duration: 900 + Math.random() * 1000, yoyo: true, repeat: -1 });
    }
  }

  private drawObstacle(obstacle: ArenaLayout['obstacles'][number], primary: number, secondary: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x0f141d, 0.96);
    g.lineStyle(2, Math.random() < 0.5 ? primary : secondary, 0.95);

    const x = obstacle.x;
    const y = obstacle.y;
    const rx = obstacle.w * 0.5;
    const ry = obstacle.h * 0.5;

    if (obstacle.kind === 'circle' || obstacle.kind === 'energy-column') {
      g.fillCircle(x, y, Math.min(rx, ry));
      g.strokeCircle(x, y, Math.min(rx, ry));
    } else if (obstacle.kind === 'triangle') {
      g.fillPoints([{ x, y: y - ry }, { x: x - rx, y: y + ry }, { x: x + rx, y: y + ry }], true);
      g.strokePoints([{ x, y: y - ry }, { x: x - rx, y: y + ry }, { x: x + rx, y: y + ry }], true);
    } else if (obstacle.kind === 'hexagon' || obstacle.kind === 'octagon') {
      const points: Phaser.Types.Math.Vector2Like[] = [];
      const sides = obstacle.kind === 'hexagon' ? 6 : 8;
      for (let i = 0; i < sides; i += 1) {
        const a = (Math.PI * 2 * i) / sides;
        points.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
      }
      g.fillPoints(points, true);
      g.strokePoints(points, true);
    } else {
      g.fillRect(x - rx, y - ry, obstacle.w, obstacle.h);
      g.strokeRect(x - rx, y - ry, obstacle.w, obstacle.h);
    }
    g.setDepth(3);
  }

  private createOrMovePlayer(): void {
    const save = SaveSystem.get();
    const up = save.upgrades;
    const hasValidBody = !!this.player && !!this.player.active && !!this.player.body;

    if (!hasValidBody) {
      const stats = {
        maxHealth: PLAYER_BALANCE.maxHealth + getUpgradeLevel(up, 'player.maxHealth') * 10,
        moveSpeed: PLAYER_BALANCE.moveSpeed + getUpgradeLevel(up, 'player.moveSpeed') * 7,
        dashCooldownMs: Math.max(1500, PLAYER_BALANCE.dashCooldownMs - getUpgradeLevel(up, 'player.dashCooldown') * 120),
        dashDistanceMultiplier: PLAYER_BALANCE.dashDistanceMultiplier + getUpgradeLevel(up, 'player.dashDistance') * 0.06,
        pickupRadius: PLAYER_BALANCE.pickupRadius + getUpgradeLevel(up, 'player.pickupRadius') * 7,
        invulnMs: PLAYER_BALANCE.invulnerabilityMs
      };
      const energy = {
        max: PLAYER_BALANCE.energyMax + getUpgradeLevel(up, 'player.energyMax') * 10,
        regenPerSecond: PLAYER_BALANCE.energyRegenPerSecond + getUpgradeLevel(up, 'player.energyRegen')
      };
      const weapon = {
        ...starterWeapon,
        damage: starterWeapon.damage + getUpgradeLevel(up, 'weapon.damage') * 2,
        fireRate: Math.min(WEAPON_BALANCE.maximumFireRate, starterWeapon.fireRate + getUpgradeLevel(up, 'weapon.fireRate') * 0.4),
        projectileSpeed: starterWeapon.projectileSpeed + getUpgradeLevel(up, 'weapon.projectileSpeed') * 30,
        critChance: Math.min(WEAPON_BALANCE.maximumCritChance, starterWeapon.critChance + getUpgradeLevel(up, 'weapon.critChance') * 0.02),
        heatPerShot: Math.max(WEAPON_BALANCE.minimumHeatPerShot, starterWeapon.heatPerShot - getUpgradeLevel(up, 'weapon.heatEfficiency') * 0.4)
      };

      const playerShape = SaveSystem.getEquippedCosmeticId('playerShape') ?? 'player-circle';
      this.player = new Player(this, this.layout.playerSpawn.x, this.layout.playerSpawn.y, playerShape, stats, energy, weapon);
      this.player.setCosmeticTint(SaveSystem.getCosmeticColor('playerColor'));
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
      this.cameras.main.setZoom(0.9);
    } else {
      this.player.setPosition(this.layout.playerSpawn.x, this.layout.playerSpawn.y);
      this.player.setVelocity(0, 0);
      this.player.hp = this.player.stats.maxHealth;
      this.player.energy = this.player.energyStats.max;
      this.player.heat = 0;
      this.player.invulnUntil = 0;
      this.player.lastDashMs = -9_999;
      this.player.dashUntil = 0;
      this.player.modSpeedBoostUntil = 0;
      this.player.modSpeedMultiplier = 1;
      this.player.buffs.damageBoostUntil = 0;
      this.player.buffs.speedBoostUntil = 0;
      this.player.buffs.rapidFireUntil = 0;
      this.player.setCosmeticTint(SaveSystem.getCosmeticColor('playerColor'));
    }

    this.physics.add.collider(this.player, this.walls);
  }

  private createHudLayer(): void {
    if (this.hud) this.hud.destroy();
    if (this.bannerText) this.bannerText.destroy();
    if (this.siteActionText) this.siteActionText.destroy();

    this.hud = new Hud(this);

    this.bannerText = this.add.text(this.scale.width * 0.5, 60, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '36px',
      color: '#74f5ff',
      align: 'center',
      stroke: '#091321',
      strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1100).setAlpha(0);

    this.siteActionText = this.add.text(this.scale.width * 0.5, this.scale.height - 46, '', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '26px',
      color: '#b8f3ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1005);

    if (import.meta.env.DEV) {
      this.balanceTelemetry?.destroy();
      this.balanceTelemetry = this.add.text(12, this.scale.height - 12, '', {
        fontFamily: 'monospace', fontSize: '13px', color: '#bffcff', backgroundColor: '#06101ccc'
      }).setOrigin(0, 1).setScrollFactor(0).setDepth(2200).setVisible(false);
    }
  }

  private registerBombSiteEvents(): void {
    this.bombSites.on('bomb-site-armed', (site: BombSiteRuntime) => {
      this.state.set(RoundState.Defense);
      this.bombSites.refreshVisuals(this.layout.theme);
      const graceMs = getSpawnProfile(this.roundManager.round, this.bombSites.destroyedCount()).initialGraceMs;
      this.nextSpawnAt = this.time.now + graceMs;
      this.showBanner(`SITE ${site.letter} ARMED\nDEFEND THE ACTIVE CHARGE`);
      this.audio.playSfx('beep');
    });

    this.bombSites.on('bomb-site-defuse-started', () => {
      this.state.set(RoundState.Defusing);
      this.bombSites.refreshVisuals(this.layout.theme);
      this.hud.setWarning('DEFUSE IN PROGRESS');
      this.audio.playSfx('defuseAlarm');
      this.audio.startDisarmLoop();
    });

    this.bombSites.on('bomb-site-defuse-stopped', () => {
      this.state.set(RoundState.Defense);
      this.bombSites.refreshVisuals(this.layout.theme);
      this.hud.setWarning('');
      this.audio.stopDisarmLoop();
    });

    this.bombSites.on('bomb-site-destroyed', () => {
      this.audio.stopDisarmLoop();
      SaveSystem.recordBombSiteDestroyed();
      this.recoveryAfterSiteDestroy();
    });

    this.bombSites.on('all-bomb-sites-destroyed', () => {
      this.completeRound();
    });
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.togglePause();
    }
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f8)) {
      this.balanceTelemetry?.setVisible(!this.balanceTelemetry.visible);
    }
    if(import.meta.env.DEV&&Phaser.Input.Keyboard.JustDown(this.keys.f7)){
      this.createRoundFromDefinition(this.roundManager.currentDefinition());
      return;
    }

    if (this.state.state === RoundState.Paused || this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat) {
      return;
    }

    this.player.updateEnergy(dt);
    this.updatePlayerMovement(now);
    this.updatePlayerShooting(now);
    this.updatePlanting(delta);
    this.bombSites.updateAmbient(this.player.x, this.player.y, now, SaveSystem.get().settings.particles);

    const activeSite = this.bombSites.getActiveBombSite();
    if (activeSite) {
      const detonated = this.bombSites.tickActive(delta);
      if (detonated) this.detonateSite(detonated);
    }

    this.updateRelentlessSpawns(now, Boolean(activeSite));

    const playerLaserImmune = now < this.player.dashUntil || now < this.shieldActiveUntil;
    this.laserSecurity?.update(now, dt, this.player, this.enemies, playerLaserImmune);
    this.updateEnemies(now, dt);
    this.updateProjectiles(delta);
    this.updateAbilities(now, dt);
    this.updateDeathMines(now);
    this.updateShieldState(now);
    this.updateArenaHealthDrops(now);
    this.updatePickups(now, dt);
    this.updateEmergencyCapacitor(now);
    this.updateCrosshair();
    this.updateHud(now);
    this.updateBalanceTelemetry();

    if (this.player.isDead()) {
      this.triggerDefeat('playerDead');
    }
  }

  private createInput(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable.');

    this.keys = {
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      e: kb.addKey('E'),
      one: kb.addKey('ONE'),
      two: kb.addKey('TWO'),
      three: kb.addKey('THREE'),
      esc: kb.addKey('ESC')
      ,f8: kb.addKey('F8')
      ,f7: kb.addKey('F7')
    };

    this.input.on('pointerdown', this.onPointerDown);
    this.input.on('pointerup', this.onPointerUp);
    this.refreshAbilityBindings();
    window.addEventListener('keydown', this.onAbilityKeyDown);
    this.setGameplayCursorMode();
  }

  private refreshAbilityBindings(): void {
    this.abilityBindings = { ...SaveSystem.get().settings.abilityBindings };
    const slots = this.hudPayload.abilities;
    slots[0].keybind = compactBindingLabel(this.abilityBindings.fence);
    slots[1].keybind = compactBindingLabel(this.abilityBindings.turret);
    slots[2].keybind = compactBindingLabel(this.abilityBindings.mine);
    slots[3].keybind = compactBindingLabel(this.abilityBindings.shield);
  }

  private actionForBinding(binding: string): AbilityAction | null {
    return ABILITY_ACTIONS.find(({ action }) => this.abilityBindings?.[action] === binding)?.action ?? null;
  }

  private consumeAbilityAction(action: AbilityAction): boolean {
    if (!this.pressedAbilityActions.has(action)) return false;
    this.pressedAbilityActions.delete(action);
    return true;
  }

  private createCrosshair(): void {
    this.crosshair = this.add.graphics().setDepth(2100);
  }

  private setGameplayCursorMode(): void {
    this.input.setDefaultCursor('none');
    if (this.crosshair) this.crosshair.setVisible(true);
  }

  private setMenuCursorMode(): void {
    this.input.setDefaultCursor('default');
    if (this.crosshair) this.crosshair.setVisible(false);
  }

  private updatePlayerMovement(now: number): void {
    const aim = this.getAimWorldPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    this.player.setRotation(angle + Math.PI / 2);

    const v = new Phaser.Math.Vector2(0, 0);
    if (this.keys.w.isDown) v.y -= 1;
    if (this.keys.s.isDown) v.y += 1;
    if (this.keys.a.isDown) v.x -= 1;
    if (this.keys.d.isDown) v.x += 1;

    if (now >= this.player.dashUntil) {
      if (v.lengthSq() > 0) {
        v.normalize().scale(this.player.speed);
        this.player.setVelocity(v.x, v.y);
      } else {
        this.player.setVelocity(0, 0);
      }
    }

    if (this.consumeAbilityAction('dash')
      && this.player.canDash(now)
      && this.player.canSpendEnergy(PLAYER_BALANCE.dashEnergyCost)) {
      this.player.spendEnergy(PLAYER_BALANCE.dashEnergyCost);
      this.player.dashTowardPoint(aim.x, aim.y, now);
      if (this.sound.get('sfx-boost')) {
        this.sound.play('sfx-boost', { volume: this.audio.getSfxVolume() });
      } else {
        this.audio.playSfx('boost');
      }
      const c = SaveSystem.getCosmeticColor('dashTrail');
      for (let i = 0; i < 9; i += 1) {
        const p = this.add.circle(this.player.x, this.player.y, Phaser.Math.Between(3, 7), c, 0.8).setDepth(3);
        this.tweens.add({
          targets: p,
          x: this.player.x - Math.cos(angle) * (18 + i * 7),
          y: this.player.y - Math.sin(angle) * (18 + i * 7),
          alpha: 0,
          scale: 0.35,
          duration: 210 + i * 16,
          onComplete: () => p.destroy()
        });
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.selectedAbility = 'fence';
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.selectedAbility = 'turret';
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.selectedAbility = 'mine';

    if (this.consumeAbilityAction('fence')) this.placeAbility('fence', now);
    if (this.consumeAbilityAction('turret')) this.placeAbility('turret', now);
    if (this.consumeAbilityAction('mine')) this.placeAbility('mine', now);
    if (this.consumeAbilityAction('shield')) this.activateShield(now);
  }

  private updatePlayerShooting(now: number): void {
    if (!this.pointerDown) return;
    if (this.player.heat >= this.player.weapon.maxHeat) return;

    const cadence = 1000 / this.player.fireRate;
    if (now - this.lastPlayerShotMs < cadence) return;
    const corruptedShotCost = this.modRuntime.has('fractured-current') ? MOD_BALANCE.fracturedCurrent.extraShotEnergyCost : 0;
    const shotEnergyCost = WEAPON_BALANCE.energyCostPerShot + corruptedShotCost;
    if (!this.player.canSpendEnergy(shotEnergyCost)) return;
    this.player.spendEnergy(shotEnergyCost);
    this.lastPlayerShotMs = now;

    const aim = this.getAimWorldPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    const speed = this.player.weapon.projectileSpeed;

    const bullet = this.physics.add.image(this.player.x + Math.cos(angle) * 14, this.player.y + Math.sin(angle) * 14, 'circle');
    bullet.setDisplaySize(7, 7);
    bullet.setTint(SaveSystem.getCosmeticColor('projectileColor'));
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setDepth(8);

    const crit = Math.random() < this.player.weapon.critChance;
    const damage = this.player.weapon.damage * this.player.damageMultiplier * (crit ? WEAPON_BALANCE.critMultiplier : 1);

    this.projectiles.push({
      sprite: bullet,
      damage,
      from: 'player',
      lifeMs: 950,
      trailColor: SaveSystem.getCosmeticColor('trailColor'),
      splitCurrentEligible: true
    });

    this.player.heat += this.player.weapon.heatPerShot;

    const flash = this.add.circle(this.player.x + Math.cos(angle) * 18, this.player.y + Math.sin(angle) * 18, 11, 0xffffff, 0.8).setDepth(9);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.2, duration: 110, onComplete: () => flash.destroy() });
    this.audio.playSfx('shot');
  }

  private updatePlanting(delta: number): void {
    const activeBomb = this.bombSites.getActiveBombSite();
    if (activeBomb) {
      this.audio.stopPlantingLoop();
      this.siteActionText.setText('Defend the active charge.');
      this.activePlantingSite = null;
      this.plantingProgressMs = 0;
      return;
    }

    const near = this.bombSites.getNearestAvailable(this.player.x, this.player.y, 90);
    if (!near) {
      this.audio.stopPlantingLoop();
      this.activePlantingSite = null;
      this.plantingProgressMs = 0;
      this.siteActionText.setText('Move to an available site and hold E to plant.');
      return;
    }

    if (!this.bombSites.canPlant(near)) {
      this.audio.stopPlantingLoop();
      this.siteActionText.setText('Defend the active charge.');
      return;
    }

    if (this.keys.e.isDown) {
      this.audio.startPlantingLoop();
      if (this.activePlantingSite?.id !== near.id) {
        this.activePlantingSite = near;
        this.plantingProgressMs = 0;
      }
      this.state.set(RoundState.Planting);
      this.bombSites.setPlanting(near);
      this.plantingProgressMs += delta;
      const pct = Phaser.Math.Clamp(this.plantingProgressMs / OBJECTIVE_CONFIG.plantHoldMs, 0, 1);
      this.siteActionText.setText(`Planting Site ${near.letter}: ${Math.round(pct * 100)}%`);

      if (pct >= 1) {
        this.audio.stopPlantingLoop();
        this.bombSites.armSite(near, OBJECTIVE_CONFIG.bombDefenseMs, this.time.now);
        this.bombSites.refreshVisuals(this.layout.theme);
        this.activePlantingSite = null;
        this.plantingProgressMs = 0;
      }
    } else {
      this.audio.stopPlantingLoop();
      if (this.activePlantingSite && this.activePlantingSite.id === near.id) {
        this.bombSites.cancelPlanting(near);
      }
      this.activePlantingSite = null;
      this.plantingProgressMs = 0;
      this.state.set(RoundState.PrePlant);
      this.siteActionText.setText(`Site ${near.letter} ready. Hold E to plant.`);
    }
  }

  private updateRelentlessSpawns(now: number, defensePhase: boolean): void {
    const level = this.roundManager.round;
    const destroyed = this.bombSites.destroyedCount();

    const profile = getSpawnProfile(level, destroyed);
    const activeSite = this.bombSites.getActiveBombSite();
    const elapsedMs = activeSite ? now - activeSite.plantedAt : 0;
    if (defensePhase && elapsedMs < profile.initialGraceMs) return;
    const phaseMultiplier = defensePhase ? getSpawnCadenceMultiplier(elapsedMs) : 1;
    if (phaseMultiplier === null) return;
    const cadenceMs = Math.round((defensePhase ? profile.defenseCadenceMs : profile.prePlantCadenceMs) * phaseMultiplier);

    if (now < this.nextSpawnAt) return;
    this.nextSpawnAt = now + cadenceMs;
    if (this.enemies.length >= profile.activeCountCap) return;

    const type = this.pickEnemyType(profile, now, defensePhase);
    if (!type) return;
    const activeWeight = this.enemies.reduce((sum, enemy) => sum + ENEMY_BALANCE[enemy.stats.type].weight, 0);
    if (activeWeight + ENEMY_BALANCE[type].weight > profile.activeWeightCap) return;

    this.spawnEnemy(type, defensePhase);
    if (type === 'defuser') this.lastDefuserSpawnAt = now;
    if (type === 'tank' || type === 'disruptor' || type === 'star') this.lastSpecialSpawnAt = now;
  }

  private getAimWorldPoint(): Phaser.Math.Vector2 {
    return this.pointerLock?.worldPoint(this.cameras.main)
      ?? new Phaser.Math.Vector2(this.input.activePointer.worldX, this.input.activePointer.worldY);
  }

  private pickEnemyType(profile: ReturnType<typeof getSpawnProfile>, now: number, defensePhase: boolean): EnemyType | null {
    const activeCount = (type: EnemyType): number => this.enemies.filter((enemy) => enemy.stats.type === type).length;
    const candidates = (Object.keys(profile.composition) as EnemyType[]).filter((type) => {
      if (profile.composition[type] <= 0 || this.roundManager.round < ENEMY_BALANCE[type].unlockRound) return false;
      if (!defensePhase && type === 'defuser') return false;
      if (type === 'defuser') {
        return activeCount(type) < OBJECTIVE_BALANCE.maxActiveDefusers
          && now - this.lastDefuserSpawnAt >= OBJECTIVE_BALANCE.defuserSpawnSpacingMs;
      }
      if (type === 'disruptor' && activeCount(type) >= (this.roundManager.round < 10 ? 1 : 2)) return false;
      if (type === 'star' && activeCount(type) >= 1) return false;
      if ((type === 'tank' || type === 'disruptor' || type === 'star') && now - this.lastSpecialSpawnAt < profile.specialSpacingMs) return false;
      return true;
    });
    if (candidates.length === 0) return 'grunt';

    const total = candidates.reduce((sum, type) => sum + profile.composition[type], 0);
    let roll = Math.random() * total;
    for (const type of candidates) {
      roll -= profile.composition[type];
      if (roll <= 0) return type;
    }
    return candidates[candidates.length - 1];
  }

  private spawnEnemy(type: EnemyType, defensePhase: boolean): void {
    const base = baseEnemyStats[type];
    const spawn = Phaser.Utils.Array.GetRandom(this.layout.enemySpawns);
    const curve = getDifficultyCurve(this.roundManager.round, this.bombSites.destroyedCount());
    const phaseScale = defensePhase ? 1 : 0.9;

    const stats = {
      ...base,
      hp: Math.round(base.hp * (1 + (curve.healthMultiplier - 1) * phaseScale)),
      speed: Math.round(base.speed * curve.speedMultiplier),
      damage: Math.round(base.damage * (1 + (curve.damageMultiplier - 1) * phaseScale))
    };

    const enemyTexture = type === 'star' ? 'enemy-star' : `enemy-${type}`;
    const enemy = new Enemy(this, spawn.x, spawn.y, enemyTexture, stats);
    if (this.modRuntime.hasInfusion('enemy-growth')) enemy.setScale(1.12);
    if (type === 'star') {
      enemy.setTexture('enemy-star');
      enemy.setBlendMode(Phaser.BlendModes.ADD);
      enemy.setAngularVelocity(52);
    }
    this.physics.add.collider(enemy, this.walls);
    this.physics.add.collider(enemy, this.player, () => {
      const hit = this.player.takeDamage(enemy.stats.damage);
      if (hit) this.audio.playSfx('playerDamage');
    });

    this.enemies.push(enemy);
    this.navState.set(enemy, {
      path: [],
      waypointIndex: 0,
      nextRepathAt: 0,
      targetKey: '',
      lastSampleX: enemy.x,
      lastSampleY: enemy.y,
      lastSampleAt: this.time.now,
      stuckTicks: 0
    });
    this.patrolTargets.set(enemy, { x: spawn.x, y: spawn.y });
  }

  private updateEnemies(now: number, dt: number): void {
    const activeSite = this.bombSites.getActiveBombSite();
    let activeDefusers = 0;
    this.refreshDefuseAssignments(activeSite, now);

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;

      if (!activeSite) {
        this.updateEnemyPatrol(enemy, now);
      } else if (this.defuseAssignees.has(enemy)) {
        if (this.updateDefuser(enemy, activeSite, now, dt)) activeDefusers += 1;
      } else if (enemy.stats.type === 'shooter') {
        this.updateShooter(enemy, now, activeSite);
      } else if (enemy.stats.type === 'disruptor') {
        this.updateDisruptor(enemy, now);
      } else {
        this.updateMelee(enemy, activeSite, now);
      }
    }

    if (activeSite && activeDefusers > 0) {
      if (activeSite.state === BombSiteState.Armed) this.activateEmergencyBombShield(activeSite, now);
      this.bombSites.startDefuse(activeSite);
      const cooperationMultiplier = 1 + Math.min(0.75, (activeDefusers - 1) * 0.25);
      if (!this.modRuntime.bombShieldBlocks(activeSite.id, now)
        && this.bombSites.applyDefuse(activeSite, dt * 1000 * cooperationMultiplier, OBJECTIVE_CONFIG.defuseRequiredMs)) {
        this.triggerDefeat('bombDefused');
      }
    } else if (this.state.state === RoundState.Defusing) {
      this.state.set(RoundState.Defense);
      this.hud.setWarning('');
      if (activeSite) this.bombSites.stopDefuse(activeSite);
    }

    this.applyEnemySeparation();

    this.enemies = this.enemies.filter((e) => {
      if (!e.isDead()) return true;
      this.killEnemy(e);
      return false;
    });
  }

  private refreshDefuseAssignments(activeSite: BombSiteRuntime | null, now: number): void {
    this.defuseAssignees.clear();
    if (!activeSite) return;

    const desired = getDefuseAssigneeCount(this.roundManager.round);
    const candidates = this.enemies
      .filter((enemy) => enemy.active && !enemy.isDead() && now >= enemy.defuseInterruptedUntil)
      .sort((a, b) => {
        const specialistDifference = Number(b.stats.type === 'defuser') - Number(a.stats.type === 'defuser');
        if (specialistDifference !== 0) return specialistDifference;
        return Phaser.Math.Distance.Between(a.x, a.y, activeSite.x, activeSite.y)
          - Phaser.Math.Distance.Between(b.x, b.y, activeSite.x, activeSite.y);
      });
    candidates.slice(0, desired).forEach((enemy) => {
      this.defuseAssignees.add(enemy);
      if (this.modRuntime.rank('priority-targeting') >= 2) {
        this.defuserMarkedUntil.set(enemy, now + MOD_BALANCE.priorityTargeting.markedDurationMs);
      }
    });
  }

  private activateEmergencyBombShield(site: BombSiteRuntime, now: number): void {
    const activation = this.modRuntime.activateBombShield(site.id, now);
    if (!activation) return;
    const color = SaveSystem.getCosmeticColor('bombColor');
    const shield = this.add.circle(site.x, site.y, 72, color, 0.12).setStrokeStyle(4, 0xffffff, 0.9).setDepth(12);
    this.tweens.add({ targets: shield, radius: 92, alpha: 0, duration: Math.max(350, activation.activeUntil - now), onComplete: () => shield.destroy() });
    if (!activation.knockback) return;
    for (const enemy of this.enemies) {
      if (enemy.stats.type === 'tank' || enemy.stats.type === 'star') continue;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, site.x, site.y);
      if (distance > MOD_BALANCE.emergencyShield.knockbackRadius || distance < 1) continue;
      const direction = new Phaser.Math.Vector2(enemy.x - site.x, enemy.y - site.y).normalize();
      const resistance = enemy.stats.type === 'disruptor' ? 0.5 : 1;
      enemy.setVelocity(direction.x * MOD_BALANCE.emergencyShield.knockbackSpeed * resistance, direction.y * MOD_BALANCE.emergencyShield.knockbackSpeed * resistance);
      enemy.defuseInterruptedUntil = now + 600;
    }
  }

  private updateEnemyPatrol(enemy: Enemy, now: number): void {
    const target = this.patrolTargets.get(enemy) ?? { x: enemy.x, y: enemy.y };
    if (Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y) < 42 || Math.random() < 0.002) {
      const bounds=this.layout.generation.bounds;
      target.x = Phaser.Math.Clamp(enemy.x + Phaser.Math.Between(-260, 260), bounds.x+60, bounds.x+bounds.w-60);
      target.y = Phaser.Math.Clamp(enemy.y + Phaser.Math.Between(-220, 220), bounds.y+60, bounds.y+bounds.h-60);
      this.patrolTargets.set(enemy, target);
    }

    if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < 260) {
      this.navigateEnemy(enemy, this.player.x, this.player.y, now, enemy.stats.speed * 0.95);
      return;
    }

    this.navigateEnemy(enemy, target.x, target.y, now, enemy.stats.speed * 0.82);
  }

  private updateMelee(enemy: Enemy, site: BombSiteRuntime, now: number): void {
    const turretTarget = this.getSecondaryTurretTarget(enemy, now);
    if (turretTarget) {
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, turretTarget.sprite.x, turretTarget.sprite.y);
      this.navigateEnemy(enemy, turretTarget.sprite.x, turretTarget.sprite.y, now, enemy.stats.speed);
      if (distance <= ENEMY_BALANCE[enemy.stats.type].attackRange + 12
        && now - enemy.lastAttackMs >= ENEMY_BALANCE[enemy.stats.type].attackCooldownMs) {
        enemy.lastAttackMs = now;
        const roleScale = enemy.stats.type === 'star' ? 1.05 : enemy.stats.type === 'tank' ? 0.85 : 0.62;
        turretTarget.takeDamage(enemy.stats.damage * roleScale);
        this.spawnImpact(turretTarget.sprite.x, turretTarget.sprite.y, enemy.stats.color);
      }
      return;
    }

    const toBomb = Phaser.Math.Distance.Between(enemy.x, enemy.y, site.x, site.y);
    const tx = toBomb < 260 || Math.random() < 0.42 ? site.x : this.player.x;
    const ty = toBomb < 260 || Math.random() < 0.42 ? site.y : this.player.y;

    this.navigateEnemy(enemy, tx, ty, now, enemy.stats.speed);

    if (enemy.stats.type === 'tank' || enemy.stats.type === 'star') {
      const isStar = enemy.stats.type === 'star';
      const fenceDamage = isStar ? 1.35 : 0.95;
      for (const f of this.fences) {
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, f.sprite.x, f.sprite.y) < 56) f.hp -= fenceDamage;
      }
    }
  }

  private activateShield(now: number): void {
    const durationMs = ABILITY_BALANCE.shield.durationMs;
    const cooldownMs = ABILITY_BALANCE.shield.cooldownMs;
    if (now < this.shieldActiveUntil) return;
    if (now < this.shieldCooldownUntil) return;
    if (!this.player.canSpendEnergy(ABILITY_BALANCE.shield.energyCost)) return;

    this.player.spendEnergy(ABILITY_BALANCE.shield.energyCost);

    this.shieldActiveUntil = now + durationMs;
    this.shieldCooldownUntil = now + cooldownMs;
    this.player.invulnUntil = Math.max(this.player.invulnUntil, this.shieldActiveUntil);

    if (!this.shieldOrb) {
      this.shieldOrb = this.add.circle(this.player.x, this.player.y, 30, COLORS.cyan, 0.22)
        .setStrokeStyle(2, COLORS.cyan, 0.8)
        .setDepth(12);
      this.shieldPulseTween = this.tweens.add({
        targets: this.shieldOrb,
        radius: { from: 28, to: 34 },
        alpha: { from: 0.14, to: 0.32 },
        duration: 260,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    this.shieldOrb.setVisible(true);
    this.audio.playSfx('shieldOn');
  }

  private updateShieldState(now: number): void {
    if (!this.shieldOrb) return;
    if (now >= this.shieldActiveUntil) {
      this.destroyShieldOrb();
      return;
    }

    this.shieldOrb.setPosition(this.player.x, this.player.y);
    this.player.invulnUntil = Math.max(this.player.invulnUntil, this.shieldActiveUntil);
  }

  private destroyShieldOrb(): void {
    this.shieldPulseTween?.remove();
    this.shieldPulseTween = null;
    this.shieldOrb?.destroy();
    this.shieldOrb = null;
  }

  private updateShooter(enemy: Enemy, now: number, site: BombSiteRuntime): void {
    const turretTarget = this.getSecondaryTurretTarget(enemy, now);
    const focusX = turretTarget?.sprite.x ?? (Math.random() < 0.25 ? site.x : this.player.x);
    const focusY = turretTarget?.sprite.y ?? (Math.random() < 0.25 ? site.y : this.player.y);

    const v = new Phaser.Math.Vector2(focusX - enemy.x, focusY - enemy.y);
    const dist = v.length();
    const ideal = 230;
    const movementSpeed = enemy.effectiveSpeed(enemy.stats.speed, now);
    if (dist > ideal + 24) {
      v.normalize();
      enemy.setVelocity(v.x * movementSpeed, v.y * movementSpeed);
    } else if (dist < ideal - 22) {
      v.normalize();
      enemy.setVelocity(-v.x * movementSpeed * 0.85, -v.y * movementSpeed * 0.85);
    } else {
      enemy.setVelocity(0, 0);
    }

    if (now - enemy.lastShotMs > ENEMY_BALANCE.shooter.attackCooldownMs) {
      enemy.lastShotMs = now;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, turretTarget?.sprite.x ?? this.player.x, turretTarget?.sprite.y ?? this.player.y);
      const bullet = this.physics.add.image(enemy.x, enemy.y, 'circle');
      bullet.setDisplaySize(7, 7);
      bullet.setTint(COLORS.orange);
      bullet.setVelocity(Math.cos(angle) * 420, Math.sin(angle) * 420);
      bullet.setDepth(7);
      this.projectiles.push({ sprite: bullet, damage: enemy.stats.damage, from: 'enemy', lifeMs: 1400, trailColor: COLORS.orange });
    }
  }

  private updateDefuser(enemy: Enemy, site: BombSiteRuntime, now: number, dt: number): boolean {
    const toSite = Phaser.Math.Distance.Between(enemy.x, enemy.y, site.x, site.y);
    if (toSite > 46) {
      this.navigateEnemy(enemy, site.x, site.y, now, enemy.stats.speed);
      enemy.defuseProgressMs = Math.max(0, enemy.defuseProgressMs - dt * 160);
      return false;
    }

    enemy.setVelocity(0, 0);
    return true;
  }

  private updateDisruptor(enemy: Enemy, now: number): void {
    let tx = this.player.x;
    let ty = this.player.y;
    const turret = this.turrets[0];
    const fence = this.fences[0];
    if (turret) {
      tx = turret.sprite.x;
      ty = turret.sprite.y;
    } else if (fence) {
      tx = fence.sprite.x;
      ty = fence.sprite.y;
    }

    this.navigateEnemy(enemy, tx, ty, now, enemy.stats.speed);

    if (now - enemy.lastAttackMs > ENEMY_BALANCE.disruptor.specialCooldownMs) {
      enemy.lastAttackMs = now;
      const pulse = this.add.circle(enemy.x, enemy.y, 16, COLORS.green, 0.2).setDepth(6);
      this.tweens.add({ targets: pulse, radius: 170, alpha: 0, duration: 500, onComplete: () => pulse.destroy() });
      for (const t of this.turrets) {
        if (Phaser.Math.Distance.Between(t.sprite.x, t.sprite.y, enemy.x, enemy.y) < 170) t.disabledUntil = now + ENEMY_BALANCE.disruptor.disableMs;
      }
      for (const f of this.fences) {
        if (Phaser.Math.Distance.Between(f.sprite.x, f.sprite.y, enemy.x, enemy.y) < 170) f.expiresAt = Math.min(f.expiresAt, now + 600);
      }
    }
  }

  private navigateEnemy(enemy: Enemy, targetX: number, targetY: number, now: number, speed: number): void {
    speed = enemy.effectiveSpeed(speed, now);
    const nav = this.navState.get(enemy);
    if (!nav) return;

    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    if (body && (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down)) {
      const bounceX = (body.blocked.left ? 1 : 0) + (body.blocked.right ? -1 : 0);
      const bounceY = (body.blocked.up ? 1 : 0) + (body.blocked.down ? -1 : 0);
      enemy.setVelocity(
        (bounceX + Phaser.Math.FloatBetween(-0.25, 0.25)) * speed,
        (bounceY + Phaser.Math.FloatBetween(-0.25, 0.25)) * speed
      );
      nav.path.length = 0;
      nav.waypointIndex = 0;
      nav.nextRepathAt = now + 70;
    }

    if (now - nav.lastSampleAt >= 240) {
      const moved = Phaser.Math.Distance.Between(enemy.x, enemy.y, nav.lastSampleX, nav.lastSampleY);
      const targetDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, targetX, targetY);
      if (targetDist > 46 && moved < 5) {
        nav.stuckTicks += 1;
      } else {
        nav.stuckTicks = Math.max(0, nav.stuckTicks - 1);
      }

      nav.lastSampleX = enemy.x;
      nav.lastSampleY = enemy.y;
      nav.lastSampleAt = now;

      if (nav.stuckTicks >= 2) {
        nav.path.length = 0;
        nav.waypointIndex = 0;
        nav.nextRepathAt = now + 45;
        enemy.setVelocity(
          Phaser.Math.FloatBetween(-1, 1) * speed * 0.7,
          Phaser.Math.FloatBetween(-1, 1) * speed * 0.7
        );
      }
    }

    const key = `${Math.floor(targetX / 40)},${Math.floor(targetY / 40)}:${this.fences.length}-${this.mines.length}`;

    if (nav.path.length === 0 || nav.targetKey !== key || now >= nav.nextRepathAt) {
      const penalty = (cx: number, cy: number): number => {
        const w = this.pathfinder.cellToWorld(cx, cy);
        let p = 0;
        for (const m of this.mines) {
          if (!m.armed) continue;
          const d = Phaser.Math.Distance.Between(w.x, w.y, m.sprite.x, m.sprite.y);
          if (d < m.radius + 60) p += ((m.radius + 60 - d) / (m.radius + 60)) * 9;
        }
        for (const f of this.fences) {
          const d = this.distancePointToSegment(
            w.x,
            w.y,
            f.sprite.x - Math.cos(f.sprite.rotation) * 45,
            f.sprite.y - Math.sin(f.sprite.rotation) * 45,
            f.sprite.x + Math.cos(f.sprite.rotation) * 45,
            f.sprite.y + Math.sin(f.sprite.rotation) * 45
          );
          if (d < 68) p += ((68 - d) / 68) * 6;
        }
        return p;
      };
      nav.path = this.pathfinder.findPath(enemy.x, enemy.y, targetX, targetY, { cellPenalty: penalty, smooth: true, maxIterations: 2500 });
      nav.waypointIndex = 0;
      nav.nextRepathAt = now + Phaser.Math.Between(360, 650);
      nav.targetKey = key;
    }

    let waypoint = nav.path[nav.waypointIndex];
    if (waypoint) {
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, waypoint.x, waypoint.y);
      if (d < 18 && nav.waypointIndex < nav.path.length - 1) {
        nav.waypointIndex += 1;
        waypoint = nav.path[nav.waypointIndex];
      }
    }

    if (waypoint) {
      const v = new Phaser.Math.Vector2(waypoint.x - enemy.x, waypoint.y - enemy.y);
      if (v.lengthSq() > 0.2) {
        v.normalize();
        enemy.setVelocity(v.x * speed, v.y * speed);
        return;
      }
    }

    const direct = new Phaser.Math.Vector2(targetX - enemy.x, targetY - enemy.y);
    if (direct.lengthSq() <= 1) {
      enemy.setVelocity(0, 0);
    } else {
      direct.normalize();
      enemy.setVelocity(direct.x * speed, direct.y * speed);
    }
  }

  private applyEnemySeparation(): void {
    for (let i = 0; i < this.enemies.length; i += 1) {
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0 || d2 > 31 * 31) continue;
        const d = Math.sqrt(d2);
        const push = (31 - d) * 0.35;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  private updateProjectiles(delta: number): void {
    this.projectiles = this.projectiles.filter((p) => {
      p.lifeMs -= delta;
      if (p.lifeMs <= 0 || !p.sprite.body) {
        p.sprite.destroy();
        return false;
      }

      if (this.hitWall(p.sprite.x, p.sprite.y)) {
        this.spawnImpact(p.sprite.x, p.sprite.y, p.trailColor);
        p.sprite.destroy();
        return false;
      }

      this.spawnProjectileTrail(p.sprite.x, p.sprite.y, p.trailColor);

      if (p.from === 'player' || p.from === 'turret') {
        const hitEnemy = this.enemies.find((e) => Phaser.Math.Distance.Between(e.x, e.y, p.sprite.x, p.sprite.y) < e.stats.size * 0.5 + 5);
        if (hitEnemy) {
          const markedForTurret = this.defuseAssignees.has(hitEnemy) || this.time.now < (this.defuserMarkedUntil.get(hitEnemy) ?? 0);
          const conditionalBonus = p.from === 'turret' && this.modRuntime.rank('priority-targeting') === 3 && markedForTurret
            ? this.modRuntime.conditionalDamageBonus([MOD_BALANCE.priorityTargeting.rank3TurretDamageBonus])
            : 0;
          const finalDamage = p.damage * (1 + conditionalBonus);
          const wasAlive = !hitEnemy.isDead();
          hitEnemy.takeDamage(finalDamage);
          hitEnemy.defuseProgressMs = 0;
          hitEnemy.defuseInterruptedUntil = this.time.now + 800;
          if (wasAlive && hitEnemy.isDead() && p.from === 'player' && p.splitCurrentEligible) {
            this.triggerSplitCurrent(hitEnemy, finalDamage);
          }
          this.spawnImpact(p.sprite.x, p.sprite.y, p.sprite.tintTopLeft);
          p.sprite.destroy();
          this.audio.playSfx('hit');
          return false;
        }
      }

      if (p.from === 'enemy') {
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.sprite.x, p.sprite.y) < 16) {
          const hit = this.player.takeDamage(p.damage);
          if (hit) this.audio.playSfx('playerDamage');
          p.sprite.destroy();
          return false;
        }

        for (const t of this.turrets) {
          if (Phaser.Math.Distance.Between(t.sprite.x, t.sprite.y, p.sprite.x, p.sprite.y) < 18) {
            t.takeDamage(p.damage);
            p.sprite.destroy();
            return false;
          }
        }
      }

      return true;
    });
  }

  private spawnProjectileTrail(x: number, y: number, color: number): void {
    if (Math.random() < 0.45) return;
    const spark = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, 0.62).setDepth(5);
    this.tweens.add({ targets: spark, alpha: 0, scale: 0.3, duration: 130, onComplete: () => spark.destroy() });
  }

  private spawnImpact(x: number, y: number, color: number): void {
    const ring = this.add.circle(x, y, 6, color, 0.4).setDepth(8);
    this.tweens.add({ targets: ring, radius: 22, alpha: 0, duration: 190, onComplete: () => ring.destroy() });

    for (let i = 0; i < 6; i += 1) {
      const d = this.add.circle(x, y, Phaser.Math.Between(2, 4), color, 0.9).setDepth(8);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = Phaser.Math.Between(40, 160);
      this.tweens.add({
        targets: d,
        x: x + Math.cos(a) * sp * 0.2,
        y: y + Math.sin(a) * sp * 0.2,
        alpha: 0,
        duration: 210,
        onComplete: () => d.destroy()
      });
    }
  }

  private placeAbility(type: AbilityType, now: number): void {
    const cfg = this.getAbilityConfig(type);
    if (now < this.abilityCooldownUntil[type]) return;
    if (!this.player.canSpendEnergy(cfg.energyCost)) return;

    const { x, y } = this.getAimWorldPoint();
    if (!this.isValidPlacement(x, y)) return;

    if (type === 'fence') {
      if (this.fences.length >= cfg.maxActive) return;
      const fence = new Fence(this, x, y, this.player.rotation, SaveSystem.getCosmeticColor('fenceStyle'), ABILITY_BALANCE.fence.width, cfg.durationMs, cfg.hp, cfg.damage, ABILITY_BALANCE.fence.slowFactor);
      this.fences.push(fence);
    }

    if (type === 'turret') {
      if (this.turrets.length >= cfg.maxActive) return;
      const turret = new Turret(this, x, y, SaveSystem.getCosmeticColor('turretSkin'), cfg.hp, cfg.damage, cfg.fireRate, cfg.range);
      this.turrets.push(turret);
    }

    if (type === 'mine') {
      if (this.mines.length >= cfg.maxActive) return;
      const mine = new Mine(this, x, y, COLORS.orange, cfg.armMs, cfg.damage, cfg.radius);
      this.mines.push(mine);
    }

    this.player.spendEnergy(cfg.energyCost);
    this.abilityCooldownUntil[type] = now + cfg.cooldownMs;
    this.audio.playSfx('place');
  }

  private updateAbilities(now: number, dt: number): void {
    const turretShots: Projectile[] = [];

    for (const turret of this.turrets) {
      turret.updateVisual();
      const target = this.getNearestEnemy(turret.sprite.x, turret.sprite.y, turret.range);
      if (!target) continue;
      const angle = Phaser.Math.Angle.Between(turret.sprite.x, turret.sprite.y, target.x, target.y);
      turret.aimAt(angle);
      if (!turret.canFire(now)) continue;

      turret.lastShotMs = now;
      const b = this.physics.add.image(turret.sprite.x, turret.sprite.y, 'circle');
      b.setDisplaySize(6, 6);
      b.setTint(SaveSystem.getCosmeticColor('projectileColor'));
      b.setVelocity(Math.cos(angle) * 560, Math.sin(angle) * 560);
      turretShots.push({ sprite: b, damage: turret.damage, from: 'turret', lifeMs: 1150, trailColor: SaveSystem.getCosmeticColor('trailColor') });
    }
    this.projectiles.push(...turretShots);

    for (const mine of this.mines) {
      mine.update(now);
      if (!mine.armed) continue;
      const trigger = this.enemies.some((e) => Phaser.Math.Distance.Between(e.x, e.y, mine.sprite.x, mine.sprite.y) <= mine.radius);
      if (trigger && mine.detonateAt === 0) {
        mine.beginDetonation(now, this.modRuntime.has('magnetic-payload') ? MOD_BALANCE.magneticPayload.preDetonationMs : 0);
      }
      if (mine.detonateAt === 0) continue;
      this.applyMagneticPayload(mine, now);
      if (!mine.readyToDetonate(now)) continue;

      this.audio.playSfx('mine');
      const blast = this.add.circle(mine.sprite.x, mine.sprite.y, 10, COLORS.orange, 0.35).setDepth(7);
      this.tweens.add({ targets: blast, radius: mine.radius, alpha: 0, duration: 280, onComplete: () => blast.destroy() });
      for (const e of this.enemies) {
        const d = Phaser.Math.Distance.Between(e.x, e.y, mine.sprite.x, mine.sprite.y);
        if (d <= mine.radius) {
          e.takeDamage(mine.damage * (1 - d / (mine.radius + 1)));
          if (!e.isDead() && this.modRuntime.rank('magnetic-payload') === 3) {
            e.slowFactor = MOD_BALANCE.magneticPayload.rank3SlowFactor;
            e.slowedUntil = now + MOD_BALANCE.magneticPayload.rank3SlowDurationMs;
          }
        }
      }

      mine.destroy();
      mine.armed = false;
    }

    for (const fence of this.fences) {
      for (const enemy of this.enemies) {
        const d = this.distancePointToSegment(
          enemy.x,
          enemy.y,
          fence.sprite.x - Math.cos(fence.sprite.rotation) * 45,
          fence.sprite.y - Math.sin(fence.sprite.rotation) * 45,
          fence.sprite.x + Math.cos(fence.sprite.rotation) * 45,
          fence.sprite.y + Math.sin(fence.sprite.rotation) * 45
        );
        if (d < 11) {
          enemy.takeDamage(fence.dps * dt);
          const body = enemy.body as Phaser.Physics.Arcade.Body | null;
          if (body) enemy.setVelocity(body.velocity.x * fence.slowFactor, body.velocity.y * fence.slowFactor);
          if (enemy.stats.type === 'tank') fence.hp -= 16 * dt;
        }
      }
    }

    this.fences = this.fences.filter((f) => {
      if (!f.isExpired(now)) return true;
      f.destroy();
      return false;
    });

    this.turrets = this.turrets.filter((t) => {
      if (t.hp > 0) return true;
      this.spawnImpact(t.sprite.x, t.sprite.y, SaveSystem.getCosmeticColor('turretSkin'));
      const collapse = this.add.circle(t.sprite.x, t.sprite.y, 8, COLORS.orange, 0.35).setDepth(8);
      this.tweens.add({ targets: collapse, radius: 32, alpha: 0, duration: 260, onComplete: () => collapse.destroy() });
      t.destroy();
      return false;
    });

    this.mines = this.mines.filter((m) => m.armed || now < m.armAt || m.sprite.active);
  }

  private updateDeathMines(now: number): void {
    this.deathMines = this.deathMines.filter((mine) => {
      if (now < mine.detonateAt) return true;

      this.audio.playSfx('mine');
      const blast = this.add.circle(mine.sprite.x, mine.sprite.y, 16, COLORS.cyan, 0.28).setDepth(8);
      const ring = this.add.circle(mine.sprite.x, mine.sprite.y, 14, 0xffffff, 0.2).setDepth(8);
      this.tweens.add({ targets: blast, radius: mine.radius, alpha: 0, duration: 360, onComplete: () => blast.destroy() });
      this.tweens.add({ targets: ring, radius: mine.radius * 0.82, alpha: 0, duration: 320, onComplete: () => ring.destroy() });

      const playerDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, mine.sprite.x, mine.sprite.y);
      if (playerDist <= mine.radius) {
        const falloff = 1 - playerDist / (mine.radius + 1);
        this.player.takeDamage(mine.damage * falloff);
      }

      for (const turret of this.turrets) {
        const d = Phaser.Math.Distance.Between(turret.sprite.x, turret.sprite.y, mine.sprite.x, mine.sprite.y);
        if (d <= mine.radius) turret.takeDamage(mine.damage * 0.5 * (1 - d / (mine.radius + 1)));
      }

      for (const fence of this.fences) {
        const d = Phaser.Math.Distance.Between(fence.sprite.x, fence.sprite.y, mine.sprite.x, mine.sprite.y);
        if (d <= mine.radius) fence.hp -= mine.damage * 0.38 * (1 - d / (mine.radius + 1));
      }

      mine.sprite.destroy();
      return false;
    });
  }

  private updatePickups(now: number, dt: number): void {
    for (const p of this.pickups) p.sprite.rotation += dt * 2;

    this.pickups = this.pickups.filter((p) => {
      if (now > p.expiresAt) {
        p.sprite.destroy();
        return false;
      }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.sprite.x, p.sprite.y);
      if (d < this.player.stats.pickupRadius) {
        this.collectPickup(p.type);
        p.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  private applyMagneticPayload(mine: Mine, now: number): void {
    const rank = this.modRuntime.rank('magnetic-payload');
    if (!this.modRuntime.has('magnetic-payload') || mine.readyToDetonate(now)) return;
    const pullRadius = MOD_BALANCE.magneticPayload.pullRadius[rank];
    const pullStrength = MOD_BALANCE.magneticPayload.pullStrength[rank];
    for (const enemy of this.enemies) {
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, mine.sprite.x, mine.sprite.y);
      if (distance > pullRadius || distance < 4) continue;
      const resistance = magneticResistanceForEnemy(enemy.stats.type);
      const direction = new Phaser.Math.Vector2(mine.sprite.x - enemy.x, mine.sprite.y - enemy.y).normalize();
      enemy.setVelocity(direction.x * pullStrength * resistance, direction.y * pullStrength * resistance);
    }
    if (now - mine.lastMagneticPulseAt >= 80) {
      mine.lastMagneticPulseAt = now;
      const ring = this.add.circle(mine.sprite.x, mine.sprite.y, pullRadius, COLORS.cyan, 0.015).setStrokeStyle(1, COLORS.cyan, 0.28).setDepth(5);
      this.tweens.add({ targets: ring, radius: 12, alpha: 0, duration: 180, onComplete: () => ring.destroy() });
    }
  }

  private updateEmergencyCapacitor(now: number): void {
    if (this.player.hp <= 0) return;
    const activation = this.modRuntime.checkEmergencyCapacitor(this.player.hp / this.player.stats.maxHealth);
    if (!activation) return;
    this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + this.player.energyStats.max * activation.energyShare);
    if (activation.speedDurationMs > 0) {
      this.player.modSpeedMultiplier = activation.speedMultiplier;
      this.player.modSpeedBoostUntil = now + activation.speedDurationMs;
    }
    const pulse = this.add.circle(this.player.x, this.player.y, 18, COLORS.cyan, 0.25).setStrokeStyle(3, 0xffffff, 0.9).setDepth(12);
    this.tweens.add({ targets: pulse, radius: 54, alpha: 0, duration: 340, onComplete: () => pulse.destroy() });
  }

  private triggerSplitCurrent(killedEnemy: Enemy, finalKillingDamage: number): void {
    const standardRank = this.modRuntime.rank('split-current');
    const corruptedRank = this.modRuntime.rank('fractured-current');
    const hasStandard = this.modRuntime.has('split-current');
    const hasCorrupted = this.modRuntime.has('fractured-current');
    if (!hasStandard && !hasCorrupted) return;
    const standardShare = hasStandard ? MOD_BALANCE.splitCurrent.damageShare[standardRank] : 0;
    const corruptedShare = hasCorrupted ? MOD_BALANCE.fracturedCurrent.damageShare[corruptedRank] : 0;
    const radius = corruptedShare > standardShare
      ? MOD_BALANCE.fracturedCurrent.radius[corruptedRank]
      : MOD_BALANCE.splitCurrent.radius[standardRank];
    const target = this.enemies
      .filter((enemy) => enemy !== killedEnemy && !enemy.isDead())
      .map((enemy) => ({ enemy, distance: Phaser.Math.Distance.Between(killedEnemy.x, killedEnemy.y, enemy.x, enemy.y) }))
      .filter(({ distance }) => distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0]?.enemy;
    if (!target) return;
    const damage = corruptedShare > standardShare
      ? finalKillingDamage * corruptedShare
      : splitCurrentSecondaryDamage(finalKillingDamage, standardRank, false);
    target.takeDamage(damage);
    const arc = this.add.graphics().setDepth(11);
    arc.lineStyle(3, COLORS.cyan, 0.95);
    arc.beginPath();
    arc.moveTo(killedEnemy.x, killedEnemy.y);
    const midX = (killedEnemy.x + target.x) * 0.5 + Phaser.Math.Between(-12, 12);
    const midY = (killedEnemy.y + target.y) * 0.5 + Phaser.Math.Between(-12, 12);
    arc.lineTo(midX, midY);
    arc.lineTo(target.x, target.y);
    arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, duration: 150, onComplete: () => arc.destroy() });
  }

  private playDetonationFireworks(x: number, y: number): void {
    const colors = [0xff55dd, 0x55eeff, 0xffd35a, 0x7cff8b];
    const config = MOD_BALANCE.detonationFireworks;
    const duration = Phaser.Math.Between(config.minDurationMs, config.maxDurationMs);
    const startsAt = this.time.now;
    let burst = 0;
    const timer = this.time.addEvent({
      delay: config.burstIntervalMs,
      repeat: Math.max(0, Math.ceil(duration / config.burstIntervalMs) - 1),
      callback: () => {
        if (!this.sys.isActive() || this.time.now - startsAt > duration) { timer.remove(); return; }
        const bx = x + Phaser.Math.Between(-155, 155);
        const by = y + Phaser.Math.Between(-145, 35);
        const rays = SaveSystem.get().settings.particles ? config.sparksPerBurst : Math.ceil(config.sparksPerBurst / 2);
        for (let ray = 0; ray < rays; ray += 1) {
          const angle = ray / rays * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
          const distance = Phaser.Math.Between(52, 88);
          const spark = this.add.circle(bx, by, Phaser.Math.Between(2, 4), colors[(burst + ray) % colors.length], 1).setDepth(42);
          this.tweens.add({ targets: spark, x: bx + Math.cos(angle) * distance, y: by + Math.sin(angle) * distance, alpha: 0, duration: Phaser.Math.Between(480, 760), ease: 'Cubic.Out', onComplete: () => spark.destroy() });
        }
        burst += 1;
      }
    });
  }

  private updateArenaHealthDrops(now: number): void {
    if (now < this.nextArenaHealthDropAt) return;

    this.nextArenaHealthDropAt = now + Phaser.Math.Between(
      PICKUP_BALANCE.arenaHealthMinIntervalMs,
      PICKUP_BALANCE.arenaHealthMaxIntervalMs
    );

    const activeHealthDrops = this.pickups.filter((pickup) => pickup.type === 'health').length;
    if (activeHealthDrops >= PICKUP_BALANCE.maxArenaHealthDrops) return;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const bounds=this.layout.generation.bounds;
      const x = Phaser.Math.Between(bounds.x+100, bounds.x+bounds.w-100);
      const y = Phaser.Math.Between(bounds.y+100, bounds.y+bounds.h-100);
      if (!this.isClearForArenaPickup(x, y)) continue;

      const pickup = this.createPickupSprite('health', x, y, COLORS.green);
      this.tweens.add({ targets: pickup, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 360, repeat: -1 });
      this.pickups.push({
        type: 'health',
        sprite: pickup,
        expiresAt: now + PICKUP_BALANCE.arenaHealthLifetimeMs
      });
      return;
    }
  }

  private getSecondaryTurretTarget(enemy: Enemy, now: number): Turret | null {
    if (!['grunt', 'shooter', 'tank', 'star'].includes(enemy.stats.type) || this.turrets.length === 0) return null;

    const previous = this.enemyTurretTargets.get(enemy);
    if (previous && now < previous.reconsiderAt && previous.turret && previous.turret.hp > 0) return previous.turret;
    if (previous && now < previous.reconsiderAt) return null;

    const chance = enemy.stats.type === 'star' ? 0.34
      : enemy.stats.type === 'tank' ? 0.28
        : enemy.stats.type === 'shooter' ? 0.18
          : 0.14;
    const nearby = this.turrets
      .filter((turret) => turret.hp > 0 && Phaser.Math.Distance.Between(enemy.x, enemy.y, turret.sprite.x, turret.sprite.y) <= 380)
      .sort((a, b) => Phaser.Math.Distance.Between(enemy.x, enemy.y, a.sprite.x, a.sprite.y)
        - Phaser.Math.Distance.Between(enemy.x, enemy.y, b.sprite.x, b.sprite.y));
    const turret = nearby.length > 0 && Math.random() < chance ? nearby[0] : null;
    this.enemyTurretTargets.set(enemy, {
      turret,
      reconsiderAt: now + (turret ? Phaser.Math.Between(2200, 4200) : Phaser.Math.Between(1800, 3200))
    });
    return turret;
  }

  private isClearForArenaPickup(x: number, y: number): boolean {
    const clearance = 30;
    if (this.wallRects.some((wall) =>
      x >= wall.x - clearance && x <= wall.x + wall.w + clearance
      && y >= wall.y - clearance && y <= wall.y + wall.h + clearance
    )) return false;

    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 160) return false;
    if (this.bombSites.sites.some((site) => Phaser.Math.Distance.Between(x, y, site.x, site.y) < 110)) return false;
    if (this.pickups.some((pickup) => Phaser.Math.Distance.Between(x, y, pickup.sprite.x, pickup.sprite.y) < 90)) return false;
    return true;
  }

  private collectPickup(type: PickupType): void {
    this.audio.playSfx('pickup');
    if (type === 'health') this.player.hp = Math.min(this.player.stats.maxHealth, this.player.hp + PICKUP_BALANCE.healthRestore);
    if (type === 'energy') {
      const restored = this.player.energyStats.max * PICKUP_BALANCE.energyRestoreFraction;
      this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + restored);
    }
    if (type === 'damageBoost') this.player.buffs.damageBoostUntil = this.time.now + WEAPON_BALANCE.buffDurationMs;
    if (type === 'speedBoost') this.player.buffs.speedBoostUntil = this.time.now + WEAPON_BALANCE.buffDurationMs;
    if (type === 'rapidFire') this.player.buffs.rapidFireUntil = this.time.now + WEAPON_BALANCE.buffDurationMs;
    if (type === 'credits') {
      this.roundCredits += PICKUP_BALANCE.credits;
      this.totalCreditsCollected += PICKUP_BALANCE.credits;
    }
    if (type === 'coreToken') this.roundCoreTokens += 1;

    const t = this.add.text(this.player.x, this.player.y - 24, `+${type}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '18px',
      color: '#96ffe4'
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 620, onComplete: () => t.destroy() });
  }

  private killEnemy(enemy: Enemy): void {
    this.audio.playSfx('enemyDeath');
    this.roundCredits += enemy.stats.valueCredits;
    this.roundCoreTokens += enemy.stats.valueCoreTokens;
    this.totalCreditsCollected += enemy.stats.valueCredits;
    SaveSystem.recordEnemyDestroyed();

    this.tryAwardMod(enemy.stats.type === 'star' ? 'eliteEnemy' : 'normalEnemy', false, enemy.x, enemy.y);

    if (Math.random() < PICKUP_BALANCE.enemyDropChance) this.dropPickup(enemy.x, enemy.y);

    this.createDeathExplosion(enemy.x, enemy.y, enemy.stats.color);

    if (enemy.stats.type === 'star') {
      const mineSprite = this.add.circle(enemy.x, enemy.y, 14, COLORS.cyan, 0.78).setDepth(8);
      mineSprite.setStrokeStyle(3, 0xffffff, 0.95);
      const prePulse = this.add.circle(enemy.x, enemy.y, 20, COLORS.cyan, 0.16).setDepth(7);
      this.tweens.add({
        targets: mineSprite,
        alpha: { from: 0.3, to: 1 },
        duration: 160,
        yoyo: true,
        repeat: 5
      });
      this.tweens.add({ targets: prePulse, radius: 30, alpha: 0, duration: 950, onComplete: () => prePulse.destroy() });

      this.deathMines.push({
        sprite: mineSprite,
        detonateAt: this.time.now + 1000,
        damage: 62,
        radius: 170
      });
    }

    enemy.destroy();
  }

  private tryAwardMod(source: ModDropSource, guaranteed = false, x = this.player.x, y = this.player.y): void {
    const definition = rollModDrop({
      source,
      round: this.roundManager.round,
      seed: this.layout.seed,
      sequence: this.modDropSequence++,
      protocol: this.protocol,
      guaranteed
    });
    if (!definition) return;
    const duplicate = Boolean(SaveSystem.getModCollection().inventory[definition.id]?.discovered);
    const result = SaveSystem.addMod(definition.id);
    if (!result.ok) return;
    const card = SaveSystem.getModCollection().cards.at(-1);
    this.modsEarned.push({ modId: definition.id, duplicate, source });
    this.showBanner(`${duplicate ? 'MOD DUPLICATE' : 'MOD DISCOVERED'}\n${definition.name.toUpperCase()}`);
    if (card) {
      const view = createModCardView(this, x, y - 34, card, card.upgradeLevel, { width: 58, height: 82, compact: true, interactive: false }).setDepth(50);
      this.tweens.add({ targets: view, y: y - 104, scale: 1.25, alpha: 0, duration: 1250, ease: 'Cubic.Out', onComplete: () => view.destroy(true) });
    }
  }

  private createDeathExplosion(x: number, y: number, color: number, playerDeath = false): void {
    const scale = playerDeath ? 1.25 : 1;
    const flash = this.add.circle(x, y, 10 * scale, 0xffffff, 0.95).setDepth(10);
    const core = this.add.circle(x, y, 15 * scale, color, 0.78).setDepth(9);
    const ring = this.add.circle(x, y, 18 * scale, color, 0.16)
      .setStrokeStyle(3, color, 0.95)
      .setDepth(8);

    this.tweens.add({ targets: flash, radius: 25 * scale, alpha: 0, duration: 110, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: core, radius: 40 * scale, alpha: 0, duration: 220, ease: 'Quad.easeOut', onComplete: () => core.destroy() });
    this.tweens.add({ targets: ring, radius: 55 * scale, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

    if (!SaveSystem.get().settings.particles) return;
    const shardCount = playerDeath ? 12 : 7;
    for (let i = 0; i < shardCount; i += 1) {
      const angle = (Math.PI * 2 * i) / shardCount + Phaser.Math.FloatBetween(-0.18, 0.18);
      const distance = Phaser.Math.Between(28, playerDeath ? 68 : 48);
      const shard = this.add.rectangle(x, y, playerDeath ? 8 : 6, 2, i % 3 === 0 ? 0xffffff : color, 0.95)
        .setRotation(angle)
        .setDepth(10);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.35,
        duration: Phaser.Math.Between(220, 360),
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  private dropPickup(x: number, y: number): void {
    const roll = Math.random();
    let type: PickupType = 'credits';
    if (roll < PICKUP_BALANCE.healthShare) type = 'health';
    else if (roll < PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare) type = 'energy';
    else if (roll < PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare + PICKUP_BALANCE.damageBoostShare) type = 'damageBoost';
    else if (roll < PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare + PICKUP_BALANCE.damageBoostShare + PICKUP_BALANCE.speedBoostShare) type = 'speedBoost';
    else if (roll < 1 - PICKUP_BALANCE.creditsShare - PICKUP_BALANCE.coreTokenShare) type = 'rapidFire';
    else if (roll < 1 - PICKUP_BALANCE.coreTokenShare) type = 'credits';
    else type = 'coreToken';

    const colorMap: Record<PickupType, number> = {
      health: COLORS.green,
      energy: COLORS.cyan,
      damageBoost: COLORS.red,
      speedBoost: COLORS.pink,
      rapidFire: COLORS.orange,
      credits: 0xf2ff72,
      coreToken: COLORS.purple
    };

    const p = this.createPickupSprite(type, x, y, colorMap[type]);
    this.tweens.add({ targets: p, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 280, repeat: -1 });
    this.pickups.push({ type, sprite: p, expiresAt: this.time.now + PICKUP_BALANCE.lifetimeMs });
  }

  private createPickupSprite(type: PickupType, x: number, y: number, color: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(6);

    if (type === 'health') {
      const v = this.add.rectangle(0, 0, 5, 16, COLORS.green, 0.95).setStrokeStyle(1, 0xbaffc6, 1);
      const h = this.add.rectangle(0, 0, 16, 5, COLORS.green, 0.95).setStrokeStyle(1, 0xbaffc6, 1);
      const glow = this.add.circle(0, 0, 13, COLORS.green, 0.15).setStrokeStyle(1, COLORS.green, 0.55);
      container.add([glow, v, h]);
      return container;
    }

    if (type === 'energy') {
      const boltPoints = [
        -4, -12,
        2, -12,
        -1, -3,
        6, -3,
        -2, 12,
        1, 3,
        -6, 3
      ];
      const glow = this.add.circle(0, 0, 13, COLORS.cyan, 0.14).setStrokeStyle(1, COLORS.cyan, 0.5);
      const bolt = this.add.polygon(0, 0, boltPoints, COLORS.cyan, 0.95).setStrokeStyle(1, 0xddfbff, 0.95);
      container.add([glow, bolt]);
      return container;
    }

    if (type === 'damageBoost') {
      const glow = this.add.circle(0, 0, 15, color, 0.13).setStrokeStyle(1, color, 0.45);
      const body = this.add.rectangle(-1, -2, 18, 7, color, 0.95).setStrokeStyle(1, 0xffffff, 0.9);
      const barrel = this.add.rectangle(10, -2, 10, 3, 0xffffff, 0.92);
      const grip = this.add.polygon(-4, 5, [0, 0, 6, 0, 3, 10, -2, 10], color, 0.95);
      container.add([glow, body, barrel, grip]);
      return container;
    }

    if (type === 'speedBoost') {
      const glow = this.add.circle(0, 0, 15, color, 0.13).setStrokeStyle(1, color, 0.45);
      const rocket = this.add.polygon(0, -1, [0, -14, 7, -4, 6, 8, 0, 12, -6, 8, -7, -4], color, 0.96)
        .setStrokeStyle(1, 0xffffff, 0.9);
      const flame = this.add.triangle(0, 14, -5, 0, 5, 0, 0, 9, COLORS.orange, 0.92);
      container.add([glow, flame, rocket]);
      return container;
    }

    if (type === 'rapidFire') {
      const glow = this.add.circle(0, 0, 15, color, 0.13).setStrokeStyle(1, color, 0.45);
      const bolts = [-7, 0, 7].map((offset) => this.add.rectangle(offset, 0, 4, 20, color, 0.95)
        .setRotation(0.35).setStrokeStyle(1, 0xffffff, 0.7));
      container.add([glow, ...bolts]);
      return container;
    }

    if (type === 'credits') {
      const diamond = this.add.polygon(0, 0, [0, -11, 10, 0, 0, 11, -10, 0], color, 0.9)
        .setStrokeStyle(2, 0xffffff, 0.8);
      container.add(diamond);
      return container;
    }

    if (type === 'coreToken') {
      const token = this.add.polygon(0, 0, [0, -12, 10, -6, 10, 6, 0, 12, -10, 6, -10, -6], color, 0.88)
        .setStrokeStyle(2, 0xffffff, 0.9);
      const core = this.add.circle(0, 0, 4, 0xffffff, 0.9);
      container.add([token, core]);
      return container;
    }

    const circle = this.add.circle(0, 0, 8, color, 0.85).setStrokeStyle(2, color, 1);
    container.add(circle);
    return container;
  }

  private detonateSite(site: BombSiteRuntime): void {
    this.state.set(RoundState.Victory);

    const color = SaveSystem.getCosmeticColor('bombColor');
    this.audio.playSfx('bomb');
    this.cameras.main.shake(760, 0.02);
    this.physics.world.timeScale = 0.35;

    const ring1 = this.add.circle(site.x, site.y, 22, color, 0.38).setDepth(30);
    const ring2 = this.add.circle(site.x, site.y, 18, 0xffffff, 0.22).setDepth(29);
    this.tweens.add({ targets: ring1, radius: 520, alpha: 0, duration: 760, onComplete: () => ring1.destroy() });
    this.tweens.add({ targets: ring2, radius: 360, alpha: 0, duration: 620, onComplete: () => ring2.destroy() });

    for (let i = 0; i < 70; i += 1) {
      const shard = this.add.rectangle(site.x, site.y, Phaser.Math.Between(2, 5), Phaser.Math.Between(8, 18), Math.random() < 0.5 ? color : this.layout.theme.secondary, 0.95).setDepth(31);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(90, 420);
      this.tweens.add({
        targets: shard,
        x: site.x + Math.cos(a) * dist,
        y: site.y + Math.sin(a) * dist,
        angle: Phaser.Math.Between(-220, 220),
        alpha: 0,
        duration: Phaser.Math.Between(420, 900),
        onComplete: () => shard.destroy()
      });
    }

    if (this.modRuntime.hasInfusion('detonation-fireworks')) this.playDetonationFireworks(site.x, site.y);

    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(e.x, e.y, site.x, site.y);
      if (d < 360) e.takeDamage(9999);
    }

    this.projectiles = this.projectiles.filter((p) => {
      if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, site.x, site.y) < 330) {
        p.sprite.destroy();
        return false;
      }
      return true;
    });

    this.time.delayedCall(850, () => {
      this.physics.world.timeScale = 1;
      this.bombSites.onDetonated(site, this.layout.theme);
      this.bombSites.refreshVisuals(this.layout.theme);
      this.state.set(RoundState.PrePlant);
    });
  }

  private recoveryAfterSiteDestroy(): void {
    this.showBanner('SITE DESTROYED - CHOOSE NEXT TARGET');

    this.player.hp = Math.min(this.player.stats.maxHealth, this.player.hp + REWARD_BALANCE.siteRecoveryHealth);
    this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + REWARD_BALANCE.siteRecoveryEnergy);
    this.abilityCooldownUntil.fence = Math.min(this.abilityCooldownUntil.fence, this.time.now + 900);
    this.abilityCooldownUntil.turret = Math.min(this.abilityCooldownUntil.turret, this.time.now + 900);
    this.abilityCooldownUntil.mine = Math.min(this.abilityCooldownUntil.mine, this.time.now + 900);

    this.roundCredits += REWARD_BALANCE.siteRecoveryCredits;
    this.totalCreditsCollected += REWARD_BALANCE.siteRecoveryCredits;

    for (const s of this.bombSites.getRemainingSites()) {
      const pickupType: PickupType = Math.random() < 0.5 ? 'health' : 'energy';
      const px = s.x + Phaser.Math.Between(-20, 20);
      const py = s.y + Phaser.Math.Between(-20, 20);
      const p = this.createPickupSprite(pickupType, px, py, pickupType === 'health' ? COLORS.green : COLORS.cyan);
      this.tweens.add({ targets: p, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 280, repeat: -1 });
      this.pickups.push({ type: pickupType, sprite: p, expiresAt: this.time.now + 11_000 });
    }
  }

  private completeRound(): void {
    this.showBanner('ALL TARGETS DESTROYED');

    const completedRound = this.roundManager.round;
    const completedSeed = this.layout.seed;
    const completedTemplate = this.layout.template;
    this.tryAwardMod('milestone', isGuaranteedMilestone(completedRound));

    const rewardCredits = this.roundCredits + REWARD_BALANCE.completionBaseCredits + completedRound * REWARD_BALANCE.completionCreditsPerRound;
    const rewardTokens = this.roundCoreTokens + Math.max(REWARD_BALANCE.completionBaseTokens, Math.floor(completedRound / REWARD_BALANCE.tokenRoundDivisor));
    SaveSystem.addCredits(rewardCredits);
    SaveSystem.addCoreTokens(rewardTokens);
    SaveSystem.recordRoundCompletion(completedRound);
    OnlineRunManager.recordMilestone(completedRound);

    // Cosmetic infusions must never gate progression or delay round controls.
    this.time.delayedCall(1400, () => {
      const next = this.roundManager.nextRound();
      const payload: RoundFinishedPayload = {
        baseSeed: this.roundManager.seedBase,
        completedRound,
        completedSeed,
        completedTemplate,
        nextRound: next.round,
        nextSeed: next.seed,
        nextTemplate: next.template,
        objectiveMode: this.roundManager.mode,
        creditsGained: rewardCredits,
        coreTokensGained: rewardTokens,
        protocol: this.protocol,
        equippedMods: this.modRuntime.snapshot(),
        modsEarned: [...this.modsEarned],
        runStartedAt: this.runStartedAt
      };

      this.registry.set('round-finished', payload);
      this.scene.start(SceneKeys.RoundFinished);
    });
  }

  private triggerDefeat(reason: 'playerDead' | 'bombDefused'): void {
    if (this.state.state === RoundState.Defeat) return;
    if (reason === 'playerDead') {
      this.audio.playSfx('playerDeath');
      this.createDeathExplosion(this.player.x, this.player.y, SaveSystem.getCosmeticColor('playerColor'), true);
      this.player.setVisible(false);
    }
    this.state.set(RoundState.Defeat);
    this.audio.stopDisarmLoop();
    this.physics.pause();

    const result: ArenaReward = {
      credits: this.roundCredits,
      coreTokens: this.roundCoreTokens,
      reason,
      round: this.roundManager.round,
      seed: this.layout.seed,
      protocol: this.protocol,
      equippedMods: this.modRuntime.snapshot(),
      modsEarned: [...this.modsEarned],
      runDurationMs: Date.now() - this.runStartedAt
    };

    SaveSystem.addCredits(result.credits);
    SaveSystem.addCoreTokens(result.coreTokens);
    OnlineRunManager.complete(reason === 'playerDead' ? 'player_dead' : 'bomb_defused', this.roundManager.round);
    this.registry.remove('arena-session');

    this.time.delayedCall(700, () => {
      this.registry.set('result', result);
      this.scene.start(SceneKeys.Results);
    });
  }

  private updateHud(now: number): void {
    const active = this.bombSites.getActiveBombSite();
    const bombText = active
      ? this.state.state === RoundState.Defusing
        ? `DEFUSE IN PROGRESS  Site ${active.letter}  ${Math.ceil(active.timerMs / 1000)}s  ${Math.round((active.defuseMs / OBJECTIVE_CONFIG.defuseRequiredMs) * 100)}%`
        : `CHARGE ARMED  Site ${active.letter}  ${Math.ceil(active.timerMs / 1000)}s  Defuse ${Math.round((active.defuseMs / OBJECTIVE_CONFIG.defuseRequiredMs) * 100)}%`
      : 'NO ACTIVE CHARGE';

    const phaseMap: Record<RoundState, string> = {
      [RoundState.PrePlant]: 'PRE-PLANT',
      [RoundState.Planting]: 'PLANTING',
      [RoundState.Defense]: 'DEFEND',
      [RoundState.Defusing]: 'DEFUSE ALERT',
      [RoundState.Victory]: 'ROUND COMPLETE',
      [RoundState.Defeat]: 'MISSION FAILURE',
      [RoundState.Paused]: 'PAUSED'
    };

    const fmtBuff = (label: string, until: number): string => {
      const sec = Math.max(0, (until - now) / 1000);
      if (sec <= 0) return '';
      const shown = sec < 1 ? sec.toFixed(1) : `${Math.ceil(sec)}`;
      return `${label} ${shown}s`;
    };

    this.hudBuffs.length = 0;
    for (const buff of [
      fmtBuff('DAMAGE+', this.player.buffs.damageBoostUntil),
      fmtBuff('SPEED+', this.player.buffs.speedBoostUntil),
      fmtBuff('RAPID FIRE+', this.player.buffs.rapidFireUntil)
    ]) {
      if (buff.length > 0) this.hudBuffs.push(buff);
    }

    const fenceCfg = this.getAbilityConfig('fence');
    const turretCfg = this.getAbilityConfig('turret');
    const mineCfg = this.getAbilityConfig('mine');

    const fenceCdMs = Math.max(0, this.abilityCooldownUntil.fence - now);
    const turretCdMs = Math.max(0, this.abilityCooldownUntil.turret - now);
    const mineCdMs = Math.max(0, this.abilityCooldownUntil.mine - now);
    const shieldCdMs = Math.max(0, this.shieldCooldownUntil - now);

    this.hudPayload.hp = this.player.hp;
    this.hudPayload.maxHp = this.player.stats.maxHealth;
    this.hudPayload.energy = this.player.energy;
    this.hudPayload.maxEnergy = this.player.energyStats.max;
    this.hudPayload.level = this.roundManager.round;
    this.hudPayload.enemies = this.enemies.length;
    this.hudPayload.credits = this.totalCreditsCollected;
    this.hudPayload.phase = phaseMap[this.state.state];
    this.hudPayload.objective = bombText;
    this.hudPayload.defuseAlert = this.state.state === RoundState.Defusing;
    this.hudPayload.bombUrgent = Boolean(active && active.timerMs <= 15_000);
    this.hudPayload.bombActive = Boolean(active);
    this.hudPayload.bombProgress = active
      ? Phaser.Math.Clamp(1 - active.timerMs / OBJECTIVE_CONFIG.bombDefenseMs, 0, 1)
      : 0;

    const [fenceSlot, turretSlot, mineSlot, shieldSlot] = this.hudPayload.abilities;
    fenceSlot.cooldownMs = fenceCdMs;
    fenceSlot.selected = this.selectedAbility === 'fence';
    fenceSlot.hasEnergy = this.player.energy >= fenceCfg.energyCost;
    fenceSlot.underLimit = this.fences.length < fenceCfg.maxActive;

    turretSlot.cooldownMs = turretCdMs;
    turretSlot.selected = this.selectedAbility === 'turret';
    turretSlot.hasEnergy = this.player.energy >= turretCfg.energyCost;
    turretSlot.underLimit = this.turrets.length < turretCfg.maxActive;

    mineSlot.cooldownMs = mineCdMs;
    mineSlot.selected = this.selectedAbility === 'mine';
    mineSlot.hasEnergy = this.player.energy >= mineCfg.energyCost;
    mineSlot.underLimit = this.mines.length < mineCfg.maxActive;

    shieldSlot.cooldownMs = now < this.shieldActiveUntil ? this.shieldActiveUntil - now : shieldCdMs;
    shieldSlot.active = now < this.shieldActiveUntil;
    shieldSlot.hasEnergy = this.player.energy >= ABILITY_BALANCE.shield.energyCost;

    this.hud.update(this.hudPayload);
  }

  private updateBalanceTelemetry(): void {
    if (!this.balanceTelemetry?.visible) return;
    const round = this.roundManager.round;
    const destroyed = this.bombSites.destroyedCount();
    const spawn = getSpawnProfile(round, destroyed);
    const curve = getDifficultyCurve(round, destroyed);
    const activeWeight = this.enemies.reduce((sum, enemy) => sum + ENEMY_BALANCE[enemy.stats.type].weight, 0);
    const totalHp = this.enemies.reduce((sum, enemy) => sum + enemy.hp, 0);
    this.balanceTelemetry.setText(
      `BALANCE DEV (F8)  R${round}  Sites ${destroyed}/${this.bombSites.sites.length}\n`
      + `Enemies ${this.enemies.length}/${spawn.activeCountCap}  Weight ${activeWeight.toFixed(1)}/${spawn.activeWeightCap.toFixed(1)}  HP ${Math.round(totalHp)}\n`
      + `HPx ${curve.healthMultiplier.toFixed(2)}  DMGx ${curve.damageMultiplier.toFixed(2)}  Cadence ${spawn.defenseCadenceMs}ms\n`
      + `ARENA (F7 regenerate) ${this.layout.template} ${this.layout.generation.bounds.w}x${this.layout.generation.bounds.h} attempt ${this.layout.generation.attempt} similarity ${this.layout.generation.similarityScore.toFixed(3)} open ${this.layout.generation.openSpacePercentage}%`
    );
  }

  private updateCrosshair(): void {
    const { x, y } = this.getAimWorldPoint();
    const valid = this.isValidPlacement(x, y);
    const color = valid ? 0x6ff6ff : COLORS.red;

    this.crosshair.clear();
    this.crosshair.lineStyle(2, color, 0.95);
    this.crosshair.strokeCircle(x, y, 10);
    this.crosshair.lineBetween(x - 16, y, x - 5, y);
    this.crosshair.lineBetween(x + 5, y, x + 16, y);
    this.crosshair.lineBetween(x, y - 16, x, y - 5);
    this.crosshair.lineBetween(x, y + 5, x, y + 16);
    this.crosshair.fillStyle(color, 0.95);
    this.crosshair.fillCircle(x, y, 1.8);
  }

  private getAbilityConfig(type: AbilityType): {
    energyCost: number;
    cooldownMs: number;
    maxActive: number;
    damage: number;
    hp: number;
    durationMs: number;
    range: number;
    fireRate: number;
    armMs: number;
    radius: number;
  } {
    const up = SaveSystem.get().upgrades;
    if (type === 'fence') {
      return {
        energyCost: ABILITY_BALANCE.fence.energyCost,
        cooldownMs: ABILITY_BALANCE.fence.cooldownMs,
        maxActive: ABILITY_BALANCE.fence.maxActive + getUpgradeLevel(up, 'fence.max'),
        damage: ABILITY_BALANCE.fence.damage + getUpgradeLevel(up, 'fence.damage') * 4,
        hp: ABILITY_BALANCE.fence.hp + getUpgradeLevel(up, 'fence.health') * 16,
        durationMs: ABILITY_BALANCE.fence.durationMs + getUpgradeLevel(up, 'fence.duration') * 1200,
        range: 0,
        fireRate: 0,
        armMs: 0,
        radius: 0
      };
    }
    if (type === 'turret') {
      return {
        energyCost: ABILITY_BALANCE.turret.energyCost,
        cooldownMs: ABILITY_BALANCE.turret.cooldownMs,
        maxActive: ABILITY_BALANCE.turret.maxActive + getUpgradeLevel(up, 'turret.max'),
        damage: ABILITY_BALANCE.turret.damage + getUpgradeLevel(up, 'turret.damage') * 2,
        hp: ABILITY_BALANCE.turret.hp + getUpgradeLevel(up, 'turret.health') * 20,
        durationMs: 0,
        range: ABILITY_BALANCE.turret.range + getUpgradeLevel(up, 'turret.range') * 12,
        fireRate: ABILITY_BALANCE.turret.fireRate + getUpgradeLevel(up, 'turret.fireRate') * 0.25,
        armMs: 0,
        radius: 0
      };
    }

    return {
      energyCost: ABILITY_BALANCE.mine.energyCost,
      cooldownMs: ABILITY_BALANCE.mine.cooldownMs,
      maxActive: ABILITY_BALANCE.mine.maxActive + getUpgradeLevel(up, 'mine.max'),
      damage: ABILITY_BALANCE.mine.damage + getUpgradeLevel(up, 'mine.damage') * 7,
      hp: 0,
      durationMs: 0,
      range: 0,
      fireRate: 0,
      armMs: Math.max(400, ABILITY_BALANCE.mine.armMs - getUpgradeLevel(up, 'mine.arm') * 70),
      radius: ABILITY_BALANCE.mine.radius + getUpgradeLevel(up, 'mine.radius') * 7
    };
  }

  private hitWall(x: number, y: number): boolean {
    return this.wallRects.some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);
  }

  private isValidPlacement(x: number, y: number): boolean {
    const bounds=this.layout.generation.bounds;
    if (x < bounds.x+40 || y < bounds.y+40 || x > bounds.x+bounds.w-40 || y > bounds.y+bounds.h-40) return false;
    if (this.hitWall(x, y)) return false;
    for (const s of this.bombSites.sites) {
      if (Phaser.Math.Distance.Between(x, y, s.x, s.y) < 86) return false;
    }
    return true;
  }

  private getNearestEnemy(x: number, y: number, range: number): Enemy | null {
    const priorityRank = this.modRuntime.has('priority-targeting') ? this.modRuntime.rank('priority-targeting') : -1;
    return prioritizeTurretTargets(this.enemies
      .filter((enemy) => !enemy.isDead())
      .map((enemy) => ({ enemy, distance: Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y), activelyDefusing: this.defuseAssignees.has(enemy), marked: this.time.now < (this.defuserMarkedUntil.get(enemy) ?? 0) }))
      .filter(({ distance }) => distance < range), priorityRank)[0]?.enemy ?? null;
  }

  private getBlockers(): RectSpec[] {
    return [...this.wallRects];
  }

  private distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const clamped = Phaser.Math.Clamp(t, 0, 1);
    const cx = x1 + clamped * dx;
    const cy = y1 + clamped * dy;
    return Math.hypot(px - cx, py - cy);
  }

  private togglePause(): void {
    if (this.state.state === RoundState.Paused) {
      this.resumeGameplay();
      return;
    }

    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();

    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.clearGameplayInput();
    this.pointerLock?.release();
    this.showPauseMenu();
  }

  private clearGameplayInput(): void {
    this.pointerDown = false;
    this.pressedAbilityActions.clear();
    this.player?.setVelocity(0, 0);
    this.input.keyboard?.resetKeys();
  }

  private pauseForPointerLock(reason: 'initial' | 'unlock' | 'blur' | 'hidden' | 'error'): void {
    if (this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat) return;
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.clearGameplayInput();
    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.setMenuCursorMode();
    if (reason !== 'initial') {
      this.pointerLock?.hidePrompt();
      this.showPauseMenu();
    }
  }

  private resumeFromPointerLock(): void {
    if (this.state.state !== RoundState.Paused || this.pauseMenu) return;
    this.setGameplayCursorMode();
    const activeSite = this.bombSites.getActiveBombSite();
    const defusing = activeSite?.state === BombSiteState.BeingDefused;
    this.state.set(defusing ? RoundState.Defusing : activeSite ? RoundState.Defense : RoundState.PrePlant);
    if (defusing) this.audio.startDisarmLoop();
    this.physics.resume();
  }

  private showBanner(text: string): void {
    this.bannerText.setText(text).setAlpha(0).setY(56);
    this.tweens.add({
      targets: this.bannerText,
      alpha: { from: 0, to: 1 },
      y: 88,
      duration: 260,
      yoyo: true,
      hold: 800
    });
  }

  private handleResize(size: Phaser.Structs.Size): void {
    const width = size.width;
    const height = size.height;
    this.bannerText.setPosition(width * 0.5, this.bannerText.y);
    this.siteActionText.setPosition(width * 0.5, height - 46);
    if (this.pauseMenu) {
      this.pauseMenu.backdrop.setPosition(width * 0.5, height * 0.5);
      this.pauseMenu.backdrop.setDisplaySize(width, height);
      this.pauseMenu.panel.setPosition(width * 0.5, height * 0.5);
      this.pauseMenu.title.setPosition(width * 0.5, height * 0.5 - 190);
      this.pauseMenu.subtitle.setPosition(width * 0.5, height * 0.5 - 128);

      const buttonYs = [height * 0.5 - 68, height * 0.5 - 16, height * 0.5 + 36, height * 0.5 + 88, height * 0.5 + 140, height * 0.5 + 192];
      this.pauseMenu.buttons.forEach((btn, i) => btn.setPosition(width * 0.5, buttonYs[i] ?? height * 0.5));
    }
  }

  private showPauseMenu(): void {
    this.hidePauseMenu();
    this.setMenuCursorMode();

    const { width, height } = this.scale;
    const backdrop = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x03060c, 0.72)
      .setScrollFactor(0)
      .setDepth(1185);
    const panel = this.add.rectangle(width * 0.5, height * 0.5, 560, 540, 0x0c1320, 0.96)
      .setStrokeStyle(2, 0x53dfff, 0.9)
      .setScrollFactor(0)
      .setDepth(1190);

    const title = this.add.text(width * 0.5, height * 0.5 - 190, 'PAUSED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '44px',
      color: '#70f7ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1192);

    const subtitle = this.add.text(
      width * 0.5,
      height * 0.5 - 128,
      `Round ${this.roundManager.round} | Seed ${this.layout.seed} | Layout ${this.layout.template}`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '26px',
        color: '#e1f8ff',
        align: 'center'
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1192);

    const buttons = [
      createButton(this, width * 0.5, height * 0.5 - 68, 'Resume', () => this.resumeGameplay(), 280),
      createButton(this, width * 0.5, height * 0.5 - 16, 'Equipped Mod Cards', () => this.showEquippedModsViewer(), 280),
      createButton(this, width * 0.5, height * 0.5 + 36, 'Restart From Round 1', () => this.restartFromRoundOne(), 280),
      createButton(this, width * 0.5, height * 0.5 + 88, 'Options', () => {
        this.hidePauseMenu();
        this.scene.launch(SceneKeys.Options, { returnScene: SceneKeys.Arena, resumeGameplay: true });
        this.scene.pause();
      }, 280),
      createButton(this, width * 0.5, height * 0.5 + 140, 'Store', () => this.scene.start(SceneKeys.Upgrades), 280),
      createButton(this, width * 0.5, height * 0.5 + 192, 'Quit To Main Menu', () => this.quitToMenu(), 280)
    ];
    buttons.forEach((btn) => {
      btn.setScrollFactor(0).setDepth(1195);
      for (const child of btn.list) {
        if ('setScrollFactor' in child && typeof child.setScrollFactor === 'function') {
          child.setScrollFactor(0);
        }
      }
    });

    this.pauseMenu = { backdrop, panel, title, subtitle, buttons };
  }

  private showEquippedModsViewer(): void {
    this.hidePauseMenu();
    this.hideEquippedModsViewer();
    const { width, height } = this.scale;
    const root = this.add.container(0, 0).setScrollFactor(0).setDepth(1250);
    root.add(this.add.rectangle(width / 2, height / 2, width, height, 0x02050b, 0.88));
    root.add(this.add.rectangle(width / 2, height / 2, Math.min(width - 60, 1040), 470, 0x091521, 0.98).setStrokeStyle(2, 0x62e9ff, 0.9));
    root.add(this.add.text(width / 2, height / 2 - 192, 'EQUIPPED MOD CARDS', { fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: '#71f6ff' }).setOrigin(0.5));
    const mods = SaveSystem.getModCollection();
    const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equipped = this.modRuntime.snapshot();
    equipped.forEach((entry, index) => {
      const selectedCardId = Object.entries(loadout?.slots ?? {}).find(([, modId]) => modId === entry.id)?.[0] as ModSlot | undefined;
      const card = mods.cards.find((candidate) => candidate.instanceId === (selectedCardId ? loadout?.cardSlots[selectedCardId] : ''))
        ?? mods.cards.find((candidate) => candidate.modId === entry.id);
      if (!card) return;
      const spacing = Math.min(175, (width - 110) / Math.max(1, equipped.length));
      const x = width / 2 - (equipped.length - 1) * spacing / 2 + index * spacing;
      root.add(createModCardView(this, x, height / 2, card, entry.rank, { width: 140, height: 196, compact: true, interactive: false }));
    });
    if (!equipped.length) root.add(this.add.text(width / 2, height / 2, 'NO MOD CARDS EQUIPPED', { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#7895a8' }).setOrigin(0.5));
    const close = createButton(this, width / 2, height / 2 + 190, 'Back To Pause Menu', () => { this.hideEquippedModsViewer(); this.showPauseMenu(); }, 280);
    root.add(close);
    this.equippedModsViewer = root;
  }

  private hideEquippedModsViewer(): void { this.equippedModsViewer?.destroy(true); this.equippedModsViewer = null; }

  private hidePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.backdrop.destroy();
    this.pauseMenu.panel.destroy();
    this.pauseMenu.title.destroy();
    this.pauseMenu.subtitle.destroy();
    this.pauseMenu.buttons.forEach((btn) => btn.destroy());
    this.pauseMenu = null;
  }

  private resumeGameplay(): void {
    this.hideEquippedModsViewer();
    this.hidePauseMenu();
    if (this.state.state !== RoundState.Paused) return;
    this.pointerLock?.showResume();
    this.pointerLock?.requestLock();
  }

  private restartFromRoundOne(): void {
    startArenaLoad(this, { reason: 'new-run', message: 'Restarting from round 1...' });
  }

  private quitToMenu(): void {
    this.setMenuCursorMode();
    OnlineRunManager.complete('quit', this.roundManager.round);
    this.registry.remove('arena-session');
    RunTransitionManager.clearForMenu(this);
    this.scene.start(SceneKeys.MainMenu);
  }

  private cleanupRoundObjects(): void {
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.sprite.destroy();
    for (const p of this.pickups) p.sprite.destroy();
    for (const f of this.fences) f.destroy();
    for (const t of this.turrets) t.destroy();
    for (const m of this.mines) m.destroy();
    for (const m of this.deathMines) m.sprite.destroy();
    this.bombSites?.destroy();
    this.destroyShieldOrb();

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.pickups.length = 0;
    this.fences.length = 0;
    this.turrets.length = 0;
    this.mines.length = 0;
    this.deathMines.length = 0;
    this.defuseAssignees.clear();

    this.children.list
      .filter((obj) => 'depth' in obj && (obj as { depth: number }).depth <= 4 && obj !== this.player)
      .forEach((obj) => obj.destroy());
  }

  private cleanup(): void {
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.scale.off('resize', this.handleResize, this);
    this.events.off('resume-from-options', this.onResumeFromOptions);
    this.hud?.destroy();
    this.siteActionText?.destroy();
    this.bannerText?.destroy();
    this.crosshair?.destroy();
    this.balanceTelemetry?.destroy();
    this.balanceTelemetry = null;
    this.hidePauseMenu();
    this.hideEquippedModsViewer();
    this.bombSites?.destroy();
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    this.destroyShieldOrb();
    this.input.off('pointerdown', this.onPointerDown);
    this.input.off('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onAbilityKeyDown);
    this.pointerLock?.destroy();
    this.pointerLock = null;
    this.setMenuCursorMode();
  }
}
