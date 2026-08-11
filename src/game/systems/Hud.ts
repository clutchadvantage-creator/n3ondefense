import Phaser from 'phaser';
import { calculateHudLayout, formatHudCountdown } from './hudLayout.ts';

export interface HudAbilitySlot {
  id: 'fence' | 'turret' | 'mine' | 'shield';
  keybind: string;
  icon: string;
  label: string;
  cooldownMs: number;
  cooldownDurationMs: number;
  active?: boolean;
  selected: boolean;
  hasEnergy: boolean;
  underLimit: boolean;
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

interface AbilitySlotVisual {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  keyText: Phaser.GameObjects.Text;
  iconText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  overlay: Phaser.GameObjects.Rectangle;
  cooldownRing: Phaser.GameObjects.Graphics;
  lastKeybind?: string;
  lastStatus?: string;
  lastReady?: boolean;
  lastCoolingDown?: boolean;
  lastActive?: boolean;
  lastSelected?: boolean;
  lastHasEnergy?: boolean;
  lastUnderLimit?: boolean;
}

const COOLDOWN_READY_EPSILON_MS = 140;
const HUD_DEPTH = 1000;
const SURFACE_COLOR = 0x060b12;
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

export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly sectionResources: Phaser.GameObjects.Rectangle;
  private readonly sectionStats: Phaser.GameObjects.Rectangle;
  private readonly sectionObjective: Phaser.GameObjects.Rectangle;
  private readonly sectionAbilities: Phaser.GameObjects.Rectangle;

  private readonly hpIconV: Phaser.GameObjects.Rectangle;
  private readonly hpIconH: Phaser.GameObjects.Rectangle;
  private readonly hpGlow: Phaser.GameObjects.Arc;
  private readonly enBolt: Phaser.GameObjects.Polygon;
  private readonly enGlow: Phaser.GameObjects.Arc;
  private readonly healthTrack: Phaser.GameObjects.Rectangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private readonly healthReadyShine: Phaser.GameObjects.Rectangle;
  private readonly healthValue: Phaser.GameObjects.Text;
  private readonly energyTrack: Phaser.GameObjects.Rectangle;
  private readonly energyFill: Phaser.GameObjects.Rectangle;
  private readonly energyValue: Phaser.GameObjects.Text;

  private readonly statsLabelLevel: Phaser.GameObjects.Text;
  private readonly statsValueLevel: Phaser.GameObjects.Text;
  private readonly statsLabelEnemies: Phaser.GameObjects.Text;
  private readonly statsValueEnemies: Phaser.GameObjects.Text;
  private readonly statsLabelCredits: Phaser.GameObjects.Text;
  private readonly statsValueCredits: Phaser.GameObjects.Text;

  private readonly phaseBadge: Phaser.GameObjects.Rectangle;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly objectiveText: Phaser.GameObjects.Text;
  private readonly objectiveTimerText: Phaser.GameObjects.Text;
  private readonly bombProgressTrack: Phaser.GameObjects.Rectangle;
  private readonly bombProgressFill: Phaser.GameObjects.Rectangle;

  private readonly abilitySlots = new Map<HudAbilitySlot['id'], AbilitySlotVisual>();
  private readonly buffTitle: Phaser.GameObjects.Text;
  private readonly buffText: Phaser.GameObjects.Text;
  private readonly radarFrame: Phaser.GameObjects.Graphics;
  private readonly radarContacts: Phaser.GameObjects.Graphics;
  private readonly radarLabel: Phaser.GameObjects.Text;

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

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(HUD_DEPTH);

    this.sectionResources = this.createSurface(0.16, 0x45f5ff);
    this.sectionStats = this.createSurface(0.12, 0x45f5ff);
    this.sectionObjective = this.createSurface(0.18, 0x45f5ff);
    this.sectionAbilities = this.createSurface(0.08, 0x45f5ff);

