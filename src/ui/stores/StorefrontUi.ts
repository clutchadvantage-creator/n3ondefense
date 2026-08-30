import type { CosmeticOption, UpgradeDefinition } from '../../game/types';
import { getUpgradeCost, getUpgradeLevel } from '../../data/upgrades';
import { getUpgradeComparison, getUpgradeVisual } from './upgradePresentation';
import { createUpgradeSvgIcon, directionIcon } from './UpgradeIconRegistry.ts';
import { getCosmeticPriceTier, getCosmeticPurchaseCosts, isPremiumCosmetic, resolveOperativeFrameAppearance } from '../../data/cosmetics.ts';
import { AudioManager } from '../../game/systems/AudioManager.ts';
import { createPremiumOperativeFrameSvg } from './PremiumOperativeFrameSvg.ts';
import { createBaseOperativeFrameSvg } from './BaseOperativeFrameSvg.ts';
import { createPremiumTurretSkinSvg } from './PremiumTurretSkinSvg.ts';
import { createMineFrameSvg } from '../../game/cosmetics/MineFrameArt.ts';
import './storefront.css';

export type StoreMode = 'cosmetics' | 'upgrades';

export interface StoreSnapshot {
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  upgrades: Record<string, number>;
  ownedCosmetics: string[];
  equippedCosmetics: Partial<Record<CosmeticOption['category'], string>>;
}

interface StoreActionResult { ok: boolean; message?: string }

interface StoreScrollState {
  screenTop: number;
  gridTop: number;
  detailsTop: number;
}

export interface StorefrontUiOptions {
  root: HTMLElement;
  mode: StoreMode;
  cosmetics?: CosmeticOption[];
  upgrades?: UpgradeDefinition[];
  particlesEnabled: boolean;
  getSnapshot(): StoreSnapshot;
  onBack(): void;
  onReturn?(): void;
  returnLabel?: string;
  onUnlock?(item: CosmeticOption): StoreActionResult;
  onEquip?(item: CosmeticOption): StoreActionResult;
  onUpgrade?(definition: UpgradeDefinition, level: number): StoreActionResult;
}

const COSMETIC_LABELS: Record<CosmeticOption['category'], string> = {
  playerColor: 'Operative Colors', playerShape: 'Operative Frames', projectileColor: 'Projectile Colors', projectileShape: 'Projectile Shapes', trailColor: 'Trails',
  bombColor: 'Bombsite Explosions', turretSkin: 'Turret Frames', mineFrame: 'Mine Frames', fenceStyle: 'Fence Frames', dashTrail: 'Dash Trails'
};
const UPGRADE_LABELS: Record<UpgradeDefinition['category'], string> = {
  player: 'Operative', weapon: 'Weapon', fence: 'Fence', turret: 'Turret', mine: 'Mine'
};
const COLOR_PALETTE_CATEGORIES = new Set<CosmeticOption['category']>(['playerColor', 'projectileColor', 'trailColor', 'bombColor']);

export class StorefrontUi {
  private readonly options: StorefrontUiOptions;
  private selectedCategory: string;
  private selectedId: string | null = null;
  private message = '';
  private actionLocked = false;
  private dialogOpen = false;
  private walletFeedback: { credits: number; coreTokens: number; plasmaChips: number } | null = null;
  private screen: HTMLElement | null = null;
  private readonly keyHandler = (event: KeyboardEvent): void => this.handleKey(event);

  constructor(options: StorefrontUiOptions) {
    this.options = options;
    const categories = this.getCategories();
    this.selectedCategory = categories[0] ?? '';
    this.selectedId = this.getVisibleItems()[0]?.id ?? null;
    this.options.root.querySelector<HTMLElement>('.storefront-screen')?.remove();
    window.addEventListener('keydown', this.keyHandler);
    this.render();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.screen?.remove();
    this.screen = null;
    this.options.root.querySelectorAll<HTMLElement>('.store-dialog-backdrop').forEach((dialog) => dialog.remove());
  }

  private getCategories(): string[] {
    const values = this.options.mode === 'cosmetics'
      ? (this.options.cosmetics ?? []).map((item) => item.category)
      : (this.options.upgrades ?? []).map((item) => item.category);
    return [...new Set(values)];
  }

  private getVisibleItems(): Array<CosmeticOption | UpgradeDefinition> {
    return this.options.mode === 'cosmetics'
      ? (this.options.cosmetics ?? []).filter((item) => item.category === this.selectedCategory)
      : (this.options.upgrades ?? []).filter((item) => item.category === this.selectedCategory);
  }

