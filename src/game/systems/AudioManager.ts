import { SaveSystem } from './SaveSystem';
import { DEFAULT_AUDIO_VOLUME, SFX_DEFINITIONS, type AudioSfxName } from '../config/audio';
import { publicAssetUrl } from '../utils/assetUrl';

const audioAssetUrl = (path: string): string => publicAssetUrl(`assets/audio/${path}`);
const BOMBLET_SFX_POOL_SIZE = 8;
const ENEMY_DEATH_SFX_MAX_CONCURRENT = 4;
const ENEMY_DEATH_SFX_MIN_INTERVAL_MS = 45;
const HIT_DAMAGE_SFX_POOL_SIZE = 6;
const HIT_DAMAGE_SFX_MIN_INTERVAL_MS = 55;
const MENU_SFX_POOL_SIZE = 4;
const MENU_HOVER_SFX_MIN_INTERVAL_MS = 45;
const PICKUP_SFX_POOL_SIZE = 4;
const PICKUP_SFX_MAX_CONCURRENT = 6;
const LOW_HEALTH_LOOP_GAP_MS = 900;
const ABILITY_FEEDBACK_SFX_POOL_SIZE = 6;
const UNAVAILABLE_SFX_MIN_INTERVAL_MS = 90;
const PRESENTATION_SFX_SOURCES = {
  gasCanImpact: 'soundeffects/gascanhitting.mp3',
  gasFizz: 'soundeffects/gasfizz.mp3',
  totemEntrance: 'soundeffects/totementrance.mp3',
  totemPulse: 'soundeffects/totempulsesound.mp3',
  miniBossSpawn: 'soundeffects/minibossspawn.mp3',
  bossArtilleryExplosion: 'soundeffects/bossartillaryexplosion.mp3',
  sentryBossAttack: 'soundeffects/senturybossattack.mp3',
  grenadeShotExplosion: 'soundeffects/grenadeshotexplosion.mp3',
  mageBossLargeAttack: 'soundeffects/magebosslargeattack.mp3',
  mageBossMagicAttack: 'soundeffects/magebossmagicattack.mp3',
  brawlerBossChargeAttack: 'soundeffects/brawlerbosschargeattack.mp3',
  circuitGate: 'soundeffects/arenacircuitgate.mp3',
  bombsiteSkull: 'soundeffects/skullbombsite.mp3',
  bombsiteFlower: 'soundeffects/flowerbombsite.mp3',
  bombsiteBats: 'soundeffects/batbombsite.mp3',
  bombsiteWitch: 'soundeffects/witchlaugh.mp3'
} as const;
type PresentationSfxName = keyof typeof PRESENTATION_SFX_SOURCES;
const PRESENTATION_SFX_POOL_SIZES: Record<PresentationSfxName, number> = {
  gasCanImpact: 3,
  gasFizz: 2,
  totemEntrance: 3,
  totemPulse: 4,
  miniBossSpawn: 2,
  bossArtilleryExplosion: 4,
  sentryBossAttack: 2,
  grenadeShotExplosion: 6,
  mageBossLargeAttack: 2,
  mageBossMagicAttack: 3,
  brawlerBossChargeAttack: 2,
  circuitGate: 2,
  bombsiteSkull: 2,
  bombsiteFlower: 2,
  bombsiteBats: 2,
  bombsiteWitch: 2
};
const PRESENTATION_SFX_MIN_INTERVAL_MS: Record<PresentationSfxName, number> = {
  gasCanImpact: 70,
  gasFizz: 220,
  totemEntrance: 100,
  totemPulse: 55,
  miniBossSpawn: 300,
  bossArtilleryExplosion: 65,
  sentryBossAttack: 140,
  grenadeShotExplosion: 35,
  mageBossLargeAttack: 500,
  mageBossMagicAttack: 180,
  brawlerBossChargeAttack: 400,
  circuitGate: 80,
  bombsiteSkull: 80,
  bombsiteFlower: 80,
  bombsiteBats: 80,
  bombsiteWitch: 80
};
type AbilityFeedbackSfxName = 'placeTurret' | 'electricFence' | 'placeMine' | 'unavailable';
const PICKUP_SFX_SOURCES = {
  pickup: 'soundeffects/pickupsound.mp3',
  healthPickup: 'soundeffects/healthpickup.mp3',
  energyPickup: 'soundeffects/energypickup.mp3',
  damageBoostPickup: 'soundeffects/damageboostpickup.mp3',
  speedPickup: 'soundeffects/speedpickup.mp3',
  fireRatePickup: 'soundeffects/fireratepickup.mp3',
  creditPickup: 'soundeffects/creditpickup.mp3',
  coreTokenPickup: 'soundeffects/coretokenpickup.mp3',
  fluxCorePickup: 'soundeffects/fluxcorepickup.mp3',
  ricochetPickup: 'soundeffects/ricochetpickup.mp3',
  grenadeRoundsPickup: 'soundeffects/grenadeshotpickup.mp3',
  scattershotPickup: 'soundeffects/scattershotpickup.mp3',
  modPickup: 'soundeffects/modpickup.mp3'
} as const;
type PickupSfxName = keyof typeof PICKUP_SFX_SOURCES;
const PICKUP_SFX_NAMES = Object.keys(PICKUP_SFX_SOURCES) as PickupSfxName[];

