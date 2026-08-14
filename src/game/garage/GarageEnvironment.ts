import Phaser from 'phaser';
import type { GarageLayout, GarageRect } from './garageLayout.ts';

const CYAN = 0x58efff;
const MAGENTA = 0xff5bcf;
const METAL = 0x101c27;
const DEEP_METAL = 0x071019;

const addAmbientPulse = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Rectangle,
  duration: number,
  minimum = 0.25,
  maximum = 0.9
): void => {
  scene.tweens.add({
    targets: target,
    alpha: { from: minimum, to: maximum },
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
};

const drawWallPanel = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: number
): void => {
  graphics.fillStyle(0x09131d, 0.82).fillRoundedRect(x, y, width, height, 4);
  graphics.lineStyle(1, 0x27424f, 0.32).strokeRoundedRect(x, y, width, height, 4);
  graphics.lineStyle(2, accent, 0.16).lineBetween(x + 8, y + 7, x + width - 8, y + 7);
  graphics.fillStyle(0x243843, 0.7);
  graphics.fillCircle(x + 8, y + 8, 2).fillCircle(x + width - 8, y + height - 8, 2);
};

export const createGarageEnvironment = (scene: Phaser.Scene, layout: GarageLayout): void => {
  const { width, height } = scene.scale;
  const wallTop = 66;
  const floorHorizon = height * 0.72;
  const compact = layout.compact;

  scene.add.rectangle(width / 2, height / 2, width, height, 0x02060b, 1).setDepth(0);
  scene.add.rectangle(width / 2, (wallTop + floorHorizon) / 2, width, floorHorizon - wallTop, 0x050c14, 1).setDepth(0);
  scene.add.grid(
    width / 2,
    (wallTop + floorHorizon) / 2,
    width,
    floorHorizon - wallTop,
    compact ? 54 : 64,
    compact ? 42 : 52,
    0x07111b,
    0.1,
    0x1a3a47,
    0.1
  ).setDepth(1);

  const wall = scene.add.graphics().setDepth(2);
  wall.fillStyle(0x0c1721, 1).fillRect(0, wallTop, width, 18);
  wall.fillStyle(0x172733, 0.8).fillRect(0, wallTop + 5, width, 4);
  wall.lineStyle(2, CYAN, 0.34).lineBetween(0, wallTop + 18, width, wallTop + 18);

  const bayPanelTop = wallTop + (compact ? 35 : 54);
  const bayPanelHeight = Math.max(100, floorHorizon - bayPanelTop - 26);
  const sidePanelWidth = Math.max(110, width * (compact ? 0.16 : 0.12));
  drawWallPanel(wall, layout.safe + 18, bayPanelTop, sidePanelWidth, bayPanelHeight, MAGENTA);
  drawWallPanel(wall, width - layout.safe - sidePanelWidth - 18, bayPanelTop, sidePanelWidth, bayPanelHeight, CYAN);

  if (!compact) {
    const centerPanelWidth = Math.min(520, width * 0.36);
    drawWallPanel(wall, width / 2 - centerPanelWidth / 2, bayPanelTop + 4, centerPanelWidth, bayPanelHeight - 8, CYAN);
    wall.lineStyle(1, 0x31505e, 0.28);
    wall.lineBetween(width / 2, bayPanelTop + 16, width / 2, bayPanelTop + bayPanelHeight - 16);
    wall.lineStyle(2, MAGENTA, 0.13);
    wall.lineBetween(width / 2 - centerPanelWidth / 2 + 18, bayPanelTop + bayPanelHeight - 19, width / 2 + centerPanelWidth / 2 - 18, bayPanelTop + bayPanelHeight - 19);
  }

  const pillarWidth = compact ? 15 : 24;
  const pillarLeft = layout.safe + (compact ? 2 : 5);
  const pillarRight = width - pillarLeft - pillarWidth;
  for (const [x, accent] of [[pillarLeft, MAGENTA], [pillarRight, CYAN]] as const) {
    wall.fillStyle(DEEP_METAL, 1).fillRect(x, wallTop + 18, pillarWidth, floorHorizon - wallTop - 18);
    wall.fillStyle(METAL, 0.96).fillRect(x + 4, wallTop + 18, pillarWidth - 8, floorHorizon - wallTop - 18);
    wall.lineStyle(2, accent, 0.34).lineBetween(x + (accent === MAGENTA ? pillarWidth - 3 : 3), wallTop + 25, x + (accent === MAGENTA ? pillarWidth - 3 : 3), floorHorizon - 12);
    for (let y = wallTop + 48; y < floorHorizon - 20; y += compact ? 74 : 92) {
      wall.fillStyle(0x2a3b46, 0.8).fillRect(x + 3, y, pillarWidth - 6, 5);
    }
  }

  const ceiling = scene.add.graphics().setDepth(3);
  const trussHeight = compact ? 25 : 34;
  ceiling.fillStyle(0x0a131c, 0.98).fillRect(0, 0, width, wallTop);
  ceiling.lineStyle(compact ? 4 : 6, 0x172b37, 0.9).lineBetween(0, wallTop - 8, width, wallTop - 8);
  ceiling.lineStyle(1, 0x315464, 0.45);
  const trussStep = compact ? 110 : 155;
  for (let x = 0; x < width + trussStep; x += trussStep) {
    ceiling.lineBetween(x, wallTop - 9, x + trussStep / 2, wallTop - trussHeight);
    ceiling.lineBetween(x + trussStep / 2, wallTop - trussHeight, x + trussStep, wallTop - 9);
  }
  ceiling.lineStyle(2, CYAN, 0.18).lineBetween(0, wallTop - trussHeight, width, wallTop - trussHeight);

  const conduit = scene.add.graphics().setDepth(4);
  const leftTerminal = layout.configTerminal;
  const rightTerminal = layout.walletTerminal;
  conduit.lineStyle(compact ? 3 : 5, 0x111f2a, 1);
  conduit.beginPath();
  conduit.moveTo(pillarLeft + pillarWidth, wallTop + 31);
  conduit.lineTo(leftTerminal.x + 18, wallTop + 31);
  conduit.lineTo(leftTerminal.x + 18, leftTerminal.y - 11);
  conduit.strokePath();
  conduit.beginPath();
  conduit.moveTo(pillarRight, wallTop + 43);
  conduit.lineTo(rightTerminal.x + rightTerminal.width - 18, wallTop + 43);
  conduit.lineTo(rightTerminal.x + rightTerminal.width - 18, rightTerminal.y - 11);
  conduit.strokePath();
  conduit.lineStyle(1, MAGENTA, 0.38);
  conduit.lineBetween(pillarLeft + pillarWidth, wallTop + 31, leftTerminal.x + 18, wallTop + 31);
  conduit.lineBetween(leftTerminal.x + 18, wallTop + 31, leftTerminal.x + 18, leftTerminal.y - 11);
  conduit.lineStyle(1, CYAN, 0.38);
  conduit.lineBetween(pillarRight, wallTop + 43, rightTerminal.x + rightTerminal.width - 18, wallTop + 43);
  conduit.lineBetween(rightTerminal.x + rightTerminal.width - 18, wallTop + 43, rightTerminal.x + rightTerminal.width - 18, rightTerminal.y - 11);

  const floor = scene.add.graphics().setDepth(4);
  floor.fillStyle(0x07111a, 1).fillRect(0, floorHorizon, width, height - floorHorizon);
  floor.fillStyle(0x0a1822, 0.92).fillTriangle(0, height, width / 2, floorHorizon, width, height);
  floor.lineStyle(2, 0x194553, 0.52);
  const vanishingX = width / 2;
  for (let x = -width; x <= width * 2; x += Math.max(64, width / 14)) floor.lineBetween(x, height, vanishingX, floorHorizon);
  for (let y = floorHorizon + 18; y < height; y += Math.max(25, height * 0.045)) floor.lineBetween(0, y, width, y);
  floor.lineStyle(2, CYAN, 0.23).lineBetween(0, floorHorizon, width, floorHorizon);
  floor.lineStyle(2, MAGENTA, 0.13);
  floor.lineBetween(width * 0.18, height, width * 0.46, floorHorizon);
  floor.lineStyle(2, CYAN, 0.13);
  floor.lineBetween(width * 0.82, height, width * 0.54, floorHorizon);

  const lightWidth = Math.min(compact ? 260 : 470, width * 0.42);
  const ceilingGlow = scene.add.rectangle(width / 2, wallTop + 4, lightWidth, compact ? 3 : 5, CYAN, 0.62).setDepth(5);
  addAmbientPulse(scene, ceilingGlow, 2700, 0.3, 0.82);

  if (!compact) {
    const fan = scene.add.container(width * 0.86, wallTop + 54).setDepth(5);
    fan.add(scene.add.circle(0, 0, 27, 0x06111a, 0.92).setStrokeStyle(2, 0x2d7582, 0.46));
    fan.add(scene.add.circle(0, 0, 5, 0x1d4d59, 0.76));
    const blades = scene.add.graphics();
    blades.fillStyle(0x3b7380, 0.32);
    for (let index = 0; index < 4; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 90);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const rotateX = (x: number, y: number): number => x * cosine - y * sine;
      const rotateY = (x: number, y: number): number => x * sine + y * cosine;
      blades.fillTriangle(
        rotateX(-4, -4), rotateY(-4, -4),
        rotateX(5, -23), rotateY(5, -23),
        rotateX(8, -5), rotateY(8, -5)
      );
    }
    fan.add(blades);
    scene.tweens.add({ targets: blades, angle: 360, duration: 5600, repeat: -1, ease: 'Linear' });
  }

  const statusRailY = floorHorizon - (compact ? 12 : 17);
  for (let index = 0; index < 7; index += 1) {
    const color = index % 3 === 1 ? MAGENTA : CYAN;
    const light = scene.add.rectangle(width / 2 + (index - 3) * (compact ? 23 : 34), statusRailY, compact ? 10 : 16, 3, color, 0.5).setDepth(5);
    addAmbientPulse(scene, light, 900 + index * 170, 0.12, 0.72);
  }

  const scan = scene.add.rectangle(width / 2, wallTop + 20, width, 2, CYAN, 0.045).setDepth(6);
  scene.tweens.add({ targets: scan, y: floorHorizon - 8, duration: 5200, repeat: -1, ease: 'Linear' });
};

