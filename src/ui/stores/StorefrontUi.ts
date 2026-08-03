import type { CosmeticOption, UpgradeDefinition } from '../../game/types';
import { getUpgradeCost, getUpgradeLevel } from '../../data/upgrades';
import { getUpgradeComparison } from './upgradePresentation';
import './storefront.css';

type StoreMode = 'cosmetics' | 'upgrades';

export interface StoreSnapshot {
  credits: number;
  coreTokens: number;
  upgrades: Record<string, number>;
  ownedCosmetics: string[];
  equippedCosmetics: Partial<Record<CosmeticOption['category'], string>>;
}

interface StoreActionResult { ok: boolean; message?: string }

export interface StorefrontUiOptions {
  root: HTMLElement;
  mode: StoreMode;
  cosmetics?: CosmeticOption[];
  upgrades?: UpgradeDefinition[];
  particlesEnabled: boolean;
  getSnapshot(): StoreSnapshot;
  onBack(): void;
  onReturnToGame?(): void;
  onUnlock?(item: CosmeticOption): StoreActionResult;
  onEquip?(item: CosmeticOption): StoreActionResult;
  onUpgrade?(definition: UpgradeDefinition, level: number): StoreActionResult;
}

const COSMETIC_LABELS: Record<CosmeticOption['category'], string> = {
  playerColor: 'Player Color', playerShape: 'Player Shape', projectileColor: 'Projectile', trailColor: 'Trail',
  bombColor: 'Bomb', turretSkin: 'Turret', fenceStyle: 'Fence', dashTrail: 'Dash Trail'
};
const UPGRADE_LABELS: Record<UpgradeDefinition['category'], string> = {
  player: 'Operative', weapon: 'Weapon', fence: 'Fence', turret: 'Turret', mine: 'Mine'
};

export class StorefrontUi {
  private readonly options: StorefrontUiOptions;
  private selectedCategory: string;
  private selectedId: string | null = null;
  private message = '';
  private actionLocked = false;
  private dialogOpen = false;
  private readonly keyHandler = (event: KeyboardEvent): void => this.handleKey(event);

