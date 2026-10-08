import Phaser from 'phaser';
import { GameplayPickupPresentation, createGameplayModPickupVisual } from '../loot/GameplayPickupPresentation.ts';
import { MOD_DEFINITIONS } from '../mods/definitions.ts';
import type { WeeklyOperationReward } from '../progression/WeeklyOperations.ts';
import type { WeeklyFeaturedRewardView } from '../progression/WeeklyRewardCampaigns.ts';
import type { PickupType } from '../types.ts';
import { registerUiFocusable } from '../input/UiNavigationController.ts';

export interface WeeklyRewardEntry { id: string; name: string; amount: number; iconRef: string }
export const getWeeklyRewardEntries = (reward: WeeklyOperationReward): WeeklyRewardEntry[] => [
  { id: 'credits', name: 'CREDITS', amount: reward.credits, iconRef: 'pickup:credits' },
  { id: 'coreTokens', name: 'CORE TOKENS', amount: reward.coreTokens, iconRef: 'pickup:coreToken' },
  { id: 'plasmaChips', name: 'PLASMA CHIPS', amount: reward.plasmaChips ?? 0, iconRef: 'pickup:plasmaChip' },
  { id: 'fluxCores', name: 'FLUX CORES', amount: reward.fluxCores ?? 0, iconRef: 'pickup:fluxCore' },
  { id: 'randomMod', name: 'RANDOM MOD', amount: reward.randomMod ? 1 : 0, iconRef: 'mod:random' }
].filter(item => item.amount > 0);

export const getWeeklyRewardColumns = (reward: WeeklyOperationReward): number => getWeeklyRewardEntries(reward).length > 2 ? 3 : 2;
export const WEEKLY_CURRENCY_ROW_HEIGHT = 44;

/** Uses the same authored currency/Mod artwork as actual arena loot. Static
 * menu instances need no animation loop, asset load, or repeated decoding. */
const rewardIcon = (scene: Phaser.Scene, parent: Phaser.GameObjects.Container, iconRef: string, x: number, y: number): void => {
  if (iconRef.startsWith('pickup:')) {
    parent.add(new GameplayPickupPresentation(scene).create(iconRef.slice(7) as PickupType, x, y).setScale(0.52));
  } else if (iconRef.startsWith('mod:')) {
    const definition = MOD_DEFINITIONS.find(item => item.id === iconRef.slice(4)) ?? MOD_DEFINITIONS[0];
    const visual = createGameplayModPickupVisual(scene, definition, x, y);
    // Amount/name are rendered at menu size; omit the small world-space rarity caption.
    for (const child of visual.root.list) if (child instanceof Phaser.GameObjects.Text) child.setVisible(false);
    parent.add(visual.root.setScale(0.48));
  } else if (scene.textures.exists(iconRef)) {
    const image = scene.add.image(x, y, iconRef);
    image.setScale(24 / Math.max(image.width, image.height));
    parent.add(image);
  }
};

export const renderWeeklyCurrencyRewards = (scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  reward: WeeklyOperationReward, width: number, top: number): void => {
  const entries = getWeeklyRewardEntries(reward);
  const columns = getWeeklyRewardColumns(reward);
  const cellWidth = width / columns;
  entries.forEach((entry, index) => {
    const x = -width / 2 + index % columns * cellWidth;
    const y = top + Math.floor(index / columns) * WEEKLY_CURRENCY_ROW_HEIGHT;
    rewardIcon(scene, parent, entry.iconRef, x + 13, y + 14);
    parent.add(scene.add.text(x + 29, y, entry.amount.toLocaleString(), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: columns === 3 ? '20px' : '23px', color: '#ffe1a4', fontStyle: 'bold'
    }).setName(`weekly-reward-${entry.id}`));
    parent.add(scene.add.text(x + cellWidth / 2, y + 27, entry.name, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: columns === 3 ? '13px' : '15px', color: '#d0e7ee', fontStyle: 'bold'
    }).setOrigin(0.5, 0));
  });
};

export const renderWeeklyFeaturedRewards = (scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  entries: readonly WeeklyFeaturedRewardView[], width: number, top: number): void => {
  if (!entries.length) return;
  const columns = Math.min(2, entries.length);
  const cellWidth = width / columns;
  entries.forEach((entry, index) => {
    const x = -width / 2 + index % columns * cellWidth;
    const y = top + Math.floor(index / columns) * 56;
    const acquired = entry.status === 'CLAIMED';
    const tile = scene.add.rectangle(x + cellWidth / 2, y + 24, cellWidth - 5, 48, acquired ? 0x103527 : 0x261b32, 0.96)
      .setStrokeStyle(1, acquired ? 0x72ffac : 0xd69eff, 0.65).setName(`weekly-featured-${entry.reward.rewardId}`);
    parent.add(tile);
    rewardIcon(scene, parent, entry.reward.iconRef, x + 17, y + 24);
    const label = scene.add.text(x + 33, y + 4, `${entry.reward.amount} ${entry.reward.displayName}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#efdbff', wordWrap: { width: cellWidth - 39 }
    }).setMaxLines(2);
    parent.add(label);
    parent.add(scene.add.text(x + 33, y + 32, `${entry.exclusive ? 'BONUS ' : ''}${entry.status}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', fontStyle: 'bold', color: acquired ? '#77ffad' : '#e1b5ff'
    }));
    const detail = scene.add.container(0, top - 8).setName('weekly-reward-details').setVisible(false);
    const message = scene.add.text(-width / 2 + 12, 0, [entry.campaignTitle, entry.reward.displayName,
      entry.reward.rarity?.toUpperCase(), entry.reward.tooltip,
      entry.exclusive ? 'Complete the Overdrive deck. Overdrive and Supreme play both count.' : 'Complete either full weekly deck.',
      entry.status === 'EARNED' ? 'EARNED // Delivery pending; retry from Main Menu.' : entry.status
    ].filter(Boolean).join('\n'), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#efdbff',
      wordWrap: { width: width - 24, useAdvancedWrap: true }, lineSpacing: 2
    });
    message.setY(-message.height - 12);
    detail.add([scene.add.rectangle(0, 0, width, message.height + 24, 0x090f1d, 1).setOrigin(0.5, 1).setStrokeStyle(1, 0xd69eff, 0.9), message]);
    parent.add(detail);
    const reveal = (show: boolean): void => {
      for (const child of parent.list) if (child.name === 'weekly-reward-details') (child as Phaser.GameObjects.Container).setVisible(false);
      detail.setVisible(show);
      parent.bringToTop(detail);
    };
    tile.setInteractive({ useHandCursor: true }).on('pointerover', () => reveal(true)).on('pointerout', () => reveal(false));
    tile.on('pointerdown', () => reveal(!detail.visible));
    registerUiFocusable(scene, tile, { id: `${parent.name}:${entry.campaignId}:${entry.reward.rewardId}`, label: `${entry.reward.displayName} reward details`,
      activate: () => reveal(!detail.visible), group: 'weekly-featured' });
  });
};