export const createModWorkbench = (
  scene: Phaser.Scene,
  cardWidth: number,
  cardHeight: number,
  centers: Array<{ x: number; y: number }>,
  compact: boolean,
  actionButtonHeight = 40,
  actionButtonGap = 11
): void => {
  if (!centers.length) return;
  const first = centers[0];
  const last = centers[centers.length - 1];
  const left = first.x - cardWidth / 2 - (compact ? 13 : 23);
  const right = last.x + cardWidth / 2 + (compact ? 13 : 23);
  const top = first.y - cardHeight / 2 - (compact ? 31 : Math.max(43, cardWidth * 0.22));
  const actionY = first.y + cardHeight / 2 + actionButtonGap + actionButtonHeight / 2;
  const bottom = actionY + actionButtonHeight / 2 + (compact ? 5 : 9);
  const width = right - left;
  const height = bottom - top;

  const shadow = scene.add.rectangle(left + width / 2 + 8, top + height / 2 + 10, width + 22, height + 18, 0x000000, 0.48)
    .setStrokeStyle(1, 0x000000, 0.65)
    .setDepth(16);
  shadow.setName('garage-workbench-shadow');

  const rack = scene.add.graphics().setDepth(17);
  rack.fillStyle(0x08131c, 0.94).fillRoundedRect(left, top, width, height, compact ? 5 : 8);
  rack.fillStyle(0x111f2b, 0.96).fillRect(left + 6, top + 7, width - 12, compact ? 16 : 22);
  rack.fillStyle(0x122531, 0.95).fillRect(left - 8, bottom - (compact ? 18 : 23), width + 16, compact ? 24 : 31);
  rack.lineStyle(2, 0x2a5361, 0.62).strokeRoundedRect(left, top, width, height, compact ? 5 : 8);
  rack.lineStyle(2, CYAN, 0.28).lineBetween(left + 12, top + (compact ? 22 : 29), right - 12, top + (compact ? 22 : 29));
  rack.lineStyle(2, MAGENTA, 0.2).lineBetween(left + 14, bottom - (compact ? 18 : 23), right - 14, bottom - (compact ? 18 : 23));

  centers.forEach((center, index) => {
    const cradleLeft = center.x - cardWidth / 2 - 6;
    const cradleRight = center.x + cardWidth / 2 + 6;
    const cradleTop = center.y - cardHeight / 2 - 5;
    const cradleBottom = center.y + cardHeight / 2 + 6;
    rack.fillStyle(0x02070c, 0.72).fillRect(cradleLeft, cradleTop, cardWidth + 12, cardHeight + 11);
    rack.fillStyle(index % 2 ? MAGENTA : CYAN, 0.11).fillRect(cradleLeft, cradleTop, 4, cardHeight + 11);
    rack.fillStyle(index % 2 ? MAGENTA : CYAN, 0.11).fillRect(cradleRight - 4, cradleTop, 4, cardHeight + 11);
    rack.lineStyle(1, 0x376675, 0.44).lineBetween(cradleLeft, cradleBottom, cradleRight, cradleBottom);
    for (let connector = -1; connector <= 1; connector += 1) {
      rack.fillStyle(connector === 0 ? 0x73f7ff : 0x315463, connector === 0 ? 0.55 : 0.75)
        .fillRect(center.x + connector * 8 - 2, cradleBottom + 3, 4, compact ? 4 : 6);
    }
  });

  const labelY = top + 11;
  if (!compact) {
    scene.add.text(left + width / 2, labelY, 'MODULAR LOADOUT ARRAY // 05 CHANNEL BUS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(cardWidth * 0.065, 11, 15)}px`, color: '#9af3fb', letterSpacing: 1
    }).setOrigin(0.5).setDepth(19);
  }

  const busLight = scene.add.rectangle(left + 20, bottom - (compact ? 8 : 10), compact ? 18 : 28, 2, CYAN, 0.7).setDepth(20);
  scene.tweens.add({
    targets: busLight,
    x: { from: left + 20, to: right - 20 },
    alpha: { from: 0.25, to: 0.85 },
    duration: compact ? 4200 : 5200,
    repeat: -1,
    yoyo: true,
    ease: 'Sine.easeInOut'
  });
};

