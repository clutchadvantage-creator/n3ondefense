import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const before = await read('artifacts/quality-layout-before.json');
const after = await read('artifacts/quality-layout-after.json');
const failures = [];
const check = (ok, label) => { if (!ok) failures.push(label); };
const mean = values => values.reduce((n, v) => n + v, 0) / Math.max(1, values.length);
const round = v => Math.round(v * 1000) / 1000;
const previous = new Map(before.cases.map(c => [c.label, c]));
check(!after.running && !after.errors.length && after.cases.length === 128, 'Complete 128-case sweep');
for (const current of after.cases) {
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
const rows = after.cases.map(c => ({ label: c.label, kind: c.kind, template: c.template, requestedTemplate: c.requestedTemplate,
  beforeSetupMs: round(previous.get(c.label)?.setupMs ?? 0), setupMs: round(c.setupMs),
  beforeRendererMs: round(previous.get(c.label)?.render.mean ?? 0), rendererMs: round(c.render.mean),
  rawFrameMs: round(c.raw.mean), rawP95Ms: round(c.raw.p95), rawMaxMs: round(c.raw.max), retired: c.retired }));
const arena = rows.filter(c => c.kind === 'arena');
const summary = { passed: !failures.length, failures, environment: after.environment, cases: rows.length,
  families: [...new Set(rows.filter(c => c.kind.startsWith('arena')).map(c => c.template))],
  arena: { cases: arena.length, beforeSetupMs: round(mean(arena.map(c => c.beforeSetupMs))), setupMs: round(mean(arena.map(c => c.setupMs))),
    beforeRendererMs: round(mean(arena.map(c => c.beforeRendererMs))), rendererMs: round(mean(arena.map(c => c.rendererMs))),
    maxRendererMs: Math.max(...arena.map(c => c.rendererMs)), maxSetupMs: Math.max(...arena.map(c => c.setupMs)) }, rows };
await writeFile('docs/quality-layout-measurements.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