export class AudioManager {
  private static instance: AudioManager | null = null;
  private readonly context: AudioContext;
  private readonly playlist = [
    'music/Arc Grid SiegeV1.mp3',
    'music/Arc Grid SiegeV3.mp3',
    'music/Arc Grid Siege4.mp3',
    'music/Arc Grid Siege5.mp3',
    'music/Arc Grid Siege6.mp3',
    'music/Busted Reef Groove.mp3',
    'music/Neon Concrete Pulse.mp3',
    'music/Neon Nebula Surge.mp3',
    'music/Neondub.mp3',
    'music/NeonShamisen.mp3',
    'music/NeonShamisenV2.mp3',
    'music/NeonSwampRiot.mp3',
    'music/NeonSwampRiotV2.mp3',
    'music/NeonTokyoNights.mp3'
  ].map(audioAssetUrl);
  private musicAudio: HTMLAudioElement | null = null;
  private playlistIndex = 0;
  private musicStarted = false;
  private readonly shotSfxPool: HTMLAudioElement[] = [];
  private readonly boostSfxPool: HTMLAudioElement[] = [];
  private readonly enemyDeathSfxPool: HTMLAudioElement[] = [];
  private readonly playerDeathSfxPool: HTMLAudioElement[] = [];
  private readonly bombletSfxPool: HTMLAudioElement[] = [];
  private readonly hitDamageSfxPool: HTMLAudioElement[] = [];
  private readonly menuHoverSfxPool: HTMLAudioElement[] = [];
  private readonly menuClickSfxPool: HTMLAudioElement[] = [];
  private readonly itemLockedSfxPool: HTMLAudioElement[] = [];
  private readonly pickupSfxPools: Record<PickupSfxName, HTMLAudioElement[]> = {
    pickup: [], healthPickup: [], energyPickup: [], damageBoostPickup: [], speedPickup: [],
    fireRatePickup: [], creditPickup: [], coreTokenPickup: [], fluxCorePickup: [], ricochetPickup: [],
    grenadeRoundsPickup: [], scattershotPickup: [], modPickup: []
  };
  private readonly pickupSfxCursors: Record<PickupSfxName, number> = {
    pickup: 0, healthPickup: 0, energyPickup: 0, damageBoostPickup: 0, speedPickup: 0,
    fireRatePickup: 0, creditPickup: 0, coreTokenPickup: 0, fluxCorePickup: 0, ricochetPickup: 0,
    grenadeRoundsPickup: 0, scattershotPickup: 0, modPickup: 0
  };
  private readonly abilityFeedbackSfxPools: Record<AbilityFeedbackSfxName, HTMLAudioElement[]> = {
    placeTurret: [], electricFence: [], placeMine: [], unavailable: []
  };
  private readonly abilityFeedbackSfxCursors: Record<AbilityFeedbackSfxName, number> = {
    placeTurret: 0, electricFence: 0, placeMine: 0, unavailable: 0
  };
  private readonly presentationSfxPools: Record<PresentationSfxName, HTMLAudioElement[]> = {
    gasCanImpact: [], gasFizz: [], totemEntrance: [], totemPulse: [], miniBossSpawn: [],
    bossArtilleryExplosion: [], sentryBossAttack: [], grenadeShotExplosion: [], mageBossLargeAttack: [],
    mageBossMagicAttack: [], brawlerBossChargeAttack: [], circuitGate: [],
    bombsiteSkull: [], bombsiteFlower: [], bombsiteBats: [], bombsiteWitch: []
  };
  private readonly presentationSfxCursors: Record<PresentationSfxName, number> = {
    gasCanImpact: 0, gasFizz: 0, totemEntrance: 0, totemPulse: 0, miniBossSpawn: 0,
    bossArtilleryExplosion: 0, sentryBossAttack: 0, grenadeShotExplosion: 0, mageBossLargeAttack: 0,
    mageBossMagicAttack: 0, brawlerBossChargeAttack: 0, circuitGate: 0,
    bombsiteSkull: 0, bombsiteFlower: 0, bombsiteBats: 0, bombsiteWitch: 0
  };
  private readonly lastPresentationSfxAt: Record<PresentationSfxName, number> = {
    gasCanImpact: -Infinity, gasFizz: -Infinity, totemEntrance: -Infinity,
    totemPulse: -Infinity, miniBossSpawn: -Infinity, bossArtilleryExplosion: -Infinity, sentryBossAttack: -Infinity,
    grenadeShotExplosion: -Infinity, mageBossLargeAttack: -Infinity,
    mageBossMagicAttack: -Infinity, brawlerBossChargeAttack: -Infinity, circuitGate: -Infinity,
    bombsiteSkull: -Infinity, bombsiteFlower: -Infinity, bombsiteBats: -Infinity, bombsiteWitch: -Infinity
  };
  private runStartSfx: HTMLAudioElement | null = null;
  private securityLaserAudio: HTMLAudioElement | null = null;
  private lasersOffSfx: HTMLAudioElement | null = null;
  private securityLaserLoopRequested = false;
  private gasSfx: HTMLAudioElement | null = null;
  private fluxCoreAudio: HTMLAudioElement | null = null;
  private fluxCoreLoopRequested = false;
  private fluxCoreProximity = 0;
  private shieldActivationSfx: HTMLAudioElement | null = null;
  private shieldDeactivationSfx: HTMLAudioElement | null = null;
  private modCollectionSfx: HTMLAudioElement | null = null;
  private legendaryModSfx: HTMLAudioElement | null = null;
  private lowHealthSfx: HTMLAudioElement | null = null;
  private lowHealthLoopRequested = false;
  private lowHealthRestartTimer: number | null = null;
  private plantingAudio: HTMLAudioElement | null = null;
  private plantingLoopRequested = false;
  private disarmAudio: HTMLAudioElement | null = null;
  private disarmLoopRequested = false;
  private shotSfxCursor = 0;
  private boostSfxCursor = 0;
  private enemyDeathSfxCursor = 0;
  private playerDeathSfxCursor = 0;
  private bombletSfxCursor = 0;
  private hitDamageSfxCursor = 0;
  private menuHoverSfxCursor = 0;
  private menuClickSfxCursor = 0;
  private itemLockedSfxCursor = 0;
  private lastEnemyDeathSfxAt = -Infinity;
  private lastHitDamageSfxAt = -Infinity;
  private lastMenuHoverSfxAt = -Infinity;
  private lastUnavailableSfxAt = -Infinity;
  private cachedMusicVolume = DEFAULT_AUDIO_VOLUME * DEFAULT_AUDIO_VOLUME;
  private cachedSfxVolume = DEFAULT_AUDIO_VOLUME * DEFAULT_AUDIO_VOLUME;
  private readonly cachedSoundVolumes = {} as Record<AudioSfxName, number>;

