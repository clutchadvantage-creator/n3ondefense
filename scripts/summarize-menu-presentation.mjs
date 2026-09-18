import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const paths = {
  browser: 'artifacts/menu-presentation-browser.json',
  returns: 'artifacts/menu-return-browser.json',
  normal: 'artifacts/menu-hud-final-normal.json',
  analysis: 'artifacts/menu-hud-final-normal.summary.json'
};
const browser = await read(paths.browser), returns = await read(paths.returns);
const normal = await read(paths.normal), analysis = await read(paths.analysis);
for (const report of [browser, returns]) {
  if (report.running || report.errors.length || report.cases.some(c => !c.ok)) throw Error('Incomplete browser evidence');
}
if (!analysis.passed || normal.running || normal.errors.length) throw Error('Incomplete gameplay evidence');
await writeFile('docs/menu-presentation-measurements.json', JSON.stringify({
  generatedAt: new Date().toISOString(), paths,
  browser: { checks: browser.cases, errors: browser.errors, music: browser.music },
  returns: { checks: returns.cases, errors: returns.errors },
  normal: { options: normal.options, analysis },
  hudEnding: 'docs/hud-information-measurements.json',
  validation: { build: 'artifacts/menu-presentation-build.txt', tests: 'artifacts/menu-presentation-tests.txt', testCount: 685 }
}, null, 2) + '\n');
console.log('Saved compact menu presentation measurements');