  private render(preserveScroll = true): void {
    const scrollState = preserveScroll ? this.captureScrollState() : null;
    const snapshot = this.options.getSnapshot();
    const screen = document.createElement('div');
    screen.className = `storefront-screen ${this.options.mode} ${this.options.particlesEnabled ? '' : 'reduced-effects'}`;
    screen.addEventListener('pointerdown', (event) => event.stopPropagation());

    const ambient = document.createElement('div');
    ambient.className = 'store-ambient';
    if (this.options.particlesEnabled) {
      for (let i = 0; i < 12; i += 1) {
        const particle = document.createElement('i');
        particle.style.setProperty('--i', `${i}`);
        ambient.append(particle);
      }
    }

    const shell = document.createElement('main');
    shell.className = 'store-shell';
    shell.append(this.renderConsoleDecor(), this.renderHeader(snapshot), this.renderModeTabs(), this.renderBody(snapshot));
    screen.append(ambient, shell);
    this.screen?.remove();
    this.options.root.append(screen);
    this.screen = screen;
    if (scrollState) this.restoreScrollState(scrollState);
  }

  private captureScrollState(): StoreScrollState | null {
    const screen = this.options.root.querySelector<HTMLElement>('.storefront-screen');
    const grid = this.options.root.querySelector<HTMLElement>('.store-card-grid');
    const details = this.options.root.querySelector<HTMLElement>('.store-details');
    if (!screen && !grid && !details) return null;
    return {
      screenTop: screen?.scrollTop ?? 0,
      gridTop: grid?.scrollTop ?? 0,
      detailsTop: details?.scrollTop ?? 0
    };
  }

  private restoreScrollState(state: StoreScrollState): void {
    const screen = this.options.root.querySelector<HTMLElement>('.storefront-screen');
    const grid = this.options.root.querySelector<HTMLElement>('.store-card-grid');
    const details = this.options.root.querySelector<HTMLElement>('.store-details');
    if (screen) screen.scrollTop = state.screenTop;
    if (grid) grid.scrollTop = state.gridTop;
    if (details) details.scrollTop = state.detailsTop;
  }

  private renderConsoleDecor(): HTMLElement {
    const decor = document.createElement('div');
    decor.className = 'store-console-decor';
    decor.setAttribute('aria-hidden', 'true');
    const node = document.createElement('span');
    node.className = 'store-console-node';
    node.textContent = this.options.mode === 'cosmetics' ? 'VISUAL FORGE // ONLINE' : 'ARMORY BUS // ONLINE';
    const channel = document.createElement('span');
    channel.className = 'store-console-channel';
    channel.textContent = 'N3ON MARKET CHANNEL 03';
    decor.append(node, channel);
    return decor;
  }

