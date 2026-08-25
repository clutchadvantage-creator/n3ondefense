import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys.ts';
import type { SupremeMilestoneKind } from '../progression/SupremeRoundTransition.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { configureSceneUiNavigation } from '../input/UiNavigationController.ts';
import { createButton, disableButton } from '../utils/ui.ts';

export interface SupremeMilestoneSceneData {
  kind: SupremeMilestoneKind;
}

interface RuleCard {
  title: string;
  detail: string;
  color: number;
  css: string;
}

const RULES: readonly RuleCard[] = [
  { title: 'SUPREME OVERDRIVE ONLY', detail: 'Supreme Mods remain offline in Normal and Regular Overdrive.', color: 0xff62d5, css: '#ff8de4' },
  { title: 'UNIVERSAL SLOT', detail: 'A Supreme Mod may occupy any Mod slot during Supreme Overdrive.', color: 0x56efff, css: '#8ff7ff' },
  { title: 'MAXIMUM 2 ACTIVE', detail: 'Up to two Supreme Mods may be active in the same loadout.', color: 0x8affbb, css: '#a1ffca' }
];

export class SupremeMilestoneScene extends Phaser.Scene {
  private presentation: SupremeMilestoneSceneData | null = null;
  private transitioning = false;
  private continueButton: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SceneKeys.SupremeMilestone);
  }

  create(data?: SupremeMilestoneSceneData): void {
    this.presentation = data?.kind ? data : null;
    this.transitioning = false;
    if (!this.presentation) {
      this.scene.start(this.registry.has('round-finished') ? SceneKeys.RoundFinished : SceneKeys.MainMenu);
      return;
    }
    if (this.presentation.kind === 'first-supreme'
      || this.presentation.kind === 'overdrive-unlocked-first-supreme') {
      SaveSystem.markFirstSupremeTutorialSeen();
    }

    this.drawPresentation();
    configureSceneUiNavigation(this, { onBack: () => this.continueToDebrief() });
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
      this.continueButton = null;
    });
  }

  private drawPresentation(): void {
    if (!this.presentation) return;
    const { width, height } = this.scale;
    const compact = width < 900 || height < 720;
    const unlocked = this.presentation.kind !== 'first-supreme';
    const firstSupreme = this.presentation.kind !== 'overdrive-unlocked';
    const panelWidth = Phaser.Math.Clamp(width - (compact ? 32 : 120), 620, 1080);
    const panelHeight = Phaser.Math.Clamp(height - (compact ? 34 : 80), 610, 880);
    const left = (width - panelWidth) * 0.5;
    const top = (height - panelHeight) * 0.5;
    const centerX = width * 0.5;

    this.cameras.main.setBackgroundColor('#02050a');
    this.add.rectangle(centerX, height * 0.5, width, height, 0x02050a, 1);
    this.add.grid(centerX, height * 0.5, width, height, compact ? 38 : 52, compact ? 38 : 52, 0x06101a, 0.2, 0x176278, 0.13);
    const leftGlow = this.add.circle(width * 0.1, height * 0.72, compact ? 90 : 145, 0x54ecff, 0.035)
      .setStrokeStyle(2, 0x54ecff, 0.18);
    const rightGlow = this.add.circle(width * 0.9, height * 0.26, compact ? 80 : 128, 0xff58cf, 0.035)
      .setStrokeStyle(2, 0xff58cf, 0.2);
    this.tweens.add({ targets: [leftGlow, rightGlow], scale: { from: 0.94, to: 1.06 }, alpha: { from: 0.35, to: 0.78 }, duration: 2300, yoyo: true, repeat: -1 });

    const panel = this.add.rectangle(centerX, top + panelHeight * 0.5, panelWidth, panelHeight, 0x07131e, 0.98)
      .setStrokeStyle(2, 0x61efff, 0.72);
    this.add.rectangle(centerX, top + 6, panelWidth - 34, 4, 0xff63d6, 0.8);
    this.add.rectangle(left + 9, top + panelHeight * 0.5, 3, panelHeight - 40, 0xff63d6, 0.56);
    this.add.rectangle(left + panelWidth - 9, top + panelHeight * 0.5, 3, panelHeight - 40, 0x61efff, 0.56);

    const eyebrow = unlocked ? 'N3ON PROTOCOL // CONSTELLATION CLEARANCE' : 'N3ON ARCHIVE // FIRST SUPREME RECOVERY';
    this.add.text(centerX, top + (compact ? 22 : 30), eyebrow, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 14 : 18}px`, color: '#78dce9', fontStyle: 'bold', letterSpacing: 2
    }).setOrigin(0.5, 0);

    const title = unlocked ? 'OVERDRIVE COMPLETE' : 'SUPREME MOD ACQUIRED';
    this.add.text(centerX, top + (compact ? 48 : 62), title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(width * 0.04, compact ? 26 : 34, 54)}px`,
      color: unlocked ? '#75f5ff' : '#f1ffff', fontStyle: 'bold', align: 'center',
      shadow: { color: unlocked ? '#45dfff' : '#ff68da', blur: 12, fill: true }
    }).setOrigin(0.5, 0);

    const subtitleY = top + (compact ? 94 : 126);
    if (unlocked) {
      this.add.text(centerX, subtitleY, 'SUPREME OVERDRIVE UNLOCKED', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 20 : 30}px`, color: '#ff83df', fontStyle: 'bold', letterSpacing: 1
      }).setOrigin(0.5, 0);
    }

    const intro = unlocked
      ? `We expected no less from an operative of your caliber.\nRegular Overdrive has been conquered.${firstSupreme ? '\nYour first Supreme Mod is secured in the Mod Collection.' : '\nYour Supreme Mods are now cleared for deployment.'}`
      : 'You have recovered your first Supreme Mod.\nSupreme Mods are powerful cross-system modifications that affect multiple parts of a build at once.';
    const introY = unlocked ? subtitleY + (compact ? 39 : 54) : subtitleY;
    this.add.text(centerX, introY, intro, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 16 : 21}px`, color: '#d7eff6',
      fontStyle: 'bold', align: 'center', lineSpacing: compact ? 2 : 5,
      wordWrap: { width: panelWidth - 90, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const rulesTop = introY + (compact ? (unlocked ? 86 : 92) : (unlocked ? 126 : 120));
    const horizontalRules = panelWidth >= 800;
    const ruleGap = compact ? 10 : 16;
    const ruleWidth = horizontalRules ? (panelWidth - 72 - ruleGap * 2) / 3 : panelWidth - 70;
    const ruleHeight = horizontalRules ? (compact ? 112 : 142) : (compact ? 74 : 92);
    RULES.forEach((rule, index) => {
      const x = horizontalRules ? left + 36 + ruleWidth * 0.5 + index * (ruleWidth + ruleGap) : centerX;
      const y = horizontalRules ? rulesTop + ruleHeight * 0.5 : rulesTop + ruleHeight * 0.5 + index * (ruleHeight + ruleGap);
      this.add.rectangle(x, y, ruleWidth, ruleHeight, 0x091b27, 0.96).setStrokeStyle(1.5, rule.color, 0.62);
      this.add.rectangle(x, y - ruleHeight * 0.5 + 4, ruleWidth - 18, 3, rule.color, 0.7);
      this.add.text(x, y - ruleHeight * 0.25, rule.title, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 12 : 15}px`, color: rule.css, fontStyle: 'bold', align: 'center'
      }).setOrigin(0.5);
      this.add.text(x, y + ruleHeight * 0.12, rule.detail, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 13 : 17}px`, color: '#bcdbe5', align: 'center', lineSpacing: 1,
        wordWrap: { width: ruleWidth - 26, useAdvancedWrap: true }
      }).setOrigin(0.5);
    });

    const footer = unlocked
      ? 'ROUND 51 BEGINS SUPREME OVERDRIVE // PREPARE YOUR LOADOUT'
      : 'STORED SAFELY // COMPLETE REGULAR OVERDRIVE TO AUTHORIZE ACTIVATION';
    const buttonY = top + panelHeight - (compact ? 44 : 58);
    this.add.text(centerX, buttonY - (compact ? 54 : 68), footer, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 13 : 17}px`, color: unlocked ? '#9effc6' : '#ffc975', fontStyle: 'bold', letterSpacing: 1,
      align: 'center', wordWrap: { width: panelWidth - 80, useAdvancedWrap: true }
    }).setOrigin(0.5);
    this.continueButton = createButton(this, centerX, buttonY, 'CONTINUE', () => this.continueToDebrief(), compact ? 250 : 320, 'menu', {
      height: compact ? 46 : 56,
      fontSize: compact ? 17 : 21,
      focusDefaultPriority: 100
    });

    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 280, ease: 'Sine.easeOut' });
    this.cameras.main.flash(180, 90, 230, 255, false);
  }

  private continueToDebrief(): boolean {
    if (this.transitioning) return false;
    this.transitioning = true;
    if (this.continueButton) disableButton(this.continueButton);
    this.registry.remove('supreme-milestone');
    this.scene.start(SceneKeys.RoundFinished);
    return true;
  }

  private readonly handleResize = (): void => {
    if (this.presentation) this.scene.restart(this.presentation);
  };
}
