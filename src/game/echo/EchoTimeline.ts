import { ECHO_BALANCE, normalizeEchoConfig, type EchoConfig } from './EchoRules.ts';

export interface EchoShot {
  time: number; x: number; y: number; angle: number; mode: 'normal' | 'scattershot' | 'grenade';
  speed: number; damage: number; critical: boolean; ricochets: number; grenadeSequence: number;
  texture: string; width: number; height: number;
}
export interface EchoHost {
  validOrigin(x: number, y: number): boolean;
  /** Return position is written into out; no ownership of the live player enters the timeline. */
  snap(x: number, y: number, out: { x: number; y: number }): boolean;
  pose(x: number, y: number, rotation: number, dashing: boolean): void;
  fire(shot: Readonly<EchoShot>, offsetX: number, offsetY: number, multiplier: number): void;
  event(event: 'record' | 'snap' | 'complete' | 'cancel'): void;
}

/** One allocation-stable movement timeline and bounded, preallocated weapon-event reserve. */
export class EchoTimeline {
  readonly config: EchoConfig;
  readonly samples = new Float64Array((ECHO_BALANCE.recordingMs * ECHO_BALANCE.sampleHz / 1000 + 2) * 5);
  readonly shots: EchoShot[] = Array.from({ length: ECHO_BALANCE.maximumShots }, () => ({
    time: 0, x: 0, y: 0, angle: 0, mode: 'normal', speed: 0, damage: 0, critical: false, ricochets: 0,
    grenadeSequence: 0, texture: '', width: 0, height: 0
  }));
  recording = false;
  replaying = false;
  elapsedMs = 0;
  durationMs = 0;
  replayMs = 0;
  cooldownMs = 0;
  sampleCount = 0;
  shotCount = 0;
  rejectedShots = 0;
  private armed = true;
  private sampleCursor = 0;
  private shotCursor = 0;
  private nextSampleMs = 0;
  private originX = 0;
  private originY = 0;
  private readonly returned = { x: 0, y: 0 };
  private readonly host: EchoHost;
  constructor(host: EchoHost, config: Partial<EchoConfig> = {}) { this.host = host; this.config = normalizeEchoConfig(config); }

  advance(deltaMs: number, held: boolean, pressed: boolean, x: number, y: number, rotation: number, dashing: boolean): void {
    const dt = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);
    this.cooldownMs = Math.max(0, this.cooldownMs - dt);
    if (!held) this.armed = true;
    if (this.replaying) {
      this.replayMs = Math.min(this.durationMs, this.replayMs + dt * this.config.replaySpeed);
      this.play();
    }
    if (!this.recording) {
      if (pressed && held && this.armed && !this.replaying && this.cooldownMs === 0 && this.host.validOrigin(x, y)) {
        this.armed = false; this.recording = true; this.elapsedMs = 0; this.shotCount = 0; this.sampleCount = 0;
        this.originX = x; this.originY = y; this.sample(x, y, rotation, dashing);
        this.nextSampleMs = 1000 / ECHO_BALANCE.sampleHz; this.host.event('record');
      }
      return;
    }
    this.elapsedMs = Math.min(this.config.recordingMs, this.elapsedMs + dt);
    if (this.elapsedMs >= this.nextSampleMs) {
      this.sample(x, y, rotation, dashing);
      this.nextSampleMs = this.elapsedMs + 1000 / ECHO_BALANCE.sampleHz;
    }
    if (!held || this.elapsedMs >= this.config.recordingMs) this.finish(x, y, rotation, dashing);
  }

  recordShot(shot: Omit<EchoShot, 'time'>, source: 'weapon' | 'echo' = 'weapon'): boolean {
    if (!this.recording || source !== 'weapon') return false;
    if (this.shotCount >= this.shots.length) { this.rejectedShots++; return false; }
    Object.assign(this.shots[this.shotCount++], shot, { time: this.elapsedMs });
    return true;
  }
  reset(): void {
    this.recording = this.replaying = false; this.elapsedMs = this.durationMs = this.replayMs = this.cooldownMs = 0;
    this.sampleCount = this.shotCount = this.sampleCursor = this.shotCursor = 0; this.armed = false;
    this.samples.fill(0);
    for (const shot of this.shots) { shot.texture = ''; shot.damage = 0; shot.time = 0; }
    this.host.event('cancel');
  }
  private sample(x: number, y: number, rotation: number, dashing: boolean): void {
    const i = Math.min(this.sampleCount, this.samples.length / 5 - 1) * 5;
    this.samples[i] = this.elapsedMs; this.samples[i + 1] = x; this.samples[i + 2] = y;
    this.samples[i + 3] = rotation; this.samples[i + 4] = Number(dashing);
    this.sampleCount = Math.min(this.sampleCount + 1, this.samples.length / 5);
  }
  private finish(x: number, y: number, rotation: number, dashing: boolean): void {
    this.sample(x, y, rotation, dashing); this.recording = false;
    this.durationMs = this.elapsedMs; this.cooldownMs = this.config.cooldownMs;
    if (!this.host.snap(this.originX, this.originY, this.returned)) { this.host.event('cancel'); return; }
    this.replaying = true; this.replayMs = 0; this.sampleCursor = this.shotCursor = 0;
    this.host.event('snap'); this.play();
  }
  private play(): void {
    const offsetX = this.returned.x - this.originX, offsetY = this.returned.y - this.originY;
    while (this.shotCursor < this.shotCount && this.shots[this.shotCursor].time <= this.replayMs) {
      this.host.fire(this.shots[this.shotCursor++], offsetX, offsetY, this.config.damageMultiplier);
    }
    while (this.sampleCursor < this.sampleCount - 2 && this.samples[(this.sampleCursor + 1) * 5] <= this.replayMs) this.sampleCursor++;
    const a = this.sampleCursor * 5, b = Math.min(this.sampleCursor + 1, this.sampleCount - 1) * 5;
    const t = Math.min(1, Math.max(0, (this.replayMs - this.samples[a]) / Math.max(.001, this.samples[b] - this.samples[a])));
    const turn = Math.atan2(Math.sin(this.samples[b + 3] - this.samples[a + 3]), Math.cos(this.samples[b + 3] - this.samples[a + 3]));
    this.host.pose(this.samples[a + 1] + (this.samples[b + 1] - this.samples[a + 1]) * t + offsetX,
      this.samples[a + 2] + (this.samples[b + 2] - this.samples[a + 2]) * t + offsetY,
      this.samples[a + 3] + turn * t, this.samples[a + 4] === 1);
    if (this.replayMs >= this.durationMs) { this.replaying = false; this.host.event('complete'); }
  }
}