  private clampVolume(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private constructor() {
    this.context = new AudioContext();
    this.shufflePlaylist();
    this.refreshVolumeCache();
    this.initShotSfxPool();
    this.initBoostSfxPool();
    this.initDeathSfxPools();
    this.initSecurityHazardSfx();
    this.initGasSfx();
    this.initPickupSfxPools();
    this.initFluxCoreAudio();
    this.initShieldSfx();
    this.initHitDamageSfxPool();
    this.initLowHealthSfx();
    this.initModRevealSfx();
    this.initMenuSfxPools();
    this.initRunStartSfx();
    this.initAbilityFeedbackSfxPools();
    this.initPresentationSfxPools();
  }

  static get(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private getVolume(kind: 'music' | 'sfx', sound?: AudioSfxName): number {
    if (kind === 'music') return this.cachedMusicVolume;
    return sound ? this.cachedSoundVolumes[sound] ?? this.cachedSfxVolume : this.cachedSfxVolume;
  }

  private refreshVolumeCache(): void {
    try {
      const settings = SaveSystem.get().settings;
      this.cachedMusicVolume = settings.masterVolume * settings.musicVolume;
      this.cachedSfxVolume = settings.masterVolume * settings.sfxVolume;
      for (const definition of SFX_DEFINITIONS) {
        this.cachedSoundVolumes[definition.key] = this.cachedSfxVolume * settings.soundVolumes[definition.key];
      }
    } catch {
      this.cachedMusicVolume = DEFAULT_AUDIO_VOLUME * DEFAULT_AUDIO_VOLUME;
      this.cachedSfxVolume = DEFAULT_AUDIO_VOLUME * DEFAULT_AUDIO_VOLUME;
      for (const definition of SFX_DEFINITIONS) {
        this.cachedSoundVolumes[definition.key] = this.cachedSfxVolume * DEFAULT_AUDIO_VOLUME;
      }
    }
  }

  getSfxVolume(sound?: AudioSfxName): number {
    return this.clampVolume(this.getVolume('sfx', sound));
  }

  private getCurrentTrackUrl(): string {
    return this.playlist[this.playlistIndex % this.playlist.length] ?? this.playlist[0];
  }

  private initShotSfxPool(): void {
    const src = audioAssetUrl('soundeffects/Laser.mp3');
    for (let i = 0; i < 8; i += 1) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = this.getSfxVolume('shot');
      this.shotSfxPool.push(audio);
    }
  }

  private playShotSfx(): void {
    if (this.shotSfxPool.length === 0) return;

    const nextIndex = this.shotSfxCursor % this.shotSfxPool.length;
    this.shotSfxCursor = (this.shotSfxCursor + 1) % this.shotSfxPool.length;
    const audio = this.shotSfxPool[nextIndex];
    audio.currentTime = 0;
    audio.volume = this.getSfxVolume('shot');
    void audio.play().catch(() => {
      // Fallback when browser blocks playback until user interaction.
      this.beep('sfx', 460, 70, 0.05, 'shot');
    });
  }

  private initBoostSfxPool(): void {
    const src = audioAssetUrl('soundeffects/boostsound.mp3');
    for (let i = 0; i < 4; i += 1) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
      audio.volume = this.getSfxVolume('boost');
      this.boostSfxPool.push(audio);
    }
  }

