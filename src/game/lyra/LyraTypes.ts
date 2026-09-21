export type LyraMode = 'GUIDANCE' | 'TACTICAL' | 'WARNING' | 'SYSTEM' | 'EVENT' | 'AMBIENT' | 'NARRATIVE';
export const LYRA_PRIORITY = { critical: 100, training: 90, gameplay: 80, event: 70, context: 60, system: 40, ambient: 10 } as const;
export interface LyraMessage {
  id: string;
  text: string;
  mode: LyraMode;
  priority: number;
  scenes?: readonly string[];
  cooldownMs?: number;
  expiryMs?: number;
  durationMs?: number;
  interruptible?: boolean;
  once?: 'profile' | 'run';
  weight?: number;
  tags?: readonly string[];
  /** Instructions already have the tutorial's persistent, binding-aware view. */
  tutorial?: boolean;
  condition?: 'low-health' | 'defusing';
  /** A recording is valid only while the presented instructions match its transcript. */
  recordedText?: string;
  /** Used by the development voice lab to exercise each provider independently. */
  voiceSource?: 'recorded' | 'tts';
}
export interface LyraSettings {
  voice: boolean;
  subtitles: boolean;
  browserTts: boolean;
  ambient: boolean;
  volume: number;
  ducking: number;
  voiceName: string;
  language: string;
  rate: number;
  pitch: number;
}
export const DEFAULT_LYRA_SETTINGS: Readonly<LyraSettings> = {
  voice: true, subtitles: true, browserTts: true, ambient: true,
  volume: .8, ducking: .25, voiceName: '', language: 'en-US', rate: .96, pitch: 1
};
export function normalizeLyraSettings(value: unknown): LyraSettings {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: keyof LyraSettings, low: number, high: number): number =>
    typeof v[key] === 'number' && Number.isFinite(v[key]) ? Math.max(low, Math.min(high, v[key] as number)) : DEFAULT_LYRA_SETTINGS[key] as number;
  const bool = (key: keyof LyraSettings): boolean => typeof v[key] === 'boolean' ? v[key] as boolean : DEFAULT_LYRA_SETTINGS[key] as boolean;
  return { voice: bool('voice'), subtitles: bool('subtitles'), browserTts: bool('browserTts'), ambient: bool('ambient'),
    volume: number('volume', 0, 1), ducking: number('ducking', 0, .5), rate: number('rate', .7, 1.3), pitch: number('pitch', .7, 1.2),
    voiceName: typeof v.voiceName === 'string' ? v.voiceName.slice(0, 160) : '',
    language: typeof v.language === 'string' && /^[a-z]{2,3}(?:-[a-zA-Z]{2,8})*$/.test(v.language) ? v.language : 'en-US' };
}
export interface LyraContext { scope: string; scene: string; blocked: boolean; training: boolean; ambientSafe: boolean; lowHealth?: boolean; defusing?: boolean; }
export interface LyraPlayback { cancel(): void; readonly durationMs?: number; }
export interface LyraVoiceProvider {
  play(message: LyraMessage, settings: LyraSettings, started: () => void, ended: () => void, failed: () => void): LyraPlayback | null;
  destroy?(): void;
}
