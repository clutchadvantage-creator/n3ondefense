import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const result = { recordedAt: new Date().toISOString(), tests: 740, builds: ['production', 'itch'] };
for (const [name, file] of Object.entries({ browser: 'mechanical-hud-browser', responsive: 'mechanical-hud-compact', resourcesAndCost: 'mechanical-hud-cost' })) {
  const r = await read(`artifacts/${file}.json`);
  if (r.running || r.errors.length || r.cases.some(c => !c.ok)) throw Error(file + ' failed');
  result[name] = { cases: r.cases, screenshots: r.screenshots?.map(s => typeof s === 'string' ? s : s.label),
    audio: r.audio, measurements: r.measurements, retiredTextures: r.retiredTextures };
}
for (const name of ['normal', 'late']) {
  const raw = await read(`artifacts/mechanical-hud-${name}.json`), summary = await read(`artifacts/mechanical-hud-${name}.summary.json`);
  if (raw.running || raw.errors.length || !summary.passed) throw Error(name + ': ' + JSON.stringify(raw.errors.length ? raw.errors : summary.failures));
  result[name] = { options: raw.options, startedAt: raw.startedAt, finishedAt: raw.finishedAt, ...summary,
    echoActivations: raw.echoActivations,
    finale: raw.finale ? { checks: raw.finale.checks, samples: raw.finale.samples.map(({ diagnostic, ...s }) => s),
      highestRound: raw.finale.afterProgress.supremeHighestRound, completed: raw.finale.afterProgress.supremeOverdriveCompleted } : undefined };
}
result.endingReload = await read('artifacts/mechanical-hud-ending-reload.json');
if (!result.endingReload.completed || result.endingReload.highest !== 148) throw Error('Ending reload failed');
const voice = await read('docs/lyra-voice-coverage.json');
result.voice = { registered: voice.registered, recorded: voice.recorded, missing: voice.missingCount, unmappedFiles: voice.unmappedFiles };
await writeFile('docs/mechanical-hud-measurements.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ normal: result.normal.passed, late: result.late.passed, voice: result.voice,
  browser: result.browser.cases.length, responsive: result.responsive.cases.length, resourcesAndCost: result.resourcesAndCost.cases.length }));
