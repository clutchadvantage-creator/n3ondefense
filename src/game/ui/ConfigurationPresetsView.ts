import Phaser from 'phaser';
import { COSMETICS } from '../../data/cosmetics.ts';
import { showPresetNameDialog, showPresetIssuesDialog } from '../../ui/PresetNameDialog.ts';
import { createCosmeticPreview } from '../cosmetics/CosmeticPreview.ts';
import { MOD_FOCUS_LABELS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import { registerUiFocusable } from '../input/UiNavigationController.ts';
import { GARAGE_MOD_SLOTS } from '../garage/GarageState.ts';
import type { GaragePreset } from '../garage/types.ts';
import { MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_RARITY_COLORS } from '../mods/ModCardView.ts';
import { RUN_PROTOCOLS } from '../mods/modBalance.ts';
import { formatOperationsMode } from '../progression/OperationsConfiguration.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { createButton, disableButton } from '../utils/ui.ts';
import { createTerminalPanel } from './TerminalChrome.ts';

export const createConfigurationPresetsView = (scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  onLoaded: () => void): void => {
  const { width, height } = scene.scale;
  const short = height < 650;
  const compact = width < 1000 || short;
  const columns = compact ? 1 : 3;
  const panelWidth = Math.min(compact ? 560 : 490, (width - 56 - (columns - 1) * 18) / columns);
  const panelHeight = Math.min(760, height - 142);
  const roomy = panelWidth >= 440;
  const content = scene.add.container(0, 0).setName('configuration-preset-cards'); parent.add(content);
  let page = 0;
  let section: 'deployment' | 'mods' | 'cosmetics' = 'deployment';
  let notice = 'SAVE A COMPLETE OPERATOR SETUP // 3 PROFILE SLOTS';
  let failed = false;
  let dialog: { destroy(): void } | null = null;
  content.once('destroy', () => dialog?.destroy());
  const text = (root: Phaser.GameObjects.Container, x: number, y: number, value: string, size = 14, color = '#c8e4ee', center = false) => {
    const label = scene.add.text(x, y, value, { fontFamily: 'Rajdhani, sans-serif', fontSize: `${size}px`, color,
      fontStyle: 'bold', wordWrap: { width: panelWidth - 34, useAdvancedWrap: true } }).setOrigin(center ? 0.5 : 0, 0);
    root.add(label); return label;
  };
  const edit = (preset: GaragePreset, rename: boolean): void => {
    dialog?.destroy();
    dialog = showPresetNameDialog(scene, {
      name: preset.name, overwrite: preset.saved && !rename, rename,
      submit: name => {
        const result = rename ? SaveSystem.renameGaragePreset(preset.id, name)
          : SaveSystem.saveGaragePreset(preset.id, { name, overwriteConfirmed: preset.saved });
        notice = result.message ?? ''; failed = !result.ok; return result;
      }, complete: () => { dialog = null; render(); }
    });
  };
  const render = (): void => {
    content.removeAll(true);
    const presets = SaveSystem.getGarageState().presets;
    const mods = SaveSystem.getModCollection();
    const status = text(content, width / 2, 66, notice, width < 760 ? 12 : 15, failed ? '#ffafbf' : '#8cddcc', true);
    status.setWordWrapWidth(width - 80, true).setMaxLines(2).setName('configuration-status');
    const visible = compact ? presets.slice(page, page + 1) : presets;
    visible.forEach((preset, index) => {
      const state = SaveSystem.getGaragePresetState(preset.id);
      const accent = state.issues.length ? 0xff829e : state.status === 'active' ? 0x74ffb2 : state.status === 'modified' ? 0xffb45f : 0x55eaff;
      const x = (width - (panelWidth * columns + (columns - 1) * 18)) / 2 + index * (panelWidth + 18);
      const card = createTerminalPanel(scene, content, { x, y: 102, width: panelWidth, height: panelHeight }, accent).setName(`preset-${preset.id}`);
      text(card, 17, 12, `CONFIGURATION ${presets.indexOf(preset) + 1} / 3`, 11, '#94b6c7');
      const name = text(card, 17, 31, preset.name, panelWidth < 330 ? 20 : 25, '#e5fbff');
      name.setWordWrapWidth(0);
      name.setScale(Math.min(1, (panelWidth - 34) / name.width));
      text(card, 17, 62, !preset.saved ? 'EMPTY // READY TO SAVE' : state.issues.length ? 'VALIDATION REQUIRED'
        : state.status === 'saved' ? 'SAVED CONFIGURATION' : `${preset.name} // ${state.status.toUpperCase()}`, 13,
      Phaser.Display.Color.IntegerToColor(accent).rgba).setMaxLines(1);
      if (preset.saved) {
        if (short) {
          const tabWidth = (panelWidth - 44) / 3;
          (['deployment', 'mods', 'cosmetics'] as const).forEach((tab, index) => {
            card.add(createButton(scene, 16 + (index + 0.5) * tabWidth + index * 4, 93, tab.toUpperCase(), () => { section = tab; render(); }, tabWidth,
              'menu', { height: 24, fontSize: 12, focusId: `${preset.id}-section-${tab}`, accent: section === tab ? 0x74ffb2 : 0x577383 }));
          });
        }
        const deploymentOffset = short ? 29 : 0;
        if (!short || section === 'deployment') {
        const mode = preset.protocol ? RUN_PROTOCOLS[preset.protocol]?.family : null;
        const start = preset.campaignStartRound ?? preset.normalStartRound;
        text(card, 17, 86 + deploymentOffset, `${mode ? formatOperationsMode(mode) : 'CURRENT MODE'} // ${start ? `ROUND ${start}` : 'LEGACY CHECKPOINT'}`, roomy ? 21 : 17, '#b8f6ff');
        text(card, 17, 111 + deploymentOffset, `CONTRACT // ${preset.contract ? RUN_CONTRACTS[preset.contract]?.label ?? 'UNAVAILABLE' : 'NONE'}`, roomy ? 17 : 14);
        text(card, 17, 131 + deploymentOffset, `SIGNAL // ${preset.modFocus ? MOD_FOCUS_LABELS[preset.modFocus] ?? 'UNAVAILABLE' : 'NONE'}`, roomy ? 17 : 14);
        const cost = getRunSetupCost({ contract: preset.contract, modFocus: preset.modFocus });
        text(card, 17, 151 + deploymentOffset, `${cost.toLocaleString()} CR / RUN  //  ${preset.savedDeploymentEnabled ? 'RETAINED' : 'ONE RUN'}`, roomy ? 15 : 12, '#ffd194');
        }
        const rowHeight = short ? Math.max(20, (panelHeight - 216) / 5) : Phaser.Math.Clamp((panelHeight - 390) / 5, 30, 62);
        if (!short || section === 'mods') {
        GARAGE_MOD_SLOTS.forEach((slot, slotIndex) => {
          const y = (short ? 108 : 180) + slotIndex * rowHeight;
          const instance = mods.cards.find(item => item.instanceId === preset.cardSlots[slot]);
          const definition = instance && MOD_BY_ID.get(instance.modId);
          const rarity = definition ? MOD_RARITY_COLORS[definition.rarity] : 0x577383;
          card.add(scene.add.rectangle(16, y, panelWidth - 32, rowHeight - 4, rarity, 0.065).setOrigin(0).setStrokeStyle(1, rarity, 0.35));
          text(card, 24, y + 5, definition?.icon ?? (preset.cardSlots[slot] ? '!' : '—'), Math.min(27, rowHeight - 8), Phaser.Display.Color.IntegerToColor(rarity).rgba);
          const titleSize = short ? 14 : rowHeight < 36 ? 13 : rowHeight < 48 ? 15 : roomy ? 20 : 15;
          const title = text(card, 59, y + (rowHeight < 36 && !short ? 1 : 3), (definition?.name ?? (preset.cardSlots[slot] ? 'MISSING MOD' : 'EMPTY SLOT')) + (short && instance ? ` // R${instance.upgradeLevel}${instance.infusionId ? ' + INFUSION' : ''}` : ''), titleSize, definition ? '#e8f5fa' : '#91afbf');
          title.setWordWrapWidth(panelWidth - 78, true).setMaxLines(1);
          if (!short) text(card, 59, y + (rowHeight < 36 ? 15 : rowHeight < 48 ? 21 : 30), `${slot.toUpperCase()}${instance ? ` // RANK ${instance.upgradeLevel}` : ''}${instance?.infusionId ? ' // INFUSED' : ''}`, roomy && rowHeight >= 48 ? 13 : 10,
            instance?.infusionId ? '#f4b2e6' : '#95b6c6');
        });
        }
        if (!short || section === 'cosmetics') {
        const cosmeticsTop = short ? 116 : 186 + rowHeight * 5;
        const equipment = Object.entries(preset.cosmetics ?? {});
        text(card, 17, cosmeticsTop, equipment.length ? `COSMETIC EQUIPMENT // ${equipment.length} LINKED` : 'LEGACY // CURRENT COSMETICS RETAINED', 12, '#eeace0');
        equipment.forEach(([category, id], cosmeticIndex) => {
          const item = COSMETICS.find(entry => entry.id === id && entry.category === category);
          const cellWidth = (panelWidth - 32) / 5;
          const cx = 16 + (cosmeticIndex % 5 + 0.5) * cellWidth;
          const cellHeight = roomy ? 38 : 27;
          const cy = cosmeticsTop + (roomy ? 42 : 32) + Math.floor(cosmeticIndex / 5) * cellHeight;
          card.add(scene.add.rectangle(cx, cy, cellWidth - 5, cellHeight - 3, 0x090f1b, 0.8).setStrokeStyle(1, item ? 0xa775b9 : 0xff829e, 0.3));
          if (item) card.add(createCosmeticPreview(scene, item, cx, cy, { animate: false, maxWidth: roomy ? 32 : 23, maxHeight: roomy ? 30 : 21,
            operatorFrameId: preset.cosmetics?.playerShape, operativeColorId: preset.cosmetics?.playerColor,
            projectileShapeId: preset.cosmetics?.projectileShape }).container);
          else text(card, cx, cy - 9, '!', 16, '#ff829e', true);
          const hit = scene.add.rectangle(cx, cy, cellWidth - 5, cellHeight - 3, 0xffffff, 0.001).setInteractive();
          const show = () => status.setText(`${category.replace(/([A-Z])/g, ' $1').toUpperCase()} // ${item?.label ?? id}`);
          hit.on('pointerover', show).on('pointerout', () => status.setText(notice)).on('pointerdown', show);
          registerUiFocusable(scene, hit, { id: `${preset.id}-cosmetic-${category}`, label: `${category} ${item?.label ?? id}`, activate: show, group: `${preset.id}-cosmetics` });
          card.add(hit);
        });
        }
        if (!short) text(card, 17, panelHeight - 102, state.issues.length ? state.issues[0] : `UPDATED ${preset.savedAt ? new Date(preset.savedAt).toLocaleString() : 'LEGACY SAVE'}`, 12,
          state.issues.length ? '#ffafbf' : '#94b6c7').setMaxLines(2);
      } else {
        text(card, panelWidth / 2, panelHeight * 0.34, 'EMPTY CONFIGURATION SLOT', 20, '#b3d6e3', true);
        text(card, panelWidth / 2, panelHeight * 0.34 + 65, 'SAVE CURRENT WORKBENCH STATE TO BEGIN', 16, '#91b4c5', true);
        if (!short) text(card, panelWidth / 2, panelHeight * 0.34 + 127, '5 MOD SLOTS\nCOSMETICS\nMODE & CHECKPOINT\nCONTRACT & SIGNAL', 15, '#9ecee0', true).setLineSpacing(8);
      }
      const saveButton = createButton(scene, panelWidth / 2, panelHeight - 63, 'SAVE CURRENT CONFIG', () => edit(preset, false), panelWidth - 34,
        'menu', { height: 34, fontSize: 16, focusId: `${preset.id}-save`, accent: 0x55eaff });
      const actionWidth = (panelWidth - 44) / 2;
      const load = createButton(scene, 17 + actionWidth / 2, panelHeight - 23, 'LOAD CONFIG', () => {
        const result = SaveSystem.loadGaragePreset(preset.id); notice = result.message ?? ''; failed = !result.ok;
        if (result.ok) onLoaded();
        else {
          const issues = SaveSystem.getGaragePresetState(preset.id).issues;
          dialog?.destroy(); dialog = showPresetIssuesDialog(scene, issues.length ? issues : [notice]);
          notice = 'CONFIGURATION UNAVAILABLE // CURRENT SETUP UNCHANGED';
        }
        render(); return result.ok;
      }, actionWidth, 'menu', { height: 32, fontSize: 14, focusId: `${preset.id}-load`, accent: 0x74ffb2 });
      const rename = createButton(scene, panelWidth - 17 - actionWidth / 2, panelHeight - 23, 'RENAME', () => edit(preset, true), actionWidth,
        'menu', { height: 32, fontSize: 14, focusId: `${preset.id}-rename`, accent: 0xff65c8 });
      if (!preset.saved) { disableButton(load); disableButton(rename); }
      card.add([saveButton, load, rename]);
    });
    if (compact) {
      const y = height - 20;
      content.add(createButton(scene, width / 2 - 125, y, '<', () => { page = (page + 2) % 3; render(); }, 48, 'menu', { height: 28, focusId: 'preset-page-left', focusShortcut: 'page-left' }));
      content.add(createButton(scene, width / 2 + 125, y, '>', () => { page = (page + 1) % 3; render(); }, 48, 'menu', { height: 28, focusId: 'preset-page-right', focusShortcut: 'page-right' }));
      text(content, width / 2, y - 9, `CONFIGURATION ${page + 1} / 3`, 14, '#b8f6ff', true);
    }
  };
  render();
};