  private playBoostSfx(): void {
    const fallbackOneShot = (): void => {
      const direct = new Audio(audioAssetUrl('soundeffects/boostsound.mp3'));
      direct.preload = 'auto';
      direct.volume = this.getSfxVolume('boost');
      void direct.play().catch(() => {
        this.beep('sfx', 350, 90, 0.05, 'boost');
      });
    };

    if (this.boostSfxPool.length === 0) {
      fallbackOneShot();
      return;
    }

    const nextIndex = this.boostSfxCursor % this.boostSfxPool.length;
    this.boostSfxCursor = (this.boostSfxCursor + 1) % this.boostSfxPool.length;
    const audio = this.boostSfxPool[nextIndex];
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers may reject seeks before metadata is ready.
    }
    audio.volume = this.getSfxVolume('boost');
    void audio.play().catch(() => {
      fallbackOneShot();
    });
  }

  private initGasSfx(): void {
    this.gasSfx = new Audio(audioAssetUrl('soundeffects/gassound.mp3'));
    this.gasSfx.preload = 'auto';
    this.gasSfx.volume = this.getSfxVolume('gas');
    this.gasSfx.load();
  }

  private initPresentationSfxPools(): void {
    for (const name of Object.keys(PRESENTATION_SFX_SOURCES) as PresentationSfxName[]) {
      const source = audioAssetUrl(PRESENTATION_SFX_SOURCES[name]);
      for (let index = 0; index < PRESENTATION_SFX_POOL_SIZES[name]; index += 1) {
        const audio = new Audio(source);
        audio.preload = 'auto';
        audio.volume = this.getSfxVolume(name);
        audio.load();
        this.presentationSfxPools[name].push(audio);
      }
    }
  }

  private playPresentationSfx(name: PresentationSfxName): void {
    const now = performance.now();
    if (now - this.lastPresentationSfxAt[name] < PRESENTATION_SFX_MIN_INTERVAL_MS[name]) return;
    const pool = this.presentationSfxPools[name];
    let availableIndex = -1;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidateIndex = (this.presentationSfxCursors[name] + offset) % pool.length;
      const candidate = pool[candidateIndex];
      if (candidate.paused || candidate.ended) {
        availableIndex = candidateIndex;
        break;
      }
    }
    if (availableIndex < 0) return;
    this.lastPresentationSfxAt[name] = now;
    this.presentationSfxCursors[name] = (availableIndex + 1) % pool.length;
    const audio = pool[availableIndex];
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata may still be loading on the first presentation event.
    }
    audio.volume = this.getSfxVolume(name);
    void audio.play().catch(() => undefined);
  }

  private initPickupSfxPools(): void {
    for (const name of PICKUP_SFX_NAMES) {
      const source = audioAssetUrl(PICKUP_SFX_SOURCES[name]);
      for (let index = 0; index < PICKUP_SFX_POOL_SIZE; index += 1) {
        const audio = new Audio(source);
        audio.preload = 'auto';
        audio.volume = this.getSfxVolume(name);
        audio.load();
        this.pickupSfxPools[name].push(audio);
      }
    }
  }

  private playPickupSfx(name: PickupSfxName): void {
    const pool = this.pickupSfxPools[name];
    if (pool.length === 0) return;
    let activeVoices = 0;
    for (const pickupName of PICKUP_SFX_NAMES) {
      const candidatePool = this.pickupSfxPools[pickupName];
      for (const candidate of candidatePool) {
        if (!candidate.paused && !candidate.ended) activeVoices += 1;
      }
    }
    if (activeVoices >= PICKUP_SFX_MAX_CONCURRENT) return;
    let availableIndex = -1;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidateIndex = (this.pickupSfxCursors[name] + offset) % pool.length;
      const candidate = pool[candidateIndex];
      if (candidate.paused || candidate.ended) {
        availableIndex = candidateIndex;
        break;
      }
    }
    if (availableIndex < 0) return;
    this.pickupSfxCursors[name] = (availableIndex + 1) % pool.length;
    const audio = pool[availableIndex];
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata may still be loading on the first pickup.
    }
    audio.volume = this.getSfxVolume(name);
    void audio.play().catch(() => undefined);
  }

  private initFluxCoreAudio(): void {
    this.fluxCoreAudio = new Audio(audioAssetUrl('soundeffects/electricalenergy.mp3'));
    this.fluxCoreAudio.preload = 'auto';
    this.fluxCoreAudio.loop = true;
    this.fluxCoreAudio.volume = 0;
    this.fluxCoreAudio.load();
  }

  private playGasSfx(): void {
    if (!this.gasSfx) return;
    this.gasSfx.pause();
    try {
      this.gasSfx.currentTime = 0;
    } catch {
      // Metadata can still be loading on the first gas phase.
    }
    this.gasSfx.volume = this.getSfxVolume('gas');
    void this.gasSfx.play().catch(() => undefined);
  }

  private initHitDamageSfxPool(): void {
    const source = audioAssetUrl('soundeffects/punch impact.mp3');
    for (let index = 0; index < HIT_DAMAGE_SFX_POOL_SIZE; index += 1) {
      const audio = new Audio(source);
      audio.preload = 'auto';
      audio.volume = this.getSfxVolume('playerDamage');
      audio.load();
      this.hitDamageSfxPool.push(audio);
    }
  }

  private initLowHealthSfx(): void {
    this.lowHealthSfx = new Audio(audioAssetUrl('soundeffects/lowhealth.mp3'));
    this.lowHealthSfx.preload = 'auto';
    this.lowHealthSfx.loop = false;
    this.lowHealthSfx.volume = this.getSfxVolume('lowHealth');
    this.lowHealthSfx.addEventListener('ended', () => this.scheduleLowHealthRepeat());
    this.lowHealthSfx.load();
  }

  private scheduleLowHealthRepeat(): void {
    if (!this.lowHealthLoopRequested || this.lowHealthRestartTimer !== null) return;
    this.lowHealthRestartTimer = window.setTimeout(() => {
      this.lowHealthRestartTimer = null;
      if (this.lowHealthLoopRequested) this.playLowHealthWarning();
    }, LOW_HEALTH_LOOP_GAP_MS);
  }

  private playLowHealthWarning(): void {
    const audio = this.lowHealthSfx;
    if (!audio || !this.lowHealthLoopRequested) return;
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata may still be loading when the threshold is first crossed.
    }
    audio.volume = this.getSfxVolume('lowHealth');
    void audio.play().catch(() => undefined);
  }

  /** Starts or stops one reusable warning voice with a calm gap between repeats. */
  setLowHealthWarning(active: boolean): void {
    if (active === this.lowHealthLoopRequested) return;
    this.lowHealthLoopRequested = active;
    if (active) {
      this.playLowHealthWarning();
      return;
    }
    if (this.lowHealthRestartTimer !== null) {
      window.clearTimeout(this.lowHealthRestartTimer);
      this.lowHealthRestartTimer = null;
    }
    this.lowHealthSfx?.pause();
    if (this.lowHealthSfx) {
      try {
        this.lowHealthSfx.currentTime = 0;
      } catch {
        // Seeking is optional while metadata is unavailable.
      }
    }
  }

  stopLowHealthWarning(): void {
    this.setLowHealthWarning(false);
  }

  private playHitDamageSfx(): void {
    const now = performance.now();
    if (now - this.lastHitDamageSfxAt < HIT_DAMAGE_SFX_MIN_INTERVAL_MS || this.hitDamageSfxPool.length === 0) return;
    this.lastHitDamageSfxAt = now;
    const nextIndex = this.hitDamageSfxCursor % this.hitDamageSfxPool.length;
    this.hitDamageSfxCursor = (this.hitDamageSfxCursor + 1) % this.hitDamageSfxPool.length;
    const audio = this.hitDamageSfxPool[nextIndex];
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata can still be loading during the first combat exchange.
    }
    audio.volume = this.getSfxVolume('playerDamage');
    void audio.play().catch(() => undefined);
  }

  private initModRevealSfx(): void {
    this.modCollectionSfx = new Audio(audioAssetUrl('soundeffects/modcollectionsound.mp3'));
    this.modCollectionSfx.preload = 'auto';
    this.modCollectionSfx.volume = this.getSfxVolume('modCollection');
    this.modCollectionSfx.load();

    this.legendaryModSfx = new Audio(audioAssetUrl('soundeffects/legendarymodsound.mp3'));
    this.legendaryModSfx.preload = 'auto';
    this.legendaryModSfx.volume = this.getSfxVolume('legendaryMod');
    this.legendaryModSfx.load();
  }

  private initMenuSfxPools(): void {
    const menuHoverSource = audioAssetUrl('soundeffects/hoversound.mp3');
    const menuClickSource = audioAssetUrl('soundeffects/menuclick.mp3');
    const itemLockedSource = audioAssetUrl('soundeffects/itemlocked.mp3');
    for (let index = 0; index < MENU_SFX_POOL_SIZE; index += 1) {
      const menuHover = new Audio(menuHoverSource);
      menuHover.preload = 'auto';
      menuHover.volume = this.getSfxVolume('menuHover');
      menuHover.load();
      this.menuHoverSfxPool.push(menuHover);

      const menuClick = new Audio(menuClickSource);
      menuClick.preload = 'auto';
      menuClick.volume = this.getSfxVolume('menu');
      menuClick.load();
      this.menuClickSfxPool.push(menuClick);

      const itemLocked = new Audio(itemLockedSource);
      itemLocked.preload = 'auto';
      itemLocked.volume = this.getSfxVolume('itemLocked');
      itemLocked.load();
      this.itemLockedSfxPool.push(itemLocked);
    }
  }

  private playMenuSfx(name: 'menuHover' | 'menu' | 'itemLocked'): void {
    if (name === 'menuHover') {
      const now = performance.now();
      if (now - this.lastMenuHoverSfxAt < MENU_HOVER_SFX_MIN_INTERVAL_MS) return;
      this.lastMenuHoverSfxAt = now;
    }
    const pool = name === 'menuHover'
      ? this.menuHoverSfxPool
      : name === 'menu'
        ? this.menuClickSfxPool
        : this.itemLockedSfxPool;
    if (pool.length === 0) return;
    const cursor = name === 'menuHover'
      ? this.menuHoverSfxCursor
      : name === 'menu'
        ? this.menuClickSfxCursor
        : this.itemLockedSfxCursor;
    let availableIndex = -1;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidateIndex = (cursor + offset) % pool.length;
      const candidate = pool[candidateIndex];
      if (candidate.paused || candidate.ended) {
        availableIndex = candidateIndex;
        break;
      }
    }
    if (availableIndex < 0) return;
    if (name === 'menuHover') this.menuHoverSfxCursor = (availableIndex + 1) % pool.length;
    else if (name === 'menu') this.menuClickSfxCursor = (availableIndex + 1) % pool.length;
    else this.itemLockedSfxCursor = (availableIndex + 1) % pool.length;
    const audio = pool[availableIndex];
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata may still be loading on the first menu interaction.
    }
    audio.volume = this.getSfxVolume(name);
    void audio.play().catch(() => undefined);
  }

  private initRunStartSfx(): void {
    this.runStartSfx = new Audio(audioAssetUrl('soundeffects/startsound.mp3'));
    this.runStartSfx.preload = 'auto';
    this.runStartSfx.volume = this.getSfxVolume('runStart');
    this.runStartSfx.load();
  }

  private initAbilityFeedbackSfxPools(): void {
    const sources: Record<AbilityFeedbackSfxName, string> = {
      placeTurret: 'soundeffects/placeturret.mp3',
      electricFence: 'soundeffects/electricfence.mp3',
      placeMine: 'soundeffects/placemine2.mp3',
      unavailable: 'soundeffects/unavailable.mp3'
    };
    for (const name of Object.keys(sources) as AbilityFeedbackSfxName[]) {
      const source = audioAssetUrl(sources[name]);
      for (let index = 0; index < ABILITY_FEEDBACK_SFX_POOL_SIZE; index += 1) {
        const audio = new Audio(source);
        audio.preload = 'auto';
        audio.volume = this.getSfxVolume(name);
        audio.load();
        this.abilityFeedbackSfxPools[name].push(audio);
      }
    }
  }

  private playAbilityFeedbackSfx(name: AbilityFeedbackSfxName): void {
    const now = performance.now();
    if (name === 'unavailable') {
      if (now - this.lastUnavailableSfxAt < UNAVAILABLE_SFX_MIN_INTERVAL_MS) return;
      this.lastUnavailableSfxAt = now;
    }
    const pool = this.abilityFeedbackSfxPools[name];
    if (pool.length === 0) return;
    const cursor = this.abilityFeedbackSfxCursors[name];
    let availableIndex = -1;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidateIndex = (cursor + offset) % pool.length;
      const candidate = pool[candidateIndex];
      if (candidate.paused || candidate.ended) {
        availableIndex = candidateIndex;
        break;
      }
    }
    // Never cut off an active placement clip; a saturated pool folds the
    // additional cue into the voices that are already playing.
    if (availableIndex < 0) return;
    this.abilityFeedbackSfxCursors[name] = (availableIndex + 1) % pool.length;
    const audio = pool[availableIndex];
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata may still be loading for the first placement.
    }
    audio.volume = this.getSfxVolume(name);
    void audio.play().catch(() => undefined);
  }

  private playRunStartSfx(): void {
    if (!this.runStartSfx) return;
    this.runStartSfx.pause();
    try {
      this.runStartSfx.currentTime = 0;
    } catch {
      // Metadata may still be loading on the first deployment.
    }
    this.runStartSfx.volume = this.getSfxVolume('runStart');
    void this.runStartSfx.play().catch(() => undefined);
  }

  private playModRevealSfx(kind: 'modCollection' | 'legendaryMod'): void {
    const audio = kind === 'legendaryMod' ? this.legendaryModSfx : this.modCollectionSfx;
    if (!audio) return;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata can still be loading when the reveal begins.
    }
    audio.volume = this.getSfxVolume(kind);
    void audio.play().catch(() => undefined);
  }

  private initSecurityHazardSfx(): void {
    this.securityLaserAudio = new Audio(audioAssetUrl('soundeffects/lasersound.mp3'));
    this.securityLaserAudio.preload = 'auto';
    this.securityLaserAudio.loop = true;
    this.securityLaserAudio.volume = this.getSfxVolume('securityLaser');
    this.securityLaserAudio.load();

    this.lasersOffSfx = new Audio(audioAssetUrl('soundeffects/lasersoff.mp3'));
    this.lasersOffSfx.preload = 'auto';
    this.lasersOffSfx.volume = this.getSfxVolume('lasersOff');
    this.lasersOffSfx.load();

    const bombletSource = audioAssetUrl('soundeffects/bomblets.mp3');
    for (let index = 0; index < BOMBLET_SFX_POOL_SIZE; index += 1) {
      const audio = new Audio(bombletSource);
      audio.preload = 'auto';
      audio.volume = this.getSfxVolume('bomblet');
      audio.load();
      this.bombletSfxPool.push(audio);
    }
  }

  private playLasersOffSfx(): void {
    if (!this.lasersOffSfx) return;
    this.lasersOffSfx.pause();
    try {
      this.lasersOffSfx.currentTime = 0;
    } catch {
      // Metadata may still be loading when the last Flux Core is destroyed.
    }
    this.lasersOffSfx.volume = this.getSfxVolume('lasersOff');
    void this.lasersOffSfx.play().catch(() => undefined);
  }

  startSecurityLaserLoop(): void {
    if (this.securityLaserLoopRequested) return;
    this.securityLaserLoopRequested = true;
    if (!this.securityLaserAudio || !this.securityLaserAudio.paused) return;
    try {
      this.securityLaserAudio.currentTime = 0;
    } catch {
      // Metadata can still be loading when the first laser cycle starts.
    }
    this.securityLaserAudio.volume = this.getSfxVolume('securityLaser');
    void this.securityLaserAudio.play().catch(() => undefined);
  }

  stopSecurityLaserLoop(): void {
    this.securityLaserLoopRequested = false;
    if (!this.securityLaserAudio) return;
    this.securityLaserAudio.pause();
    try {
      this.securityLaserAudio.currentTime = 0;
    } catch {
      // Seeking is optional while metadata is unavailable.
    }
  }

  private playBombletSfx(volumeKey: 'bomblet' | 'mine' | 'bomb' = 'bomblet'): void {
    if (this.bombletSfxPool.length === 0) return;
    const nextIndex = this.bombletSfxCursor % this.bombletSfxPool.length;
    this.bombletSfxCursor = (this.bombletSfxCursor + 1) % this.bombletSfxPool.length;
    const audio = this.bombletSfxPool[nextIndex];
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata can still be loading on the first strike.
    }
    audio.volume = this.getSfxVolume(volumeKey);
    void audio.play().catch(() => undefined);
  }

  private initShieldSfx(): void {
    this.shieldActivationSfx = new Audio(audioAssetUrl('soundeffects/shieldactivate.mp3'));
    this.shieldActivationSfx.preload = 'auto';
    this.shieldActivationSfx.volume = this.getSfxVolume('shieldOn');
    this.shieldActivationSfx.load();

    this.shieldDeactivationSfx = new Audio(audioAssetUrl('soundeffects/shielddown.mp3'));
    this.shieldDeactivationSfx.preload = 'auto';
    this.shieldDeactivationSfx.volume = this.getSfxVolume('shieldOff');
    this.shieldDeactivationSfx.load();
  }

  private playShieldOnSfx(): void {
    if (!this.shieldActivationSfx) return;
    this.shieldActivationSfx.pause();
    try {
      this.shieldActivationSfx.currentTime = 0;
    } catch {
      // Metadata may still be loading on the first activation.
    }
    this.shieldActivationSfx.volume = this.getSfxVolume('shieldOn');
    void this.shieldActivationSfx.play().catch(() => undefined);
  }

  private playShieldOffSfx(): void {
    if (!this.shieldDeactivationSfx) return;
    this.shieldDeactivationSfx.pause();
    try {
      this.shieldDeactivationSfx.currentTime = 0;
    } catch {
      // Metadata may still be loading on the first deactivation.
    }
    this.shieldDeactivationSfx.volume = this.getSfxVolume('shieldOff');
    void this.shieldDeactivationSfx.play().catch(() => undefined);
  }

  private initDeathSfxPools(): void {
    const src = audioAssetUrl('soundeffects/bang.mp3');
    for (let i = 0; i < ENEMY_DEATH_SFX_MAX_CONCURRENT; i += 1) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
      audio.volume = this.getSfxVolume('enemyDeath');
      this.enemyDeathSfxPool.push(audio);
    }
    for (let i = 0; i < 2; i += 1) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
      audio.volume = this.getSfxVolume('playerDeath');
      this.playerDeathSfxPool.push(audio);
    }
  }

  private playDeathSfx(name: 'enemyDeath' | 'playerDeath'): void {
    if (name === 'enemyDeath') {
      this.playEnemyDeathSfx();
      return;
    }

    this.playPlayerDeathSfx();
  }

  private playEnemyDeathSfx(): void {
    const now = performance.now();
    if (
      this.enemyDeathSfxPool.length === 0
      || now - this.lastEnemyDeathSfxAt < ENEMY_DEATH_SFX_MIN_INTERVAL_MS
    ) return;

    let availableIndex = -1;
    for (let offset = 0; offset < this.enemyDeathSfxPool.length; offset += 1) {
      const candidateIndex = (this.enemyDeathSfxCursor + offset) % this.enemyDeathSfxPool.length;
      const candidate = this.enemyDeathSfxPool[candidateIndex];
      if (candidate.paused || candidate.ended) {
        availableIndex = candidateIndex;
        break;
      }
    }

    // Never interrupt an active kill sound. If all voices are occupied, this
    // kill is intentionally folded into the existing burst.
    if (availableIndex < 0) return;

    const audio = this.enemyDeathSfxPool[availableIndex];
    this.enemyDeathSfxCursor = (availableIndex + 1) % this.enemyDeathSfxPool.length;
    this.lastEnemyDeathSfxAt = now;
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers may reject seeks before metadata is ready.
    }
    audio.volume = this.getSfxVolume('enemyDeath');
    void audio.play().catch(() => undefined);
  }

  private playPlayerDeathSfx(): void {
    if (this.playerDeathSfxPool.length === 0) return;
    const nextIndex = this.playerDeathSfxCursor % this.playerDeathSfxPool.length;
    this.playerDeathSfxCursor = (this.playerDeathSfxCursor + 1) % this.playerDeathSfxPool.length;
    const audio = this.playerDeathSfxPool[nextIndex];
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers may reject seeks before metadata is ready.
    }
    audio.volume = this.getSfxVolume('playerDeath');
    void audio.play().catch(() => undefined);
  }

  private mountTrack(url: string): void {
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.src = '';
      this.musicAudio.removeAttribute('src');
      this.musicAudio.load();
    }

    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = this.clampVolume(this.getVolume('music'));
    audio.addEventListener('ended', () => this.nextTrack());
    audio.addEventListener('error', () => this.nextTrack());
    this.musicAudio = audio;
  }

  private shufflePlaylist(avoidFirst?: string): void {
    for (let index = this.playlist.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [this.playlist[index], this.playlist[swapIndex]] = [this.playlist[swapIndex], this.playlist[index]];
    }
    if (avoidFirst && this.playlist.length > 1 && this.playlist[0] === avoidFirst) {
      const swapIndex = 1 + Math.floor(Math.random() * (this.playlist.length - 1));
      [this.playlist[0], this.playlist[swapIndex]] = [this.playlist[swapIndex], this.playlist[0]];
    }
    this.playlistIndex = 0;
  }

  private advancePlaylist(): void {
    const currentTrack = this.getCurrentTrackUrl();
    if (this.playlistIndex + 1 >= this.playlist.length) this.shufflePlaylist(currentTrack);
    else this.playlistIndex += 1;
  }

  private nextTrack(): void {
    this.advancePlaylist();
    this.mountTrack(this.getCurrentTrackUrl());
    void this.musicAudio?.play().catch(() => undefined);
  }

  playMusic(): void {
    this.startMusicLoop();
  }

  pauseMusic(): void {
    this.musicAudio?.pause();
    this.musicStarted = false;
  }

  nextMusicTrack(): void {
    this.advancePlaylist();
    this.mountTrack(this.getCurrentTrackUrl());
    this.musicStarted = true;
    void this.musicAudio?.play().catch(() => {
      this.musicStarted = false;
    });
  }

  previousMusicTrack(): void {
    this.playlistIndex = (this.playlistIndex - 1 + this.playlist.length) % this.playlist.length;
    this.mountTrack(this.getCurrentTrackUrl());
    this.musicStarted = true;
    void this.musicAudio?.play().catch(() => {
      this.musicStarted = false;
    });
  }

  isMusicPlaying(): boolean {
    return Boolean(this.musicAudio && !this.musicAudio.paused && this.musicStarted);
  }

  startMusicLoop(): void {
    if (!this.musicAudio) {
      this.mountTrack(this.getCurrentTrackUrl());
    }

    this.refreshMix();
    if (this.musicStarted && !this.musicAudio?.paused) return;

    this.musicStarted = true;
    void this.musicAudio?.play().catch(() => {
      this.musicStarted = false;
    });
  }

  refreshMix(): void {
    this.refreshVolumeCache();
    if (this.musicAudio) {
      this.musicAudio.volume = this.clampVolume(this.getVolume('music'));
    }

    for (const shot of this.shotSfxPool) {
      shot.volume = this.getSfxVolume('shot');
    }
    for (const boost of this.boostSfxPool) {
      boost.volume = this.getSfxVolume('boost');
    }
    for (const enemyDeath of this.enemyDeathSfxPool) {
      enemyDeath.volume = this.getSfxVolume('enemyDeath');
    }
    for (const playerDeath of this.playerDeathSfxPool) {
      playerDeath.volume = this.getSfxVolume('playerDeath');
    }
    for (const bomblet of this.bombletSfxPool) {
      bomblet.volume = this.getSfxVolume('bomblet');
    }
    for (const hitDamage of this.hitDamageSfxPool) {
      hitDamage.volume = this.getSfxVolume('playerDamage');
    }
    if (this.lowHealthSfx) this.lowHealthSfx.volume = this.getSfxVolume('lowHealth');
    for (const menuHover of this.menuHoverSfxPool) menuHover.volume = this.getSfxVolume('menuHover');
    for (const menuClick of this.menuClickSfxPool) menuClick.volume = this.getSfxVolume('menu');
    for (const itemLocked of this.itemLockedSfxPool) itemLocked.volume = this.getSfxVolume('itemLocked');
    for (const name of PICKUP_SFX_NAMES) {
      for (const pickup of this.pickupSfxPools[name]) pickup.volume = this.getSfxVolume(name);
    }
    for (const name of Object.keys(this.abilityFeedbackSfxPools) as AbilityFeedbackSfxName[]) {
      for (const audio of this.abilityFeedbackSfxPools[name]) audio.volume = this.getSfxVolume(name);
    }
    for (const name of Object.keys(this.presentationSfxPools) as PresentationSfxName[]) {
      for (const audio of this.presentationSfxPools[name]) audio.volume = this.getSfxVolume(name);
    }
    if (this.runStartSfx) this.runStartSfx.volume = this.getSfxVolume('runStart');
    if (this.securityLaserAudio) this.securityLaserAudio.volume = this.getSfxVolume('securityLaser');
    if (this.lasersOffSfx) this.lasersOffSfx.volume = this.getSfxVolume('lasersOff');
    if (this.gasSfx) this.gasSfx.volume = this.getSfxVolume('gas');
    if (this.fluxCoreAudio) this.fluxCoreAudio.volume = this.fluxCoreTargetVolume(this.fluxCoreProximity);
    if (this.shieldActivationSfx) this.shieldActivationSfx.volume = this.getSfxVolume('shieldOn');
    if (this.shieldDeactivationSfx) this.shieldDeactivationSfx.volume = this.getSfxVolume('shieldOff');
    if (this.modCollectionSfx) this.modCollectionSfx.volume = this.getSfxVolume('modCollection');
    if (this.legendaryModSfx) this.legendaryModSfx.volume = this.getSfxVolume('legendaryMod');
    if (this.plantingAudio) this.plantingAudio.volume = this.getSfxVolume('planting');
    if (this.disarmAudio) this.disarmAudio.volume = this.getSfxVolume('disarm');
  }

  stopMusic(): void {
    this.pauseMusic();
  }

  beep(kind: 'music' | 'sfx', frequency: number, durationMs: number, gain = 0.04, sound?: AudioSfxName): void {
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => undefined);
    }

    const osc = this.context.createOscillator();
    const g = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;

    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain * this.getVolume(kind, sound), this.context.currentTime + 0.01);
    g.gain.linearRampToValueAtTime(0, this.context.currentTime + durationMs / 1000);

    osc.connect(g);
    g.connect(this.context.destination);
    osc.start();
    osc.stop(this.context.currentTime + durationMs / 1000 + 0.02);
  }

  /** Keeps one electrical loop alive only while the operative is near a Flux Core. */
  setFluxCoreProximity(strength: number): void {
    const proximity = Math.max(0, Math.min(1, strength));
    this.fluxCoreProximity = proximity;
    const audio = this.fluxCoreAudio;
    if (!audio) return;

    const targetVolume = this.fluxCoreTargetVolume(proximity);
    const smoothing = targetVolume > audio.volume ? 0.16 : 0.09;
    audio.volume = this.clampVolume(audio.volume + (targetVolume - audio.volume) * smoothing);

    if (proximity > 0.005) {
      if (this.fluxCoreLoopRequested) return;
      this.fluxCoreLoopRequested = true;
      void audio.play().catch(() => undefined);
      return;
    }

    this.fluxCoreLoopRequested = false;
    if (audio.volume > 0.004) return;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Seeking is optional while metadata is unavailable.
    }
  }

  stopFluxCoreLoop(): void {
    this.fluxCoreLoopRequested = false;
    this.fluxCoreProximity = 0;
    if (!this.fluxCoreAudio) return;
    this.fluxCoreAudio.pause();
    this.fluxCoreAudio.volume = 0;
    try {
      this.fluxCoreAudio.currentTime = 0;
    } catch {
      // Seeking is optional while metadata is unavailable.
    }
  }

  private fluxCoreTargetVolume(proximity: number): number {
    return this.clampVolume(this.getSfxVolume('fluxCore') * Math.pow(proximity, 1.35) * 0.78);
  }

  startPlantingLoop(): void {
    if (this.plantingLoopRequested) return;
    this.plantingLoopRequested = true;
    if (!this.plantingAudio) {
      this.plantingAudio = new Audio(audioAssetUrl('soundeffects/planting.mp3'));
      this.plantingAudio.preload = 'auto';
      this.plantingAudio.loop = true;
    }
    if (!this.plantingAudio.paused) return;
    this.plantingAudio.currentTime = 0;
    this.plantingAudio.volume = this.getSfxVolume('planting');
    void this.plantingAudio.play().catch(() => undefined);
  }

  stopPlantingLoop(): void {
    this.plantingLoopRequested = false;
    if (!this.plantingAudio) return;
    this.plantingAudio.pause();
    this.plantingAudio.currentTime = 0;
  }

  startDisarmLoop(): void {
    if (this.disarmLoopRequested) return;
    this.disarmLoopRequested = true;
    if (!this.disarmAudio) {
      this.disarmAudio = new Audio(audioAssetUrl('soundeffects/disarm.mp3'));
      this.disarmAudio.preload = 'auto';
      this.disarmAudio.loop = true;
    }
    if (!this.disarmAudio.paused) return;
    this.disarmAudio.currentTime = 0;
    this.disarmAudio.volume = this.getSfxVolume('disarm');
    void this.disarmAudio.play().catch(() => undefined);
  }

  stopDisarmLoop(): void {
    this.disarmLoopRequested = false;
    if (!this.disarmAudio) return;
    this.disarmAudio.pause();
    this.disarmAudio.currentTime = 0;
  }

  playSfx(name: Exclude<AudioSfxName, 'planting' | 'disarm' | 'securityLaser' | 'fluxCore' | 'lowHealth'>): void {
    switch (name) {
      case 'shot':
        this.playShotSfx();
        break;
      case 'boost':
        this.playBoostSfx();
        break;
      case 'shieldOn':
        this.playShieldOnSfx();
        break;
      case 'shieldOff':
        this.playShieldOffSfx();
        break;
      case 'hit':
        this.beep('sfx', 180, 50, 0.06, name);
        break;
      case 'playerDamage':
        this.playHitDamageSfx();
        break;
      case 'enemyDeath':
      case 'playerDeath':
        this.playDeathSfx(name);
        break;
      case 'place':
        this.beep('sfx', 350, 90, 0.05, name);
        break;
      case 'placeTurret':
      case 'electricFence':
      case 'placeMine':
      case 'unavailable':
        this.playAbilityFeedbackSfx(name);
        break;
      case 'bomblet':
      case 'mine':
      case 'bomb':
        this.playBombletSfx(name);
        break;
      case 'beep':
        this.beep('sfx', 620, 80, 0.05, name);
        break;
      case 'defuseAlarm':
        this.beep('sfx', 780, 120, 0.08, name);
        break;
      case 'gas':
        this.playGasSfx();
        break;
      case 'gasCanImpact':
      case 'gasFizz':
      case 'totemEntrance':
      case 'totemPulse':
      case 'miniBossSpawn':
      case 'bossArtilleryExplosion':
      case 'sentryBossAttack':
      case 'grenadeShotExplosion':
      case 'mageBossLargeAttack':
      case 'mageBossMagicAttack':
      case 'brawlerBossChargeAttack':
      case 'circuitGate':
      case 'bombsiteSkull':
      case 'bombsiteFlower':
      case 'bombsiteBats':
      case 'bombsiteWitch':
        this.playPresentationSfx(name);
        break;
      case 'pickup':
      case 'healthPickup':
      case 'energyPickup':
      case 'damageBoostPickup':
      case 'speedPickup':
      case 'fireRatePickup':
      case 'creditPickup':
      case 'coreTokenPickup':
      case 'fluxCorePickup':
      case 'ricochetPickup':
      case 'grenadeRoundsPickup':
      case 'scattershotPickup':
      case 'modPickup':
        this.playPickupSfx(name);
        break;
      case 'lasersOff':
        this.playLasersOffSfx();
        break;
      case 'modCollection':
      case 'legendaryMod':
        this.playModRevealSfx(name);
        break;
      case 'menuHover':
      case 'menu':
      case 'itemLocked':
        this.playMenuSfx(name);
        break;
      case 'runStart':
        this.playRunStartSfx();
        break;
    }
  }
}
