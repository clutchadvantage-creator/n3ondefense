export interface WalkingBoss {
  readonly x: number;
  readonly y: number;
  readonly active: boolean;
  readonly hp: number;
  readonly visible: boolean;
}

export const BOSS_WALKING_AUDIO = { fadeOutSeconds: .28, fadeInSeconds: .09, minimumSpeed: 3, gain: .8 } as const;
interface Voice {
  x: number;
  y: number;
  time: number;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  pan: StereoPannerNode | null;
  fadingUntil: number | null;
}

/** One loop per moving legged boss. Actual displacement excludes walking into
 * walls, idle aiming and spawn/teleport jumps. Loading never starts playback. */
export class BossWalkingAudio {
  private readonly voices = new Map<WalkingBoss, Voice>();
  private buffer: AudioBuffer | null = null;
  private readonly context: AudioContext;
  loadError: string | null = null;
  readonly ready: Promise<void>;

  constructor(context: AudioContext, url: string) {
    this.context = context;
    this.ready = fetch(url).then(response => {
      if (!response.ok) throw new Error(`Boss walking audio HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(bytes => context.decodeAudioData(bytes)).then(buffer => { this.buffer = buffer; })
      .catch(error => { this.loadError = String(error); });
  }

  update(bosses: readonly WalkingBoss[], listenerX: number, listenerY: number, volume: number): void {
    if (volume <= 0 || this.context.state !== 'running') { this.stop(); return; }
    const now = this.context.currentTime;
    for (const [boss, voice] of this.voices) {
      if (!bosses.includes(boss) || !boss.active || boss.hp <= 0 || !boss.visible) {
        this.release(voice);
        this.voices.delete(boss);
      }
    }
    for (const boss of bosses) {
      if (!boss.active || boss.hp <= 0 || !boss.visible) continue;
      let voice = this.voices.get(boss);
      if (!voice) {
        const gain = this.context.createGain();
        const pan = typeof this.context.createStereoPanner === 'function' ? this.context.createStereoPanner() : null;
        gain.gain.value = 0;
        if (pan) { gain.connect(pan); pan.connect(this.context.destination); }
        else gain.connect(this.context.destination);
        voice = { x: boss.x, y: boss.y, time: now, source: null, gain, pan, fadingUntil: null };
        this.voices.set(boss, voice);
      }
      const elapsed = now - voice.time, distance = Math.hypot(boss.x - voice.x, boss.y - voice.y);
      const moving = elapsed > 0 && elapsed < .5 && distance <= 150
        && distance / elapsed > BOSS_WALKING_AUDIO.minimumSpeed;
      voice.x = boss.x; voice.y = boss.y; voice.time = now;
      if (moving && this.buffer) {
        if (!voice.source) {
          const source = this.context.createBufferSource();
          source.buffer = this.buffer;
          source.loop = true;
          source.connect(voice.gain);
          voice.gain.gain.setValueAtTime(0, now);
          source.start();
          voice.source = source;
        }
        voice.fadingUntil = null;
        const dx = boss.x - listenerX, dy = boss.y - listenerY;
        const proximity = Math.max(.15, 1 - Math.hypot(dx, dy) / 1400);
        voice.gain.gain.setTargetAtTime(volume * BOSS_WALKING_AUDIO.gain * proximity, now, BOSS_WALKING_AUDIO.fadeInSeconds / 3);
        voice.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / 900)), now, .035);
      } else if (voice.source) {
        if (voice.fadingUntil === null) {
          voice.fadingUntil = now + BOSS_WALKING_AUDIO.fadeOutSeconds;
          voice.gain.gain.setTargetAtTime(0, now, BOSS_WALKING_AUDIO.fadeOutSeconds / 5);
        }
        if (now >= voice.fadingUntil) this.stopSource(voice);
      }
    }
  }

  stop(): void {
    for (const voice of this.voices.values()) this.release(voice);
    this.voices.clear();
  }

  stats() {
    const voices = [...this.voices.values()];
    return { owners: voices.length, active: voices.filter(v => v.source).length,
      fading: voices.filter(v => v.fadingUntil !== null).length,
      loaded: !!this.buffer, duration: this.buffer?.duration ?? 0, loadError: this.loadError };
  }

  private stopSource(voice: Voice): void {
    voice.gain.gain.cancelScheduledValues(this.context.currentTime);
    voice.gain.gain.setValueAtTime(0, this.context.currentTime);
    voice.source?.stop();
    voice.source?.disconnect();
    voice.source = null;
    voice.fadingUntil = null;
  }

  private release(voice: Voice): void {
    this.stopSource(voice);
    voice.gain.disconnect();
    voice.pan?.disconnect();
  }
}