export const createStationHousing = (
  scene: Phaser.Scene,
  center: { x: number; y: number },
  width: number,
  index: number,
  buttonHeight = 40
): Phaser.GameObjects.Container => {
  const root = scene.add.container(center.x, center.y).setDepth(76);
  const accent = index % 2 ? MAGENTA : CYAN;
  const housingHeight = buttonHeight + 14;
  const housingTop = -housingHeight / 2;
  const housing = scene.add.graphics();
  housing.fillStyle(0x03080e, 0.86).fillRoundedRect(-width / 2 - 7, housingTop, width + 14, housingHeight, 4);
  housing.fillStyle(0x14232e, 0.98).fillRect(-width / 2 - 4, housingTop + 2, width + 8, 5);
  housing.lineStyle(1, 0x355b69, 0.72).strokeRoundedRect(-width / 2 - 7, housingTop, width + 14, housingHeight, 4);
  housing.lineStyle(2, accent, 0.36).lineBetween(-width / 2 + 8, housingTop + 1, width / 2 - 8, housingTop + 1);
  housing.fillStyle(0x263b46, 0.84)
    .fillCircle(-width / 2 + 4, housingHeight / 2 - 8, 2)
    .fillCircle(width / 2 - 4, housingHeight / 2 - 8, 2);
  root.add(housing);
  if (scene.scale.height >= 560) {
    root.add(scene.add.text(-width / 2 + 8, housingTop - 2, `STATION 0${index + 1}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${Phaser.Math.Clamp(buttonHeight * 0.19, 8, 12)}px`, fontStyle: 'bold', color: index % 2 ? '#e28dcc' : '#83d7e2'
    }).setOrigin(0, 1));
  }
  return root;
};

