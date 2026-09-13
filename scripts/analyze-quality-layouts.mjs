import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const before = await read('artifacts/quality-layout-before.json');
const after = await read('artifacts/quality-layout-after.json');
const failures = [];
const check = (ok, label) => { if (!ok) failures.push(label); };
// A HEIST-only correction can reuse the unchanged Arena/menu measurements.
// Keep the original sweep and identify every replacement in the output.
const followupPath = process.argv[2];
const followup = followupPath ? await read(followupPath) : undefined;
const replacements = new Map(followup?.cases.map(c => [c.label, c]) ?? []);
if (followup) {
  check(!followup.running && !followup.errors.length && followup.cases.length === 9
    && replacements.size === 9 && followup.cases.every(c => c.kind === 'heist'), 'Complete nine-view HEIST follow-up');
  check(['width', 'height', 'dpr', 'renderer'].every(k => followup.environment[k] === after.environment[k]), 'Matching follow-up viewport/renderer');
  check(after.cases.filter(c => c.kind === 'heist').every(c => replacements.has(c.label)), 'Matching HEIST follow-up views');
}
const measuredCases = after.cases.map(c => c.kind === 'heist' ? replacements.get(c.label) ?? c : c);
const mean = values => values.reduce((n, v) => n + v, 0) / Math.max(1, values.length);
const round = v => Math.round(v * 1000) / 1000;
const previous = new Map(before.cases.map(c => [c.label, c]));
check(!after.running && !after.errors.length && after.cases.length === 128, 'Complete 128-case sweep');
for (const current of measuredCases) {
  const baseline = previous.get(current.label);
  check(Boolean(baseline), `Baseline exists: ${current.label}`);
  if (!baseline) continue;
  check(JSON.stringify(current.layout) === JSON.stringify(baseline.layout), `Geometry preserved: ${current.label}`);
  check(current.render.mean <= baseline.render.mean * 1.3 + .15, `Renderer CPU: ${current.label}`);
  check(current.raw.mean <= baseline.raw.mean * 1.15 + 1, `Raw frames: ${current.label}`);
  if (current.kind.startsWith('arena')) {
    check(current.resources.renderTextures.reduce((sum, t) => sum + t.width * t.height, 0) <= 2 * 2400 * 1600 + 1048576, `Small-art texture allowance: ${current.label}`);
    check(current.retired.objects === 0 && current.retired.canvasOwners === 0, `Retirement: ${current.label}`);
  }
}
const rows = measuredCases.map(c => ({ label: c.label, kind: c.kind, template: c.template, requestedTemplate: c.requestedTemplate,
  source: replacements.has(c.label) ? followupPath : 'artifacts/quality-layout-after.json',
  beforeSetupMs: round(previous.get(c.label)?.setupMs ?? 0), setupMs: round(c.setupMs),
  beforeRendererMs: round(previous.get(c.label)?.render.mean ?? 0), rendererMs: round(c.render.mean),
  rawFrameMs: round(c.raw.mean), rawP95Ms: round(c.raw.p95), rawMaxMs: round(c.raw.max), retired: c.retired }));
const arena = rows.filter(c => c.kind === 'arena');
const summary = { passed: !failures.length, failures, environment: after.environment, cases: rows.length,
  beforeEnvironment: before.environment,
  sameBrowserBuild: before.environment.userAgent === after.environment.userAgent,
  sources: { before: 'artifacts/quality-layout-before.json', sweep: 'artifacts/quality-layout-after.json', heistFollowup: followupPath },
  supersededHeistViews: followup ? after.cases.filter(c => c.kind === 'heist').map(c => ({ label: c.label, rendererMs: round(c.render.mean),
    passedRendererBudget: c.render.mean <= previous.get(c.label).render.mean * 1.3 + .15 })) : undefined,
  families: [...new Set(rows.filter(c => c.kind.startsWith('arena')).map(c => c.template))],
  arena: { cases: arena.length, beforeSetupMs: round(mean(arena.map(c => c.beforeSetupMs))), setupMs: round(mean(arena.map(c => c.setupMs))),
    beforeRendererMs: round(mean(arena.map(c => c.beforeRendererMs))), rendererMs: round(mean(arena.map(c => c.rendererMs))),
    maxRendererMs: Math.max(...arena.map(c => c.rendererMs)), maxSetupMs: Math.max(...arena.map(c => c.setupMs)) }, rows };
await writeFile('docs/quality-layout-measurements.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
