import { SaveSystem } from './SaveSystem';
import type { AudioSfxName } from '../config/audio';

export class AudioManager {
  private static instance: AudioManager | null = null;
  private readonly context: AudioContext;
  private readonly playlist = [
    '/assets/audio/music/Arc Grid SiegeV1.mp3',
    '/assets/audio/music/Arc Grid SiegeV3.mp3'
  ];
  private musicAudio: HTMLAudioElement | null = null;
  private playlistIndex = 0;
  private musicStarted = false;
  private readonly shotSfxPool: HTMLAudioElement[] = [];
  private readonly boostSfxPool: HTMLAudioElement[] = [];
  private readonly explosionSfxPool: HTMLAudioElement[] = [];
  private readonly enemyDeathSfxPool: HTMLAudioElement[] = [];
  private readonly playerDeathSfxPool: HTMLAudioElement[] = [];
  private plantingAudio: HTMLAudioElement | null = null;
  private plantingLoopRequested = false;
  private disarmAudio: HTMLAudioElement | null = null;
  private disarmLoopRequested = false;
  private shotSfxCursor = 0;
  private boostSfxCursor = 0;
  private explosionSfxCursor = 0;
  private enemyDeathSfxCursor = 0;
  private playerDeathSfxCursor = 0;

  private clampVolume(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private constructor() {
    this.context = new AudioContext();
    this.initShotSfxPool();
    this.initBoostSfxPool();
    this.initExplosionSfxPool();
    this.initDeathSfxPools();
  }

  static get(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private getVolume(kind: 'music' | 'sfx', sound?: AudioSfxName): number {
    try {
      const settings = SaveSystem.get().settings;
      const local = kind === 'music' ? settings.musicVolume : settings.sfxVolume;
      const individual = kind === 'sfx' && sound ? settings.soundVolumes[sound] : 1;
      return settings.masterVolume * local * individual;
    } catch {
      const local = kind === 'music' ? 0.6 : 0.75;
      return 0.85 * local;
    }
  }

  getSfxVolume(sound?: AudioSfxName): number {
    return this.clampVolume(this.getVolume('sfx', sound));
  }

  private getCurrentTrackUrl(): string {
    return this.playlist[this.playlistIndex % this.playlist.length] ?? this.playlist[0];
  }

  private initShotSfxPool(): void {
    const src = '/assets/audio/soundeffects/Laser.mp3';
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
    const src = '/assets/audio/soundeffects/boost.mp3';
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
      const direct = new Audio('/assets/audio/soundeffects/boost.mp3');
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

  private initExplosionSfxPool(): void {
    const src = '/assets/audio/soundeffects/explosion.mp3';
    for (let i = 0; i < 3; i += 1) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
      audio.volume = this.getSfxVolume('bomb');
      this.explosionSfxPool.push(audio);
    }
  }

  private playExplosionSfx(): void {
    const fallbackOneShot = (): void => {
      const direct = new Audio('/assets/audio/soundeffects/explosion.mp3');
      direct.preload = 'auto';
      direct.volume = this.getSfxVolume('bomb');
      void direct.play().catch(() => {
        this.beep('sfx', 60, 650, 0.2, 'bomb');
      });
    };

    if (this.explosionSfxPool.length === 0) {
      fallbackOneShot();
      return;
    }

    const nextIndex = this.explosionSfxCursor % this.explosionSfxPool.length;
    this.explosionSfxCursor = (this.explosionSfxCursor + 1) % this.explosionSfxPool.length;
    const audio = this.explosionSfxPool[nextIndex];
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers may reject seeks before metadata is ready.
    }
    audio.volume = this.getSfxVolume('bomb');
    void audio.play().catch(() => {
      fallbackOneShot();
    });
  }

  private initDeathSfxPools(): void {
    const src = '/assets/audio/soundeffects/bang.mp3';
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
    if (this.musicAudio) {
      this.musicAudio.volume = this.clampVolume(this.getVolume('music'));
    }

    for (const shot of this.shotSfxPool) {
      shot.volume = this.getSfxVolume('shot');
    }
    for (const boost of this.boostSfxPool) {
      boost.volume = this.getSfxVolume('boost');
    }
    for (const explosion of this.explosionSfxPool) {
      explosion.volume = this.getSfxVolume('bomb');
    }
    for (const enemyDeath of this.enemyDeathSfxPool) {
      enemyDeath.volume = this.getSfxVolume('enemyDeath');
    }
    for (const playerDeath of this.playerDeathSfxPool) {
      playerDeath.volume = this.getSfxVolume('playerDeath');
    }
    if (this.plantingAudio) this.plantingAudio.volume = this.getSfxVolume('planting');
    if (this.disarmAudio) this.disarmAudio.volume = this.getSfxVolume('disarm');
  }

  stopMusic(): void {
    this.musicAudio?.pause();
    this.musicStarted = false;
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
      this.plantingAudio = new Audio('/assets/audio/soundeffects/planting.mp3');
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
      this.disarmAudio = new Audio('/assets/audio/soundeffects/disarm.mp3');
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

  playSfx(name: Exclude<AudioSfxName, 'planting' | 'disarm'>): void {
    switch (name) {
      case 'shot':
        this.playShotSfx();
        break;
      case 'boost':
        this.playBoostSfx();
        break;
      case 'hit':
        this.beep('sfx', 180, 50, 0.06, name);
        break;
      case 'playerDamage':
        this.beep('sfx', 120, 110, 0.08, name);
        break;
      case 'enemyDeath':
      case 'playerDeath':
        this.playDeathSfx(name);
        break;
      case 'place':
        this.beep('sfx', 350, 90, 0.05, name);
        break;
      case 'mine':
        this.beep('sfx', 90, 240, 0.1, name);
        break;
      case 'beep':
        this.beep('sfx', 620, 80, 0.05, name);
        break;
      case 'defuseAlarm':
        this.beep('sfx', 780, 120, 0.08, name);
        break;
      case 'bomb':
        this.playExplosionSfx();
        break;
      case 'pickup':
        this.beep('sfx', 840, 90, 0.05, name);
        break;
      case 'menu':
        this.beep('sfx', 520, 60, 0.04, name);
        break;
    }
  }
}
