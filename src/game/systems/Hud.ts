import Phaser from 'phaser';
import { calculateHudLayout, formatHudCountdown, type HudRect, type HudScreenLayout } from './hudLayout.ts';
import { DEFAULT_HUD_SETTINGS, glowMultiplier, normalizeHudSettings, type HudSettings } from '../config/interfaceSettings.ts';

export interface HudAbilitySlot {
  id: 'fence' | 'turret' | 'mine' | 'shield';
  keybind: string;
  /** Retained for payload compatibility; the HUD renders a procedural equipment icon. */
  icon: string;
  label: string;
  cooldownMs: number;
  cooldownDurationMs: number;
  active?: boolean;
  selected: boolean;
  hasEnergy: boolean;
  underLimit: boolean;
  count: number;
  capacity: number | null;
}

export type HudRadarContactKind = 'enemy' | 'objective' | 'boss';
export type HudRadarContactState = 'normal' | 'available' | 'locked' | 'active' | 'defusing';

export interface HudRadarContact {
  kind: HudRadarContactKind;
  dx: number;
  dy: number;
  state: HudRadarContactState;
}

export interface HudPayload {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  level: number;
  enemies: number;
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
  phase: string;
  objective: string;
  objectiveTimerMs: number | null;
  defuseAlert: boolean;
  bombUrgent: boolean;
  bombActive: boolean;
  bombProgress: number;
  buffs: string[];
  abilities: HudAbilitySlot[];
  radarRange: number;
  radarContacts: HudRadarContact[];
}

export type HudResourceKind = 'credits' | 'coreTokens' | 'plasmaChips' | 'fluxCores';

interface CyberPanelVisual {
  frame: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  led: Phaser.GameObjects.Arc;
  rect: HudRect;
  accent: number;
}

interface ResourceVisual {
  root: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Graphics;
  creditGlyph: Phaser.GameObjects.Text | null;
  value: Phaser.GameObjects.Text;
  color: number;
  lastValue?: number;
}

interface AbilitySlotVisual {
  root: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Graphics;
  keyChip: Phaser.GameObjects.Rectangle;
  keyText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
  countText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  overlay: Phaser.GameObjects.Rectangle;
  cooldownRing: Phaser.GameObjects.Graphics;
  segments: Phaser.GameObjects.Graphics;
  lastKeybind?: string;
  lastStatus?: string;
  lastReady?: boolean;
  lastCoolingDown?: boolean;
  lastActive?: boolean;
  lastSelected?: boolean;
  lastHasEnergy?: boolean;
  lastUnderLimit?: boolean;
  lastCount?: number;
  lastCapacity?: number | null;
}

interface BuffVisual {
  root: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Rectangle;
  pip: Phaser.GameObjects.Arc;
  text: Phaser.GameObjects.Text;
}

const COOLDOWN_READY_EPSILON_MS = 140;
const HUD_DEPTH = 1000;
const PANEL_FILL = 0x06111b;
const PANEL_GLASS = 0x0a1d29;
const CYAN = 0x56edff;
const MAGENTA = 0xff61cf;
const GREEN = 0x72ffac;
const GOLD = 0xffd768;
const WARNING = 0xff5f79;
const BASE_ABILITY_WIDTH = 100;
const BASE_ABILITY_HEIGHT = 82;

const RESOURCE_COLORS: Record<HudResourceKind, number> = {
  credits: 0xffed67,
  coreTokens: 0xffc86b,
  plasmaChips: 0xc877ff,
  fluxCores: 0x69ff9c
};

const PHASE_COLOR_MAP: Record<string, { fill: number; border: number; text: string }> = {
  'PRE-PLANT': { fill: 0x103243, border: 0x5de7ff, text: '#8ef2ff' },
  PLANTING: { fill: 0x43330e, border: 0xf1ca5a, text: '#ffe591' },
  DEFEND: { fill: 0x3b193d, border: 0xff79df, text: '#ffd0f7' },
  'DEFUSE ALERT': { fill: 0x4a141f, border: 0xff5b70, text: '#ffd6dc' },
  'ROUND COMPLETE': { fill: 0x133f33, border: 0x7cffa4, text: '#ceffe0' },
  'MISSION FAILURE': { fill: 0x4a1016, border: 0xff596e, text: '#ffd8de' },
  'BOSS FIGHT': { fill: 0x43330e, border: 0xffca63, text: '#ffe3a1' },
  PAUSED: { fill: 0x2a2f39, border: 0xa8c7db, text: '#e9f7ff' }
};

export function drawHudResourceIcon(graphics: Phaser.GameObjects.Graphics, kind: HudResourceKind, color: number): void {
  graphics.clear().fillStyle(color, 0.07).fillCircle(0, 0, 11).lineStyle(1, color, 0.72).strokeCircle(0, 0, 9);
  if (kind === 'credits') return;
  if (kind === 'coreTokens') {
    graphics.fillStyle(color, 0.84);
    graphics.beginPath().moveTo(0, -6).lineTo(6, -3).lineTo(6, 3).lineTo(0, 6).lineTo(-6, 3).lineTo(-6, -3).closePath().fillPath();
    graphics.fillStyle(0xf8ffff, 0.95).fillCircle(0, 0, 2);
    return;
  }
  if (kind === 'plasmaChips') {
    graphics.fillStyle(color, 0.9).beginPath().moveTo(0, -6).lineTo(6, 0).lineTo(0, 6).lineTo(-6, 0).closePath().fillPath();
    graphics.fillStyle(0xffffff, 0.9).fillCircle(0, 0, 1.7);
    return;
  }
  graphics.fillStyle(color, 0.3).fillCircle(0, 0, 6).lineStyle(1.5, 0xd8ffe4, 0.82).strokeCircle(0, 0, 6);
  graphics.fillStyle(0xd9ffe5, 0.96).fillCircle(0, 0, 2.5);
  graphics.lineStyle(1, color, 0.9).lineBetween(-7, 0, 7, 0).lineBetween(0, -7, 0, 7);
}

