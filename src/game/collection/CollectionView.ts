import Phaser from 'phaser';
import { RELICS, TROPHIES, COLLECTION_DISPLAY_SLOTS, type RelicDefinition } from './CollectionCatalog.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { createButton } from '../utils/ui.ts';
import { registerUiFocusable, setSceneUiModalDepth } from '../input/UiNavigationController.ts';
import type { GarageLayout } from '../garage/garageLayout.ts';

const FONT = 'Rajdhani, sans-serif';
const DISPLAY = 'Orbitron, sans-serif';
const text = (scene: Phaser.Scene, root: Phaser.GameObjects.Container, x: number, y: number, value: string, size: number, color = '#c5dfea', width?: number) => {
  const label = scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', ...(width ? { wordWrap: { width, useAdvancedWrap: true } } : {}) });
  root.add(label); return label;
};
export const addRelicAssembly = (scene: Phaser.Scene, root: Phaser.GameObjects.Container, relic: RelicDefinition, x: number, y: number, size: number, fragments: readonly string[]) => {
  root.add(scene.add.image(x, y, `relic-${relic.id}-locked`).setDisplaySize(size, size));
  for (const fragment of relic.fragments) if (fragments.includes(fragment.id)) root.add(scene.add.image(x, y, `fragment-${fragment.id}`).setDisplaySize(size, size));
};

/** Recessed chassis is shared by collection panels and physical Garage cabinets. */
export const collectionChassis = (scene: Phaser.Scene, root: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, color: number): void => {
  root.add(scene.add.rectangle(x + 6, y + 9, w, h, 0x000208, 0.8));
  root.add(scene.add.rectangle(x, y, w, h, 0x14222e).setStrokeStyle(2, 0x647886));
  root.add(scene.add.rectangle(x, y, w - 10, h - 10, 0x030a14).setStrokeStyle(1, color, 0.75));
  root.add(scene.add.rectangle(x, y - h / 2 + 7, w - 38, 3, color, 0.85));
  root.add(scene.add.rectangle(x, y + h / 2 - 7, w - 38, 2, color, 0.35));
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    root.add(scene.add.circle(x + dx * (w / 2 - 11), y + dy * (h / 2 - 11), 3, 0x8b9ca9));
  }
};

