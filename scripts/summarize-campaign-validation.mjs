import { readFile, writeFile } from 'node:fs/promises';

const fixtures = {};
for (const [name, path] of Object.entries({
  boundaries: 'artifacts/campaign-boundaries-final.json',
  online: 'artifacts/campaign-online.json',
  ending: 'artifacts/campaign-ending.json',
  regression: 'artifacts/campaign-regression.json'
})) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  if (report.running || report.errors.length || report.cases.some(test => !test.ok)) throw Error(`Incomplete/failed fixture: ${path}`);
  fixtures[name] = { source: path, assertions: report.cases.length, checks: report.cases, frames: report.frames ?? [], errors: report.errors };
}
await writeFile('docs/campaign-validation.json', JSON.stringify({
  baseline: 'e38bcedde97e6487fc8582eabe1cb3f79c7a1f2f',
  scope: 'Short assisted local browser checks. Online transport is mocked; no external submissions. No campaign soak or production-backend deployment.',
  browserAssertions: Object.values(fixtures).reduce((sum, fixture) => sum + fixture.assertions, 0),
  fixtures
}, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([name, fixture]) => [name, { assertions: fixture.assertions, frames: fixture.frames }]))));
