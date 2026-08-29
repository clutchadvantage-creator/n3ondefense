import Phaser from 'phaser';
import { MOD_FOCUS_LABELS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import type { RunSetupSelection } from '../economy/types.ts';
import { createButton } from '../utils/ui.ts';

export interface DeploymentConfigurationModalOptions {
  kind: 'reminder' | 'insufficient';
  selection: RunSetupSelection;
  cost: number;
  walletCredits: number;
  onConfirm?: () => void;
  onCancel: () => void;
  onConfigure?: () => void;
}

const chamfer = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0, width, cut, width, height - cut,
  width - cut, height, cut, height, 0, height - cut, 0, cut
];

export const createDeploymentConfigurationModal = (
  scene: Phaser.Scene,
  options: DeploymentConfigurationModalOptions
): Phaser.GameObjects.Container => {
  const { width, height } = scene.scale;
  const compact = width < 760 || height < 620;
  const panelWidth = Math.min(width - 28, compact ? 560 : 690);
  const panelHeight = Math.min(height - 28, compact ? 380 : 430);
  const root = scene.add.container(0, 0).setDepth(50_000);
  const shade = scene.add.rectangle(width / 2, height / 2, width, height, 0x01040a, 0.82).setInteractive();
  const shadow = scene.add.polygon(width / 2 + 7, height / 2 + 9, chamfer(panelWidth, panelHeight, 22), 0x000000, 0.62);
  const panel = scene.add.polygon(width / 2, height / 2, chamfer(panelWidth, panelHeight, 22), 0x07131f, 0.99)
    .setStrokeStyle(2, options.kind === 'reminder' ? 0x55efff : 0xff668f, 0.9);
  const inset = scene.add.rectangle(width / 2, height / 2 + 5, panelWidth - 30, panelHeight - 38, 0x081b28, 0.72)
    .setStrokeStyle(1, 0xff5bcf, 0.24);
  const topRail = scene.add.rectangle(width / 2, height / 2 - panelHeight / 2 + 7, panelWidth - 70, 4, 0x55efff, 0.75);
  const title = scene.add.text(width / 2, height / 2 - panelHeight / 2 + 34, options.kind === 'reminder'
    ? 'DEPLOYMENT CONFIGURATION ACTIVE'
    : 'DEPLOYMENT BLOCKED // INSUFFICIENT CREDITS', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 18 : 24}px`, fontStyle: 'bold',
    color: options.kind === 'reminder' ? '#8cf7ff' : '#ff8ca7', align: 'center',
    wordWrap: { width: panelWidth - 60, useAdvancedWrap: true }
  }).setOrigin(0.5, 0);
  const contract = options.selection.contract ? RUN_CONTRACTS[options.selection.contract].label.toUpperCase() : 'NONE';
  const signal = options.selection.modFocus ? MOD_FOCUS_LABELS[options.selection.modFocus].toUpperCase() : 'NONE';
  const copy = options.kind === 'reminder'
    ? 'YOUR SAVED CONTRACT / SIGNAL WILL BE APPLIED TO THIS NEW RUN.'
    : `CURRENT BALANCE // ${options.walletCredits.toLocaleString()} CREDITS\nSHORTFALL // ${Math.max(0, options.cost - options.walletCredits).toLocaleString()} CREDITS`;
  const details = scene.add.text(width / 2, title.y + title.height + 22,
    `${copy}\n\nCONTRACT // ${contract}\nSIGNAL // ${signal}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 16 : 20}px`, color: '#d7f6ff',
      fontStyle: 'bold', align: 'center', lineSpacing: compact ? 3 : 6,
      wordWrap: { width: panelWidth - 70, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
  const cost = scene.add.text(width / 2, height / 2 + panelHeight * 0.16,
    `RUN COST // ${options.cost.toLocaleString()} CREDITS`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 18 : 24}px`, fontStyle: 'bold',
      color: '#ffd17d', align: 'center'
    }).setOrigin(0.5);
  const actionY = height / 2 + panelHeight / 2 - (compact ? 52 : 58);
  const actionWidth = Math.min(250, (panelWidth - 72) / 2);
  const gap = 12;
  const leftLabel = options.kind === 'reminder' ? 'YES // DEPLOY' : 'OPEN CONFIGURATION';
  const rightLabel = options.kind === 'reminder' ? 'NO // STAY HERE' : 'CLOSE';
  const left = createButton(scene, width / 2 - actionWidth / 2 - gap / 2, actionY, leftLabel, () => {
    if (options.kind === 'reminder') options.onConfirm?.();
    else options.onConfigure?.();
  }, actionWidth, 'menu', {
    height: compact ? 44 : 50,
    fontSize: compact ? 15 : 18,
    focusModalDepth: 100,
    focusDefaultPriority: options.kind === 'reminder' ? 80 : 60
  });
  const right = createButton(scene, width / 2 + actionWidth / 2 + gap / 2, actionY, rightLabel, options.onCancel, actionWidth, 'menu', {
    height: compact ? 44 : 50,
    fontSize: compact ? 15 : 18,
    focusModalDepth: 100,
    focusDefaultPriority: options.kind === 'reminder' ? 60 : 80,
    focusLabel: options.kind === 'reminder' ? 'NO STAY HERE' : 'CLOSE INSUFFICIENT FUNDS'
  });
  root.add([shade, shadow, panel, inset, topRail, title, details, cost, left, right]);
  return root;
};