export class CollectionWing {
  private root: Phaser.GameObjects.Container | null = null;
  private tab: 'trophies' | 'relics';
  private selected = 0;
  private page = 0;
  private readonly shutdown = () => this.destroy();
  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void, tab: 'trophies' | 'relics' = 'trophies') {
    this.tab = tab; this.render(); scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
  }
  private render(): void {
    this.root?.destroy(true);
    const s = this.scene, state = SaveSystem.getCollection(), { width, height } = s.scale;
    const root = this.root = s.add.container(0, 0).setDepth(6000);
    s.data.set('collection-modal', true); setSceneUiModalDepth(s, 60);
    root.add(s.add.rectangle(width / 2, height / 2, width, height, 0x01040a, 0.97).setInteractive());
    const margin = Math.max(14, Math.min(44, width * 0.025)), w = width - margin * 2, top = 92, bottom = height - 64;
    text(s, root, width / 2, 18, 'TROPHIES & RELICS', width < 850 ? 24 : 34, '#b5f6ff').setFontFamily(DISPLAY).setOrigin(0.5, 0);
    text(s, root, width / 2, 61, 'RUNTWERKX // PRIVATE COLLECTION WING', 15, '#829dae').setOrigin(0.5, 0);
    const tabs = ['trophies', 'relics'] as const;
    tabs.forEach((tab, i) => root.add(createButton(s, width / 2 + (i - 0.5) * 230, top + 20, tab.toUpperCase(), () => {
      this.tab = tab; this.selected = 0; this.page = 0; this.render();
    }, Math.min(220, w / 2 - 12), 'menu', { height: 40, fontSize: 18, accent: tab === this.tab ? 0x89e9ff : 0x586773, focusModalDepth: 60 })));
    const listTop = top + 60, contentHeight = bottom - listTop;
    const narrow = width < 900, listW = narrow ? w * 0.48 : w * 0.62, detailX = margin + listW + 24, detailW = w - listW - 24;
    collectionChassis(s, root, detailX + detailW / 2, listTop + contentHeight / 2, detailW, contentHeight, this.tab === 'relics' ? 0xff5373 : 0x7ce6f5);
    if (this.tab === 'trophies') {
      const perPage = narrow ? 4 : 10, columns = narrow ? 2 : 5, rows = 2, gap = 12;
      const pages = Math.ceil(TROPHIES.length / perPage), gridHeight = contentHeight - (pages > 1 ? 46 : 0);
      const cellW = (listW - gap * (columns - 1)) / columns, cellH = (gridHeight - gap * (rows - 1)) / rows;
      TROPHIES.slice(this.page * perPage, (this.page + 1) * perPage).forEach((trophy, i) => {
        const index = this.page * perPage + i;
        const cx = margin + (i % columns) * (cellW + gap) + cellW / 2, cy = listTop + Math.floor(i / columns) * (cellH + gap) + cellH / 2;
        const unlocked = state.unlockedTrophies.includes(trophy.id), selected = index === this.selected;
        root.add(s.add.rectangle(cx, cy, cellW, cellH, selected ? 0x162a39 : 0x09131e).setStrokeStyle(selected ? 2 : 1, selected ? trophy.color : 0x365060));
        const size = Math.max(26, Math.min(cellW - 8, cellH - 64));
        root.add(s.add.image(cx, cy - 20, `trophy-${trophy.id}${unlocked ? '' : '-locked'}`).setDisplaySize(size, size));
        text(s, root, cx, cy + cellH / 2 - 65, trophy.name.toUpperCase(), narrow ? 15 : 18, unlocked ? '#e0f9ff' : '#90a3af', cellW - 12).setAlign('center').setOrigin(0.5, 0).setMaxLines(2);
        text(s, root, cx, cy + cellH / 2 - 17, unlocked ? 'EARNED' : 'NOT EARNED YET', narrow ? 11 : 14, unlocked ? '#92ffd3' : '#ff7289').setOrigin(0.5);
        // The full cell is a focusable selection target; no hidden duplicate controls.
        const select = s.add.zone(cx, cy, cellW, cellH).setInteractive({ useHandCursor: true });
        const activate = () => { this.selected = index; this.render(); };
        select.on('pointerdown', activate);
        registerUiFocusable(s, select, { label: trophy.name, activate, modalDepth: 60 });
        root.add(select);
      });
      if (pages > 1) {
        root.add(createButton(s, margin + 45, bottom - 17, 'PREV', () => { this.page = (this.page + pages - 1) % pages; this.selected = this.page * perPage; this.render(); }, 88, 'menu', { height: 32, fontSize: 13, focusModalDepth: 60 }));
        root.add(createButton(s, margin + listW - 45, bottom - 17, 'NEXT', () => { this.page = (this.page + 1) % pages; this.selected = this.page * perPage; this.render(); }, 88, 'menu', { height: 32, fontSize: 13, focusModalDepth: 60 }));
        text(s, root, margin + listW / 2, bottom - 17, `${this.page + 1} / ${pages}`, 16, '#a0c6d8').setOrigin(0.5);
      }
      const trophy = TROPHIES[this.selected] ?? TROPHIES[0], unlocked = state.unlockedTrophies.includes(trophy.id);
      const artSize = Math.min(detailW - 40, Math.max(52, Math.min(contentHeight * 0.42, contentHeight - 275)));
      root.add(s.add.image(detailX + detailW / 2, listTop + 25 + artSize / 2, `trophy-${trophy.id}${unlocked ? '' : '-locked'}`).setDisplaySize(artSize, artSize));
      const y = listTop + artSize + 36;
      const title = text(s, root, detailX + 24, y, trophy.name.toUpperCase(), contentHeight < 430 ? 18 : narrow ? 19 : 25, '#e0f7ff', detailW - 48).setFontFamily(DISPLAY).setMaxLines(2);
      text(s, root, detailX + 24, title.y + title.height + 14, trophy.requirement, contentHeight < 430 ? 16 : 19, '#b8cbd7', detailW - 48);
      const progress = Math.min(trophy.target, state.progress[trophy.metric]), barW = detailW - 48, barY = bottom - 108;
      root.add(s.add.rectangle(detailX + 24, barY, barW, 6, 0x243846).setOrigin(0));
      root.add(s.add.rectangle(detailX + 24, barY, barW * progress / trophy.target, 6, trophy.color).setOrigin(0));
      text(s, root, detailX + 24, barY - 30, `${progress.toLocaleString()} / ${trophy.target.toLocaleString()}`, 20, '#c5e7f6');
      const displayed = state.displayedTrophies.includes(trophy.id);
      root.add(createButton(s, detailX + detailW / 2, bottom - 48, unlocked ? displayed ? 'REMOVE FROM SHOWCASE' : 'DISPLAY TROPHY' : 'NOT EARNED YET', () => {
        if (unlocked) { SaveSystem.toggleCollectionDisplay('trophies', trophy.id); this.render(); }
      }, detailW - 42, 'menu', { height: 40, fontSize: 15, focusModalDepth: 60, accent: unlocked ? trophy.color : 0x985465 }));
    } else {
      const gap = 18, cardH = (contentHeight - gap) / 2;
      RELICS.forEach((relic, i) => {
        const cy = listTop + i * (cardH + gap) + cardH / 2;
        collectionChassis(s, root, margin + listW / 2, cy, listW, cardH, i === this.selected ? relic.color : 0x3f515f);
        const size = Math.min(cardH - 15, listW * 0.48);
        addRelicAssembly(s, root, relic, margin + size / 2 + 8, cy, size, state.fragments);
        const tx = margin + size + 12, count = relic.fragments.filter(f => state.fragments.includes(f.id)).length;
        text(s, root, tx, cy - 50, relic.name.toUpperCase(), narrow ? 14 : 23, '#d8e9f4', listW - size - 30);
        text(s, root, tx, cy + 10, count ? `${count} / 3 FRAGMENTS` : 'NOT FOUND YET', narrow ? 12 : 18, count ? '#a3ecff' : '#ff7289', listW - size - 30);
        root.add(createButton(s, tx + (listW - size - 30) / 2, cy + 62, 'INSPECT', () => { this.selected = i; this.render(); }, Math.max(76, listW - size - 30), 'menu', { height: 32, fontSize: 13, focusModalDepth: 60 }));
      });
      const relic = RELICS[this.selected] ?? RELICS[0], completed = state.completedRelics.includes(relic.id);
      const titleY = listTop + 24;
      const heading = text(s, root, detailX + 24, titleY, relic.name.toUpperCase(), narrow ? 18 : 25, '#edf4ff', detailW - 48).setFontFamily(DISPLAY);
      text(s, root, detailX + 24, heading.y + heading.height + 16, relic.description, narrow || contentHeight < 430 ? 15 : 20, '#b8cbd7', detailW - 48).setMaxLines(contentHeight < 430 ? 3 : 5);
      relic.fragments.forEach((fragment, i) => {
        const rowGap = contentHeight < 430 ? 43 : 56;
        const owned = state.fragments.includes(fragment.id), y = bottom - 114 - (2 - i) * rowGap;
        root.add(s.add.image(detailX + 40, y + 12, `fragment-${fragment.id}`).setDisplaySize(64, 64).setAlpha(owned ? 1 : 0.25));
        text(s, root, detailX + 75, y, fragment.name.toUpperCase(), narrow ? 13 : 17, owned ? '#b6fff1' : '#8797a3', detailW - 95);
        text(s, root, detailX + 75, y + 22, owned ? 'SECURED' : 'UNDISCOVERED', 12, owned ? '#73d8bd' : '#e17889');
      });
      const displayed = state.displayedRelics.includes(relic.id);
      root.add(createButton(s, detailX + detailW / 2, bottom - 48, completed ? displayed ? 'REMOVE FROM VAULT' : 'FEATURE IN VAULT' : 'RECONSTRUCTION REQUIRED', () => {
        if (completed) { SaveSystem.toggleCollectionDisplay('relics', relic.id); this.render(); }
      }, detailW - 42, 'menu', { height: 40, fontSize: 14, focusModalDepth: 60, accent: relic.color }));
    }
    text(s, root, margin, height - 38, `${state.unlockedTrophies.length}/${TROPHIES.length} TROPHIES  //  ${state.completedRelics.length}/${RELICS.length} RELICS  //  PERMANENT PROFILE COLLECTION`, width < 900 ? 12 : 16, '#82a4b5');
    root.add(createButton(s, width - margin - 85, height - 32, 'BACK TO GARAGE', () => this.close(), 170, 'menu', { height: 36, fontSize: 14, focusModalDepth: 60 }));
  }
  close(): void { this.destroy(); this.onClose(); }
  destroy(): void {
    this.root?.destroy(true); this.root = null;
    this.scene.data.set('collection-modal', false); setSceneUiModalDepth(this.scene, 0);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
  }
}