  constructor(options: StorefrontUiOptions) {
    this.options = options;
    const categories = this.getCategories();
    this.selectedCategory = categories[0] ?? '';
    this.selectedId = this.getVisibleItems()[0]?.id ?? null;
    this.options.root.replaceChildren();
    window.addEventListener('keydown', this.keyHandler);
    this.render();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.options.root.replaceChildren();
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

  private render(): void {
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
    shell.append(this.renderHeader(snapshot), this.renderBody(snapshot));
    screen.append(ambient, shell);
    this.options.root.replaceChildren(screen);
  }

  private renderHeader(snapshot: StoreSnapshot): HTMLElement {
    const header = document.createElement('header');
    header.className = 'store-header';
    const branding = document.createElement('div');
    branding.className = 'store-branding';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = this.options.mode === 'cosmetics' ? 'NEON CUSTOMIZATION' : 'COMBAT SYSTEMS';
    const title = document.createElement('h1');
    title.textContent = this.options.mode === 'cosmetics' ? 'COSMETICS SHOWROOM' : 'SYSTEM UPGRADE LAB';
    const subtitle = document.createElement('p');
    subtitle.textContent = this.options.mode === 'cosmetics'
      ? 'Customize your operative and defensive technology.'
      : 'Enhance combat systems and battlefield equipment.';
    branding.append(eyebrow, title, subtitle);

    const wallet = document.createElement('div');
    wallet.className = 'store-wallet';
    wallet.innerHTML = `<span class="credits"><b>◆</b> ${snapshot.credits.toLocaleString()} <small>CREDITS</small></span><span class="tokens"><b>⬡</b> ${snapshot.coreTokens.toLocaleString()} <small>CORE TOKENS</small></span>`;
    const actions = document.createElement('div');
    actions.className = 'store-header-actions';
    if (this.options.onReturnToGame) {
      const returnToGame = document.createElement('button');
      returnToGame.type = 'button';
      returnToGame.className = 'store-back game';
      returnToGame.textContent = 'BACK TO GAME';
      returnToGame.addEventListener('click', this.options.onReturnToGame);
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
      button.className = category === this.selectedCategory ? 'active' : '';
      const label = this.options.mode === 'cosmetics'
        ? COSMETIC_LABELS[category as CosmeticOption['category']]
        : UPGRADE_LABELS[category as UpgradeDefinition['category']];
      button.innerHTML = `<i></i><span>${label}</span><small>${complete} / ${total}</small>`;
      button.addEventListener('click', () => {
        this.selectedCategory = category;
        this.selectedId = null;
        this.selectedId = this.getVisibleItems()[0]?.id ?? null;
        this.message = '';
        this.render();
      });
      nav.append(button);
    }
    return nav;
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
    const affordable = item.currency === 'credits' ? snapshot.credits >= item.cost : snapshot.coreTokens >= item.cost;
    const card = this.cardButton(item.id, `cosmetic-card ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''}`);
    const visual = this.renderCosmeticVisual(item, false);
    const badge = document.createElement('span');
    badge.className = 'card-badge';
    badge.textContent = equipped ? 'EQUIPPED' : owned ? 'OWNED' : affordable ? 'AVAILABLE' : 'LOCKED';
    const name = document.createElement('h3');
    name.textContent = item.label;
    const price = document.createElement('p');
    price.className = `card-price ${item.currency}`;
    price.textContent = owned ? 'READY TO EQUIP' : `${item.cost.toLocaleString()} ${item.currency === 'credits' ? 'CREDITS' : 'CORE TOKENS'}`;
    card.append(badge, visual, name, price);
    return card;
  }

  private renderUpgradeCard(item: UpgradeDefinition, snapshot: StoreSnapshot): HTMLElement {
    const level = getUpgradeLevel(snapshot.upgrades, item.id);
    const maxed = level >= item.maxLevel;
    const cost = maxed ? 0 : getUpgradeCost(item.baseCost, item.growth, level);
    const comparison = getUpgradeComparison(item, level);
    const card = this.cardButton(item.id, `upgrade-card ${maxed ? 'maxed' : ''}`);
    const icon = document.createElement('div');
    icon.className = 'upgrade-icon';
    icon.textContent = this.upgradeIcon(item.category);
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

  private cardButton(id: string, classes: string): HTMLButtonElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `store-card ${classes} ${id === this.selectedId ? 'selected' : ''}`;
    card.dataset.itemId = id;
    card.addEventListener('pointerenter', () => {
      if (this.selectedId === id) return;
      this.selectedId = id;
      this.message = '';
      this.render();
    });
    card.addEventListener('click', () => {
      this.selectedId = id;
      this.message = '';
      this.render();
      this.options.root.querySelector<HTMLElement>('.store-action')?.focus();
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
    const balance = item.currency === 'credits' ? snapshot.credits : snapshot.coreTokens;
    const affordable = balance >= item.cost;
    const label = document.createElement('span');
    label.className = 'detail-eyebrow';
    label.textContent = `${COSMETIC_LABELS[item.category].toUpperCase()} PREVIEW`;
    const preview = document.createElement('div');
    preview.className = 'cosmetic-preview-stage';
    preview.append(this.renderCosmeticVisual(item, true));
    const title = document.createElement('h2');
    title.textContent = item.label;
    const description = document.createElement('p');
    description.className = 'detail-description';
    description.textContent = this.cosmeticDescription(item.category);
    const status = document.createElement('div');
    status.className = 'detail-status';
    status.innerHTML = `<span>${equipped ? 'EQUIPPED' : owned ? 'OWNED' : 'LOCKED'}</span><strong>${owned ? 'Collection item ready' : `${item.cost.toLocaleString()} ${item.currency === 'credits' ? 'Credits' : 'Core Tokens'}`}</strong>`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'store-action';
    action.disabled = equipped || (!owned && !affordable) || this.actionLocked;
    action.textContent = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : affordable
      ? `UNLOCK — ${item.cost.toLocaleString()} ${item.currency === 'credits' ? 'CREDITS' : 'CORE TOKENS'}`
      : `NEED ${(item.cost - balance).toLocaleString()} MORE ${item.currency === 'credits' ? 'CREDITS' : 'TOKENS'}`;
    action.addEventListener('click', () => {
      if (owned) this.perform(() => this.options.onEquip?.(item));
      else if (item.currency === 'coreTokens' || item.cost >= 650) this.confirm(`UNLOCK ${item.label.toUpperCase()}?`, `Cost: ${item.cost} ${item.currency === 'credits' ? 'Credits' : 'Core Tokens'}`, 'UNLOCK', () => this.perform(() => this.options.onUnlock?.(item)));
      else this.perform(() => this.options.onUnlock?.(item));
    });
    aside.append(label, preview, title, description, status, action, this.renderMessage());
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
    preview.innerHTML = `<div class="tech-ring"><b>${this.upgradeIcon(item.category)}</b></div><div class="circuit-lines"></div>`;
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
    action.disabled = maxed || !affordable || this.actionLocked;
    action.textContent = maxed ? 'MAX LEVEL' : affordable ? `PURCHASE UPGRADE — ${cost.toLocaleString()} CREDITS` : `NEED ${(cost - snapshot.credits).toLocaleString()} MORE CREDITS`;
    action.addEventListener('click', () => {
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
    const result = action() ?? { ok: false, message: 'ACTION FAILED' };
    this.message = result.message ?? (result.ok ? 'SYSTEM UPDATED' : 'ACTION FAILED');
    this.actionLocked = false;
    this.render();
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
    visual.className = `cosmetic-visual ${item.category} ${large ? 'large' : ''}`;
    visual.style.setProperty('--item-color', `#${item.color.toString(16).padStart(6, '0')}`);
    visual.dataset.shape = item.id.includes('square') ? 'square' : item.id.includes('triangle') ? 'triangle' : item.id.includes('star') ? 'star' : 'circle';
    visual.innerHTML = '<i class="trail-a"></i><i class="trail-b"></i><b></b><span></span>';
    return visual;
  }

  private cosmeticDescription(category: CosmeticOption['category']): string {
    return ({
      playerColor: 'Preview this operative color under holographic showroom lighting.',
      playerShape: 'Preview the geometric frame used by your operative in the arena.',
      projectileColor: 'A live pulse demonstrates the projectile color in motion.',
      trailColor: 'A repeating motion pass previews the wake left behind moving objects.',
      bombColor: 'A safe holographic charge pulse previews the detonation palette.',
      turretSkin: 'A rotating sentinel model previews this defensive skin.',
      fenceStyle: 'An energized lattice previews this fence style and current flow.',
      dashTrail: 'A short dash cycle previews the high-speed trail effect.'
    })[category];
  }

  private upgradeIcon(category: UpgradeDefinition['category']): string {
    return ({ player: '⬡', weapon: '⌁', fence: '╫', turret: '△', mine: '✦' })[category];
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.dialogOpen) { (this.options.onReturnToGame ?? this.options.onBack)(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const cards = Array.from(this.options.root.querySelectorAll<HTMLButtonElement>('.store-card'));
    if (cards.length === 0) return;
    const current = document.activeElement instanceof HTMLButtonElement ? cards.indexOf(document.activeElement) : -1;
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    cards[(current + delta + cards.length) % cards.length]?.focus();
    event.preventDefault();
  }
}
