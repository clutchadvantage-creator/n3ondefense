import Phaser from 'phaser';
import type { RunSetupSelection } from '../economy/types.ts';
import { calculateRunConfigurationLayout, type RunConfigurationConsoleLayout } from './RunConfigurationLayout.ts';

export interface RunConfigurationWallet {
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
}

export interface RunConfigurationConsoleData {
  setup: RunSetupSelection;
  savedDeploymentEnabled: boolean;
  totalCost: number;
  signalMultiplier: number;
  contractLabel: string;
  contractCreditMultiplier: number;
  contractEnemyHealthMultiplier: number;
  contractSpawnCadenceMultiplier: number;
  wallet: RunConfigurationWallet;
}

const chamfer = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0, width, cut, width, height - cut,
  width - cut, height, cut, height, 0, height - cut, 0, cut
];

const addText = (
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  x: number,
  y: number,
  text: string,
  size: number,
  color: string,
  originX = 0,
  fontFamily = 'Rajdhani, sans-serif'
): Phaser.GameObjects.Text => {
  const label = scene.add.text(x, y, text, {
    fontFamily,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    letterSpacing: size >= 12 ? 1 : 0
  }).setOrigin(originX, 0.5);
  root.add(label);
  return label;
};

const createEmbeddedMonitor = (
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  accent: number,
  titleSize = Math.round(Phaser.Math.Clamp(height * 0.105, 12, 15))
): Phaser.GameObjects.Container => {
  const monitor = scene.add.container(x, y);
  const shadow = scene.add.polygon(5, 6, chamfer(width, height, 10), 0x000000, 0.48).setOrigin(0.5);
  const chassis = scene.add.polygon(0, 0, chamfer(width, height, 10), 0x061019, 0.98)
    .setOrigin(0.5).setStrokeStyle(1, accent, 0.58);
  const glass = scene.add.rectangle(0, 4, width - 18, height - 20, 0x071b26, 0.72)
    .setStrokeStyle(1, accent, 0.16);
  const rail = scene.add.rectangle(0, -height / 2 + 6, width - 28, 3, accent, 0.62);
  const header = scene.add.text(-width / 2 + 16, -height / 2 + 15, title, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, fontStyle: 'bold',
    color: Phaser.Display.Color.IntegerToColor(accent).rgba, letterSpacing: 1
  }).setOrigin(0, 0.5);
  const led = scene.add.circle(width / 2 - 17, -height / 2 + 15, 2.5, accent, 0.95);
  const scan = scene.add.rectangle(0, -height / 2 + 28, width - 24, 1, accent, 0.08);
  monitor.add([shadow, chassis, glass, rail, header, led, scan]);
  root.add(monitor);
  return monitor;
};