  private renderModeTabs(): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'store-mode-tabs';
    for (const mode of ['upgrades', 'cosmetics'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `store-mode-tab${this.options.mode === mode ? ' active' : ''}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', this.options.mode === mode ? 'true' : 'false');
      button.dataset.controllerTabGroup = 'store-mode';
      button.dataset.controllerFocusId = `store-mode-${mode}`;
      button.textContent = mode === 'upgrades' ? 'UPGRADES' : 'COSMETICS';
      button.addEventListener('click', () => {
        if (this.options.mode === mode) return;
        this.options.mode = mode;
        this.selectedCategory = this.getCategories()[0] ?? '';
        this.selectedId = this.getVisibleItems()[0]?.id ?? null;
        this.message = '';
        this.render(false);
      });
      nav.append(button);
    }
    return nav;
  }

  private renderHeader(snapshot: StoreSnapshot): HTMLElement {
    const header = document.createElement('header');
    header.className = 'store-header';
    const branding = document.createElement('div');
    branding.className = 'store-branding';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = this.options.mode === 'cosmetics' ? 'NEON CUSTOMIZATION' : 'COMBAT SYSTEMS';
    const title = document.createElement('h1');
    title.textContent = 'N3ONDefense STORE';
    const subtitle = document.createElement('p');
    subtitle.textContent = this.options.mode === 'cosmetics'
      ? 'Customize your operative and defensive technology.'
      : 'Enhance combat systems and battlefield equipment.';
    branding.append(eyebrow, title, subtitle);

    const wallet = document.createElement('div');
    wallet.className = 'store-wallet';
    wallet.dataset.tutorialTarget = 'store.wallet';
    wallet.innerHTML = `<span class="credits" data-tutorial-target="store.wallet.credits"><b>◆</b> ${snapshot.credits.toLocaleString()} <small>CREDITS</small></span><span class="tokens" data-tutorial-target="store.wallet.core-tokens"><b>⬡</b> ${snapshot.coreTokens.toLocaleString()} <small>CORE TOKENS</small></span><span class="chips"><b>◇</b> ${snapshot.plasmaChips.toLocaleString()} <small>PLASMA CHIPS</small></span>`;
    const feedback = this.walletFeedback;
    this.walletFeedback = null;
    const creditDelta = this.createCurrencyDelta(feedback?.credits);
    const tokenDelta = this.createCurrencyDelta(feedback?.coreTokens);
    const chipDelta = this.createCurrencyDelta(feedback?.plasmaChips);
    if (creditDelta) wallet.querySelector('.credits')?.insertBefore(creditDelta, wallet.querySelector('.credits small'));
    if (tokenDelta) wallet.querySelector('.tokens')?.insertBefore(tokenDelta, wallet.querySelector('.tokens small'));
    if (chipDelta) wallet.querySelector('.chips')?.insertBefore(chipDelta, wallet.querySelector('.chips small'));
    const actions = document.createElement('div');
    actions.className = 'store-header-actions';
    if (this.options.onReturn) {
      const returnToGame = document.createElement('button');
      returnToGame.type = 'button';
      returnToGame.className = 'store-back game';
      returnToGame.textContent = this.options.returnLabel ?? 'BACK';
      returnToGame.addEventListener('click', this.options.onReturn);
      actions.append(returnToGame);
    }
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'store-back';
    back.textContent = 'MAIN MENU';
    back.addEventListener('click', this.options.onBack);
    actions.append(back);
    header.append(branding, wallet, actions);
    return header;
  }

  private renderBody(snapshot: StoreSnapshot): HTMLElement {
    const body = document.createElement('div');
    body.className = 'store-body';
    body.append(this.renderCategories(snapshot), this.renderGrid(snapshot), this.renderDetails(snapshot));
    return body;
  }

  private renderCategories(snapshot: StoreSnapshot): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'store-categories';
    const heading = document.createElement('h2');
    heading.textContent = this.options.mode === 'cosmetics' ? 'CATEGORIES' : 'SYSTEMS';
    nav.append(heading);
    for (const category of this.getCategories()) {
      let complete: number;
      let total: number;
      if (this.options.mode === 'cosmetics') {
        const items = (this.options.cosmetics ?? []).filter((item) => item.category === category);
        complete = items.filter((item) => snapshot.ownedCosmetics.includes(item.id) || item.cost === 0).length;
        total = items.length;
      } else {
        const items = (this.options.upgrades ?? []).filter((item) => item.category === category);
        complete = items.reduce((sum, item) => sum + getUpgradeLevel(snapshot.upgrades, item.id), 0);
        total = items.reduce((sum, item) => sum + item.maxLevel, 0);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `store-category-tab${category === this.selectedCategory ? ' active' : ''}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', category === this.selectedCategory ? 'true' : 'false');
      button.dataset.controllerTabGroup = 'store-category';
      button.dataset.controllerFocusId = `store-category-${category}`;
      const label = this.options.mode === 'cosmetics'
        ? COSMETIC_LABELS[category as CosmeticOption['category']]
        : UPGRADE_LABELS[category as UpgradeDefinition['category']];
      if (this.options.mode === 'upgrades') {
        button.classList.add('has-system-icon');
        const indicator = document.createElement('i');
        const systemCategory = category as UpgradeDefinition['category'];
        const systemIcon = createUpgradeSvgIcon(
          systemCategory === 'player' ? 'operative' : systemCategory,
          'store-category-icon'
        );
        const text = document.createElement('span');
        text.textContent = label;
        const count = document.createElement('small');
        count.textContent = `${complete} / ${total}`;
        button.append(indicator, systemIcon, text, count);
      } else {
        button.classList.add('has-system-icon');
        const indicator = document.createElement('i');
        const text = document.createElement('span');
        text.textContent = label;
        const count = document.createElement('small');
        count.textContent = `${complete} / ${total}`;
        button.append(indicator, this.createCosmeticCategoryIcon(category as CosmeticOption['category']), text, count);
      }
      button.addEventListener('click', () => {
        this.selectedCategory = category;
        this.selectedId = null;
        this.selectedId = this.getVisibleItems()[0]?.id ?? null;
        this.message = '';
        this.render(false);
      });
      nav.append(button);
    }
    return nav;
  }

