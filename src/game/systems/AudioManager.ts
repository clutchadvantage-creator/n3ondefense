import { SaveSystem } from './SaveSystem';
import { SFX_DEFINITIONS, type AudioSfxName } from '../config/audio';
import { publicAssetUrl } from '../utils/assetUrl';

const audioAssetUrl = (path: string): string => publicAssetUrl(`assets/audio/${path}`);
const BOMBLET_SFX_POOL_SIZE = 8;
const HIT_DAMAGE_SFX_POOL_SIZE = 6;
const HIT_DAMAGE_SFX_MIN_INTERVAL_MS = 55;

export class AudioManager {
  private static instance: AudioManager | null = null;
  private readonly context: AudioContext;
  private readonly playlist = [
    'music/Arc Grid SiegeV1.mp3',
    'music/Arc Grid SiegeV3.mp3',
    'music/Arc Grid Siege4.mp3',
    'music/Arc Grid Siege5.mp3',
    'music/Arc Grid Siege6.mp3'
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
  private securityLaserAudio: HTMLAudioElement | null = null;
  private securityLaserLoopRequested = false;
  private gasSfx: HTMLAudioElement | null = null;
  private modCollectionSfx: HTMLAudioElement | null = null;
  private legendaryModSfx: HTMLAudioElement | null = null;
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
  private lastHitDamageSfxAt = -Infinity;
  private cachedMusicVolume = 0.51;
  private cachedSfxVolume = 0.6375;
  private readonly cachedSoundVolumes = {} as Record<AudioSfxName, number>;

  private clampVolume(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private constructor() {
    this.context = new AudioContext();
    this.refreshVolumeCache();
    this.initShotSfxPool();
    this.initBoostSfxPool();
    this.initDeathSfxPools();
    this.initSecurityHazardSfx();
    this.initGasSfx();
    this.initHitDamageSfxPool();
    this.initModRevealSfx();
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
      this.cachedMusicVolume = 0.85 * 0.6;
      this.cachedSfxVolume = 0.85 * 0.75;
      for (const definition of SFX_DEFINITIONS) this.cachedSoundVolumes[definition.key] = this.cachedSfxVolume;
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
    const src = audioAssetUrl('soundeffects/boost.mp3');
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
      const direct = new Audio(audioAssetUrl('soundeffects/boost.mp3'));
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
    const source = audioAssetUrl('soundeffects/hitdamage.mp3');
    for (let index = 0; index < HIT_DAMAGE_SFX_POOL_SIZE; index += 1) {
      const audio = new Audio(source);
      audio.preload = 'auto';
      audio.volume = this.getSfxVolume('hit');
      audio.load();
      this.hitDamageSfxPool.push(audio);
    }
  }

  private playHitDamageSfx(volumeKey: 'hit' | 'playerDamage'): void {
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
    audio.volume = this.getSfxVolume(volumeKey);
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

    const bombletSource = audioAssetUrl('soundeffects/bomblets.mp3');
    for (let index = 0; index < BOMBLET_SFX_POOL_SIZE; index += 1) {
      const audio = new Audio(bombletSource);
      audio.preload = 'auto';
      audio.volume = this.getSfxVolume('bomblet');
      audio.load();
      this.bombletSfxPool.push(audio);
    }
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

  private playShieldOnSfx(): void {
    const audio = new Audio(audioAssetUrl('soundeffects/shieldon.mp3'));
    audio.preload = 'auto';
    audio.volume = this.getSfxVolume('shieldOn');
    void audio.play().catch(() => {
      this.beep('sfx', 720, 180, 0.06, 'shieldOn');
    });
  }

  private initDeathSfxPools(): void {
    const src = audioAssetUrl('soundeffects/bang.mp3');
    for (let i = 0; i < 10; i += 1) {
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
    const pool = name === 'enemyDeath' ? this.enemyDeathSfxPool : this.playerDeathSfxPool;
    if (pool.length === 0) return;

    const cursor = name === 'enemyDeath' ? this.enemyDeathSfxCursor : this.playerDeathSfxCursor;
    const nextIndex = cursor % pool.length;
    if (name === 'enemyDeath') {
      this.enemyDeathSfxCursor = (cursor + 1) % pool.length;
    } else {
      this.playerDeathSfxCursor = (cursor + 1) % pool.length;
    }

    const audio = pool[nextIndex];
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers may reject seeks before metadata is ready.
    }
    audio.volume = this.getSfxVolume(name);
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

  private nextTrack(): void {
    this.playlistIndex = (this.playlistIndex + 1) % this.playlist.length;
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
    this.playlistIndex = (this.playlistIndex + 1) % this.playlist.length;
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
      hitDamage.volume = this.getSfxVolume('hit');
    }
    if (this.securityLaserAudio) this.securityLaserAudio.volume = this.getSfxVolume('securityLaser');
    if (this.gasSfx) this.gasSfx.volume = this.getSfxVolume('gas');
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

  playSfx(name: Exclude<AudioSfxName, 'planting' | 'disarm' | 'securityLaser'>): void {
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
      case 'hit':
      case 'playerDamage':
        this.playHitDamageSfx(name);
        break;
      case 'enemyDeath':
      case 'playerDeath':
        this.playDeathSfx(name);
        break;
      case 'place':
        this.beep('sfx', 350, 90, 0.05, name);
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
      case 'pickup':
        this.beep('sfx', 840, 90, 0.05, name);
        break;
      case 'modCollection':
      case 'legendaryMod':
        this.playModRevealSfx(name);
        break;
      case 'menu':
        this.beep('sfx', 520, 60, 0.04, name);
        break;
    }
  }
}
