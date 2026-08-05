import Phaser from 'phaser';

export interface HudAbilitySlot {
  id: 'fence' | 'turret' | 'mine' | 'shield';
  keybind: 'Q' | 'F' | 'R' | 'MMB';
  icon: string;
  label: string;
  cooldownMs: number;
  active?: boolean;
  selected: boolean;
  hasEnergy: boolean;
  underLimit: boolean;
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
  defuseAlert: boolean;
  bombUrgent: boolean;
  buffs: string[];
  abilities: HudAbilitySlot[];
}

interface AbilitySlotVisual {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  keyText: Phaser.GameObjects.Text;
  iconText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  overlay: Phaser.GameObjects.Rectangle;
}

const COOLDOWN_READY_EPSILON_MS = 140;

// Keep HUD opacity on individual dark surfaces so foreground elements and
// borders stay crisp while gameplay remains visible through the panel.
const HUD_ALPHA = {
  panelGlow: 0.025,
  panel: 0.18,
  resources: 0.1,
  section: 0.08,
  ability: 0.14,
  phaseBadge: 0.42,
  disabledOverlay: 0.16
} as const;

export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly panelGlow: Phaser.GameObjects.Rectangle;
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

  private readonly abilitySlots = new Map<HudAbilitySlot['id'], AbilitySlotVisual>();
  private readonly buffTitle: Phaser.GameObjects.Text;
  private readonly buffText: Phaser.GameObjects.Text;
  private readonly warning: Phaser.GameObjects.Text;

  private readonly healthReadyShine: Phaser.GameObjects.Rectangle;
  private displayedHealthRatio = 1;
  private displayedEnergyRatio = 1;
  private lowHealthPulse: Phaser.Tweens.Tween | null = null;
  private defusePulse: Phaser.Tweens.Tween | null = null;
  private readonly lastAbilityReady = new Map<HudAbilitySlot['id'], boolean>();

  private panelWidth = 620;
  private panelHeight = 250;
  private scaleFactor = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(16, 16).setScrollFactor(0).setDepth(1000);

    this.panelGlow = scene.add.rectangle(0, 0, this.panelWidth, this.panelHeight, 0x45f5ff, HUD_ALPHA.panelGlow)
      .setOrigin(0)
      .setStrokeStyle(1, 0x45f5ff, 0.25);
    this.panel = scene.add.rectangle(0, 0, this.panelWidth, this.panelHeight, 0x060b12, HUD_ALPHA.panel)
      .setOrigin(0)
      .setStrokeStyle(1, 0x45f5ff, 0.85);

    this.sectionResources = scene.add.rectangle(0, 0, 100, 80, 0x0b121d, HUD_ALPHA.resources).setOrigin(0);
    this.sectionStats = scene.add.rectangle(0, 0, 100, 50, 0x0b121d, HUD_ALPHA.section).setOrigin(0);
    this.sectionObjective = scene.add.rectangle(0, 0, 100, 62, 0x0b121d, HUD_ALPHA.section).setOrigin(0);
    this.sectionAbilities = scene.add.rectangle(0, 0, 100, 92, 0x0b121d, HUD_ALPHA.section).setOrigin(0);

    this.hpGlow = scene.add.circle(0, 0, 12, 0xff5578, 0.2);
    this.hpIconV = scene.add.rectangle(0, 0, 4, 14, 0xff7f98, 1);
    this.hpIconH = scene.add.rectangle(0, 0, 14, 4, 0xff7f98, 1);

    this.healthTrack = scene.add.rectangle(0, 0, 220, 14, 0x2a0a12, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x6f2735, 0.8);
    this.healthFill = scene.add.rectangle(0, 0, 220, 10, 0xff5578, 1).setOrigin(0, 0.5);
    this.healthReadyShine = scene.add.rectangle(0, 0, 34, 10, 0xffffff, 0.17).setOrigin(0, 0.5);
    this.healthValue = scene.add.text(0, 0, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#ffd9e2' }).setOrigin(1, 0.5);

    this.enGlow = scene.add.circle(0, 0, 12, 0x42f2ff, 0.16);
    this.enBolt = scene.add.polygon(0, 0, [
      -3, -10,
      2, -10,
      -1, -2,
      5, -2,
      -2, 10,
      1, 2,
      -5, 2
    ], 0x6cf6ff, 0.98).setStrokeStyle(1, 0xe8fdff, 0.9);
    this.energyTrack = scene.add.rectangle(0, 0, 220, 14, 0x0a2435, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x1f5f84, 0.8);
    this.energyFill = scene.add.rectangle(0, 0, 220, 10, 0x42f2ff, 1).setOrigin(0, 0.5);
    this.energyValue = scene.add.text(0, 0, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#d5fbff' }).setOrigin(1, 0.5);

    this.statsLabelLevel = scene.add.text(0, 0, 'LEVEL', { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#86abc8' });
    this.statsValueLevel = scene.add.text(0, 0, '1', { fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#baf7ff' });
    this.statsLabelEnemies = scene.add.text(0, 0, 'ENEMIES', { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#9e9dd6' });
    this.statsValueEnemies = scene.add.text(0, 0, '0', { fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#ffe19a' });
    this.statsLabelCredits = scene.add.text(0, 0, 'CREDITS', { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#b0b08c' });
    this.statsValueCredits = scene.add.text(0, 0, '0', { fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#fff080' });

    this.phaseBadge = scene.add.rectangle(0, 0, 150, 24, 0x103243, HUD_ALPHA.phaseBadge).setOrigin(0, 0.5).setStrokeStyle(1, 0x5de7ff, 0.85);
    this.phaseText = scene.add.text(0, 0, 'PRE-PLANT', { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#8ef2ff' }).setOrigin(0.5);
    this.objectiveText = scene.add.text(0, 0, 'NO ACTIVE CHARGE', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '16px',
      color: '#def6ff'
    });

    this.buffTitle = scene.add.text(0, 0, 'BUFFS', { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#9fd0ff' });
    this.buffText = scene.add.text(0, 0, 'NONE', { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#cce8ff' });

    this.warning = scene.add.text(0, -42, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '34px',
      color: '#ff4c68',
      stroke: '#22020a',
      strokeThickness: 6
    }).setOrigin(0.5, 0);
    this.warning.setPosition(scene.scale.width / 2, 4).setScrollFactor(0).setDepth(1001);

    for (const slot of [
      { id: 'fence', keybind: 'Q', icon: '⛔', label: 'FENCE' },
      { id: 'turret', keybind: 'F', icon: '⌖', label: 'TURRET' },
      { id: 'mine', keybind: 'R', icon: '✹', label: 'MINE' },
      { id: 'shield', keybind: 'MMB', icon: '◉', label: 'SHIELD' }
    ] as const) {
      const slotRoot = scene.add.container(0, 0);
      const slotBg = scene.add.rectangle(0, 0, 132, 54, 0x0d1724, HUD_ALPHA.ability).setOrigin(0).setStrokeStyle(1, 0x3a8fad, 0.65);
      const keyText = scene.add.text(0, 0, slot.keybind, { fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#c4f3ff' });
      const iconText = scene.add.text(0, 0, slot.icon, { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#82f6ff' });
      const labelText = scene.add.text(0, 0, slot.label, { fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#95d7f0' });
      const statusText = scene.add.text(0, 0, 'READY', { fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#92ffcc' });
      const overlay = scene.add.rectangle(0, 0, 132, 54, 0x05080e, 0).setOrigin(0);

      slotRoot.add([slotBg, keyText, iconText, labelText, statusText, overlay]);
      this.abilitySlots.set(slot.id, {
        root: slotRoot,
        bg: slotBg,
        keyText,
        iconText,
        labelText,
        statusText,
        overlay
      });
      this.lastAbilityReady.set(slot.id, false);
    }

    this.root.add([
      this.panelGlow,
      this.panel,
      this.sectionResources,
      this.sectionStats,
      this.sectionObjective,
      this.sectionAbilities,
      this.hpGlow,
      this.hpIconV,
      this.hpIconH,
      this.healthTrack,
      this.healthFill,
      this.healthReadyShine,
      this.healthValue,
      this.enGlow,
      this.enBolt,
      this.energyTrack,
      this.energyFill,
      this.energyValue,
      this.statsLabelLevel,
      this.statsValueLevel,
      this.statsLabelEnemies,
      this.statsValueEnemies,
      this.statsLabelCredits,
      this.statsValueCredits,
      this.phaseBadge,
      this.phaseText,
      this.objectiveText,
      ...Array.from(this.abilitySlots.values()).map((s) => s.root),
      this.buffTitle,
      this.buffText
    ]);

    this.layout(scene.scale.width, scene.scale.height);
    this.scene.scale.on('resize', this.onResize, this);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.layout(size.width, size.height);
    this.warning.setPosition(size.width / 2, 4);
  }

  private layout(width: number, _height: number): void {
    this.scaleFactor = Phaser.Math.Clamp(width / 1366, 0.9, 1.22);
    const fontScale = Phaser.Math.Clamp(width / 1366, 0.92, 1.2);
    const viewportHeight = _height;
    const horizontalMargin = Phaser.Math.Clamp(width * 0.02, 24, 40);
    const topMargin = Phaser.Math.Clamp(viewportHeight * 0.024, 18, 30);
    const p = Math.round(12 * this.scaleFactor);
    const gapSection = Math.round(8 * this.scaleFactor);
    const sectionInner = Math.round(9 * this.scaleFactor);

    this.panelWidth = Math.floor(Math.min(width - horizontalMargin * 2, 1840));
    this.panelHeight = Math.round(Phaser.Math.Clamp(viewportHeight * 0.16, 136, 165));
    this.root.setPosition(Math.round((width - this.panelWidth) / 2), Math.round(topMargin));

    this.healthValue.setFontSize(Math.round(16 * fontScale));
    this.energyValue.setFontSize(Math.round(16 * fontScale));
    this.statsLabelLevel.setFontSize(Math.round(13 * fontScale));
    this.statsValueLevel.setFontSize(Math.round(20 * fontScale));
    this.statsLabelEnemies.setFontSize(Math.round(13 * fontScale));
    this.statsValueEnemies.setFontSize(Math.round(20 * fontScale));
    this.statsLabelCredits.setFontSize(Math.round(13 * fontScale));
    this.statsValueCredits.setFontSize(Math.round(20 * fontScale));
    this.phaseText.setFontSize(Math.round(14 * fontScale));
    this.objectiveText.setFontSize(Math.round(16 * fontScale));
    this.buffTitle.setFontSize(Math.round(13 * fontScale));
    this.buffText.setFontSize(Math.round(15 * fontScale));

    this.panelGlow.setDisplaySize(this.panelWidth, this.panelHeight);
    this.panel.setDisplaySize(this.panelWidth, this.panelHeight);

    const contentWidth = this.panelWidth - p * 2 - gapSection * 3;
    const resourcesWidth = Math.floor(contentWidth * 0.37);
    const statsWidth = Math.floor(contentWidth * 0.16);
    const objectiveWidth = Math.floor(contentWidth * 0.2);
    const abilitiesWidth = contentWidth - resourcesWidth - statsWidth - objectiveWidth;
    const sectionHeight = this.panelHeight - p * 2;

    let x = p;
    this.sectionResources.setPosition(x, p).setDisplaySize(resourcesWidth, sectionHeight);
    x += resourcesWidth + gapSection;
    this.sectionStats.setPosition(x, p).setDisplaySize(statsWidth, sectionHeight);
    x += statsWidth + gapSection;
    this.sectionObjective.setPosition(x, p).setDisplaySize(objectiveWidth, sectionHeight);
    x += objectiveWidth + gapSection;
    this.sectionAbilities.setPosition(x, p).setDisplaySize(abilitiesWidth, sectionHeight);

    const secW = this.sectionResources.displayWidth;
    const barX = this.sectionResources.x + sectionInner + 22;
    const barY1 = this.sectionResources.y + Math.round(sectionHeight * 0.35);
    const barY2 = this.sectionResources.y + Math.round(sectionHeight * 0.68);
    const barW = Math.max(110, Math.floor(secW - sectionInner * 2 - 110));

    this.hpGlow.setPosition(this.sectionResources.x + sectionInner + 8, barY1);
    this.hpIconV.setPosition(this.sectionResources.x + sectionInner + 8, barY1);
    this.hpIconH.setPosition(this.sectionResources.x + sectionInner + 8, barY1);
    this.healthTrack.setPosition(barX, barY1).setDisplaySize(barW, Math.round(14 * this.scaleFactor));
    this.healthFill.setPosition(barX, barY1).setDisplaySize(barW, Math.round(10 * this.scaleFactor));
    this.healthReadyShine.setPosition(barX, barY1).setDisplaySize(Math.max(16, Math.round(34 * this.scaleFactor)), Math.round(10 * this.scaleFactor));
    this.healthValue.setPosition(this.sectionResources.x + secW - sectionInner, barY1);

    this.enGlow.setPosition(this.sectionResources.x + sectionInner + 8, barY2);
    this.enBolt.setPosition(this.sectionResources.x + sectionInner + 8, barY2);
    this.energyTrack.setPosition(barX, barY2).setDisplaySize(barW, Math.round(14 * this.scaleFactor));
    this.energyFill.setPosition(barX, barY2).setDisplaySize(barW, Math.round(10 * this.scaleFactor));
    this.energyValue.setPosition(this.sectionResources.x + secW - sectionInner, barY2);

    const statY = this.sectionStats.y + Math.round(sectionHeight * 0.25);
    const statW = Math.floor((this.sectionStats.displayWidth - sectionInner * 2) / 3);
    const statX = this.sectionStats.x + sectionInner;

    this.statsLabelLevel.setPosition(statX, statY);
    this.statsValueLevel.setPosition(statX, statY + Math.round(18 * this.scaleFactor));
    this.statsLabelEnemies.setPosition(statX + statW, statY);
    this.statsValueEnemies.setPosition(statX + statW, statY + Math.round(18 * this.scaleFactor));
    this.statsLabelCredits.setPosition(statX + statW * 2, statY);
    this.statsValueCredits.setPosition(statX + statW * 2, statY + Math.round(18 * this.scaleFactor));

    const objX = this.sectionObjective.x + sectionInner;
    const objY = this.sectionObjective.y + Math.round(sectionHeight * 0.2);
    this.phaseBadge.setPosition(objX, objY + Math.round(11 * this.scaleFactor)).setDisplaySize(Math.max(140, Math.round(168 * this.scaleFactor)), Math.round(23 * this.scaleFactor));
    this.phaseText.setPosition(this.phaseBadge.x + this.phaseBadge.displayWidth / 2, this.phaseBadge.y);
    this.objectiveText.setPosition(objX, objY + Math.round(32 * this.scaleFactor));
    this.objectiveText.setWordWrapWidth(this.sectionObjective.displayWidth - sectionInner * 2, true);

    const slotsStartX = this.sectionAbilities.x + sectionInner;
    const slotsStartY = this.sectionAbilities.y + sectionInner;
    const slotGap = Math.round(6 * this.scaleFactor);
    const slotW = Math.floor((this.sectionAbilities.displayWidth - sectionInner * 2 - slotGap * 3) / 4);
    const slotHeight = Math.round(Phaser.Math.Clamp(sectionHeight * 0.56, 54, 68));
    let i = 0;
    for (const slot of ['fence', 'turret', 'mine', 'shield'] as const) {
      const visual = this.abilitySlots.get(slot);
      if (!visual) continue;
      const sx = slotsStartX + i * (slotW + slotGap);
      const sy = slotsStartY;
      visual.root.setPosition(sx, sy);
      visual.bg.setDisplaySize(slotW, slotHeight);
      visual.overlay.setDisplaySize(slotW, slotHeight);
      visual.keyText.setPosition(8, 4).setFontSize(Math.round(12 * fontScale));
      visual.iconText.setPosition(slotW - Math.round(18 * this.scaleFactor), 4).setFontSize(Math.round(17 * fontScale));
      visual.labelText.setPosition(8, Math.round(20 * this.scaleFactor)).setFontSize(Math.round(12 * fontScale));
      visual.statusText.setPosition(8, Math.round(36 * this.scaleFactor)).setFontSize(Math.round(12 * fontScale));
      i += 1;
    }

    const buffsY = Math.min(
      slotsStartY + slotHeight + Math.round(7 * this.scaleFactor),
      this.sectionAbilities.y + sectionHeight - Math.round(20 * this.scaleFactor)
    );
    this.buffTitle.setPosition(this.sectionAbilities.x + sectionInner, buffsY);
    this.buffText.setPosition(this.sectionAbilities.x + sectionInner + Math.round(52 * this.scaleFactor), buffsY);
    this.buffText.setWordWrapWidth(this.sectionAbilities.displayWidth - Math.round(62 * this.scaleFactor), true);
  }

  private formatCompactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 10_000) return value.toLocaleString();
    return `${value}`;
  }

  private formatCooldown(ms: number): string {
    if (ms <= 0) return 'READY';
    if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.ceil(ms / 1000)}s`;
  }

  update(payload: HudPayload): void {
    const hpRatio = Phaser.Math.Clamp(payload.hp / payload.maxHp, 0, 1);
    const enRatio = Phaser.Math.Clamp(payload.energy / payload.maxEnergy, 0, 1);
    this.displayedHealthRatio = Phaser.Math.Linear(this.displayedHealthRatio, hpRatio, 0.22);
    this.displayedEnergyRatio = Phaser.Math.Linear(this.displayedEnergyRatio, enRatio, 0.2);

    this.healthFill.displayWidth = Math.max(0, this.healthTrack.displayWidth * this.displayedHealthRatio);
    this.energyFill.displayWidth = Math.max(0, this.energyTrack.displayWidth * this.displayedEnergyRatio);

    const shineMax = Math.max(0, this.healthFill.displayWidth - this.healthReadyShine.displayWidth);
    this.healthReadyShine.x = this.healthTrack.x + Phaser.Math.Clamp(shineMax * 0.7, 0, shineMax);

    this.healthValue.setText(`${Math.max(0, Math.round(payload.hp))} / ${Math.max(1, Math.round(payload.maxHp))}`);
    const energy = Math.max(0, payload.energy);
    const energyText = Number.isInteger(energy) ? energy.toFixed(0) : energy.toFixed(1);
    this.energyValue.setText(`${energyText} / ${Math.max(1, Math.round(payload.maxEnergy))}`);

    if (hpRatio <= 0.4) {
      if (!this.lowHealthPulse) {
        this.lowHealthPulse = this.scene.tweens.add({
          targets: [this.healthFill, this.hpGlow],
          alpha: { from: 1, to: 0.28 },
          duration: 180,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    } else {
      this.lowHealthPulse?.remove();
      this.lowHealthPulse = null;
      this.healthFill.setAlpha(1);
      this.hpGlow.setAlpha(0.2);
    }

    this.statsValueLevel.setText(`${payload.level}`);
    this.statsValueEnemies.setText(this.formatCompactNumber(Math.max(0, payload.enemies)));
    this.statsValueCredits.setText(this.formatCompactNumber(Math.max(0, payload.credits)));

    const phaseColorMap: Record<string, { fill: number; border: number; text: string }> = {
      'PRE-PLANT': { fill: 0x103243, border: 0x5de7ff, text: '#8ef2ff' },
      PLANTING: { fill: 0x43330e, border: 0xf1ca5a, text: '#ffe591' },
      'CHARGE ARMED': { fill: 0x3b193d, border: 0xff79df, text: '#ffd0f7' },
      DEFEND: { fill: 0x3b193d, border: 0xff79df, text: '#ffd0f7' },
      DEFENSE: { fill: 0x3b193d, border: 0xff79df, text: '#ffd0f7' },
      'DEFUSE ALERT': { fill: 0x4a141f, border: 0xff5b70, text: '#ffd6dc' },
      DEFUSING: { fill: 0x4a141f, border: 0xff5b70, text: '#ffd6dc' },
      'SITE DESTROYED': { fill: 0x133f33, border: 0x7cffa4, text: '#ceffe0' },
      'ROUND COMPLETE': { fill: 0x133f33, border: 0x7cffa4, text: '#ceffe0' },
      VICTORY: { fill: 0x133f33, border: 0x7cffa4, text: '#ceffe0' },
      'MISSION FAILURE': { fill: 0x4a1016, border: 0xff596e, text: '#ffd8de' },
      DEFEAT: { fill: 0x4a1016, border: 0xff596e, text: '#ffd8de' },
      PAUSED: { fill: 0x2a2f39, border: 0xa8c7db, text: '#e9f7ff' }
    };
    const phaseStyle = phaseColorMap[payload.phase] ?? phaseColorMap['PRE-PLANT'];
    this.phaseBadge.setFillStyle(phaseStyle.fill, HUD_ALPHA.phaseBadge).setStrokeStyle(1, phaseStyle.border, 0.92);
    this.phaseText.setColor(phaseStyle.text).setText(payload.phase);

    this.objectiveText.setText(payload.objective);
    if (payload.bombUrgent) {
      this.objectiveText.setColor('#ff9daf');
    } else {
      this.objectiveText.setColor('#def6ff');
    }

    if (payload.defuseAlert) {
      if (!this.defusePulse) {
        this.defusePulse = this.scene.tweens.add({
          targets: this.phaseBadge,
          alpha: { from: 1, to: 0.5 },
          duration: 220,
          yoyo: true,
          repeat: -1
        });
      }
    } else {
      this.defusePulse?.remove();
      this.defusePulse = null;
      this.phaseBadge.setAlpha(1);
    }

    for (const slot of payload.abilities) {
      const visual = this.abilitySlots.get(slot.id);
      if (!visual) continue;

      const cooldownMs = slot.cooldownMs <= COOLDOWN_READY_EPSILON_MS ? 0 : slot.cooldownMs;
      const coolingDown = cooldownMs > 0;
      const ready = !coolingDown && slot.hasEnergy && slot.underLimit;
      const prevReady = this.lastAbilityReady.get(slot.id) ?? false;
      this.lastAbilityReady.set(slot.id, ready);

      let status = this.formatCooldown(cooldownMs);
      if (slot.active) status = 'ACTIVE';
      else if (ready) status = 'READY';
      else if (!slot.hasEnergy) status = 'NO EN';
      else if (!slot.underLimit) status = 'MAX';

      visual.statusText.setText(status);
      visual.overlay.setAlpha(coolingDown || !slot.hasEnergy || !slot.underLimit ? HUD_ALPHA.disabledOverlay : 0);
      visual.bg.setStrokeStyle(1, slot.selected ? 0xff7de5 : ready ? 0x6dffb8 : 0x3a8fad, slot.selected ? 1 : 0.75);
      visual.statusText.setColor(
        ready ? '#9bffc9' : coolingDown ? '#d8ebff' : !slot.hasEnergy ? '#ffb2be' : '#ffdba3'
      );

      if (!prevReady && ready) {
        this.scene.tweens.add({
          targets: visual.bg,
          alpha: { from: 0.7, to: 1 },
          duration: 170,
          yoyo: true,
          repeat: 1
        });
      }
    }

    if (payload.buffs.length === 0) {
      this.buffText.setText('NONE');
      return;
    }

    const visibleBuffs = payload.buffs.slice(0, 2);
    const extra = payload.buffs.length - visibleBuffs.length;
    const suffix = extra > 0 ? `  +${extra}` : '';
    this.buffText.setText(`${visibleBuffs.join('  |  ')}${suffix}`);
  }

  setWarning(msg: string): void {
    this.warning.setText(msg);
    this.warning.setAlpha(msg.length > 0 ? 1 : 0);
  }

  destroy(): void {
    this.scene.scale.off('resize', this.onResize, this);
    this.lowHealthPulse?.remove();
    this.lowHealthPulse = null;
    this.defusePulse?.remove();
    this.defusePulse = null;
    this.root.destroy(true);
    this.warning.destroy();
  }
}