    this.hpGlow = scene.add.circle(0, 0, 11, 0xff5578, 0.18);
    this.hpIconV = scene.add.rectangle(0, 0, 4, 14, 0xff7f98, 1);
    this.hpIconH = scene.add.rectangle(0, 0, 14, 4, 0xff7f98, 1);
    this.healthTrack = scene.add.rectangle(0, 0, 200, 11, 0x2a0a12, 0.9)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0x6f2735, 0.8);
    this.healthFill = scene.add.rectangle(0, 0, 200, 7, 0xff5578, 1).setOrigin(0, 0.5);
    this.healthReadyShine = scene.add.rectangle(0, 0, 28, 7, 0xffffff, 0.13).setOrigin(0, 0.5);
    this.healthValue = this.createText('', 14, '#ffd9e2', 'Rajdhani, sans-serif').setOrigin(1, 0.5);

    this.enGlow = scene.add.circle(0, 0, 11, 0x42f2ff, 0.15);
    this.enBolt = scene.add.polygon(0, 0, [-3, -10, 2, -10, -1, -2, 5, -2, -2, 10, 1, 2, -5, 2], 0x6cf6ff, 0.98)
      .setStrokeStyle(1, 0xe8fdff, 0.9);
    this.energyTrack = scene.add.rectangle(0, 0, 200, 11, 0x0a2435, 0.9)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0x1f5f84, 0.8);
    this.energyFill = scene.add.rectangle(0, 0, 200, 7, 0x42f2ff, 1).setOrigin(0, 0.5);
    this.energyValue = this.createText('', 14, '#d5fbff', 'Rajdhani, sans-serif').setOrigin(1, 0.5);

    this.statsLabelLevel = this.createText('LV', 11, '#86abc8');
    this.statsValueLevel = this.createText('1', 15, '#baf7ff');
    this.statsLabelEnemies = this.createText('ENEMIES', 11, '#9e9dd6');
    this.statsValueEnemies = this.createText('0', 15, '#ffe19a');
    this.statsLabelCredits = this.createText('¢', 13, '#b0b08c');
    this.statsValueCredits = this.createText('0', 15, '#fff080');

    this.phaseBadge = scene.add.rectangle(0, 0, 134, 20, 0x103243, 0.38)
      .setOrigin(0.5).setStrokeStyle(1, 0x5de7ff, 0.75);
    this.phaseText = this.createText('PRE-PLANT', 11, '#8ef2ff').setOrigin(0.5);
    this.objectiveText = this.createText('SITE A AVAILABLE', 14, '#def6ff').setOrigin(0.5);
    this.objectiveTimerText = this.createText('', 19, '#9ffaff').setOrigin(0.5).setVisible(false);
    this.bombProgressTrack = scene.add.rectangle(0, 0, 120, 5, 0x10201d, 0.8)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0x5b9d87, 0.55).setVisible(false);
    this.bombProgressFill = scene.add.rectangle(0, 0, 120, 3, 0x53ff8a, 1)
      .setOrigin(0, 0.5).setVisible(false);

    this.buffTitle = this.createText('ACTIVE', 10, '#77b5d7', 'Rajdhani, sans-serif').setOrigin(1, 0.5).setVisible(false);
    this.buffText = this.createText('', 13, '#d8f5ff', 'Rajdhani, sans-serif').setOrigin(1, 0.5).setVisible(false);

    this.radarFrame = scene.add.graphics();
    this.radarContacts = scene.add.graphics();
    this.radarLabel = this.createText('RADAR', 10, '#6ca7bc', 'Rajdhani, sans-serif').setOrigin(0.5, 1);

    for (const slot of [
      { id: 'fence', keybind: 'Q', icon: '⛔', label: 'FENCE' },
      { id: 'turret', keybind: 'F', icon: '⌖', label: 'TURRET' },
      { id: 'mine', keybind: 'R', icon: '✹', label: 'MINE' },
      { id: 'shield', keybind: 'MMB', icon: '◉', label: 'SHIELD' }
    ] as const) {
      const slotRoot = scene.add.container(0, 0);
      const slotBg = scene.add.rectangle(0, 27, 50, 50, 0x0d1724, 0.22)
        .setOrigin(0.5).setStrokeStyle(1, 0x3a8fad, 0.7);
      const keyText = this.createText(slot.keybind, 10, '#c4f3ff').setOrigin(0.5).setPosition(0, 8);
      const iconText = this.createText(slot.icon, 20, '#82f6ff', 'Rajdhani, sans-serif').setOrigin(0.5).setPosition(0, 30);
      const labelText = this.createText(slot.label, 10, '#95d7f0', 'Rajdhani, sans-serif').setOrigin(0.5).setPosition(0, 62);
      const statusText = this.createText('', 13, '#d8ebff').setOrigin(0.5).setPosition(0, 31).setVisible(false);
      const overlay = scene.add.rectangle(0, 27, 50, 50, 0x05080e, 0).setOrigin(0.5);
      const cooldownRing = scene.add.graphics();

      slotRoot.add([slotBg, overlay, iconText, keyText, statusText, cooldownRing, labelText]);
      this.abilitySlots.set(slot.id, { root: slotRoot, bg: slotBg, keyText, iconText, labelText, statusText, overlay, cooldownRing });
      this.lastAbilityReady.set(slot.id, false);
    }

    this.root.add([
      this.sectionResources, this.sectionStats, this.sectionObjective, this.sectionAbilities,
      this.hpGlow, this.hpIconV, this.hpIconH, this.healthTrack, this.healthFill, this.healthReadyShine, this.healthValue,
      this.enGlow, this.enBolt, this.energyTrack, this.energyFill, this.energyValue,
      this.statsLabelLevel, this.statsValueLevel, this.statsLabelEnemies, this.statsValueEnemies,
      this.statsLabelCredits, this.statsValueCredits,
      this.phaseBadge, this.phaseText, this.objectiveText, this.objectiveTimerText,
      this.bombProgressTrack, this.bombProgressFill,
      this.radarFrame, this.radarContacts, this.radarLabel,
      ...Array.from(this.abilitySlots.values()).map((slot) => slot.root),
      this.buffTitle, this.buffText
    ]);

    this.layout(scene.scale.width, scene.scale.height);
    this.scene.scale.on('resize', this.onResize, this);
  }

  private createSurface(alpha: number, border: number): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(0, 0, 100, 60, SURFACE_COLOR, alpha)
      .setOrigin(0).setStrokeStyle(1, border, 0.68);
  }

  private createText(text: string, size: number, color: string, family = 'Orbitron, sans-serif'): Phaser.GameObjects.Text {
    return this.scene.add.text(0, 0, text, { fontFamily: family, fontSize: `${size}px`, color });
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.layout(size.width, size.height);
  }

  private layout(width: number, height: number): void {
    const layout = calculateHudLayout(width, height);
    this.scaleFactor = layout.scale;
    this.root.setPosition(0, 0);

    this.sectionResources.setPosition(layout.vitals.x, layout.vitals.y).setDisplaySize(layout.vitals.width, layout.vitals.height);
    this.sectionStats.setPosition(layout.stats.x, layout.stats.y).setDisplaySize(layout.stats.width, layout.stats.height);
    this.sectionObjective.setPosition(layout.objective.x, layout.objective.y).setDisplaySize(layout.objective.width, layout.objective.height);
    this.sectionAbilities.setPosition(layout.abilities.x, layout.abilities.y).setDisplaySize(layout.abilities.width, layout.abilities.height);

    const vitalsLeft = layout.vitals.x;
    const vitalsTop = layout.vitals.y;
    const iconX = vitalsLeft + Math.round(16 * layout.scale);
    const barX = vitalsLeft + Math.round(30 * layout.scale);
    const barWidth = Math.max(74, layout.vitals.width - Math.round(40 * layout.scale));
    const healthY = vitalsTop + Math.round(27 * layout.scale);
    const energyY = vitalsTop + Math.round(63 * layout.scale);
    const valueOffset = Math.round(13 * layout.scale);

    this.hpGlow.setPosition(iconX, healthY).setScale(layout.scale);
    this.hpIconV.setPosition(iconX, healthY).setScale(layout.scale);
    this.hpIconH.setPosition(iconX, healthY).setScale(layout.scale);
    this.healthTrack.setPosition(barX, healthY).setDisplaySize(barWidth, Math.max(8, Math.round(11 * layout.scale)));
    this.healthFill.setPosition(barX, healthY).setDisplaySize(barWidth, Math.max(5, Math.round(7 * layout.scale)));
    this.healthReadyShine.setPosition(barX, healthY).setDisplaySize(Math.round(28 * layout.scale), Math.max(5, Math.round(7 * layout.scale)));
    this.healthValue.setPosition(vitalsLeft + layout.vitals.width - 8, healthY - valueOffset).setFontSize(Math.round(14 * layout.scale));

    this.enGlow.setPosition(iconX, energyY).setScale(layout.scale);
    this.enBolt.setPosition(iconX, energyY).setScale(layout.scale);
    this.energyTrack.setPosition(barX, energyY).setDisplaySize(barWidth, Math.max(8, Math.round(11 * layout.scale)));
    this.energyFill.setPosition(barX, energyY).setDisplaySize(barWidth, Math.max(5, Math.round(7 * layout.scale)));
    this.energyValue.setPosition(vitalsLeft + layout.vitals.width - 8, energyY - valueOffset).setFontSize(Math.round(14 * layout.scale));

    const statCenterY = layout.stats.y + layout.stats.height / 2;
    const statInset = Math.round(10 * layout.scale);
    const statUsable = layout.stats.width - statInset * 2;
    const statPositions = [0, 0.31, 0.69].map((ratio) => layout.stats.x + statInset + statUsable * ratio);
    this.placeStat(this.statsLabelLevel, this.statsValueLevel, statPositions[0], statCenterY, 24);
    this.placeStat(this.statsLabelEnemies, this.statsValueEnemies, statPositions[1], statCenterY, 58);
    this.placeStat(this.statsLabelCredits, this.statsValueCredits, statPositions[2], statCenterY, 18);

    const objectiveCenterX = layout.objective.x + layout.objective.width / 2;
    this.objectiveText.setPosition(objectiveCenterX, layout.objective.y + Math.round(18 * layout.scale))
      .setFontSize(Math.round(14 * layout.scale)).setWordWrapWidth(layout.objective.width - 16, true);
    this.phaseBadge.setPosition(objectiveCenterX, layout.objective.y + Math.round(45 * layout.scale))
      .setDisplaySize(Math.min(layout.objective.width - 24, Math.round(138 * layout.scale)), Math.round(20 * layout.scale));
    this.phaseText.setPosition(objectiveCenterX, this.phaseBadge.y).setFontSize(Math.round(11 * layout.scale));
    this.objectiveTimerText.setPosition(objectiveCenterX, layout.objective.y + Math.round(68 * layout.scale))
      .setFontSize(Math.round(19 * layout.scale));
    const objectiveBarWidth = layout.objective.width - Math.round(20 * layout.scale);
    const objectiveBarX = layout.objective.x + Math.round(10 * layout.scale);
    const objectiveBarY = layout.objective.y + layout.objective.height - Math.round(5 * layout.scale);
    this.bombProgressTrack.setPosition(objectiveBarX, objectiveBarY).setDisplaySize(objectiveBarWidth, Math.max(3, Math.round(5 * layout.scale)));
    this.bombProgressFill.setPosition(objectiveBarX, objectiveBarY).setDisplaySize(objectiveBarWidth, Math.max(2, Math.round(3 * layout.scale)));
    this.radarDiameter = layout.radar.diameter;
    this.radarFrame.setPosition(layout.radar.centerX, layout.radar.centerY);
    this.radarContacts.setPosition(layout.radar.centerX, layout.radar.centerY);
    this.radarLabel.setPosition(layout.radar.centerX, layout.radar.centerY - layout.radar.diameter / 2 - 4)
      .setFontSize(Math.round(10 * layout.scale));
    this.drawRadarFrame();

    const abilityTop = layout.abilities.y;
    const slotWidth = layout.abilities.width / 4;
    let index = 0;
    for (const slot of ['fence', 'turret', 'mine', 'shield'] as const) {
      const visual = this.abilitySlots.get(slot);
      if (!visual) continue;
      const slotScale = Math.min(1, layout.scale);
      visual.root.setPosition(layout.abilities.x + slotWidth * (index + 0.5), abilityTop + Math.round(4 * layout.scale)).setScale(slotScale);
      index += 1;
    }
    this.buffTitle.setPosition(layout.abilities.x + layout.abilities.width, abilityTop - Math.round(30 * layout.scale))
      .setFontSize(Math.round(10 * layout.scale));
    this.buffText.setPosition(layout.abilities.x + layout.abilities.width, abilityTop - Math.round(13 * layout.scale))
      .setFontSize(Math.round(13 * layout.scale)).setWordWrapWidth(layout.abilities.width, true);
  }

  private placeStat(
    label: Phaser.GameObjects.Text,
    value: Phaser.GameObjects.Text,
    x: number,
    y: number,
    valueOffset: number
  ): void {
    label.setPosition(x, y).setOrigin(0, 0.5).setFontSize(Math.round(11 * this.scaleFactor));
    value.setPosition(x + Math.round(valueOffset * this.scaleFactor), y).setOrigin(0, 0.5).setFontSize(Math.round(15 * this.scaleFactor));
  }

  private drawRadarFrame(): void {
    const radius = this.radarDiameter / 2;
    const inner = radius - 3;
    this.radarFrame.clear();
    this.radarFrame.fillStyle(0x030812, 0.18).fillCircle(0, 0, radius);
    this.radarFrame.lineStyle(1, 0x43dfee, 0.48).strokeCircle(0, 0, radius);
    this.radarFrame.lineStyle(1, 0x2e8294, 0.18).strokeCircle(0, 0, inner * 0.66);
    this.radarFrame.lineStyle(1, 0x2e8294, 0.12).strokeCircle(0, 0, inner * 0.33);
    this.radarFrame.lineStyle(1, 0x2e8294, 0.13);
    this.radarFrame.lineBetween(-inner, 0, inner, 0);
    this.radarFrame.lineBetween(0, -inner, 0, inner);
    this.radarFrame.fillStyle(0x8af9ff, 1).fillTriangle(0, -5, -4, 5, 4, 5);
  }

  private drawRadarContacts(contacts: HudRadarContact[], radarRange: number): void {
    const radius = this.radarDiameter / 2 - 7;
    const range = Math.max(1, radarRange);
    this.radarContacts.clear();

    for (const contact of contacts) {
      const distance = Math.hypot(contact.dx, contact.dy);
      const distanceScale = distance > range ? range / distance : 1;
      const x = contact.dx / range * radius * distanceScale;
      const y = contact.dy / range * radius * distanceScale;

      if (contact.kind === 'enemy') {
        this.radarContacts.fillStyle(0xff5f7c, distance > range ? 0.65 : 0.95).fillCircle(x, y, 2.5);
        continue;
      }
      if (contact.kind === 'boss') {
        this.radarContacts.fillStyle(0xffcf63, 1).fillTriangle(x, y - 5, x - 5, y + 4, x + 5, y + 4);
        continue;
      }

      const objectiveColor = contact.state === 'defusing' ? 0xff526f
        : contact.state === 'active' ? 0xff72dd
          : contact.state === 'available' ? 0x63f6ff
            : 0x49727d;
      const alpha = contact.state === 'locked' ? 0.48 : 1;
      this.radarContacts.fillStyle(objectiveColor, alpha).fillRect(x - 3.5, y - 3.5, 7, 7);
      this.radarContacts.lineStyle(1, 0xe5ffff, alpha * 0.7).strokeRect(x - 4.5, y - 4.5, 9, 9);
    }
  }

  private formatCompactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    return value >= 10_000 ? value.toLocaleString() : `${value}`;
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
    this.healthTrack.setAlpha(healthQuiet ? 0.62 : 0.9);
    this.healthValue.setAlpha(healthAlpha);
    this.hpIconV.setAlpha(healthAlpha);
    this.hpIconH.setAlpha(healthAlpha);
    this.healthReadyShine.setVisible(healthQuiet);
    this.energyTrack.setAlpha(energyQuiet ? 0.62 : 0.9);
    this.energyFill.setAlpha(energyAlpha);
    this.energyValue.setAlpha(energyAlpha);
    this.enBolt.setAlpha(energyAlpha);
    this.sectionResources.setFillStyle(SURFACE_COLOR, healthQuiet && energyQuiet ? 0.09 : 0.16);
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
          targets: [this.healthFill, this.hpGlow],
          alpha: { from: 1, to: 0.28 }, duration: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
    } else {
      this.lowHealthPulse?.remove();
      this.lowHealthPulse = null;
      this.healthFill.setAlpha(hpRatio >= 0.999 && this.scene.time.now >= this.healthEmphasisUntil ? 0.72 : 1);
      this.hpGlow.setAlpha(0.18);
    }

    this.setTextIfChanged(this.statsValueLevel, `${payload.level}`);
    this.setTextIfChanged(this.statsValueEnemies, this.formatCompactNumber(Math.max(0, payload.enemies)));
    this.setTextIfChanged(this.statsValueCredits, this.formatCompactNumber(Math.max(0, payload.credits)));

    const phaseStyle = PHASE_COLOR_MAP[payload.phase] ?? PHASE_COLOR_MAP['PRE-PLANT'];
    this.phaseBadge.setFillStyle(phaseStyle.fill, 0.38).setStrokeStyle(1, phaseStyle.border, 0.86);
    const phaseIsRedundant = payload.objective.includes(payload.phase)
      || (payload.phase === 'DEFUSE ALERT' && payload.objective.includes('DEFUSE'));
    this.phaseBadge.setVisible(!phaseIsRedundant);
    this.phaseText.setVisible(!phaseIsRedundant).setColor(phaseStyle.text);
    this.setTextIfChanged(this.phaseText, payload.phase);
    this.setTextIfChanged(this.objectiveText, payload.objective);
    this.objectiveText.setY(this.sectionObjective.y + this.sectionObjective.displayHeight * (phaseIsRedundant && payload.objectiveTimerMs === null ? 0.5 : 0.2))
      .setColor(payload.bombUrgent ? '#ff9daf' : '#def6ff');
    this.setTextIfChanged(this.objectiveTimerText, formatHudCountdown(payload.objectiveTimerMs));
    this.objectiveTimerText.setVisible(payload.objectiveTimerMs !== null)
      .setY(this.sectionObjective.y + this.sectionObjective.displayHeight * (phaseIsRedundant ? 0.6 : 0.76))
      .setColor(payload.bombUrgent ? '#ff718c' : '#9ffaff');

    const bombProgress = Phaser.Math.Clamp(payload.bombProgress, 0, 1);
    this.bombProgressTrack.setVisible(payload.bombActive);
    this.bombProgressFill.setVisible(payload.bombActive);
    if (payload.bombActive) {
      this.bombProgressFill.displayWidth = this.bombProgressTrack.displayWidth * bombProgress;
      const color = bombProgress >= 0.82 ? 0xff526f : 0x53ff8a;
      const pulse = bombProgress >= 0.82 ? 0.48 + Math.abs(Math.sin(this.scene.time.now * 0.014)) * 0.52 : 1;
      this.bombProgressFill.setFillStyle(color, 1).setAlpha(pulse);
    }

    if (payload.defuseAlert) {
      if (!this.defusePulse) {
        this.defusePulse = this.scene.tweens.add({ targets: this.phaseBadge, alpha: { from: 1, to: 0.5 }, duration: 220, yoyo: true, repeat: -1 });
      }
    } else {
      this.defusePulse?.remove();
      this.defusePulse = null;
      this.phaseBadge.setAlpha(1);
    }

    for (const slot of payload.abilities) this.updateAbility(slot);

    const buffsVisible = payload.buffs.length > 0;
    this.buffTitle.setVisible(buffsVisible);
    this.buffText.setVisible(buffsVisible);
    if (buffsVisible) {
      const visibleCount = Math.min(3, payload.buffs.length);
      let buffLabel = '';
      for (let index = 0; index < visibleCount; index += 1) buffLabel += `${index > 0 ? '  •  ' : ''}${payload.buffs[index]}`;
      const extra = payload.buffs.length - visibleCount;
      this.setTextIfChanged(this.buffText, `${buffLabel}${extra > 0 ? `  +${extra}` : ''}`);
    } else {
      this.setTextIfChanged(this.buffText, '');
    }

    this.drawRadarContacts(payload.radarContacts, payload.radarRange);
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
      visual.keyText.setText(slot.keybind).setFontSize(slot.keybind.length > 5 ? 8 : 10);
    }

    let status = '';
    if (slot.active) status = 'ACTIVE';
    else if (coolingDown) status = this.formatCooldown(cooldownMs);
    else if (!slot.hasEnergy) status = 'NO EN';
    else if (!slot.underLimit) status = 'MAX';
    if (visual.lastStatus !== status) {
      visual.lastStatus = status;
      visual.statusText.setText(status).setVisible(status.length > 0);
    }

    const visualStateChanged = visual.lastReady !== ready
      || visual.lastCoolingDown !== coolingDown
      || visual.lastActive !== slot.active
      || visual.lastSelected !== slot.selected
      || visual.lastHasEnergy !== slot.hasEnergy
      || visual.lastUnderLimit !== slot.underLimit;
    if (visualStateChanged) {
      visual.iconText.setAlpha(status.length > 0 ? 0.25 : 1);
      visual.overlay.setAlpha(coolingDown || !slot.hasEnergy || !slot.underLimit ? 0.24 : 0);
      const border = slot.selected ? 0xff7de5 : ready ? 0x6dffb8 : 0x3a8fad;
      visual.bg.setFillStyle(ready ? 0x10231e : 0x0d1724, ready ? 0.28 : 0.2)
        .setStrokeStyle(1, border, slot.selected ? 1 : 0.78);
      visual.statusText.setColor(slot.active ? '#ffb5ec' : coolingDown ? '#d8ebff' : !slot.hasEnergy ? '#ffb2be' : '#ffdba3');
    }
    if (coolingDown || visualStateChanged) {
      const ringRadius = 28;
      visual.cooldownRing.clear();
      visual.cooldownRing.lineStyle(1, 0x244c5c, 0.48).strokeCircle(0, 27, ringRadius);
      if (ready || slot.active) {
        visual.cooldownRing.lineStyle(2, slot.active ? 0xff77df : 0x6dffb8, 0.9).strokeCircle(0, 27, ringRadius);
      } else if (coolingDown) {
        const progress = 1 - Phaser.Math.Clamp(cooldownMs / Math.max(1, slot.cooldownDurationMs), 0, 1);
        visual.cooldownRing.lineStyle(2, 0x52dff5, 0.9).beginPath()
          .arc(0, 27, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false).strokePath();
      }
    }
    visual.lastReady = ready;
    visual.lastCoolingDown = coolingDown;
    visual.lastActive = slot.active;
    visual.lastSelected = slot.selected;
    visual.lastHasEnergy = slot.hasEnergy;
    visual.lastUnderLimit = slot.underLimit;

    if (!previousReady && ready) {
      this.scene.tweens.add({ targets: [visual.bg, visual.cooldownRing], alpha: { from: 0.65, to: 1 }, duration: 170, yoyo: true, repeat: 1 });
    }
  }

  destroy(): void {
    this.scene.scale.off('resize', this.onResize, this);
    this.lowHealthPulse?.remove();
    this.lowHealthPulse = null;
    this.defusePulse?.remove();
    this.defusePulse = null;
    for (const visual of this.abilitySlots.values()) {
      this.scene.tweens.killTweensOf([visual.bg, visual.cooldownRing]);
    }
    this.root.destroy(true);
  }
}
