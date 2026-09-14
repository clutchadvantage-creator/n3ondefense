export interface DroneAudioOwner { readonly active: boolean; readonly airborne: boolean; readonly hp: number; readonly x: number; readonly y: number }
export const DRONE_AUDIO = { capacity: 5, radius: 720, updateMs: 100, gain: .65, switchBias: .9 } as const;
interface Voice {
  owner: DroneAudioOwner | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  pan: StereoPannerNode | null;
  endsAt: number;
  retiring: boolean;
}

/** Five reusable spatial channels; one shared decoded clip, one source per occupied channel.
 * Buffer sources are single-use WebAudio nodes and are disconnected on retirement.
 * No timers or async load completion can start an unowned sound.
 */
export class DroneAudioPool {
  private readonly voices: Voice[];
  private readonly nearest: DroneAudioOwner[] = [];
  private readonly distances: number[] = [];
  private buffer: AudioBuffer | null = null;
  private nextAt = 0;
  private readonly context: AudioContext;
  loadError: string | null = null;
  readonly ready: Promise<void>;

  constructor(context: AudioContext, url: string) {
    this.context = context;
    this.voices = Array.from({ length: DRONE_AUDIO.capacity }, () => {
      const gain = context.createGain();
      const pan = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
      gain.gain.value = 0;
      if (pan) { gain.connect(pan); pan.connect(context.destination); }
      else gain.connect(context.destination);
      return { owner: null, source: null, gain, pan, endsAt: 0, retiring: false };
    });
    this.ready = fetch(url).then(r => { if (!r.ok) throw new Error(`Drone audio HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(bytes => context.decodeAudioData(bytes)).then(buffer => { this.buffer = buffer; })
      .catch(error => { this.loadError = String(error); });
  }

  update(nowMs: number, enemies: readonly DroneAudioOwner[], x: number, y: number, volume: number, cameraRotation = 0): void {
    if (volume <= 0 || this.context.state !== 'running') { this.stop(); return; }
    if (nowMs < this.nextAt) return;
    this.nextAt = nowMs + DRONE_AUDIO.updateMs;
    this.nearest.length = 0; this.distances.length = 0;
    for (const enemy of enemies) {
      if (!enemy.airborne || !enemy.active || enemy.hp <= 0) continue;
      const distance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (distance >= DRONE_AUDIO.radius ** 2) continue;
      // Keep an existing owner unless a challenger is meaningfully closer.
      const rank = distance * (this.voices.some(v => v.owner === enemy && !v.retiring) ? DRONE_AUDIO.switchBias ** 2 : 1);
      let index = 0; while (index < this.distances.length && this.distances[index] <= rank) index++;
      if (index >= DRONE_AUDIO.capacity) continue;
      this.nearest.splice(index, 0, enemy); this.distances.splice(index, 0, rank);
      if (this.nearest.length > DRONE_AUDIO.capacity) { this.nearest.pop(); this.distances.pop(); }
    }
    const time = this.context.currentTime;
    for (const voice of this.voices) {
      if (voice.retiring || (voice.owner && (!voice.owner.active || voice.owner.hp <= 0))) this.clear(voice);
      if (voice.owner && !this.nearest.includes(voice.owner)) {
        voice.retiring = true;
        voice.gain.gain.cancelScheduledValues(time);
        voice.gain.gain.setTargetAtTime(0, time, .012);
        voice.source?.stop(time + .04);
      }
    }
    for (const enemy of this.nearest) {
      let voice = this.voices.find(v => v.owner === enemy && !v.retiring);
      if (!voice) { voice = this.voices.find(v => !v.owner); if (voice) voice.owner = enemy; }
      if (!voice) continue;
      const dx = enemy.x - x, dy = enemy.y - y;
      const proximity = Math.max(0, 1 - Math.hypot(dx, dy) / DRONE_AUDIO.radius);
      if (!voice.source && this.buffer) {
        const source = this.context.createBufferSource();
        source.buffer = this.buffer; source.loop = false; source.connect(voice.gain);
        voice.source = source; voice.endsAt = time + this.buffer.duration;
        const slot = voice;
        source.onended = () => { source.disconnect(); if (slot.source === source) slot.source = null; };
        voice.gain.gain.cancelScheduledValues(time); voice.gain.gain.setValueAtTime(0, time);
        source.start();
      }
      // The supplied recording is not a seamless loop. Fade its tail and retrigger
      // only after the previous source ended, while the owner is still selected.
      const tail = Math.min(1, Math.max(0, (voice.endsAt - time) / .18));
      voice.gain.gain.setTargetAtTime(volume * DRONE_AUDIO.gain * proximity ** 2 * tail, time, .035);
      voice.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * Math.cos(cameraRotation) - dy * Math.sin(cameraRotation)) / (DRONE_AUDIO.radius * .7))), time, .035);
    }
  }

  release(owner: DroneAudioOwner): void { for (const voice of this.voices) if (voice.owner === owner) this.clear(voice); }
  stop(): void { for (const voice of this.voices) this.clear(voice); this.nextAt = 0; this.nearest.length = 0; this.distances.length = 0; }
  stats() { return { capacity: this.voices.length, owners: this.voices.filter(v => v.owner).length, active: this.voices.filter(v => v.source).length, loaded: Boolean(this.buffer), duration: this.buffer?.duration ?? 0, loadError: this.loadError }; }
  private clear(voice: Voice): void {
    if (!voice.owner && !voice.source && !voice.retiring) return;
    voice.gain.gain.cancelScheduledValues(this.context.currentTime); voice.gain.gain.setValueAtTime(0, this.context.currentTime);
    if (voice.source) { voice.source.onended = null; voice.source.stop(); voice.source.disconnect(); voice.source = null; }
    voice.owner = null; voice.retiring = false;
  }
}