  private createCosmeticCategoryIcon(category: CosmeticOption['category']): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('store-category-icon');
    const markup: Record<CosmeticOption['category'], string> = {
      playerColor: '<circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><path d="m8 14 4 6 4-6"/>',
      playerShape: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><circle cx="12" cy="12" r="3"/>',
      projectileColor: '<path d="M3 8h8M2 12h11M4 16h7"/><path d="m11 6 10 6-10 6z"/>',
      projectileShape: '<path d="m12 2 9 10-9 10L3 12z"/><path d="M8 12h8"/>',
      trailColor: '<path d="M2 7h13M5 12h16M2 17h12"/>',
      bombColor: '<circle cx="11" cy="13" r="8"/><path d="m16 7 4-5m-2 2 3 2"/><circle cx="11" cy="13" r="2"/>',
      turretSkin: '<path d="M4 20h16M7 20l2-6h6l2 6M8 14V8h9v6M14 8l6-4"/>',
      mineFrame: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4M4 4l3 3m10 10 3 3M20 4l-3 3M7 17l-3 3"/>',
      fenceStyle: '<path d="M5 3v18M19 3v18M5 7h14M5 12h14M5 17h14"/><circle cx="5" cy="3" r="2"/><circle cx="19" cy="3" r="2"/>',
      dashTrail: '<path d="M2 7h10M5 12h11M2 17h10"/><path d="m13 5 9 7-9 7z"/>'
    };
    svg.innerHTML = markup[category];
    return svg;
  }

  private renderGrid(snapshot: StoreSnapshot): HTMLElement {
    const section = document.createElement('section');
    section.className = 'store-grid-panel';
    const heading = document.createElement('div');
    heading.className = 'store-panel-heading';
    const title = document.createElement('h2');
    title.textContent = this.options.mode === 'cosmetics' ? 'SHOWROOM INVENTORY' : 'AVAILABLE MODULES';
    const state = document.createElement('span');
    state.textContent = this.getVisibleItems().length === 0 ? 'NO ITEMS' : `${this.getVisibleItems().length} MODULES`;
    heading.append(title, state);
    const grid = document.createElement('div');
    grid.className = 'store-card-grid';
    const items = this.getVisibleItems();
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'store-empty';
      empty.textContent = 'No items are available in this category.';
      grid.append(empty);
    } else {
      for (const item of items) grid.append(this.options.mode === 'cosmetics'
        ? this.renderCosmeticCard(item as CosmeticOption, snapshot)
        : this.renderUpgradeCard(item as UpgradeDefinition, snapshot));
    }
    section.append(heading, grid);
    return section;
  }

  private renderCosmeticCard(item: CosmeticOption, snapshot: StoreSnapshot): HTMLElement {
    const owned = snapshot.ownedCosmetics.includes(item.id) || item.cost === 0;
    const equipped = snapshot.equippedCosmetics[item.category] === item.id;
    const affordable = this.canAffordCosmetic(snapshot, item);
    const premium = isPremiumCosmetic(item);
    const card = this.cardButton(
      item.id,
      `cosmetic-card tier-${getCosmeticPriceTier(item)} ${premium ? 'premium' : 'regular'} ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''}`,
      !owned && !affordable
    );
    card.dataset.cosmeticClass = premium ? 'premium' : 'regular';
    const visual = this.renderCosmeticVisual(item, false);
    const topLine = document.createElement('div');
    topLine.className = 'card-topline';
    const badge = document.createElement('span');
    badge.className = 'card-badge';
    badge.textContent = equipped ? 'EQUIPPED' : owned ? 'OWNED' : affordable ? 'AVAILABLE' : 'LOCKED';
    const tier = document.createElement('span');
    tier.className = `cosmetic-tier-marker ${premium ? 'premium' : 'regular'}`;
    tier.textContent = premium ? 'PREMIUM' : 'REGULAR';
    topLine.append(badge, tier);
    const name = document.createElement('h3');
    name.textContent = item.label;
    const price = document.createElement('div');
    price.className = `card-price ${item.currency}`;
    price.textContent = owned ? 'READY TO EQUIP' : '';
    if (!owned) price.append(this.renderCosmeticCostBreakdown(item, true));
    card.append(topLine, visual, name, price);
    return card;
  }

  private renderUpgradeCard(item: UpgradeDefinition, snapshot: StoreSnapshot): HTMLElement {
    const level = getUpgradeLevel(snapshot.upgrades, item.id);
    const maxed = level >= item.maxLevel;
    const cost = maxed ? 0 : getUpgradeCost(item.baseCost, item.growth, level);
    const comparison = getUpgradeComparison(item, level);
    const card = this.cardButton(item.id, `upgrade-card ${maxed ? 'maxed' : ''}`);
    card.dataset.tutorialTarget = 'store.upgrade-card';
    const icon = this.renderUpgradeVisual(item, snapshot, false);
    const badge = document.createElement('span');
    badge.className = 'card-badge';
    badge.textContent = maxed ? 'MAX LEVEL' : `LEVEL ${level} / ${item.maxLevel}`;
    const name = document.createElement('h3');
    name.textContent = item.label;
    const current = document.createElement('p');
    current.className = 'card-current';
    current.textContent = comparison.current;
    const price = document.createElement('p');
    price.className = 'card-price credits';
    price.textContent = maxed ? 'SYSTEM COMPLETE' : `${cost.toLocaleString()} CREDITS`;
    card.append(badge, icon, name, current, price);
    return card;
  }

  private cardButton(id: string, classes: string, locked = false): HTMLButtonElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `store-card ${classes} ${id === this.selectedId ? 'selected' : ''}`;
    card.dataset.itemId = id;
    if (locked) card.dataset.locked = 'true';
    card.addEventListener('click', () => {
      this.selectedId = id;
      this.message = '';
      this.options.root.querySelectorAll<HTMLElement>('.store-card.selected').forEach((node) => node.classList.remove('selected'));
      card.classList.add('selected');
      // Selection only changes the detail viewer. Keeping the inventory grid
      // mounted preserves its exact scroll position and leaves focus on the
      // selected card instead of pulling the viewport toward the action area.
      this.options.root.querySelector<HTMLElement>('.store-details')
        ?.replaceWith(this.renderDetails(this.options.getSnapshot()));
    });
    return card;
  }

  private renderDetails(snapshot: StoreSnapshot): HTMLElement {
    const aside = document.createElement('aside');
    aside.className = 'store-details';
    const item = this.getVisibleItems().find((candidate) => candidate.id === this.selectedId) ?? this.getVisibleItems()[0];
    if (!item) return aside;
    if (this.options.mode === 'cosmetics') this.fillCosmeticDetails(aside, item as CosmeticOption, snapshot);
    else this.fillUpgradeDetails(aside, item as UpgradeDefinition, snapshot);
    return aside;
  }

  private fillCosmeticDetails(aside: HTMLElement, item: CosmeticOption, snapshot: StoreSnapshot): void {
    const owned = snapshot.ownedCosmetics.includes(item.id) || item.cost === 0;
    const equipped = snapshot.equippedCosmetics[item.category] === item.id;
    const affordable = this.canAffordCosmetic(snapshot, item);
    const premium = isPremiumCosmetic(item);
    aside.classList.add(premium ? 'premium-cosmetic-details' : 'regular-cosmetic-details');
    const label = document.createElement('span');
    label.className = `detail-eyebrow ${premium ? 'premium' : 'regular'}`;
    label.textContent = `${premium ? 'PREMIUM' : 'REGULAR'} // ${COSMETIC_LABELS[item.category].toUpperCase()} PREVIEW`;
    const preview = document.createElement('div');
    preview.className = 'cosmetic-preview-stage';
    preview.append(this.renderCosmeticVisual(item, true));
    const title = document.createElement('h2');
    title.textContent = item.label;
    const description = document.createElement('p');
    description.className = 'detail-description';
    description.textContent = item.description ?? this.cosmeticDescription(item.category);
    const purchaseCost = this.renderCosmeticCostBreakdown(item, false);
    purchaseCost.classList.add('detail-cosmetic-cost');
    const status = document.createElement('div');
    status.className = 'detail-status';
    status.innerHTML = `<span>${equipped ? 'EQUIPPED' : owned ? 'OWNED' : 'LOCKED'}</span><strong>${owned ? 'Collection item ready' : this.formatCosmeticCost(item)}</strong>`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'store-action';
    const unavailable = equipped || (!owned && !affordable) || this.actionLocked;
    action.dataset.menuAudio = 'deferred';
    action.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    action.textContent = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : affordable
      ? `UNLOCK — ${this.formatCosmeticCost(item)}`
      : this.formatCosmeticShortfall(snapshot, item);
    action.addEventListener('click', () => {
      AudioManager.get().playSfx(unavailable ? 'itemLocked' : 'menu');
      if (unavailable) return;
      if (owned) this.perform(() => this.options.onEquip?.(item));
      else if (getCosmeticPriceTier(item) === 'prestige' || item.currency !== 'credits' || item.cost >= 650) this.confirm(`UNLOCK ${item.label.toUpperCase()}?`, `Cost: ${this.formatCosmeticCost(item)}`, 'UNLOCK', () => this.perform(() => this.options.onUnlock?.(item)));
      else this.perform(() => this.options.onUnlock?.(item));
    });
    aside.append(label, preview, title, description);
    if (!owned) aside.append(purchaseCost);
    aside.append(status, action, this.renderMessage());
  }

  private fillUpgradeDetails(aside: HTMLElement, item: UpgradeDefinition, snapshot: StoreSnapshot): void {
    const level = getUpgradeLevel(snapshot.upgrades, item.id);
    const maxed = level >= item.maxLevel;
    const cost = maxed ? 0 : getUpgradeCost(item.baseCost, item.growth, level);
    const affordable = snapshot.credits >= cost;
    const comparison = getUpgradeComparison(item, level);
    const label = document.createElement('span');
    label.className = 'detail-eyebrow';
    label.textContent = `${UPGRADE_LABELS[item.category].toUpperCase()} SYSTEM`;
    const preview = document.createElement('div');
    preview.className = 'upgrade-preview-stage';
    const scanner = document.createElement('div');
    scanner.className = 'tech-ring';
    scanner.append(this.renderUpgradeVisual(item, snapshot, true));
    const circuitLines = document.createElement('div');
    circuitLines.className = 'circuit-lines';
    preview.append(scanner, circuitLines);
    const title = document.createElement('h2');
    title.textContent = item.label;
    const progress = document.createElement('div');
    progress.className = 'upgrade-progress';
    progress.innerHTML = `<span>LEVEL ${level} / ${item.maxLevel}</span><div><i style="width:${level / item.maxLevel * 100}%"></i></div>`;
    const comparisonNode = document.createElement('div');
    comparisonNode.className = 'upgrade-comparison';
    comparisonNode.innerHTML = `<div><small>CURRENT</small><strong>${comparison.current}</strong></div><b>→</b><div><small>${maxed ? 'STATUS' : 'NEXT'}</small><strong>${maxed ? 'MAXIMUM' : comparison.next}</strong></div>`;
    const improvement = document.createElement('p');
    improvement.className = 'detail-description';
    improvement.textContent = maxed ? 'This system is fully upgraded.' : `${comparison.improvement}${comparison.percentage ? ` • ${comparison.percentage} improvement` : ''}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'store-action';
    action.dataset.tutorialTarget = 'store.upgrade-action';
    const unavailable = maxed || !affordable || this.actionLocked;
    action.dataset.menuAudio = 'deferred';
    action.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    action.textContent = maxed ? 'MAX LEVEL' : affordable ? `PURCHASE UPGRADE — ${cost.toLocaleString()} CREDITS` : `NEED ${(cost - snapshot.credits).toLocaleString()} MORE CREDITS`;
    action.addEventListener('click', () => {
      AudioManager.get().playSfx(unavailable ? 'itemLocked' : 'menu');
      if (unavailable) return;
      const purchase = () => this.perform(() => this.options.onUpgrade?.(item, level));
      if (cost >= 650) this.confirm(`UPGRADE ${item.label.toUpperCase()}?`, `Level ${level} → ${level + 1}\n${comparison.current} → ${comparison.next}\nCost: ${cost} Credits`, 'PURCHASE', purchase);
      else purchase();
    });
    aside.append(label, preview, title, progress, comparisonNode, improvement, action, this.renderMessage());
  }

  private renderMessage(): HTMLElement {
    const message = document.createElement('p');
    message.className = `store-message ${this.message.includes('NEED') || this.message.includes('FAILED') ? 'error' : ''}`;
    message.textContent = this.message;
    return message;
  }

  private perform(action: () => StoreActionResult | undefined): void {
    if (this.actionLocked) return;
    this.actionLocked = true;
    const before = this.options.getSnapshot();
    const result = action() ?? { ok: false, message: 'ACTION FAILED' };
    const after = this.options.getSnapshot();
    this.walletFeedback = result.ok ? {
      credits: after.credits - before.credits,
      coreTokens: after.coreTokens - before.coreTokens,
      plasmaChips: after.plasmaChips - before.plasmaChips
    } : null;
    this.message = result.message ?? (result.ok ? 'SYSTEM UPDATED' : 'ACTION FAILED');
    this.actionLocked = false;
    this.render();
  }

  private createCurrencyDelta(delta?: number): HTMLElement | null {
    if (!delta) return null;
    const feedback = document.createElement('em');
    feedback.className = `currency-delta ${delta > 0 ? 'gain' : 'loss'}`;
    feedback.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()}`;
    return feedback;
  }

  private currencyLabel(currency: CosmeticOption['currency']): string {
    if (currency === 'credits') return 'CREDITS';
    if (currency === 'coreTokens') return 'CORE TOKENS';
    return 'PLASMA CHIPS';
  }

  private canAffordCosmetic(snapshot: StoreSnapshot, item: CosmeticOption): boolean {
    const costs = getCosmeticPurchaseCosts(item);
    return snapshot.credits >= costs.credits
      && snapshot.coreTokens >= costs.coreTokens
      && snapshot.plasmaChips >= costs.plasmaChips;
  }

  private formatCosmeticCost(item: CosmeticOption): string {
    const costs = getCosmeticPurchaseCosts(item);
    return (['credits', 'coreTokens', 'plasmaChips'] as const)
      .filter((currency) => costs[currency] > 0)
      .map((currency) => `${costs[currency].toLocaleString()} ${this.currencyLabel(currency)}`)
      .join(' + ');
  }

  private renderCosmeticCostBreakdown(item: CosmeticOption, compact: boolean): HTMLElement {
    const costs = getCosmeticPurchaseCosts(item);
    const breakdown = document.createElement('div');
    breakdown.className = `cosmetic-cost-breakdown ${compact ? 'compact' : ''}`;
    breakdown.setAttribute('aria-label', this.formatCosmeticCost(item));
    const currencyMeta = {
      credits: { glyph: '¢', label: 'CREDITS' },
      coreTokens: { glyph: '⬡', label: 'CORE TOKENS' },
      plasmaChips: { glyph: '◆', label: 'PLASMA CHIPS' }
    } as const;
    for (const currency of ['credits', 'coreTokens', 'plasmaChips'] as const) {
      if (costs[currency] <= 0) continue;
      const value = document.createElement('span');
      value.className = `cosmetic-currency-cost ${currency}`;
      value.title = `${costs[currency].toLocaleString()} ${currencyMeta[currency].label}`;
      value.innerHTML = `<b aria-hidden="true">${currencyMeta[currency].glyph}</b><strong>${costs[currency].toLocaleString()}</strong>${compact ? '' : `<small>${currencyMeta[currency].label}</small>`}`;
      breakdown.append(value);
    }
    return breakdown;
  }

  private formatCosmeticShortfall(snapshot: StoreSnapshot, item: CosmeticOption): string {
    const costs = getCosmeticPurchaseCosts(item);
    const balances = { credits: snapshot.credits, coreTokens: snapshot.coreTokens, plasmaChips: snapshot.plasmaChips };
    const missing = (['credits', 'coreTokens', 'plasmaChips'] as const)
      .filter((currency) => costs[currency] > balances[currency])
      .map((currency) => `${(costs[currency] - balances[currency]).toLocaleString()} ${this.currencyLabel(currency)}`);
    return `NEED ${missing.join(' + ')}`;
  }

  private confirm(titleText: string, bodyText: string, confirmText: string, onConfirm: () => void): void {
    if (this.dialogOpen) return;
    this.dialogOpen = true;
    const backdrop = document.createElement('div');
    backdrop.className = 'store-dialog-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'store-dialog';
    const title = document.createElement('h2');
    title.textContent = titleText;
    const body = document.createElement('p');
    body.textContent = bodyText;
    const actions = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'CANCEL';
    const confirm = document.createElement('button');
    confirm.type = 'button'; confirm.className = 'confirm'; confirm.textContent = confirmText;
    const close = (): void => { this.dialogOpen = false; backdrop.remove(); };
    cancel.addEventListener('click', close);
    confirm.addEventListener('click', () => { close(); onConfirm(); });
    actions.append(cancel, confirm);
    dialog.append(title, body, actions);
    backdrop.append(dialog);
    this.options.root.append(backdrop);
    cancel.focus();
  }

  private renderCosmeticVisual(item: CosmeticOption, large: boolean): HTMLElement {
    const visual = document.createElement('div');
    const premium = isPremiumCosmetic(item);
    visual.className = `cosmetic-visual ${item.category} ${item.colorMode ?? ''} ${premium ? 'premium' : 'regular'} ${large ? 'large' : ''}`;
    const previewColor = item.colorMode === 'prism' ? 0xff4ed3 : item.color;
    visual.style.setProperty('--item-color', `#${previewColor.toString(16).padStart(6, '0')}`);
    visual.style.setProperty('--item-accent', `#${(item.accentColor ?? previewColor).toString(16).padStart(6, '0')}`);
    visual.dataset.cosmeticClass = premium ? 'premium' : 'regular';
    visual.dataset.shape = item.visualShape ?? 'circle';
    if (item.bombExplosionEffect) visual.dataset.effect = item.bombExplosionEffect;
    if (item.dashTrailEffect) visual.dataset.trailEffect = item.dashTrailEffect;
    if (item.turretSkinEffect) visual.dataset.turretSkin = item.turretSkinEffect;
    if (item.mineFrameEffect) visual.dataset.mineFrame = item.mineFrameEffect;
    visual.innerHTML = '<i class="trail-a"></i><i class="trail-b"></i><b></b><span></span>';
    if (COLOR_PALETTE_CATEGORIES.has(item.category) && !item.bombExplosionEffect) {
      visual.classList.add('cyber-palette-control');
      visual.setAttribute('role', 'img');
      visual.setAttribute('aria-label', `${item.label} cyber palette swatch`);
      const tray = document.createElement('div');
      tray.className = 'cyber-palette-tray';
      const rail = document.createElement('div');
      rail.className = 'cyber-palette-rail';
      for (let index = 0; index < 5; index += 1) {
        const swatch = document.createElement('i');
        swatch.className = `cyber-palette-swatch swatch-${index + 1}`;
        rail.append(swatch);
      }
      const readout = document.createElement('small');
      readout.textContent = item.colorMode === 'prism' ? 'SPECTRUM' : item.colorMode === 'native' ? 'AUTHORED' : `#${previewColor.toString(16).padStart(6, '0').toUpperCase()}`;
      tray.append(rail, readout);
      visual.append(tray);
    }
    if (item.category === 'playerShape' && premium) {
      const detailedFrame = createPremiumOperativeFrameSvg(item.visualShape);
      if (detailedFrame) {
        visual.classList.add('premium-operative-art');
        visual.append(detailedFrame);
      }
    }
    if (item.category === 'playerShape' && !premium) {
      const baseFrame = createBaseOperativeFrameSvg(item.visualShape);
      if (baseFrame) {
        visual.classList.add('base-operative-art');
        visual.append(baseFrame);
      }
    }
    if (item.category === 'turretSkin' && item.turretSkinEffect) {
      const detailedTurret = createPremiumTurretSkinSvg(item.turretSkinEffect);
      if (detailedTurret) {
        visual.classList.add('premium-turret-art');
        visual.append(detailedTurret);
      }
    }
    if (item.category === 'mineFrame') {
      visual.classList.add('premium-mine-frame-art');
      visual.append(createMineFrameSvg(item.mineFrameEffect ?? 'default', item.color, item.accentColor ?? item.color));
    }
    return visual;
  }

  private cosmeticDescription(category: CosmeticOption['category']): string {
    return ({
      playerColor: 'Preview this operative color under holographic showroom lighting.',
      playerShape: 'Preview the geometric frame used by your operative in the arena.',
      projectileColor: 'A live pulse demonstrates the projectile color in motion.',
      projectileShape: 'Preview the silhouette used by your operative weapon projectiles.',
      trailColor: 'A repeating motion pass previews the wake left behind moving objects.',
      bombColor: 'A safe holographic charge pulse previews the detonation palette.',
      turretSkin: 'A rotating sentinel model previews this defensive skin.',
      mineFrame: 'An armed-state hologram previews this mine chassis without changing its combat footprint.',
      fenceStyle: 'An energized lattice previews this fence style and current flow.',
      dashTrail: 'A short dash cycle previews the high-speed trail effect.'
    })[category];
  }

  private renderUpgradeVisual(item: UpgradeDefinition, snapshot: StoreSnapshot, large: boolean): HTMLElement {
    const visual = getUpgradeVisual(item);
    const cluster = document.createElement('div');
    cluster.className = `upgrade-visual-cluster layout-${visual.layout} accent-${visual.accent ?? 'cyan'} ${large ? 'large' : ''}`;
    cluster.setAttribute('role', 'img');
    cluster.setAttribute('aria-label', `${UPGRADE_LABELS[item.category]} ${item.label} upgrade visualization`);

    const scanner = document.createElement('span');
    scanner.className = 'upgrade-cluster-scanner';
    const connector = document.createElement('span');
    connector.className = 'upgrade-cluster-connector';

    const hero = document.createElement('span');
    hero.className = `upgrade-hero upgrade-hero-${visual.hero}`;
    if (visual.hero === 'operative') hero.append(this.renderEquippedOperative(snapshot, large));
    else hero.append(createUpgradeSvgIcon(visual.hero, 'upgrade-svg hero-svg'));

    const effect = document.createElement('span');
    effect.className = `upgrade-effect effect-${visual.effect}`;
    effect.append(createUpgradeSvgIcon(visual.effect, 'upgrade-svg effect-svg'));

    const direction = document.createElement('span');
    direction.className = `upgrade-direction direction-${visual.direction}`;
    direction.append(createUpgradeSvgIcon(directionIcon(visual.direction), 'upgrade-svg direction-svg'));

    cluster.append(scanner, connector, hero, effect, direction);
    return cluster;
  }

  private renderEquippedOperative(snapshot: StoreSnapshot, large: boolean): HTMLElement {
    const cosmetics = this.options.cosmetics ?? [];
    const frame = cosmetics.find((item) => item.category === 'playerShape' && item.id === snapshot.equippedCosmetics.playerShape)
      ?? cosmetics.find((item) => item.category === 'playerShape' && item.cost === 0);
    const color = cosmetics.find((item) => item.category === 'playerColor' && item.id === snapshot.equippedCosmetics.playerColor)
      ?? cosmetics.find((item) => item.category === 'playerColor' && item.cost === 0);
    if (!frame) {
      const fallback = document.createElement('span');
      fallback.className = 'upgrade-operative-fallback';
      fallback.append(createUpgradeSvgIcon('operative', 'upgrade-svg hero-svg'));
      return fallback;
    }
    const appearance = resolveOperativeFrameAppearance(frame.id, color?.id, Date.now());
    const operative = this.renderCosmeticVisual(appearance.mode === 'native' ? frame : {
      ...frame,
      color: appearance.primaryColor,
      accentColor: appearance.primaryColor,
      colorMode: color?.colorMode
    }, large);
    operative.classList.add('upgrade-operative-visual');
    return operative;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.dialogOpen) { (this.options.onReturn ?? this.options.onBack)(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const cards = Array.from(this.options.root.querySelectorAll<HTMLButtonElement>('.store-card'));
    if (cards.length === 0) return;
    const current = document.activeElement instanceof HTMLButtonElement ? cards.indexOf(document.activeElement) : -1;
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    cards[(current + delta + cards.length) % cards.length]?.focus();
    event.preventDefault();
  }
}
