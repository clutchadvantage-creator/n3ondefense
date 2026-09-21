import { SaveSystem } from '../systems/SaveSystem.ts';
import { PlayerProfileStore } from '../state/PlayerProfileStore.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { LyraQueue } from './LyraQueue.ts';
import { LYRA_MESSAGE_BY_ID, LYRA_MESSAGES, LYRA_RECORDINGS } from './LyraRegistry.ts';
import { BrowserTTSProvider, RecordedAudioProvider, TextOnlyFallback } from './LyraVoiceProviders.ts';
import { normalizeLyraSettings, type LyraContext, type LyraMessage, type LyraPlayback, type LyraSettings } from './LyraTypes.ts';

export class LyraComms {
  private static instance: LyraComms | undefined;
  static get(): LyraComms { return this.instance ??= new LyraComms(); }
  readonly tts = new BrowserTTSProvider();
  private readonly recorded = new RecordedAudioProvider(LYRA_RECORDINGS, `${import.meta.env.BASE_URL}assets/audio/lyra/`);
  private readonly textOnly = new TextOnlyFallback();
  private settings = normalizeLyraSettings(undefined);
  private profile = '';
  private seen = new Set<string>();
  private playback: LyraPlayback | null = null;
  private generation = 0;
  private timer: number | undefined;
  private watchdog: number | undefined;
  private speaking = false;
  private provider = 'text-only';
  private voiceStarted = false;
  private startedAt = 0;
  private readUntil = 0;
  private trainingOwner = '';
  private activeContext: LyraContext = { scope: '', scene: '', blocked: true, training: false, ambientSafe: false };
  private nextAmbient = performance.now() + 180000 + Math.random() * 180000;
  private readonly ambientHistory: string[] = [];
  private presenter: ((message: LyraMessage | null, speaking: boolean) => void) | null = null;
  private lastRefresh = -Infinity;
  private devSettings: Partial<LyraSettings> = {};
  get currentScene(): string { return this.activeContext.scene; }
  readonly queue = new LyraQueue(() => performance.now(), id => this.seen.has(id), message => this.start(message), () => this.stop());