export const createRunConfigurationConsole = (
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  width: number,
  height: number,
  data: RunConfigurationConsoleData
): { layout: RunConfigurationConsoleLayout; animatedTargets: Phaser.GameObjects.GameObject[] } => {
  const layout = calculateRunConfigurationLayout(width, height);
  const {
    density,
    compact,
    outerMargin,
    columnGap,
    columnWidth,
    leftX,
    rightX,
    statusY,
    statusHeight,
    panelTop,
    panelBottom,
    monitorHeight,
    monitorTop,
    bottomSummaryY,
    summaryHeight,
    typography
  } = layout;
  const animatedTargets: Phaser.GameObjects.GameObject[] = [];

  const shellWidth = width - 14;
  const shellHeight = height - 14;
  const shell = scene.add.polygon(width / 2, height / 2, chamfer(shellWidth, shellHeight, compact ? 16 : 26), 0x030910, 0.985)
    .setStrokeStyle(2, 0x54efff, 0.62);
  const inset = scene.add.polygon(width / 2, height / 2 + 4, chamfer(shellWidth - 24, shellHeight - 30, compact ? 12 : 20), 0x07121c, 0.62)
    .setStrokeStyle(1, 0xff5bcf, 0.2);
  const topBus = scene.add.rectangle(width / 2, compact ? 69 : 78, width - (compact ? 210 : 310), 5, 0x55efff, 0.56);
  const topBusGlow = scene.add.rectangle(width / 2, compact ? 69 : 78, width - (compact ? 260 : 390), 14, 0x55efff, 0.045)
    .setBlendMode(Phaser.BlendModes.ADD);
  // The overlay creates its title and Close command before this workstation.
  // Insert the opaque chassis behind those controls so the console cannot
  // visually cover or intercept its own navigation chrome.
  root.addAt(shell, 3);
  root.addAt(inset, 4);
  root.add([topBusGlow, topBus]);

  // Console hardware: vents, screws, and distinct cyan/magenta data buses.
  for (const x of [outerMargin + 14, width - outerMargin - 14]) {
    const boltTop = scene.add.circle(x, panelTop - 23, 3, 0x9beeff, 0.7).setStrokeStyle(1, 0xffffff, 0.55);
    const boltBottom = scene.add.circle(x, panelBottom + 16, 3, 0xff70d0, 0.65).setStrokeStyle(1, 0xffffff, 0.45);
    root.add([boltTop, boltBottom]);
  }
  for (let index = 0; index < 7; index += 1) {
    const vent = scene.add.rectangle(width / 2 - 92 + index * 30, panelBottom + 17, 18, 3, index % 2 ? 0xff5bcf : 0x55efff, 0.24);
    root.add(vent);
  }

  const systemWidth = Math.min(columnWidth - 8, density === 'compressed' ? 330 : compact ? 420 : 500);
  const systemX = outerMargin + systemWidth * 0.5;
  const system = createEmbeddedMonitor(scene, root, systemX, statusY, systemWidth, statusHeight, 'SYSTEM STATUS', 0x55efff, typography.monitorTitle);
  addText(
    scene,
    system,
    -systemWidth * 0.5 + 17,
    statusHeight * 0.16,
    data.savedDeploymentEnabled ? 'PERSISTENCE LINK // ACTIVE' : 'PERSISTENCE LINK // MANUAL',
    typography.diagnosticLabel,
    data.savedDeploymentEnabled ? '#72ffae' : '#8fc6d5'
  );

  const walletWidth = Math.min(width - outerMargin * 2 - systemWidth - columnGap, density === 'compressed' ? 680 : 900);
  const walletX = width - outerMargin - walletWidth * 0.5;
  const wallet = createEmbeddedMonitor(scene, root, walletX, statusY, walletWidth, statusHeight, 'TACTICAL WALLET', 0xff5bcf, typography.monitorTitle);
  const walletLine = `${data.wallet.credits.toLocaleString()} CREDITS  //  ${data.wallet.coreTokens.toLocaleString()} CORE  //  ${data.wallet.plasmaChips.toLocaleString()} PLASMA  //  ${data.wallet.fluxCores.toLocaleString()} FLUX`;
  addText(scene, wallet, 0, statusHeight * 0.16, walletLine, typography.walletValue, '#ffe4f8', 0.5, 'Orbitron, sans-serif');

  const createModuleFrame = (centerX: number, title: string, accent: number, channel: string): void => {
    const moduleHeight = panelBottom - panelTop;
    const frame = scene.add.polygon(centerX, panelTop + moduleHeight * 0.5, chamfer(columnWidth, moduleHeight, compact ? 11 : 18), 0x07121b, 0.93)
      .setStrokeStyle(2, accent, 0.58);
    const recess = scene.add.rectangle(centerX, panelTop + moduleHeight * 0.5 + 8, columnWidth - 18, moduleHeight - 56, 0x06131d, 0.86)
      .setStrokeStyle(1, accent, 0.15);
    const header = scene.add.rectangle(centerX, panelTop + 21, columnWidth - 18, 38, accent, 0.075)
      .setStrokeStyle(1, accent, 0.3);
    const rail = scene.add.rectangle(centerX, panelTop + 4, columnWidth - 54, 3, accent, 0.65);
    const label = scene.add.text(centerX - columnWidth / 2 + 24, panelTop + 21, title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 15 : 18}px`, fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(accent).rgba, letterSpacing: 1
    }).setOrigin(0, 0.5);
    const channelLabel = scene.add.text(centerX + columnWidth / 2 - 24, panelTop + 21, channel, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.channel}px`, fontStyle: 'bold', color: '#7899a7'
    }).setOrigin(1, 0.5);
    root.add([frame, recess, header, rail, label, channelLabel]);
  };
  createModuleFrame(leftX, 'SIGNAL // FOCUSED MOD HUNT', 0x55efff, 'CHANNEL A-03');
  createModuleFrame(rightX, 'CONTRACT // ENGAGEMENT RULES', 0xff5bcf, 'CHANNEL B-07');

  const halfMonitorWidth = (columnWidth - columnGap) * 0.5;
  const monitorCenterY = monitorTop + monitorHeight * 0.5;
  const signalWeight = createEmbeddedMonitor(
    scene, root, leftX - halfMonitorWidth * 0.5 - 3, monitorCenterY,
    halfMonitorWidth, monitorHeight, 'SIGNAL WEIGHTING PREVIEW', 0x55efff, typography.monitorTitle
  );
  const categoryLabels = ['WPN', 'PLY', 'DEF', 'BMB', 'UTL'];
  const selectedIndex = data.setup.modFocus ? ['weapon', 'player', 'defense', 'bombSite', 'utility'].indexOf(data.setup.modFocus) : -1;
  const graphWidth = halfMonitorWidth - 30;
  categoryLabels.forEach((label, index) => {
    const barWidth = graphWidth / categoryLabels.length - 5;
    const active = index === selectedIndex;
    const barHeight = (density === 'compressed' ? 20 : compact ? 30 : 55) * (active ? 1 : 1 / data.signalMultiplier);
    const x = -graphWidth / 2 + index * (barWidth + 5) + barWidth / 2;
    const bottom = monitorHeight / 2 - (density === 'compressed' ? 26 : compact ? 32 : 38);
    const bar = scene.add.rectangle(x, bottom - barHeight / 2, barWidth, barHeight, active ? 0x55efff : 0x234858, active ? 0.86 : 0.52);
    const text = scene.add.text(x, bottom + 5, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.diagnosticLabel}px`, color: active ? '#b9fbff' : '#7597a5', fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    signalWeight.add([bar, text]);
  });

  const focus = createEmbeddedMonitor(
    scene, root, leftX + halfMonitorWidth * 0.5 + 3, monitorCenterY,
    halfMonitorWidth, monitorHeight, 'ACTIVE MOD FOCUS', 0x55efff, typography.monitorTitle
  );
  const focusName = data.setup.modFocus ? data.setup.modFocus.toUpperCase() : 'NONE';
  addText(scene, focus, 0, density === 'compressed' ? -3 : compact ? -7 : -12, focusName, typography.diagnosticValue, '#adfaff', 0.5, 'Orbitron, sans-serif');
  addText(scene, focus, 0, density === 'compressed' ? 17 : compact ? 21 : 26, data.setup.modFocus ? `${data.signalMultiplier.toFixed(1)}x CATEGORY WEIGHT` : 'STANDARD DISTRIBUTION', typography.diagnosticLabel, '#8bc4d2', 0.5);

  const simulation = createEmbeddedMonitor(
    scene, root, rightX - halfMonitorWidth * 0.5 - 3, monitorCenterY,
    halfMonitorWidth, monitorHeight, 'ENCOUNTER SIMULATION', 0xff5bcf, typography.monitorTitle
  );
  const waveform = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  waveform.lineStyle(2, 0xff5bcf, 0.75).beginPath();
  const waveWidth = halfMonitorWidth - 28;
  for (let point = 0; point <= 18; point += 1) {
    const x = -waveWidth / 2 + point / 18 * waveWidth;
    const pressure = (data.contractEnemyHealthMultiplier - 1) * 18 + (1 / data.contractSpawnCadenceMultiplier - 1) * 20;
    const y = 10 + Math.sin(point * 0.87) * (5 + pressure) + Math.sin(point * 0.31) * 3;
    if (point === 0) waveform.moveTo(x, y); else waveform.lineTo(x, y);
  }
  waveform.strokePath();
  simulation.add(waveform);
  addText(scene, simulation, 0, monitorHeight / 2 - (compact ? 23 : 29), data.setup.contract ? 'PROTOCOL ARMED' : 'BASELINE PRESSURE', typography.diagnosticLabel, data.setup.contract ? '#ff9ee4' : '#9bb7c2', 0.5);

  const rewards = createEmbeddedMonitor(
    scene, root, rightX + halfMonitorWidth * 0.5 + 3, monitorCenterY,
    halfMonitorWidth, monitorHeight, 'REWARD PARAMETERS', 0xff5bcf, typography.monitorTitle
  );
  const creditBonus = Math.round((data.contractCreditMultiplier - 1) * 100);
  addText(scene, rewards, 0, density === 'compressed' ? -3 : compact ? -7 : -12, creditBonus > 0 ? `CREDITS +${creditBonus}%` : 'STANDARD REWARDS', typography.diagnosticValue, creditBonus > 0 ? '#ffd37c' : '#b4cbd4', 0.5, 'Orbitron, sans-serif');
  addText(scene, rewards, 0, density === 'compressed' ? 17 : compact ? 21 : 26, data.contractLabel.toUpperCase(), typography.diagnosticLabel, '#ef9bd5', 0.5);

  const summaryWidth = Math.min(width - (compact ? 40 : 64), 1600);
  const summary = createEmbeddedMonitor(scene, root, width / 2, bottomSummaryY, summaryWidth, summaryHeight, 'DEPLOYMENT SUMMARY // SYSTEM FEED', 0x6fffb1, typography.monitorTitle);
  const signalSummary = data.setup.modFocus ? data.setup.modFocus.toUpperCase() : 'STANDARD';
  const summaryLine = `SIGNAL ${signalSummary}   //   CONTRACT ${data.contractLabel.toUpperCase()}   //   RUN FEE ${data.totalCost.toLocaleString()}C`;
  addText(scene, summary, 0, density === 'compressed' ? 0 : compact ? 1 : 2, summaryLine, typography.summary, '#d4f8ff', 0.5, 'Orbitron, sans-serif');
  const summaryStatus = data.totalCost > data.wallet.credits
    ? 'INSUFFICIENT CREDITS'
    : data.savedDeploymentEnabled
      ? 'SAVED CONFIGURATION ACTIVE // CHARGED PER NEW RUN'
      : 'CONFIGURATION VALID // CONSUMED ON NEXT DEPLOYMENT';
  addText(scene, summary, 0, density === 'compressed' ? 20 : compact ? 24 : 29, summaryStatus, typography.summaryStatus, data.totalCost <= data.wallet.credits ? '#71ffad' : '#ff7a96', 0.5);

  const sweep = scene.add.rectangle(outerMargin + 10, height / 2, 2, height - 54, 0x55efff, 0.045);
  root.add(sweep);
  animatedTargets.push(sweep, topBusGlow);
  scene.tweens.add({ targets: sweep, x: width - outerMargin - 10, duration: 5200, repeat: -1, repeatDelay: 1800, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: topBusGlow, alpha: { from: 0.02, to: 0.11 }, duration: 1900, yoyo: true, repeat: -1 });

  return {
    layout,
    animatedTargets
  };
};