export function drawHudAbilityIcon(graphics: Phaser.GameObjects.Graphics, id: HudAbilitySlot['id']): void {
  graphics.clear().lineStyle(2, 0x8af7ff, 0.92).fillStyle(0x62eaff, 0.18);
  if (id === 'fence') {
    graphics.fillStyle(0x64edff, 0.78).fillRect(-13, -10, 3, 21).fillRect(10, -10, 3, 21);
    graphics.lineStyle(1.5, 0x88faff, 0.95).lineBetween(-9, -6, 9, -6).lineBetween(-9, 0, 9, 0).lineBetween(-9, 6, 9, 6);
    graphics.lineStyle(1, MAGENTA, 0.58).lineBetween(-8, -8, 8, 8).lineBetween(-8, 8, 8, -8);
  } else if (id === 'turret') {
    graphics.fillStyle(0x64edff, 0.28).fillRect(-10, -4, 18, 13).fillRect(-13, 9, 26, 4);
    graphics.lineStyle(2, 0x8af7ff, 0.95).strokeRect(-10, -4, 18, 13).lineBetween(-2, -5, 11, -12).lineBetween(10, -12, 15, -12);
    graphics.fillStyle(MAGENTA, 0.9).fillCircle(-3, 2, 2.5);
  } else if (id === 'mine') {
    graphics.fillStyle(0xff8859, 0.24).fillCircle(0, 0, 9).lineStyle(2, 0xffaa72, 0.95).strokeCircle(0, 0, 9);
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      graphics.lineBetween(Math.cos(angle) * 10, Math.sin(angle) * 10, Math.cos(angle) * 15, Math.sin(angle) * 15);
    }
    graphics.fillStyle(0xff596d, 1).fillCircle(0, 0, 3);
  } else {
    graphics.fillStyle(0x62eaff, 0.12);
    graphics.beginPath().moveTo(0, -14).lineTo(12, -7).lineTo(12, 6).lineTo(0, 14).lineTo(-12, 6).lineTo(-12, -7).closePath().fillPath();
    graphics.lineStyle(2, 0x8af7ff, 0.95);
    graphics.beginPath().moveTo(0, -14).lineTo(12, -7).lineTo(12, 6).lineTo(0, 14).lineTo(-12, 6).lineTo(-12, -7).closePath().strokePath();
    graphics.lineStyle(1, MAGENTA, 0.7).strokeCircle(0, 0, 6);
  }
}

/**
 * Single live gameplay HUD. All game state continues to arrive through the
 * existing HudPayload; this class owns presentation, responsive layout and
 * cleanup only.
 */