  setPresenter(presenter: typeof this.presenter): void {
    this.presenter?.(null, false);
    this.presenter = presenter;
    this.present();
  }
  setContext(scene: string, blocked: boolean, ambientSafe: boolean, lowHealth = false, defusing = false): void {
    const changed = scene !== this.activeContext.scene;
    if (changed) this.trainingOwner = '';
    const context = { scope: `${this.profile}:${scene}`, scene, blocked, ambientSafe, lowHealth, defusing,
      training: this.trainingOwner === scene };
    if (changed || blocked !== this.activeContext.blocked || ambientSafe !== this.activeContext.ambientSafe || context.training !== this.activeContext.training
      || lowHealth !== this.activeContext.lowHealth || defusing !== this.activeContext.defusing) {
      this.activeContext = context;
      this.queue.setContext(context);
    }
  }
  training(scene: string, id: string, text: string): void {
    this.refreshSettings();
    this.trainingOwner = scene;
    this.activeContext = { scope: `${this.profile}:${scene}`, scene, blocked: false, ambientSafe: false, training: true };
    this.queue.setContext(this.activeContext);
    this.queue.clear();
    const definition = LYRA_MESSAGE_BY_ID.get(id);
    if (definition) this.queue.submit({ ...definition, text });
  }
  endTraining(scene: string): void {
    if (this.trainingOwner !== scene) return;
    this.queue.clear();
    this.trainingOwner = '';
    this.activeContext.training = false;
    this.queue.setContext({ ...this.activeContext });
  }
  say(id: string): boolean {
    const message = LYRA_MESSAGE_BY_ID.get(id);
    if (!message || (message.mode === 'AMBIENT' && !this.settings.ambient)) return false;
    if (!this.settings.subtitles && (!this.settings.voice || this.settings.volume === 0)) return false;
    if (message.once === 'profile' && !SaveSystem.get().settings.contextualTutorials) return false;
    return this.queue.submit(message);
  }
  cancel(): void { this.queue.clear(); }
  resetRun(): void { this.queue.resetRun(); }
  tick(): void {
    const now = performance.now();
    if (now - this.lastRefresh < 250) return;
    this.lastRefresh = now;
    this.refreshSettings();
    this.queue.tick();
    if (now >= this.nextAmbient) {
      this.nextAmbient = now + 180000 + Math.random() * 180000;
      this.ambient();
    }
  }
  ambient(): boolean {
    if (!this.settings.ambient || !this.activeContext.ambientSafe || this.activeContext.training || this.queue.active || this.queue.pending.length) return false;
    const choices = LYRA_MESSAGES.filter(m => m.mode === 'AMBIENT' && m.scenes?.includes(this.activeContext.scene) && !this.ambientHistory.includes(m.id));
    let roll = Math.random() * choices.reduce((sum, m) => sum + (m.weight ?? 1), 0);
    const choice = choices.find(m => (roll -= m.weight ?? 1) < 0);
    if (!choice || !this.say(choice.id)) return false;
    this.ambientHistory.push(choice.id);
    if (this.ambientHistory.length > 1) this.ambientHistory.shift();
    return true;
  }
  refreshSettings(): void {
    let save: ReturnType<typeof PlayerProfileStore.getActiveSave>;
    try { save = PlayerProfileStore.getActiveSave(); } catch { this.queue.clear(); return; }
    const profile = save.profile.id;
    if (profile !== this.profile) {
      this.queue.resetRun(); this.queue.resetCooldowns(); this.profile = profile;
      this.seen = new Set(SaveSystem.getTutorialProgress().lyraSeen ?? []);
      this.activeContext.scope = `${profile}:${this.activeContext.scene}`;
      this.queue.setContext({ ...this.activeContext });
    }
    const next = normalizeLyraSettings({ ...save.settings.lyra, ...this.devSettings });
    next.volume *= save.settings.masterVolume;
    if ((!next.voice || next.volume === 0 || (!next.browserTts && this.settings.browserTts)) && this.playback) {
      this.stopVoice(); this.completeSpeech();
    }
    const changed = next.subtitles !== this.settings.subtitles;
    this.settings = next;
    if (changed) this.present();
  }
  diagnostics() {
    return { context: { ...this.activeContext }, active: this.queue.active?.id ?? null,
      pending: this.queue.pending.map(p => p.message.id), speaking: this.speaking,
      provider: this.provider, voiceStarted: this.voiceStarted,
      voice: this.tts.selected(this.settings), settings: this.settings, seen: [...this.seen] };
  }
  configureDevelopment(settings: Partial<LyraSettings>): void {
    if (!import.meta.env.DEV) return;
    this.devSettings = { ...this.devSettings, ...settings }; this.refreshSettings();
  }
  resetSeen(): void {
    if (!import.meta.env.DEV) return;
    this.seen.clear(); SaveSystem.updateTutorialProgress(state => { state.lyraSeen = []; });
  }
  destroy(): void { this.queue.clear(); this.tts.destroy(); this.setPresenter(null); LyraComms.instance = undefined; }
  private start(message: LyraMessage): void {
    this.stop();
    const generation = ++this.generation;
    this.startedAt = performance.now();
    this.provider = 'text-only'; this.voiceStarted = false;
    this.readUntil = this.startedAt + (message.durationMs ?? Math.min(12000, Math.max(3500, message.text.length * 48)));
    this.present();
    if (!this.settings.voice || this.settings.volume === 0) { this.completeSpeech(); return; }
    const providers = message.voiceSource === 'recorded' ? [this.recorded, this.textOnly]
      : message.voiceSource === 'tts' ? [this.tts, this.textOnly] : [this.recorded, this.tts, this.textOnly];
    const providerNames = message.voiceSource === 'recorded' ? ['recorded', 'text-only']
      : message.voiceSource === 'tts' ? ['browser-tts', 'text-only'] : ['recorded', 'browser-tts', 'text-only'];
    const attempt = (index: number): void => {
      if (generation !== this.generation) return;
      window.clearTimeout(this.watchdog);
      this.playback?.cancel(); this.playback = null;
      if (index >= providers.length) { this.completeSpeech(); return; }
      let providerStarted = false;
      this.provider = providerNames[index];
      this.playback = providers[index].play(message, this.settings, () => {
        if (generation !== this.generation) return;
        providerStarted = true; this.voiceStarted = true; this.speaking = true;
        const strength = message.mode === 'AMBIENT' ? 0 : message.mode === 'WARNING' ? .5 : 1;
        AudioManager.get().setLyraDucking(this.settings.ducking * strength);
        this.present();
      }, () => { if (generation === this.generation) this.completeSpeech(); }, () => {
        if (generation === this.generation) { this.stopVoice(); attempt(index + 1); }
      });
      if (!this.playback) { attempt(index + 1); return; }
      // A missing start or end event must never strand the queue or music gain.
      this.watchdog = window.setTimeout(() => {
        if (generation !== this.generation) return;
        if (!providerStarted) { this.stopVoice(); attempt(index + 1); }
        else this.watchdog = window.setTimeout(() => {
          if (generation === this.generation) { this.stopVoice(); this.completeSpeech(); }
        }, Math.min(180000, Math.max(15000, (this.playback?.durationMs ?? message.text.length * 100 / this.settings.rate) + 2000)));
      }, 2000);
    };
    attempt(0);
  }
  private completeSpeech(): void {
    window.clearTimeout(this.watchdog);
    this.stopVoice();
    this.present();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const message = this.queue.active;
      // A higher-priority interruption must not permanently consume an unread hint.
      if (message?.once === 'profile' && !this.seen.has(message.id)) {
        this.seen.add(message.id);
        SaveSystem.updateTutorialProgress(state => { state.lyraSeen = [...this.seen]; });
      }
      this.queue.finish(); this.presenter?.(null, false);
    }, Math.max(0, this.readUntil - performance.now()));
  }
  private present(): void {
    const message = this.queue.active;
    this.presenter?.(message && !message.tutorial && this.settings.subtitles ? message : null, this.speaking);
  }
  private stopVoice(): void {
    this.playback?.cancel(); this.playback = null; this.speaking = false;
    AudioManager.get().setLyraDucking(0);
  }
  private stop(): void {
    ++this.generation; window.clearTimeout(this.timer); window.clearTimeout(this.watchdog);
    this.stopVoice(); this.presenter?.(null, false);
  }
}
