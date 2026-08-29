import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateRunConfigurationLayout } from '../src/game/ui/RunConfigurationLayout.ts';

const targetViewports = [
  [1920, 1080],
  [1600, 900],
  [1366, 768]
];

test('Run Configuration assigns non-overlapping structural regions at target desktop viewports', () => {
  for (const [width, height] of targetViewports) {
    const layout = calculateRunConfigurationLayout(width, height);
    const statusTop = layout.statusY - layout.statusHeight / 2;
    const statusBottom = layout.statusY + layout.statusHeight / 2;
    const monitorBottom = layout.monitorTop + layout.monitorHeight;
    const summaryTop = layout.bottomSummaryY - layout.summaryHeight / 2;
    const summaryBottom = layout.bottomSummaryY + layout.summaryHeight / 2;
    const signalButtonBottom = layout.selectionStartY + 5 * layout.signalGap + 24;
    const contractDescriptionBottom = layout.selectionStartY + 3 * layout.contractGap
      + (layout.compact ? 26 : 31)
      + layout.typography.selectionDescription * 1.25;

    assert.ok(statusTop >= 80, 'top monitors must clear the screen title and run-fee strip');
    assert.ok(statusBottom < layout.panelTop, 'top monitors must clear the selection modules');
    assert.ok(signalButtonBottom <= layout.selectionBottomY, 'all six Signal rows must clear diagnostics');
    assert.ok(contractDescriptionBottom <= layout.selectionBottomY, 'Contract descriptions must clear diagnostics');
    assert.ok(layout.selectionBottomY < layout.monitorTop);
    assert.ok(monitorBottom < summaryTop);
    assert.ok(summaryBottom <= height);
    assert.ok(layout.columnWidth > 600 || width < 1500);
  }
});

test('important Run Configuration text never falls into decorative micro-font sizes', () => {
  for (const [width, height] of targetViewports) {
    const { typography } = calculateRunConfigurationLayout(width, height);
    assert.ok(typography.runFee >= 16);
    assert.ok(typography.selection >= 14);
    assert.ok(typography.selectionDescription >= 18);
    assert.ok(typography.walletValue >= 14);
    assert.ok(typography.diagnosticLabel >= 14);
    assert.ok(typography.summary >= 16);
    assert.ok(typography.summaryStatus >= 15);
  }
});

test('Garage fee and setup console both use the authoritative resolver and selections refresh live', () => {
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const terminal = garage.slice(garage.indexOf('private createConfigurationTerminal'), garage.indexOf('private createWalletTerminal'));
  const setup = garage.slice(garage.indexOf('private showRunConfiguration'), garage.indexOf('private showLibrary'));
  const refresh = garage.slice(garage.indexOf('private refreshConfigurationTerminalState'), garage.indexOf('private createWalletTerminal'));

  assert.match(terminal, /getRunSetupCost\(setup\)/);
  assert.match(setup, /const totalCost = getRunSetupCost\(setup\)/);
  assert.match(refresh, /const setup = SaveSystem\.getNextRunSetupSelection\(\)/);
  assert.match(refresh, /const cost = getRunSetupCost\(setup\)/);
  assert.equal((setup.match(/this\.refreshConfigurationTerminalState\(\)/g) ?? []).length, 3);
});