export const createGarageCollectionDisplays = (scene: Phaser.Scene, layout: GarageLayout, open: (tab: 'trophies' | 'relics') => void): Phaser.GameObjects.Container => {
  const root = scene.add.container(0, 0).setDepth(35), state = SaveSystem.getCollection();
  const leftEdge = layout.dockCenters[0].x - layout.cardWidth / 2 - 20;
  const w = Math.max(46, Math.min(290, leftEdge - layout.safe - 18));
  const h = layout.cardHeight + layout.dockActionGap + layout.dockActionHeight;
  const cy = layout.dockCenters[0].y + (layout.dockActionGap + layout.dockActionHeight) / 2;
  (['trophies', 'relics'] as const).forEach((kind, i) => {
    const x = i === 0 ? layout.safe + w / 2 + 4 : scene.scale.width - layout.safe - w / 2 - 4;
    const color = i === 0 ? 0x78d8ed : 0xff446a;
    collectionChassis(scene, root, x, cy, w, h, color);
    const mini = w < 120;
    text(scene, root, x, cy - h / 2 + 19, mini ? i ? 'VAULT' : 'AWARDS' : i ? 'BLACKSITE VAULT' : 'TROPHY SHOWCASE', mini ? 10 : 15, i ? '#ff9aa8' : '#c4f7ff').setOrigin(0.5, 0);
    const ids = i ? state.displayedRelics : state.displayedTrophies;
    const slots = COLLECTION_DISPLAY_SLOTS[kind];
    const cols = i || mini ? 1 : 2, rows = Math.ceil(slots / cols);
    const art = Math.min((w - 22) / cols, (h - 95) / rows);
    for (let index = 0; index < slots; index++) {
      const tx = x + (index % cols - (cols - 1) / 2) * (w - 20) / cols;
      const ty = cy - h / 2 + 53 + (index / cols | 0) * (h - 92) / rows + (h - 92) / rows / 2;
      root.add(scene.add.ellipse(tx, ty + art * 0.39, art * 0.85, 9, color, 0.14));
      if (ids[index]) root.add(scene.add.image(tx, ty, `${i ? 'relic' : 'trophy'}-${ids[index]}`).setDisplaySize(art, art));
      else { root.add(scene.add.rectangle(tx, ty, art * 0.72, art * 0.74, 0x0d1925).setStrokeStyle(1, color, 0.18)); text(scene, root, tx, ty, '+', 22, '#46616e').setOrigin(0.5); }
    }
    root.add(scene.add.triangle(x - w * 0.22, cy - h * 0.1, 0, 0, w * 0.75, 0, 0, h * 0.55, 0xd7f5ff, 0.025));
    root.add(createButton(scene, x, cy + h / 2 - 27, mini ? 'VIEW' : 'CURATE COLLECTION', () => open(kind), w - 16, 'menu', { height: 30, fontSize: mini ? 10 : 13, accent: color }));
  });
  return root;
};
