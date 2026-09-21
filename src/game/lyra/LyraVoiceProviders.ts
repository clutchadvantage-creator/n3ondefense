import type { LyraMessage, LyraPlayback, LyraSettings, LyraVoiceProvider } from './LyraTypes.ts';

export interface VoiceDescription { name: string; lang: string; localService: boolean; }
/** Voice names are preferences, not a claim about gender metadata or installed voices. */
export const LYRA_PREFERRED_VOICE_NAMES = ['Aria', 'Jenny', 'Zira', 'Samantha', 'Victoria', 'Karen', 'Moira'];
export function selectLyraVoice<T extends VoiceDescription>(voices: readonly T[], settings: LyraSettings): T | undefined {
  const local = voices.filter(voice => voice.localService);
  return local.find(voice => settings.voiceName && voice.name === settings.voiceName)
    ?? local.find(voice => voice.lang.toLowerCase() === settings.language.toLowerCase() && LYRA_PREFERRED_VOICE_NAMES.some(name => voice.name.includes(name)))
    ?? local.find(voice => /^en(?:-|$)/i.test(voice.lang) && LYRA_PREFERRED_VOICE_NAMES.some(name => voice.name.includes(name)))
    ?? local.find(voice => voice.lang.toLowerCase() === settings.language.toLowerCase())
    ?? local.find(voice => /^en(?:-|$)/i.test(voice.lang));
}

export class RecordedAudioProvider implements LyraVoiceProvider {
  private readonly recordings: Record<string, Partial<Record<string, string>>>;
  private readonly base: string;
  constructor(recordings: Record<string, Partial<Record<string, string>>>, base: string) { this.recordings = recordings; this.base = base; }
  play(message: LyraMessage, settings: LyraSettings, started: () => void, ended: () => void, failed: () => void): LyraPlayback | null {
    if (message.recordedText !== undefined && message.recordedText !== message.text) return null;
    const path = this.recordings[settings.language]?.[message.id];
    if (!path) return null;
    const audio = new Audio(`${this.base}${path}`);
    let retired = false;
    const cancel = (): void => {
      if (retired) return;
      retired = true;
      audio.onended = audio.onerror = audio.onplaying = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
    };
    audio.volume = settings.volume;
    audio.onplaying = () => { if (!retired) started(); };
    audio.onended = () => { if (!retired) { cancel(); ended(); } };
    const fail = (): void => { if (!retired) { cancel(); failed(); } };
    audio.onerror = fail;
    void audio.play().catch(fail);
    return { cancel, get durationMs() { return Number.isFinite(audio.duration) ? audio.duration * 1000 : undefined; } };
  }
}

export class BrowserTTSProvider implements LyraVoiceProvider {
  private voices: SpeechSynthesisVoice[] = [];
  private readonly refresh = (): void => { this.voices = this.synth?.getVoices() ?? []; };
  private readonly synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  constructor() {
    this.refresh();
    this.synth?.addEventListener('voiceschanged', this.refresh);
  }
  listVoices(): VoiceDescription[] { return this.voices.map(({ name, lang, localService }) => ({ name, lang, localService })); }
  selected(settings: LyraSettings): VoiceDescription | null {
    const voice = selectLyraVoice(this.voices, settings);
    return voice ? { name: voice.name, lang: voice.lang, localService: voice.localService } : null;
  }
  play(message: LyraMessage, settings: LyraSettings, started: () => void, ended: () => void, failed: () => void): LyraPlayback | null {
    if (!settings.browserTts || !this.synth || typeof SpeechSynthesisUtterance === 'undefined') return null;
    const voice = selectLyraVoice(this.voices, settings);
    // Only explicitly local voices: gameplay must not depend on a network speech service.
    if (!voice) return null;
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.voice = voice; utterance.lang = voice.lang;
    utterance.rate = settings.rate; utterance.pitch = settings.pitch; utterance.volume = settings.volume;
    let retired = false;
    const cleanup = (): void => { retired = true; utterance.onstart = utterance.onend = utterance.onerror = null; };
    utterance.onstart = () => { if (!retired) started(); };
    utterance.onend = () => { if (!retired) { cleanup(); ended(); } };
    utterance.onerror = () => { if (!retired) { cleanup(); failed(); } };
    try { this.synth.speak(utterance); } catch { cleanup(); return null; }
    return { cancel: () => { if (!retired) { cleanup(); this.synth!.cancel(); } } };
  }
  destroy(): void { this.synth?.removeEventListener('voiceschanged', this.refresh); }
}

export class TextOnlyFallback implements LyraVoiceProvider {
  play(_message: LyraMessage, _settings: LyraSettings, _started: () => void, ended: () => void): LyraPlayback {
    const timer = window.setTimeout(ended, 0);
    return { cancel: () => window.clearTimeout(timer) };
  }
}