export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly vitalsPanel: CyberPanelVisual;
  private readonly objectivePanel: CyberPanelVisual;
  private readonly statsPanel: CyberPanelVisual;
  private readonly abilitiesPanel: CyberPanelVisual;

  private readonly hpIcon: Phaser.GameObjects.Graphics;
  private readonly hpGlow: Phaser.GameObjects.Arc;
  private readonly healthLabel: Phaser.GameObjects.Text;
  private readonly healthTrack: Phaser.GameObjects.Rectangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private readonly healthReadyShine: Phaser.GameObjects.Rectangle;
  private readonly healthValue: Phaser.GameObjects.Text;
  private readonly energyIcon: Phaser.GameObjects.Graphics;
  private readonly energyGlow: Phaser.GameObjects.Arc;
  private readonly energyLabel: Phaser.GameObjects.Text;
  private readonly energyTrack: Phaser.GameObjects.Rectangle;
  private readonly energyFill: Phaser.GameObjects.Rectangle;
  private readonly energyValue: Phaser.GameObjects.Text;

  private readonly roundLabel: Phaser.GameObjects.Text;
  private readonly roundValue: Phaser.GameObjects.Text;
  private readonly enemyLabel: Phaser.GameObjects.Text;
  private readonly enemyValue: Phaser.GameObjects.Text;
  private readonly resourceVisuals = new Map<HudResourceKind, ResourceVisual>();

  private readonly phaseBadge: Phaser.GameObjects.Rectangle;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly objectiveText: Phaser.GameObjects.Text;
  private readonly objectiveTimerText: Phaser.GameObjects.Text;
  private readonly bombProgressTrack: Phaser.GameObjects.Rectangle;
  private readonly bombProgressFill: Phaser.GameObjects.Rectangle;

  private readonly abilitySlots = new Map<HudAbilitySlot['id'], AbilitySlotVisual>();
  private readonly buffVisuals: BuffVisual[] = [];
  private readonly radarFrame: Phaser.GameObjects.Graphics;
  private readonly radarContacts: Phaser.GameObjects.Graphics;
  private readonly radarLabel: Phaser.GameObjects.Text;

  private currentLayout!: HudScreenLayout;
  private displayedHealthRatio = 1;
  private displayedEnergyRatio = 1;
  private previousHealth: number | null = null;
  private previousEnergy: number | null = null;
  private healthEmphasisUntil = 0;
  private energyEmphasisUntil = 0;
  private lowHealthPulse: Phaser.Tweens.Tween | null = null;
  private defusePulse: Phaser.Tweens.Tween | null = null;
  private readonly lastAbilityReady = new Map<HudAbilitySlot['id'], boolean>();
  private radarDiameter = 132;
  private scaleFactor = 1;
  private objectiveAccent = CYAN;
  private settings: HudSettings = { ...DEFAULT_HUD_SETTINGS };

  constructor(scene: Phaser.Scene, settings: HudSettings = DEFAULT_HUD_SETTINGS) {
    this.scene = scene;
    this.settings = normalizeHudSettings(settings);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(HUD_DEPTH);

    this.vitalsPanel = this.createCyberPanel('OPERATIVE // VITALS', CYAN);
    this.objectivePanel = this.createCyberPanel('TACTICAL OBJECTIVE', CYAN);
    this.statsPanel = this.createCyberPanel('RUN CACHE // TELEMETRY', MAGENTA);
    this.abilitiesPanel = this.createCyberPanel('COMBAT COMMAND DECK', CYAN);

    this.hpGlow = scene.add.circle(0, 0, 13, 0xff5578, 0.12).setBlendMode(Phaser.BlendModes.ADD);
    this.hpIcon = scene.add.graphics();
    this.drawHealthIcon(this.hpIcon);
    this.healthLabel = this.createText('HP', 10, '#ff93a8').setOrigin(0, 0.5);
    this.healthTrack = scene.add.rectangle(0, 0, 200, 13, 0x260914, 0.92)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0x9e334a, 0.74);
    this.healthFill = scene.add.rectangle(0, 0, 200, 7, 0xff5578, 1).setOrigin(0, 0.5);
    this.healthReadyShine = scene.add.rectangle(0, 0, 28, 7, 0xffffff, 0.12).setOrigin(0, 0.5);
    this.healthValue = this.createText('', 14, '#ffd9e2', 'Rajdhani, sans-serif').setOrigin(1, 0.5).setFontStyle('bold');

    this.energyGlow = scene.add.circle(0, 0, 13, 0x42f2ff, 0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.energyIcon = scene.add.graphics();
    this.drawEnergyIcon(this.energyIcon);
    this.energyLabel = this.createText('EN', 10, '#75eaff').setOrigin(0, 0.5);
    this.energyTrack = scene.add.rectangle(0, 0, 200, 13, 0x071e2f, 0.92)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0x267da0, 0.74);
    this.energyFill = scene.add.rectangle(0, 0, 200, 7, 0x42f2ff, 1).setOrigin(0, 0.5);
    this.energyValue = this.createText('', 14, '#d5fbff', 'Rajdhani, sans-serif').setOrigin(1, 0.5).setFontStyle('bold');

    this.roundLabel = this.createText('ROUND', 10, '#7fc6d8', 'Rajdhani, sans-serif').setOrigin(0, 0.5).setFontStyle('bold');
    this.roundValue = this.createText('1', 17, '#baf7ff').setOrigin(0, 0.5).setFontStyle('bold');
    this.enemyLabel = this.createText('HOSTILES', 10, '#d495c8', 'Rajdhani, sans-serif').setOrigin(0, 0.5).setFontStyle('bold');
    this.enemyValue = this.createText('0', 17, '#ffe19a').setOrigin(0, 0.5).setFontStyle('bold');

    for (const kind of ['credits', 'coreTokens', 'plasmaChips', 'fluxCores'] as const) {
      this.resourceVisuals.set(kind, this.createResourceVisual(kind));
    }

    this.phaseBadge = scene.add.rectangle(0, 0, 142, 22, 0x103243, 0.5)
      .setOrigin(0.5).setStrokeStyle(1, 0x5de7ff, 0.78);
    this.phaseText = this.createText('PRE-PLANT', 11, '#8ef2ff').setOrigin(0.5).setFontStyle('bold');
    this.objectiveText = this.createText('SITE A AVAILABLE', 15, '#def6ff').setOrigin(0.5).setFontStyle('bold');
    this.objectiveTimerText = this.createText('', 23, '#9ffaff').setOrigin(0.5).setVisible(false).setFontStyle('bold');
    this.bombProgressTrack = scene.add.rectangle(0, 0, 120, 6, 0x10201d, 0.88)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0x5b9d87, 0.58).setVisible(false);
    this.bombProgressFill = scene.add.rectangle(0, 0, 120, 3, 0x53ff8a, 1)
      .setOrigin(0, 0.5).setVisible(false);

    this.radarFrame = scene.add.graphics();
    this.radarContacts = scene.add.graphics();
    this.radarLabel = this.createText('TACTICAL RADAR', 10, '#78c7d6', 'Rajdhani, sans-serif')
      .setOrigin(0.5, 1).setFontStyle('bold');

    for (const slot of ['fence', 'turret', 'mine', 'shield'] as const) this.createAbilitySlot(slot);
    for (let index = 0; index < 3; index += 1) this.buffVisuals.push(this.createBuffVisual());

    this.root.add([
      this.vitalsPanel.frame, this.objectivePanel.frame, this.statsPanel.frame, this.abilitiesPanel.frame,
      this.vitalsPanel.title, this.vitalsPanel.led, this.objectivePanel.title, this.objectivePanel.led,
      this.statsPanel.title, this.statsPanel.led, this.abilitiesPanel.title, this.abilitiesPanel.led,
      this.hpGlow, this.hpIcon, this.healthLabel, this.healthTrack, this.healthFill, this.healthReadyShine, this.healthValue,
      this.energyGlow, this.energyIcon, this.energyLabel, this.energyTrack, this.energyFill, this.energyValue,
      this.roundLabel, this.roundValue, this.enemyLabel, this.enemyValue,
      ...Array.from(this.resourceVisuals.values()).map((resource) => resource.root),
      this.phaseBadge, this.phaseText, this.objectiveText, this.objectiveTimerText,
      this.bombProgressTrack, this.bombProgressFill,
      this.radarFrame, this.radarContacts, this.radarLabel,
      ...Array.from(this.abilitySlots.values()).map((slot) => slot.root),
      ...this.buffVisuals.map((buff) => buff.root)
    ]);

    this.applySettings(this.settings);
    this.scene.scale.on('resize', this.onResize, this);
  }

  private createText(text: string, size: number, color: string, family = 'Orbitron, sans-serif'): Phaser.GameObjects.Text {
    return this.scene.add.text(0, 0, text, { fontFamily: family, fontSize: `${size}px`, color });
  }

  private createCyberPanel(title: string, accent: number): CyberPanelVisual {
    return {
      frame: this.scene.add.graphics(),
      title: this.createText(title, 10, Phaser.Display.Color.IntegerToColor(accent).rgba, 'Rajdhani, sans-serif')
        .setFontStyle('bold').setOrigin(0, 0),
      led: this.scene.add.circle(0, 0, 2.5, accent, 0.95),
      rect: { x: 0, y: 0, width: 1, height: 1 },
      accent
    };
  }

  private drawCyberPanel(panel: CyberPanelVisual, rect: HudRect, accent = panel.accent, fillAlpha = 0.78): void {
    panel.rect = rect;
    panel.accent = accent;
    const cut = Math.max(5, Math.min(11, rect.height * 0.13));
    const width = rect.width;
    const height = rect.height;
    const frame = panel.frame;
    const glow = glowMultiplier(this.settings.glow);
    frame.clear().setPosition(rect.x, rect.y);
    frame.fillStyle(0x000000, 0.26);
    frame.beginPath().moveTo(cut + 4, 5).lineTo(width, 5).lineTo(width, height - cut + 4)
      .lineTo(width - cut, height + 4).lineTo(4, height + 4).lineTo(4, cut + 4).closePath().fillPath();
    frame.fillStyle(PANEL_FILL, fillAlpha * this.settings.panelOpacity);
    frame.beginPath().moveTo(cut, 0).lineTo(width - cut, 0).lineTo(width, cut)
      .lineTo(width, height - cut).lineTo(width - cut, height).lineTo(cut, height).lineTo(0, height - cut).lineTo(0, cut)
      .closePath().fillPath();
    frame.lineStyle(1, accent, 0.68);
    frame.beginPath().moveTo(cut, 0).lineTo(width - cut, 0).lineTo(width, cut)
      .lineTo(width, height - cut).lineTo(width - cut, height).lineTo(cut, height).lineTo(0, height - cut).lineTo(0, cut)
      .closePath().strokePath();
    frame.fillStyle(PANEL_GLASS, 0.48 * this.settings.backgroundOpacity).fillRect(7, 17, Math.max(1, width - 14), Math.max(1, height - 24));
    frame.fillStyle(accent, 0.24 + glow * 0.44).fillRect(cut + 4, 4, Math.max(8, width - cut * 2 - 8), 2);
    frame.fillStyle(MAGENTA, 0.2 + glow * 0.3).fillRect(3, cut + 5, 2, Math.max(5, height - cut * 2 - 10));
    frame.lineStyle(1, accent, 0.22).lineBetween(9, 17, width - 9, 17);
    panel.title.setPosition(rect.x + 11, rect.y + 5)
      .setFontSize(Math.max(8, Math.round(10 * this.scaleFactor)))
      .setColor(Phaser.Display.Color.IntegerToColor(accent).rgba);
    panel.led.setPosition(rect.x + rect.width - 11, rect.y + 10).setFillStyle(accent, 0.95);
  }

  private drawHealthIcon(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear().fillStyle(0xff7f98, 1).fillRect(-3, -10, 6, 20).fillRect(-10, -3, 20, 6);
    graphics.lineStyle(1, 0xffd5df, 0.86).strokeRect(-3, -10, 6, 20).strokeRect(-10, -3, 20, 6);
  }

  private drawEnergyIcon(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear().fillStyle(0x6cf6ff, 1);
    graphics.beginPath().moveTo(-2, -11).lineTo(7, -11).lineTo(1, -2).lineTo(8, -2)
      .lineTo(-5, 12).lineTo(-1, 3).lineTo(-8, 3).closePath().fillPath();
    graphics.lineStyle(1, 0xe8fdff, 0.82);
    graphics.beginPath().moveTo(-2, -11).lineTo(7, -11).lineTo(1, -2).lineTo(8, -2)
      .lineTo(-5, 12).lineTo(-1, 3).lineTo(-8, 3).closePath().strokePath();
  }

  private createResourceVisual(kind: HudResourceKind): ResourceVisual {
    const color = RESOURCE_COLORS[kind];
    const root = this.scene.add.container(0, 0);
    const icon = this.scene.add.graphics();
    drawHudResourceIcon(icon, kind, color);
    const creditGlyph = kind === 'credits'
      ? this.createText('\u00a2', 16, '#fff5a4').setOrigin(0.5).setFontStyle('bold').setPosition(0, -1)
      : null;
    const value = this.createText('0', 12, Phaser.Display.Color.IntegerToColor(color).rgba, 'Rajdhani, sans-serif')
      .setOrigin(0, 0.5).setFontStyle('bold');
    root.add([icon, ...(creditGlyph ? [creditGlyph] : []), value]);
    return { root, icon, creditGlyph, value, color };
  }

  private createAbilitySlot(id: HudAbilitySlot['id']): void {
    const root = this.scene.add.container(0, 0);
    const frame = this.scene.add.graphics();
    const overlay = this.scene.add.rectangle(0, 0, BASE_ABILITY_WIDTH, BASE_ABILITY_HEIGHT, 0x02050a, 0)
      .setOrigin(0, 0);
    const icon = this.scene.add.graphics().setPosition(BASE_ABILITY_WIDTH / 2, 35);
    drawHudAbilityIcon(icon, id);
    const keyChip = this.scene.add.rectangle(8, 8, 25, 16, 0x0b2735, 0.94).setOrigin(0, 0).setStrokeStyle(1, CYAN, 0.52);
    const keyText = this.createText('', 9, '#d8faff').setOrigin(0.5).setPosition(20.5, 16).setFontStyle('bold');
    const countText = this.createText('', 10, '#a7e7f2', 'Rajdhani, sans-serif').setOrigin(1, 0.5).setPosition(92, 16).setFontStyle('bold');
    const labelText = this.createText(id.toUpperCase(), 9, '#a7dfeb', 'Rajdhani, sans-serif')
      .setOrigin(0.5).setPosition(50, 66).setFontStyle('bold');
    const statusText = this.createText('', 13, '#d8ebff').setOrigin(0.5).setPosition(50, 36).setVisible(false).setFontStyle('bold');
    const cooldownRing = this.scene.add.graphics();
    const segments = this.scene.add.graphics();
    root.add([frame, overlay, icon, keyChip, keyText, countText, statusText, cooldownRing, labelText, segments]);
    this.drawAbilityModuleFrame(frame, CYAN, false, false);
    this.abilitySlots.set(id, { root, frame, icon, keyChip, keyText, labelText, countText, statusText, overlay, cooldownRing, segments });
    this.lastAbilityReady.set(id, false);
  }

  private drawAbilityModuleFrame(graphics: Phaser.GameObjects.Graphics, border: number, ready: boolean, selected: boolean): void {
    const cut = 7;
    graphics.clear().fillStyle(ready ? 0x0d2823 : 0x091722, ready ? 0.92 : 0.86);
    graphics.beginPath().moveTo(cut, 0).lineTo(BASE_ABILITY_WIDTH - cut, 0).lineTo(BASE_ABILITY_WIDTH, cut)
      .lineTo(BASE_ABILITY_WIDTH, BASE_ABILITY_HEIGHT - cut).lineTo(BASE_ABILITY_WIDTH - cut, BASE_ABILITY_HEIGHT)
      .lineTo(cut, BASE_ABILITY_HEIGHT).lineTo(0, BASE_ABILITY_HEIGHT - cut).lineTo(0, cut).closePath().fillPath();
    graphics.lineStyle(selected ? 2 : 1, border, selected ? 1 : 0.7);
    graphics.beginPath().moveTo(cut, 0).lineTo(BASE_ABILITY_WIDTH - cut, 0).lineTo(BASE_ABILITY_WIDTH, cut)
      .lineTo(BASE_ABILITY_WIDTH, BASE_ABILITY_HEIGHT - cut).lineTo(BASE_ABILITY_WIDTH - cut, BASE_ABILITY_HEIGHT)
      .lineTo(cut, BASE_ABILITY_HEIGHT).lineTo(0, BASE_ABILITY_HEIGHT - cut).lineTo(0, cut).closePath().strokePath();
    const decorativeAlpha = 0.2 + glowMultiplier(this.settings.glow) * 0.32;
    graphics.fillStyle(selected ? MAGENTA : border, selected ? 0.95 : decorativeAlpha).fillRect(12, 3, 76, selected ? 3 : 2);
    if (selected) {
      graphics.lineStyle(2, MAGENTA, 0.8).lineBetween(3, 18, 3, BASE_ABILITY_HEIGHT - 18);
      graphics.fillStyle(MAGENTA, 0.9).fillTriangle(3, 34, 8, 39, 3, 44);
    }
  }

  private createBuffVisual(): BuffVisual {
    const root = this.scene.add.container(0, 0).setVisible(false);
    const frame = this.scene.add.rectangle(0, 0, 116, 21, 0x081722, 0.92).setOrigin(0, 0.5).setStrokeStyle(1, GREEN, 0.36);
    const pip = this.scene.add.circle(10, 0, 3, GREEN, 0.9);
    const text = this.createText('', 10, '#c9ffe0', 'Rajdhani, sans-serif').setOrigin(0, 0.5).setPosition(18, 0).setFontStyle('bold');
    root.add([frame, pip, text]);
    return { root, frame, pip, text };
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.layout(size.width, size.height);
  }

  applySettings(settings: HudSettings): void {
    this.settings = normalizeHudSettings(settings);
    const glow = glowMultiplier(this.settings.glow);
    this.hpGlow.setAlpha(0.12 * glow);
    this.energyGlow.setAlpha(0.1 * glow);
    if (this.settings.animation === 'off') {
      for (const visual of this.abilitySlots.values()) {
        this.scene.tweens.killTweensOf([visual.root, visual.cooldownRing]);
        visual.root.setAlpha(1);
        visual.cooldownRing.setAlpha(1);
      }
      for (const visual of this.resourceVisuals.values()) {
        this.scene.tweens.killTweensOf([visual.icon, visual.value]);
        visual.icon.setAlpha(1);
        visual.value.setAlpha(1);
      }
    }
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  private layout(width: number, height: number): void {
    const layout = calculateHudLayout(width, height, this.settings);
    this.currentLayout = layout;
    this.scaleFactor = layout.scale * this.settings.textScale;
    this.root.setPosition(0, 0);
    this.drawCyberPanel(this.vitalsPanel, layout.vitals, CYAN, 0.76);
    this.drawCyberPanel(this.objectivePanel, layout.objective, this.objectiveAccent, 0.8);
    this.drawCyberPanel(this.statsPanel, layout.stats, MAGENTA, 0.76);
    this.drawCyberPanel(this.abilitiesPanel, layout.abilities, CYAN, 0.78);

    this.layoutVitals(layout.vitals, layout.scale, this.scaleFactor);
    this.layoutStats(layout.stats, layout.scale, this.scaleFactor);
    this.layoutObjective(layout.objective, layout.scale, this.scaleFactor);
    this.layoutRadar(layout);
    this.layoutAbilities(layout);
  }

  private layoutVitals(rect: HudRect, scale: number, fontScale: number): void {
    const compact = rect.width < 230;
    const iconScale = Math.max(0.72, Math.min(1.08, scale));
    const iconX = rect.x + Math.round((compact ? 14 : 18) * scale);
    const barX = rect.x + Math.round((compact ? 29 : 38) * scale);
    const barRight = rect.x + rect.width - Math.round(9 * scale);
    const barWidth = Math.max(70, barRight - barX);
    const healthY = rect.y + rect.height * 0.4;
    const energyY = rect.y + rect.height * 0.76;
    const valueY = Math.round(12 * scale);
    const barHeight = Math.max(9, Math.round(13 * scale));
    const fillHeight = Math.max(5, Math.round(7 * scale));

    this.hpGlow.setPosition(iconX, healthY).setScale(iconScale);
    this.hpIcon.setPosition(iconX, healthY).setScale(iconScale);
    this.healthLabel.setPosition(barX, healthY - valueY).setFontSize(Math.max(8, Math.round(10 * fontScale)));
    this.healthTrack.setPosition(barX, healthY).setDisplaySize(barWidth, barHeight);
    this.healthFill.setPosition(barX, healthY).setDisplaySize(barWidth, fillHeight);
    this.healthReadyShine.setPosition(barX, healthY).setDisplaySize(Math.round(30 * scale), fillHeight);
    this.healthValue.setPosition(barRight, healthY - valueY).setFontSize(Math.max(11, Math.round(14 * fontScale)));

    this.energyGlow.setPosition(iconX, energyY).setScale(iconScale);
    this.energyIcon.setPosition(iconX, energyY).setScale(iconScale);
    this.energyLabel.setPosition(barX, energyY - valueY).setFontSize(Math.max(8, Math.round(10 * fontScale)));
    this.energyTrack.setPosition(barX, energyY).setDisplaySize(barWidth, barHeight);
    this.energyFill.setPosition(barX, energyY).setDisplaySize(barWidth, fillHeight);
    this.energyValue.setPosition(barRight, energyY - valueY).setFontSize(Math.max(11, Math.round(14 * fontScale)));
  }

  private layoutStats(rect: HudRect, scale: number, fontScale: number): void {
    const compact = rect.width < 275;
    const topY = rect.y + rect.height * 0.34;
    const left = rect.x + Math.round(12 * scale);
    const center = rect.x + rect.width * 0.54;
    this.roundLabel.setPosition(left, topY).setFontSize(Math.max(8, Math.round(10 * fontScale)));
    this.roundValue.setPosition(left + Math.round(45 * scale), topY).setFontSize(Math.max(13, Math.round(17 * fontScale)));
    this.enemyLabel.setPosition(center, topY).setFontSize(Math.max(8, Math.round(10 * fontScale)));
    this.enemyValue.setPosition(center + Math.round(54 * scale), topY).setFontSize(Math.max(13, Math.round(17 * fontScale)));

    const resources = ['credits', 'coreTokens', 'plasmaChips', 'fluxCores'] as const;
    const cellWidth = rect.width / resources.length;
    const resourceY = rect.y + rect.height * 0.72;
    resources.forEach((kind, index) => {
      const visual = this.resourceVisuals.get(kind);
      if (!visual) return;
      const cellX = rect.x + cellWidth * (index + 0.5);
      const iconScale = Math.max(0.66, Math.min(1, scale * (compact ? 0.72 : 0.9)));
      visual.root.setPosition(cellX - (compact ? 0 : Math.round(16 * scale)), resourceY).setScale(1);
      visual.icon.setScale(iconScale);
      visual.creditGlyph?.setScale(iconScale);
      visual.value.setFontSize(Math.max(8, Math.round((compact ? 10 : 13) * fontScale)));
      if (compact) {
        visual.value.setOrigin(0.5, 0).setPosition(0, 10);
      } else {
        visual.value.setOrigin(0, 0.5).setPosition(15, 0);
      }
    });
  }

  private layoutObjective(rect: HudRect, scale: number, fontScale: number): void {
    const centerX = rect.x + rect.width / 2;
    this.objectiveText.setPosition(centerX, rect.y + rect.height * 0.35)
      .setFontSize(Math.max(12, Math.round(15 * fontScale))).setWordWrapWidth(rect.width - 22, true);
    this.phaseBadge.setPosition(centerX, rect.y + rect.height * 0.63)
      .setDisplaySize(Math.min(rect.width - 34, Math.round(150 * scale)), Math.max(19, Math.round(22 * scale)));
    this.phaseText.setPosition(centerX, this.phaseBadge.y).setFontSize(Math.max(9, Math.round(11 * fontScale)));
    this.objectiveTimerText.setPosition(centerX, rect.y + rect.height * 0.76).setFontSize(Math.max(18, Math.round(23 * fontScale)));
    const barWidth = rect.width - Math.round(24 * scale);
    const barX = rect.x + Math.round(12 * scale);
    const barY = rect.y + rect.height - Math.round(7 * scale);
    this.bombProgressTrack.setPosition(barX, barY).setDisplaySize(barWidth, Math.max(4, Math.round(6 * scale)));
    this.bombProgressFill.setPosition(barX, barY).setDisplaySize(barWidth, Math.max(2, Math.round(3 * scale)));
  }

  private layoutRadar(layout: HudScreenLayout): void {
    this.radarDiameter = layout.radar.diameter;
    this.radarFrame.setPosition(layout.radar.centerX, layout.radar.centerY);
    this.radarContacts.setPosition(layout.radar.centerX, layout.radar.centerY);
    this.radarLabel.setPosition(layout.radar.centerX, layout.radar.centerY - layout.radar.diameter / 2 - 5)
      .setFontSize(Math.max(9, Math.round(10 * layout.scale * this.settings.textScale)));
    this.drawRadarFrame();
  }

  private layoutAbilities(layout: HudScreenLayout): void {
    const rect = layout.abilities;
    const inset = Math.round(8 * layout.scale);
    const gap = Math.max(3, Math.round(5 * layout.scale));
    const contentTop = rect.y + Math.round(21 * layout.scale);
    const contentHeight = rect.height - Math.round(28 * layout.scale);
    const cellWidth = (rect.width - inset * 2 - gap * 3) / 4;
    const slotScale = Math.min(1.18, cellWidth / BASE_ABILITY_WIDTH, contentHeight / BASE_ABILITY_HEIGHT);
    let index = 0;
    for (const id of ['fence', 'turret', 'mine', 'shield'] as const) {
      const visual = this.abilitySlots.get(id);
      if (!visual) continue;
      const cellX = rect.x + inset + index * (cellWidth + gap);
      visual.root.setPosition(cellX + (cellWidth - BASE_ABILITY_WIDTH * slotScale) / 2, contentTop).setScale(slotScale);
      const textScale = this.settings.textScale;
      visual.labelText.setFontSize(Math.round(9 * textScale));
      visual.countText.setFontSize(Math.round(10 * textScale));
      visual.statusText.setFontSize(Math.round(13 * textScale));
      const keyLength = visual.lastKeybind?.length ?? 1;
      visual.keyText.setFontSize(Math.max(7, Math.round((keyLength > 5 ? 7 : keyLength > 3 ? 8 : 9) * textScale)));
      index += 1;
    }

    const visibleWidth = Math.min(126, Math.max(88, rect.width / 3.15));
    this.buffVisuals.forEach((buff, buffIndex) => {
      const x = rect.x + rect.width - visibleWidth * (buffIndex + 1) - gap * buffIndex;
      const y = rect.y - Math.round(14 * layout.scale);
      buff.root.setPosition(x, y).setScale(visibleWidth / 116, Math.max(0.82, layout.scale));
      buff.text.setFontSize(Math.round(10 * this.settings.textScale));
    });
  }

  private drawRadarFrame(): void {
    const radius = this.radarDiameter / 2;
    const inner = radius - 7;
    const bracket = 14;
    const glow = glowMultiplier(this.settings.glow);
    this.radarFrame.clear();
    this.radarFrame.fillStyle(0x030812, 0.18).fillCircle(0, 0, radius);
    this.radarFrame.lineStyle(2, CYAN, 0.28 + glow * 0.2).strokeCircle(0, 0, radius);
    this.radarFrame.lineStyle(1, 0x2e8294, 0.18).strokeCircle(0, 0, inner * 0.68);
    this.radarFrame.lineStyle(1, 0x2e8294, 0.13).strokeCircle(0, 0, inner * 0.34);
    this.radarFrame.lineStyle(1, 0x2e8294, 0.13).lineBetween(-inner, 0, inner, 0).lineBetween(0, -inner, 0, inner);
    this.radarFrame.lineStyle(2, MAGENTA, 0.24 + glow * 0.3)
      .lineBetween(-radius, -radius + bracket, -radius, -radius).lineBetween(-radius, -radius, -radius + bracket, -radius)
      .lineBetween(radius - bracket, radius, radius, radius).lineBetween(radius, radius, radius, radius - bracket);
    this.radarFrame.fillStyle(0x8af9ff, 1).fillTriangle(0, -6, -5, 6, 5, 6);
    this.radarFrame.lineStyle(1, 0x8af9ff, 0.3).lineBetween(0, 0, inner * 0.62, -inner * 0.62);
  }

  private drawRadarContacts(contacts: HudRadarContact[], radarRange: number): void {
    const radius = this.radarDiameter / 2 - 9;
    const range = Math.max(1, radarRange);
    this.radarContacts.clear();
    for (const contact of contacts) {
      const distanceSquared = contact.dx * contact.dx + contact.dy * contact.dy;
      const distance = Math.sqrt(distanceSquared);
      const distanceScale = distance > range ? range / distance : 1;
      const x = contact.dx / range * radius * distanceScale;
      const y = contact.dy / range * radius * distanceScale;
      if (contact.kind === 'enemy') {
        this.radarContacts.fillStyle(WARNING, distance > range ? 0.64 : 0.96).fillCircle(x, y, 2.6);
        continue;
      }
      if (contact.kind === 'boss') {
        this.radarContacts.fillStyle(GOLD, 1).fillTriangle(x, y - 6, x - 6, y + 5, x + 6, y + 5);
        this.radarContacts.lineStyle(1, 0xffffff, 0.65).strokeCircle(x, y, 7);
        continue;
      }
      const objectiveColor = contact.state === 'defusing' ? WARNING
        : contact.state === 'active' ? MAGENTA
          : contact.state === 'available' ? CYAN
            : 0x49727d;
      const alpha = contact.state === 'locked' ? 0.46 : 1;
      this.radarContacts.fillStyle(objectiveColor, alpha).fillRect(x - 3.5, y - 3.5, 7, 7);
      this.radarContacts.lineStyle(1, 0xe5ffff, alpha * 0.76).strokeRect(x - 5, y - 5, 10, 10);
    }
  }

  private formatCompactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 10_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
    return Math.max(0, Math.floor(value)).toLocaleString();
  }

  private formatCooldown(ms: number): string {
    const seconds = ms / 1000;
    return seconds < 10 ? seconds.toFixed(1) : `${Math.ceil(seconds)}`;
  }

  private setTextIfChanged(text: Phaser.GameObjects.Text, value: string): void {
    if (text.text !== value) text.setText(value);
  }

  private updateVitalsEmphasis(payload: HudPayload, hpRatio: number, energyRatio: number): void {
    const now = this.scene.time.now;
    if (this.previousHealth !== null && Math.abs(payload.hp - this.previousHealth) >= 0.1) this.healthEmphasisUntil = now + 850;
    if (this.previousEnergy !== null && payload.energy < this.previousEnergy - 0.1) this.energyEmphasisUntil = now + 700;
    this.previousHealth = payload.hp;
    this.previousEnergy = payload.energy;
    const healthQuiet = hpRatio >= 0.999 && now >= this.healthEmphasisUntil;
    const energyQuiet = energyRatio >= 0.999 && now >= this.energyEmphasisUntil;
    const healthAlpha = healthQuiet ? 0.72 : 1;
    const energyAlpha = energyQuiet ? 0.72 : 1;
    this.healthTrack.setAlpha(healthQuiet ? 0.62 : 0.92);
    this.healthValue.setAlpha(healthAlpha);
    this.hpIcon.setAlpha(healthAlpha);
    this.healthReadyShine.setVisible(healthQuiet);
    this.energyTrack.setAlpha(energyQuiet ? 0.62 : 0.92);
    this.energyFill.setAlpha(energyAlpha);
    this.energyValue.setAlpha(energyAlpha);
    this.energyIcon.setAlpha(energyAlpha);
    this.vitalsPanel.frame.setAlpha(healthQuiet && energyQuiet ? 0.76 : 1);
  }

  update(payload: HudPayload): void {
    const hpRatio = Phaser.Math.Clamp(payload.hp / Math.max(1, payload.maxHp), 0, 1);
    const energyRatio = Phaser.Math.Clamp(payload.energy / Math.max(1, payload.maxEnergy), 0, 1);
    this.displayedHealthRatio = Phaser.Math.Linear(this.displayedHealthRatio, hpRatio, 0.22);
    this.displayedEnergyRatio = Phaser.Math.Linear(this.displayedEnergyRatio, energyRatio, 0.2);
    this.healthFill.displayWidth = Math.max(0, this.healthTrack.displayWidth * this.displayedHealthRatio);
    this.energyFill.displayWidth = Math.max(0, this.energyTrack.displayWidth * this.displayedEnergyRatio);
    const shineMax = Math.max(0, this.healthFill.displayWidth - this.healthReadyShine.displayWidth);
    this.healthReadyShine.x = this.healthTrack.x + Phaser.Math.Clamp(shineMax * 0.7, 0, shineMax);
    this.setTextIfChanged(this.healthValue, `${Math.max(0, Math.round(payload.hp))} / ${Math.max(1, Math.round(payload.maxHp))}`);
    const energy = Math.max(0, payload.energy);
    this.setTextIfChanged(this.energyValue, `${Number.isInteger(energy) ? energy.toFixed(0) : energy.toFixed(1)} / ${Math.max(1, Math.round(payload.maxEnergy))}`);
    this.updateVitalsEmphasis(payload, hpRatio, energyRatio);

    if (hpRatio <= 0.4) {
      if (!this.lowHealthPulse) {
        this.lowHealthPulse = this.scene.tweens.add({
          targets: [this.healthFill, this.hpGlow], alpha: { from: 1, to: 0.3 }, duration: 190, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
    } else {
      this.lowHealthPulse?.remove();
      this.lowHealthPulse = null;
      this.healthFill.setAlpha(1);
      this.hpGlow.setAlpha(0.12 * glowMultiplier(this.settings.glow));
    }

    this.setTextIfChanged(this.roundValue, `${payload.level}`);
    this.setTextIfChanged(this.enemyValue, this.formatCompactNumber(payload.enemies));
    this.updateResource('credits', payload.credits);
    this.updateResource('coreTokens', payload.coreTokens);
    this.updateResource('plasmaChips', payload.plasmaChips);
    this.updateResource('fluxCores', payload.fluxCores);

    const phaseStyle = PHASE_COLOR_MAP[payload.phase] ?? PHASE_COLOR_MAP['PRE-PLANT'];
    if (this.objectiveAccent !== phaseStyle.border) {
      this.objectiveAccent = phaseStyle.border;
      this.drawCyberPanel(this.objectivePanel, this.currentLayout.objective, phaseStyle.border, 0.8);
    }
    this.phaseBadge.setFillStyle(phaseStyle.fill, 0.5).setStrokeStyle(1, phaseStyle.border, 0.88);
    const phaseIsRedundant = payload.objective.includes(payload.phase)
      || (payload.phase === 'DEFUSE ALERT' && payload.objective.includes('DEFUSE'));
    this.phaseBadge.setVisible(!phaseIsRedundant);
    this.phaseText.setVisible(!phaseIsRedundant).setColor(phaseStyle.text);
    this.setTextIfChanged(this.phaseText, payload.phase);
    this.setTextIfChanged(this.objectiveText, payload.objective);
    const objectiveRect = this.currentLayout.objective;
    this.objectiveText.setY(objectiveRect.y + objectiveRect.height * (phaseIsRedundant && payload.objectiveTimerMs === null ? 0.56 : 0.35))
      .setColor(payload.bombUrgent ? '#ff9daf' : '#def6ff');
    this.setTextIfChanged(this.objectiveTimerText, formatHudCountdown(payload.objectiveTimerMs));
    this.objectiveTimerText.setVisible(payload.objectiveTimerMs !== null)
      .setY(objectiveRect.y + objectiveRect.height * (phaseIsRedundant ? 0.64 : 0.76))
      .setColor(payload.bombUrgent ? '#ff718c' : '#9ffaff');

    const bombProgress = Phaser.Math.Clamp(payload.bombProgress, 0, 1);
    this.bombProgressTrack.setVisible(payload.bombActive);
    this.bombProgressFill.setVisible(payload.bombActive);
    if (payload.bombActive) {
      this.bombProgressFill.displayWidth = this.bombProgressTrack.displayWidth * bombProgress;
      const color = bombProgress >= 0.82 ? WARNING : GREEN;
      const pulse = bombProgress >= 0.82 ? 0.48 + Math.abs(Math.sin(this.scene.time.now * 0.014)) * 0.52 : 1;
      this.bombProgressFill.setFillStyle(color, 1).setAlpha(pulse);
    }
    if (payload.defuseAlert) {
      if (!this.defusePulse) {
        this.defusePulse = this.scene.tweens.add({ targets: [this.phaseBadge, this.objectivePanel.led], alpha: { from: 1, to: 0.38 }, duration: 220, yoyo: true, repeat: -1 });
      }
    } else {
      this.defusePulse?.remove();
      this.defusePulse = null;
      this.phaseBadge.setAlpha(1);
      this.objectivePanel.led.setAlpha(1);
    }

    for (const slot of payload.abilities) this.updateAbility(slot);
    this.updateBuffs(payload.buffs);
    this.drawRadarContacts(payload.radarContacts, payload.radarRange);
  }

  private updateResource(kind: HudResourceKind, rawValue: number): void {
    const visual = this.resourceVisuals.get(kind);
    if (!visual) return;
    const value = Math.max(0, rawValue);
    this.setTextIfChanged(visual.value, this.formatCompactNumber(value));
    if (this.settings.animation !== 'off' && visual.lastValue !== undefined && value > visual.lastValue) {
      this.scene.tweens.killTweensOf([visual.icon, visual.value]);
      this.scene.tweens.add({
        targets: [visual.icon, visual.value],
        alpha: { from: this.settings.animation === 'reduced' ? 0.68 : 0.38, to: 1 },
        duration: this.settings.animation === 'reduced' ? 130 : 210,
        ease: 'Sine.easeOut'
      });
    }
    visual.lastValue = value;
  }

  private updateBuffs(buffs: string[]): void {
    for (let index = 0; index < this.buffVisuals.length; index += 1) {
      const visual = this.buffVisuals[index];
      const label = buffs[index];
      visual.root.setVisible(Boolean(label));
      if (label) this.setTextIfChanged(visual.text, label);
    }
  }

  private updateAbility(slot: HudAbilitySlot): void {
    const visual = this.abilitySlots.get(slot.id);
    if (!visual) return;
    const cooldownMs = slot.cooldownMs <= COOLDOWN_READY_EPSILON_MS ? 0 : slot.cooldownMs;
    const coolingDown = cooldownMs > 0;
    const ready = !coolingDown && slot.hasEnergy && slot.underLimit;
    const previousReady = this.lastAbilityReady.get(slot.id) ?? false;
    this.lastAbilityReady.set(slot.id, ready);
    if (visual.lastKeybind !== slot.keybind) {
      visual.lastKeybind = slot.keybind;
      visual.keyText.setText(slot.keybind).setFontSize(Math.max(7, Math.round((slot.keybind.length > 5 ? 7 : slot.keybind.length > 3 ? 8 : 9) * this.settings.textScale)));
      visual.keyChip.setDisplaySize(slot.keybind.length > 3 ? 34 : 25, 16);
      visual.keyText.setX(8 + visual.keyChip.displayWidth / 2);
    }

    const countLabel = slot.capacity === null ? (slot.active ? 'ON' : '--') : `${slot.count}/${slot.capacity}`;
    this.setTextIfChanged(visual.countText, countLabel);
    let status = '';
    if (slot.active) status = 'ACTIVE';
    else if (coolingDown) status = this.formatCooldown(cooldownMs);
    else if (!slot.hasEnergy) status = 'LOW EN';
    else if (!slot.underLimit) status = 'FULL';
    if (visual.lastStatus !== status) {
      visual.lastStatus = status;
      visual.statusText.setText(status).setVisible(status.length > 0);
    }

    const visualStateChanged = visual.lastReady !== ready
      || visual.lastCoolingDown !== coolingDown
      || visual.lastActive !== slot.active
      || visual.lastSelected !== slot.selected
      || visual.lastHasEnergy !== slot.hasEnergy
      || visual.lastUnderLimit !== slot.underLimit
      || visual.lastCount !== slot.count
      || visual.lastCapacity !== slot.capacity;
    if (visualStateChanged) {
      const muted = coolingDown || !slot.hasEnergy || !slot.underLimit;
      visual.icon.setAlpha(status.length > 0 ? 0.22 : 1);
      visual.overlay.setAlpha(muted ? 0.25 : 0);
      const border = slot.selected ? MAGENTA : ready ? GREEN : 0x3a8fad;
      this.drawAbilityModuleFrame(visual.frame, border, ready, slot.selected);
      visual.keyChip.setStrokeStyle(1, slot.selected ? MAGENTA : CYAN, slot.selected ? 0.9 : 0.52);
      visual.labelText.setColor(slot.selected ? '#ffb7eb' : ready ? '#baffd6' : '#9ac8d4');
      visual.statusText.setColor(slot.active ? '#ffb5ec' : coolingDown ? '#d8ebff' : !slot.hasEnergy ? '#ffb2be' : '#ffdba3');
      this.drawAbilitySegments(visual.segments, slot, ready);
    }
    if (coolingDown || visualStateChanged) {
      const ringRadius = 21;
      visual.cooldownRing.clear().lineStyle(1, 0x244c5c, 0.5).strokeCircle(50, 35, ringRadius);
      if (ready || slot.active) {
        visual.cooldownRing.lineStyle(2, slot.active ? MAGENTA : GREEN, 0.92).strokeCircle(50, 35, ringRadius);
      } else if (coolingDown) {
        const progress = 1 - Phaser.Math.Clamp(cooldownMs / Math.max(1, slot.cooldownDurationMs), 0, 1);
        visual.cooldownRing.lineStyle(2, CYAN, 0.94).beginPath()
          .arc(50, 35, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false).strokePath();
      }
    }
    visual.lastReady = ready;
    visual.lastCoolingDown = coolingDown;
    visual.lastActive = slot.active;
    visual.lastSelected = slot.selected;
    visual.lastHasEnergy = slot.hasEnergy;
    visual.lastUnderLimit = slot.underLimit;
    visual.lastCount = slot.count;
    visual.lastCapacity = slot.capacity;
    if (this.settings.animation !== 'off' && !previousReady && ready) {
      this.scene.tweens.killTweensOf([visual.root, visual.cooldownRing]);
      this.scene.tweens.add({
        targets: [visual.root, visual.cooldownRing],
        alpha: { from: this.settings.animation === 'reduced' ? 0.8 : 0.62, to: 1 },
        duration: this.settings.animation === 'reduced' ? 110 : 160,
        yoyo: true,
        repeat: this.settings.animation === 'reduced' ? 0 : 1
      });
    }
  }

  private drawAbilitySegments(graphics: Phaser.GameObjects.Graphics, slot: HudAbilitySlot, ready: boolean): void {
    graphics.clear();
    if (slot.capacity === null) {
      graphics.fillStyle(slot.active ? MAGENTA : ready ? GREEN : 0x315764, 0.86).fillRect(39, 75, 22, 2);
      return;
    }
    const segments = Math.max(1, Math.min(6, slot.capacity));
    const segmentWidth = 6;
    const totalWidth = segments * segmentWidth + (segments - 1) * 2;
    const startX = (BASE_ABILITY_WIDTH - totalWidth) / 2;
    for (let index = 0; index < segments; index += 1) {
      const isActive = index < Math.min(slot.count, segments);
      graphics.fillStyle(isActive ? (slot.selected ? MAGENTA : GREEN) : 0x24414c, isActive ? 0.86 : 0.56)
        .fillRect(startX + index * (segmentWidth + 2), 75, segmentWidth, 2);
    }
  }

  destroy(): void {
    this.scene.scale.off('resize', this.onResize, this);
    this.lowHealthPulse?.remove();
    this.lowHealthPulse = null;
    this.defusePulse?.remove();
    this.defusePulse = null;
    for (const visual of this.abilitySlots.values()) this.scene.tweens.killTweensOf([visual.root, visual.cooldownRing]);
    for (const visual of this.resourceVisuals.values()) this.scene.tweens.killTweensOf([visual.icon, visual.value]);
    this.root.destroy(true);
  }
}