export const addTerminalMount = (
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  rect: GarageRect,
  color: number
): void => {
  const leftMounted = rect.x + rect.width / 2 < scene.scale.width / 2;
  const casing = scene.add.graphics();
  casing.fillStyle(0x000000, 0.44).fillRoundedRect(6, 7, rect.width + 8, rect.height + 8, 5);
  casing.fillStyle(0x101d28, 1).fillRoundedRect(-8, -8, rect.width + 16, rect.height + 16, 5);
  casing.fillStyle(0x1b2b35, 0.9).fillRect(-12, 12, 6, rect.height - 24);
  casing.fillStyle(0x1b2b35, 0.9).fillRect(rect.width + 6, 12, 6, rect.height - 24);
  casing.lineStyle(2, 0x315563, 0.72).strokeRoundedRect(-8, -8, rect.width + 16, rect.height + 16, 5);
  casing.lineStyle(2, color, 0.28).lineBetween(4, -5, rect.width - 4, -5);

  const armX = leftMounted ? -22 : rect.width + 22;
  const edgeX = leftMounted ? -8 : rect.width + 8;
  casing.lineStyle(7, 0x14232d, 1);
  casing.lineBetween(edgeX, rect.height * 0.28, armX, rect.height * 0.38);
  casing.lineBetween(armX, rect.height * 0.38, armX, rect.height * 0.77);
  casing.lineBetween(armX, rect.height * 0.77, edgeX, rect.height * 0.84);
  casing.lineStyle(1, color, 0.22);
  casing.lineBetween(edgeX, rect.height * 0.28, armX, rect.height * 0.38);
  casing.lineBetween(armX, rect.height * 0.38, armX, rect.height * 0.77);
  casing.lineBetween(armX, rect.height * 0.77, edgeX, rect.height * 0.84);
  casing.fillStyle(0x435861, 0.9);
  casing.fillCircle(-3, -3, 2).fillCircle(rect.width + 3, -3, 2);
  casing.fillCircle(-3, rect.height + 3, 2).fillCircle(rect.width + 3, rect.height + 3, 2);
  root.addAt(casing, 0);
};
