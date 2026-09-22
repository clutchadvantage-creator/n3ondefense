import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { LYRA_MESSAGES, LYRA_RECORDINGS } from '../src/game/lyra/LyraRegistry.ts';
import { TUTORIAL_SEQUENCES } from '../src/game/tutorial/TutorialRegistry.ts';
import { resolveTutorialCopy } from '../src/game/tutorial/TutorialCopy.ts';
import { DEFAULT_ABILITY_BINDINGS } from '../src/game/config/controls.ts';

const directory = 'public/assets/audio/lyra';
const recordings = LYRA_RECORDINGS['en-US'];
const steps = new Map(TUTORIAL_SEQUENCES.flatMap(sequence => sequence.steps.map(step =>
  [`tutorial.${sequence.id}.${step.id}`, { ...step, scene: sequence.scene, sequence: sequence.title }])));
const unavailableSuffix = ' This action is not currently available; continue when ready.';
const entries = LYRA_MESSAGES.map(message => {
  const step = steps.get(message.id), file = recordings[message.id];
  const text = step ? resolveTutorialCopy(step, 'keyboardMouse', 'xbox', DEFAULT_ABILITY_BINDINGS).body : message.text;
  const fileExists = Boolean(file && existsSync(`${directory}/${file}`));
  return { id: message.id, mode: message.mode, scene: step?.scene ?? message.scenes ?? 'context controlled',
    title: step?.title ?? message.id, text, file: file ?? null, fileExists,
    usesRecordingByDefault: fileExists && (message.recordedText === undefined || message.recordedText === text),
    suggestedFile: file ?? `lyra-${message.id.replaceAll('.', '-')}.mp3` };
});
const missing = entries.filter(entry => !entry.usesRecordingByDefault);
const variants = [];
for (const entry of entries.filter(e => e.usesRecordingByDefault)) {
  const step = steps.get(entry.id);
  if (!step) continue;
  const grouped = new Map();
  for (const family of ['xbox', 'playstation', 'generic']) {
    const text = resolveTutorialCopy(step, 'gamepad', family, DEFAULT_ABILITY_BINDINGS).body;
    if (text === entry.text) continue;
    const existing = grouped.get(text) ?? []; existing.push(family); grouped.set(text, existing);
  }
  for (const [text, families] of grouped) variants.push({ id: entry.id, kind: 'controller', families, text });
  if (/\{(?:SHIELD|DASH|MINE|FENCE|TURRET)\}/.test(step.body))
    variants.push({ id: entry.id, kind: 'rebound-key-template', text: step.body });
  if (step.completion.type === 'event') variants.push({ id: entry.id, kind: 'action-unavailable', text: entry.text + unavailableSuffix });
}
const mapped = new Set(Object.values(recordings));
const unmappedFiles = readdirSync(directory).filter(file => /\.(mp3|ogg|wav|m4a)$/i.test(file) && !mapped.has(file));
const report = { generatedAt: new Date().toISOString(), language: 'en-US', registered: entries.length,
  recorded: entries.filter(e => e.usesRecordingByDefault).length, missingCount: missing.length,
  missing, variants, entries, unmappedFiles, unavailableSuffix };
writeFileSync('docs/lyra-voice-coverage.json', JSON.stringify(report, null, 2) + '\n');
const quote = text => text.split('\n').map(line => '> ' + line).join('\n');
const lines = [
  '# LYRA — remaining custom voice recordings', '',
  `The current English catalog contains **${report.registered} message IDs: ${report.recorded} have working custom recordings and ${missing.length} have no matching custom recording**. The following is generated from the actual message registry, tutorial text resolver, recording map, and files in \`${directory}/\`.`, '',
  'Missing recordings use local browser TTS when LYRA voice and Browser TTS are enabled and a suitable local voice exists. Otherwise they use the existing text-only fallback. This is a coverage inventory, not a claim that every message played during a test session.', '',
  '## Recording list — every message without custom VO', '',
  'Record the quoted text for each ID. Suggested filenames are organizational suggestions; new files must also be registered in `LYRA_RECORDINGS` before the game uses them. Keep files in `public/assets/audio/lyra/`.', ''
];
missing.forEach((entry, index) => lines.push(`### ${index + 1}. ${entry.title}`, '',
  `ID: \`${entry.id}\`  \nSuggested file: \`${entry.suggestedFile}\``, '', quote(entry.text), ''));
lines.push('## Existing recordings that still fall back to TTS in some situations', '',
  'Recorded audio is accepted only when its transcript exactly matches the displayed instructions. This prevents a recording from teaching the wrong button. The 17 existing files cover the default English keyboard/mouse script; controller prompts, rebound ability keys, and the unavailable-action explanation can change that script.', '',
  '### Controller variants — exact current text', '',
  'These variants do not have matching recordings. Family names below identify the actual controller prompt text. A variant-aware recording map will be needed to select these files; adding another file under the same message ID alone would replace its default recording.', '');
for (const variant of variants.filter(v => v.kind === 'controller')) lines.push(`#### ${variant.id} — ${variant.families.join(', ')}`, '', quote(variant.text), '');
lines.push('### Rebound keyboard/mouse ability variants', '',
  'These are the complete templates. The game replaces the braces with the chosen binding name. Arbitrary player bindings cannot be covered by one fixed recording; either record supported variants or retain TTS for custom bindings.', '');
for (const variant of variants.filter(v => v.kind === 'rebound-key-template')) lines.push(`#### ${variant.id}`, '', quote(variant.text), '');
lines.push('### Action-unavailable variants', '',
  'When an action-gated step cannot be performed, the game appends this exact sentence to the entire resolved tutorial line:', '', quote(unavailableSuffix.trim()), '',
  'For a recorded line, that changes its transcript and selects TTS. The affected existing recording IDs are:', '',
  ...variants.filter(v => v.kind === 'action-unavailable').map(v => `- \`${v.id}\``), '',
  'The machine-readable inventory includes each complete default-keyboard unavailable-action transcript. Controller or custom-key versions use their resolved full text plus the same suffix. Tutorial lines already listed in the 45-line recording list can receive the same suffix when action-gated.', '',
  '### Other fallback conditions', '',
  '- A language other than `en-US` has no registered custom audio map. The current registry text remains English; selecting a different language does not supply a translation.',
  '- A missing, unreadable, or failed audio file can fall through to TTS even for one of the 17 mapped messages.',
  '- The development voice lab can explicitly force TTS for any registered message. That is a preview control, not additional authored dialogue.',
  '- Echo currently has three ability sound-effect cues and no authored LYRA dialogue entry. Those synthesized cues are SFX, not TTS voice lines.', '',
  '## Existing files checked', '', '| Message ID | Custom file |', '| --- | --- |',
  ...entries.filter(e => e.usesRecordingByDefault).map(e => `| \`${e.id}\` | \`${e.file}\` |`), '',
  `Unmapped audio files in the LYRA folder: ${unmappedFiles.length ? unmappedFiles.join(', ') : '**none**'}.`, '',
  'Regenerate this inventory after adding or changing dialogue:', '',
  '```powershell', 'node --experimental-strip-types scripts/audit-lyra-voice-coverage.mjs', '```', '',
  '[Machine-readable inventory and complete variant text](lyra-voice-coverage.json).', ''
);
writeFileSync('docs/lyra-missing-voice-lines.md', lines.join('\n'));
console.log(JSON.stringify({ registered: report.registered, recorded: report.recorded, missing: missing.length,
  controllerVariants: variants.filter(v => v.kind === 'controller').length, reboundTemplates: variants.filter(v => v.kind === 'rebound-key-template').length,
  unavailableVariants: variants.filter(v => v.kind === 'action-unavailable').length, unmappedFiles }));
