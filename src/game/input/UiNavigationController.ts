import Phaser from 'phaser';
import { DEFAULT_CONTROLLER_SETTINGS, normalizeControllerSettings } from '../config/controllerSettings.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import {
  ActionStateBuffer,
  StandardGamepadReader,
  resolveActionPrompt,
  type BrowserGamepadLike,
  type GamepadFamily,
  type InputDevice
} from './ActionInput.ts';
import {
  UI_NAVIGATION_REPEAT,
  UI_SLIDER_REPEAT,
  UiFocusManager,
  UiInputRepeater,
  type UiFocusDirection,
  type UiFocusableControl,
  type UiFocusRect
} from './UiFocusManager.ts';

type Shortcut = 'page-left' | 'page-right' | 'tab-left' | 'tab-right';
const PHASER_FOCUS_MEMORY = new Map<string, string>();

export interface UiFocusableOptions {
  id?: string;
  label?: string;
  activate?: () => unknown;
  disabled?: () => boolean;
  locked?: () => boolean;
  visible?: () => boolean;
  adjust?: (direction: -1 | 1) => unknown;
  scroll?: (amount: number) => unknown;
  neighbors?: UiFocusableControl['neighbors'];
  group?: string;
  modalDepth?: number;
  defaultPriority?: number;
  destructive?: boolean;
  shortcut?: Shortcut;
}

export interface SceneUiNavigationOptions {
  onBack?: () => unknown;
  onTabLeft?: () => unknown;
  onTabRight?: () => unknown;
  onPageLeft?: () => unknown;
  onPageRight?: () => unknown;
  onScroll?: (amount: number) => unknown;
}

interface NavigationLayer {
  id: string;
  manager: UiFocusManager;
  priority: number;
  isAvailable(): boolean;
  back(): boolean;
  shortcut(shortcut: Shortcut): boolean;
  drawFocus(now: number, visible: boolean): void;
  get hasScrollableFocus(): boolean;
  scroll(amount: number): boolean;
  destroy(): void;
}

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'control';
const isVisibleElement = (element: HTMLElement): boolean => {
  if (!element.isConnected || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const elementRect = (element: HTMLElement): UiFocusRect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

const nearestScrollable = (element: HTMLElement): HTMLElement | null => {
  let candidate: HTMLElement | null = element;
  while (candidate) {
    const style = window.getComputedStyle(candidate);
    if (/(auto|scroll)/.test(style.overflowY) && candidate.scrollHeight > candidate.clientHeight + 2) return candidate;
    candidate = candidate.parentElement;
  }
  return document.querySelector<HTMLElement>('.store-details, .store-card-grid, .mod-database-scroll, [data-controller-scroll]');
};

let cachedSettingsSource: unknown = DEFAULT_CONTROLLER_SETTINGS;
let cachedSettings = normalizeControllerSettings(DEFAULT_CONTROLLER_SETTINGS);
const safeControllerSettings = () => {
  try {
    const source = SaveSystem.get().settings.controller;
    if (source !== cachedSettingsSource) {
      cachedSettingsSource = source;
      cachedSettings = normalizeControllerSettings(source);
    }
  } catch { /* No active profile yet: retain the already-normalized defaults. */ }
  return cachedSettings;
};

class PhaserNavigationLayer implements NavigationLayer {
  readonly manager = new UiFocusManager();
  readonly priority: number;
  private readonly shortcuts = new Map<Shortcut, Set<string>>();
  private readonly labels = new Map<string, string>();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private onBack?: () => unknown;
  private onTabLeft?: () => unknown;
  private onTabRight?: () => unknown;
  private onPageLeft?: () => unknown;
  private onPageRight?: () => unknown;
  private onScroll?: (amount: number) => unknown;
  private sequence = 0;

  constructor(readonly scene: Phaser.Scene, options: SceneUiNavigationOptions = {}) {
    this.id = `phaser:${scene.scene.key}`;
    this.priority = 20;
    this.configure(options);
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(2_000_000).setVisible(false);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  readonly id: string;

  configure(options: SceneUiNavigationOptions): void {
    if ('onBack' in options) this.onBack = options.onBack;
    if ('onTabLeft' in options) this.onTabLeft = options.onTabLeft;
    if ('onTabRight' in options) this.onTabRight = options.onTabRight;
    if ('onPageLeft' in options) this.onPageLeft = options.onPageLeft;
    if ('onPageRight' in options) this.onPageRight = options.onPageRight;
    if ('onScroll' in options) this.onScroll = options.onScroll;
  }

  register(target: Phaser.GameObjects.GameObject, options: UiFocusableOptions): () => void {
    const label = options.label ?? target.name ?? 'control';
    const id = options.id ?? `${slug(this.scene.scene.key)}:${slug(label)}:${this.sequence++}`;
    this.labels.set(id, label);
    if (options.shortcut) {
      const values = this.shortcuts.get(options.shortcut) ?? new Set<string>();
      values.add(id);
      this.shortcuts.set(options.shortcut, values);
    }
    const unregister = this.manager.register({
      id,
      getRect: () => this.targetRect(target),
      activate: options.activate ?? (() => target.emit('pointerdown')),
      setFocused: (focused) => {
        if (focused) PHASER_FOCUS_MEMORY.set(this.id, label);
      },
      isVisible: () => this.targetVisible(target) && options.visible?.() !== false,
      isDisabled: options.disabled,
      isLocked: options.locked,
      adjust: options.adjust,
      scroll: options.scroll,
      neighbors: options.neighbors,
      group: options.group,
      modalDepth: options.modalDepth,
      defaultPriority: options.defaultPriority,
      destructive: options.destructive
    });
    if (PHASER_FOCUS_MEMORY.get(this.id) === label) this.manager.focus(id);
    const remove = (): void => {
      unregister();
      this.labels.delete(id);
      for (const values of this.shortcuts.values()) values.delete(id);
    };
    target.once(Phaser.GameObjects.Events.DESTROY, remove);
    return remove;
  }

  isAvailable(): boolean {
    return (this.scene.sys.isActive() || this.scene.sys.isPaused()) && this.manager.size > 0;
  }

  back(): boolean {
    if (this.onBack) { this.onBack(); return true; }
    const candidates = [...this.labels.entries()]
      .filter(([, label]) => /cancel|close|back|return|resume/i.test(label))
      .sort((a, b) => {
        const safe = (label: string) => /cancel|resume|close/i.test(label) ? 0 : 1;
        return safe(a[1]) - safe(b[1]);
      });
    for (const [id] of candidates) {
      if (!this.manager.focus(id)) continue;
      this.manager.activate();
      return true;
    }
    return false;
  }

  shortcut(shortcut: Shortcut): boolean {
    const handler = shortcut === 'tab-left' ? this.onTabLeft
      : shortcut === 'tab-right' ? this.onTabRight
        : shortcut === 'page-left' ? this.onPageLeft : this.onPageRight;
    if (handler) { handler(); return true; }
    const candidates = this.shortcuts.get(shortcut);
    if (!candidates) return false;
    for (const id of candidates) {
      if (!this.manager.focus(id)) continue;
      return this.manager.activate() === 'activated';
    }
    return false;
  }

  drawFocus(now: number, visible: boolean): void {
    const current = this.manager.current;
    this.graphics.clear().setVisible(Boolean(visible && current));
    if (!visible || !current) return;
    const rect = current.getRect();
    const pad = 7 + Math.sin(now / 170) * 1.5;
    const x = rect.x - pad;
    const y = rect.y - pad;
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;
    const corner = Math.min(17, Math.max(9, Math.min(width, height) * 0.18));
    this.graphics.lineStyle(3, 0x72f7ff, 0.96);
    this.graphics.beginPath();
    this.graphics.moveTo(x + corner, y); this.graphics.lineTo(x, y); this.graphics.lineTo(x, y + corner);
    this.graphics.moveTo(x + width - corner, y); this.graphics.lineTo(x + width, y); this.graphics.lineTo(x + width, y + corner);
    this.graphics.moveTo(x, y + height - corner); this.graphics.lineTo(x, y + height); this.graphics.lineTo(x + corner, y + height);
    this.graphics.moveTo(x + width - corner, y + height); this.graphics.lineTo(x + width, y + height); this.graphics.lineTo(x + width, y + height - corner);
    this.graphics.strokePath();
    this.graphics.lineStyle(1, 0xff5bcf, 0.72).strokeRect(x + 4, y + 4, Math.max(1, width - 8), Math.max(1, height - 8));
  }

  get hasScrollableFocus(): boolean { return Boolean(this.manager.current?.scroll || this.onScroll); }
  scroll(amount: number): boolean {
    if (this.manager.scroll(amount)) return true;
    if (!this.onScroll) return false;
    this.onScroll(amount);
    return true;
  }

  destroy(): void {
    this.manager.clear();
    if (this.graphics.scene) this.graphics.destroy();
    UiNavigationController.get().removeLayer(this);
  }

  private targetVisible(target: Phaser.GameObjects.GameObject): boolean {
    let node: (Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Alpha>) | null = target;
    while (node) {
      if (!node.active || node.visible === false || (node.alpha ?? 1) <= 0.01) return false;
      node = node.parentContainer as unknown as typeof node;
    }
    return Boolean(target.scene);
  }

  private targetRect(target: Phaser.GameObjects.GameObject): UiFocusRect {
    const bounds = (target as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.GetBounds).getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
}

class DomNavigationLayer implements NavigationLayer {
  readonly id = 'dom:game-ui-root';
  readonly manager = new UiFocusManager();
  readonly priority = 100;
  private readonly observer: MutationObserver;
  private readonly focusFrame: HTMLDivElement;
  private readonly controls = new Map<HTMLElement, () => void>();
  private refreshQueued = false;
  private sequence = 0;
  private available = false;
  private lastFocusedKey: string | null = null;
  private readonly focusKeys = new Map<HTMLElement, string>();
  private readonly focusIds = new Map<HTMLElement, string>();

  constructor(private readonly root: HTMLElement) {
    this.focusFrame = document.createElement('div');
    this.focusFrame.className = 'controller-dom-focus-frame';
    this.focusFrame.hidden = true;
    this.focusFrame.setAttribute('aria-hidden', 'true');
    document.body.append(this.focusFrame);
    this.observer = new MutationObserver(() => this.queueRefresh());
    this.observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-hidden', 'aria-disabled', 'class', 'data-controller-ignore'] });
    this.refresh();
  }

  isAvailable(): boolean { return this.manager.size > 0 && this.available; }

  back(): boolean {
    const modal = this.activeModal();
    const pool = [...this.controls.keys()].filter((element) => isVisibleElement(element) && (!modal || modal.contains(element)));
    const candidate = pool.find((element) => /cancel/i.test(element.textContent ?? ''))
      ?? pool.find((element) => /close|back|return|skip tutorial/i.test(element.textContent ?? ''));
    if (!candidate) return false;
    candidate.click();
    return true;
  }

  shortcut(shortcut: Shortcut): boolean {
    const left = shortcut.endsWith('left');
    const selectors = left
      ? '[data-controller-page="left"], [data-controller-tab="left"], .store-tab-previous, .previous-page'
      : '[data-controller-page="right"], [data-controller-tab="right"], .store-tab-next, .next-page';
    const explicit = this.root.querySelector<HTMLElement>(selectors);
    if (explicit && isVisibleElement(explicit)) { explicit.click(); return true; }
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const group = activeElement?.dataset.controllerTabGroup
      ?? (this.root.querySelector('.store-category-tab') ? 'store-category' : undefined);
    const tabs = [...this.root.querySelectorAll<HTMLButtonElement>(group
      ? `[data-controller-tab-group="${group}"]`
      : '[role="tab"], .store-category-tab, .store-tab')].filter(isVisibleElement);
    if (tabs.length < 2) return false;
    const active = tabs.findIndex((tab) => tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('selected'));
    const index = ((active < 0 ? 0 : active) + (left ? -1 : 1) + tabs.length) % tabs.length;
    tabs[index].click();
    return true;
  }

  drawFocus(_now: number, visible: boolean): void {
    const active = visible && this.isAvailable();
    this.root.classList.toggle('controller-navigation-active', active);
    const control = active ? this.manager.current : null;
    if (!control) {
      this.focusFrame.hidden = true;
      return;
    }
    const rect = control.getRect();
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.width <= 0 || rect.height <= 0) {
      this.focusFrame.hidden = true;
      return;
    }
    const padding = 6;
    const left = Math.max(2, rect.x - padding);
    const top = Math.max(2, rect.y - padding);
    const right = Math.min(window.innerWidth - 2, rect.x + rect.width + padding);
    const bottom = Math.min(window.innerHeight - 2, rect.y + rect.height + padding);
    this.focusFrame.hidden = false;
    this.focusFrame.style.left = `${Math.round(left)}px`;
    this.focusFrame.style.top = `${Math.round(top)}px`;
    this.focusFrame.style.width = `${Math.max(2, Math.round(right - left))}px`;
    this.focusFrame.style.height = `${Math.max(2, Math.round(bottom - top))}px`;
  }

  get hasScrollableFocus(): boolean { return Boolean(this.manager.current?.scroll); }
  scroll(amount: number): boolean { return this.manager.scroll(amount); }

  destroy(): void {
    this.observer.disconnect();
    for (const unregister of this.controls.values()) unregister();
    this.controls.clear();
    this.manager.clear();
    this.root.classList.remove('controller-navigation-active');
    this.focusFrame.remove();
  }

  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => { this.refreshQueued = false; this.refresh(); });
  }

  private refresh(): void {
    const selector = 'button:not([data-controller-ignore="true"]), [role="button"]:not([data-controller-ignore="true"]), [role="tab"]:not([data-controller-ignore="true"]), input:not([type="hidden"]):not([type="file"]):not([data-controller-ignore="true"]), select:not([data-controller-ignore="true"]), textarea:not([data-controller-ignore="true"]), .store-card:not([data-controller-ignore="true"]), .profile-card:not([data-controller-ignore="true"])';
    const elements = [...this.root.querySelectorAll<HTMLElement>(selector)];
    const present = new Set(elements);
    for (const [element, unregister] of this.controls) {
      if (present.has(element)) continue;
      unregister();
      this.controls.delete(element);
      this.focusKeys.delete(element);
      this.focusIds.delete(element);
    }
    const duplicateCounts = new Map<string, number>();
    for (const element of elements) {
      if (this.controls.has(element)) continue;
      const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.className;
      const base = slug(element.dataset.controllerFocusId ?? label);
      const count = duplicateCounts.get(base) ?? 0;
      duplicateCounts.set(base, count + 1);
      const id = `dom:${base}:${count}:${this.sequence++}`;
      const focusKey = element.dataset.controllerFocusId ?? base;
      const modalDepth = element.closest('.store-dialog-backdrop, .profile-modal-backdrop, [role="dialog"], .feedback-modal, .tutorial-overlay:not([hidden])') ? 1 : 0;
      const input = element instanceof HTMLInputElement && element.type === 'range' ? element : null;
      const tabGroup = element.dataset.controllerTabGroup;
      const group = element.dataset.controllerGroup
        ?? (tabGroup ? `tabs:${tabGroup}` : undefined)
        ?? (element.classList.contains('store-card') ? 'store-card-grid' : undefined)
        ?? (element.classList.contains('profile-card') ? 'profile-card-grid' : undefined);
      const control: UiFocusableControl = {
        id,
        getRect: () => elementRect(element),
        activate: () => {
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) element.focus({ preventScroll: true });
          else element.click();
        },
        setFocused: (focused) => {
          element.classList.toggle('controller-focus', focused);
          if (focused) {
            this.lastFocusedKey = focusKey;
            element.focus({ preventScroll: true });
            element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        },
        isVisible: () => isVisibleElement(element),
        isDisabled: () => element.matches(':disabled')
          || (element.getAttribute('aria-disabled') === 'true' && !element.classList.contains('locked')),
        // Store cards remain selectable for inspection even when their
        // purchase action is unavailable. Only an explicit controller lock (or
        // a non-card legacy lock) blocks activation.
        isLocked: () => element.dataset.controllerLocked === 'true'
          || (!element.classList.contains('store-card') && (element.classList.contains('locked') || element.dataset.locked === 'true')),
        group,
        neighbors: {
          up: element.dataset.controllerUp,
          down: element.dataset.controllerDown,
          left: element.dataset.controllerLeft,
          right: element.dataset.controllerRight
        },
        modalDepth,
        defaultPriority: element.classList.contains('store-card') && element.classList.contains('selected')
          ? 30
          : /deploy|continue|resume|play|start/i.test(label)
            ? 20
            : element.classList.contains('primary') || element.classList.contains('active') ? 10 : 0,
        destructive: /delete|reset|quit|restart/i.test(label) || element.classList.contains('danger'),
        adjust: input ? (direction) => {
          const step = Number(input.step) || 1;
          input.value = `${Math.max(Number(input.min) || 0, Math.min(Number(input.max) || 100, Number(input.value) + direction * step))}`;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } : element instanceof HTMLSelectElement ? (direction) => {
          const next = Math.max(0, Math.min(element.options.length - 1, element.selectedIndex + direction));
          if (next === element.selectedIndex) return;
          element.selectedIndex = next;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } : undefined,
        scroll: (amount) => {
          const scrollable = nearestScrollable(element);
          if (scrollable) scrollable.scrollTop = Math.max(0, Math.min(scrollable.scrollHeight - scrollable.clientHeight, scrollable.scrollTop + amount));
        }
      };
      this.controls.set(element, this.manager.register(control));
      this.focusKeys.set(element, focusKey);
      this.focusIds.set(element, id);
    }
    this.available = elements.some(isVisibleElement);
    this.manager.invalidate();
    if (this.lastFocusedKey) {
      const restore = elements.find((element) => this.focusKeys.get(element) === this.lastFocusedKey && isVisibleElement(element));
      const id = restore ? this.focusIds.get(restore) : undefined;
      if (id) this.manager.focus(id);
    }
  }

  private activeModal(): HTMLElement | null {
    return [...this.root.querySelectorAll<HTMLElement>('.store-dialog-backdrop, .profile-modal-backdrop, [role="dialog"], .feedback-modal, .tutorial-overlay:not([hidden])')]
      .find(isVisibleElement) ?? null;
  }
}

/** Singleton action router shared by Phaser and DOM UI stacks. */
export class UiNavigationController {
  private static instance: UiNavigationController | null = null;
  static get(): UiNavigationController {
    this.instance ??= new UiNavigationController();
    return this.instance;
  }

  private readonly reader = new StandardGamepadReader();
  private readonly states = new ActionStateBuffer();
  private readonly navigationRepeat = new UiInputRepeater<UiFocusDirection>();
  private readonly sliderRepeat = new UiInputRepeater<'left' | 'right'>();
  private readonly layers: NavigationLayer[] = [];
  private readonly gamepads: (BrowserGamepadLike | null)[] = [];
  private device: InputDevice = 'keyboardMouse';
  private family: GamepadFamily = 'generic';
  private keyboardActivityAt = 0;
  private gamepadActivityAt = 0;
  private hints: HTMLElement | null = null;
  private readonly presentationListeners = new Set<(device: InputDevice, family: GamepadFamily) => void>();

  private constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    requestAnimationFrame(this.tick);
  }

  installDomRoot(root: HTMLElement): () => void {
    const existing = this.layers.find((layer) => layer.id === 'dom:game-ui-root');
    if (existing) return () => undefined;
    const layer = new DomNavigationLayer(root);
    this.layers.push(layer);
    return () => { layer.destroy(); this.removeLayer(layer); };
  }

  phaserLayer(scene: Phaser.Scene, options: SceneUiNavigationOptions = {}): PhaserNavigationLayer {
    const id = `phaser:${scene.scene.key}`;
    const existing = this.layers.find((layer): layer is PhaserNavigationLayer => layer.id === id && layer instanceof PhaserNavigationLayer);
    if (existing) { existing.configure(options); return existing; }
    const layer = new PhaserNavigationLayer(scene, options);
    this.layers.push(layer);
    return layer;
  }

  removeLayer(layer: NavigationLayer): void {
    const index = this.layers.indexOf(layer);
    if (index >= 0) this.layers.splice(index, 1);
  }

  get activeDevice(): InputDevice { return this.device; }
  get activeFamily(): GamepadFamily { return this.family; }

  subscribePresentation(listener: (device: InputDevice, family: GamepadFamily) => void): () => void {
    this.presentationListeners.add(listener);
    listener(this.device, this.family);
    return () => this.presentationListeners.delete(listener);
  }

  private readonly tick = (now: number): void => {
    requestAnimationFrame(this.tick);
    this.gamepads.length = 0;
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      for (let index = 0; index < pads.length; index += 1) this.gamepads[index] = pads[index];
    }
    const pad = this.reader.poll(this.gamepads, safeControllerSettings());
    const priorDevice = this.device;
    const priorFamily = this.family;
    this.family = pad.family;
    if (pad.freshActivity) this.gamepadActivityAt = now;
    if (pad.freshActivity && this.gamepadActivityAt >= this.keyboardActivityAt) this.device = 'gamepad';
    if (this.device === 'gamepad' && !pad.connected) this.device = 'keyboardMouse';
    if (priorDevice !== this.device || priorFamily !== this.family) this.notifyPresentation();

    this.states.beginFrame();
    for (const action of ['pause', 'confirm', 'cancel', 'navigateUp', 'navigateDown', 'navigateLeft', 'navigateRight', 'pageLeft', 'pageRight', 'tabLeft', 'tabRight'] as const) {
      this.states.setHeld(action, pad.held(action));
    }
    this.states.finishFrame('menu');

    const layer = this.activeLayer();
    for (const candidate of this.layers) candidate.drawFocus(now, this.device === 'gamepad' && candidate === layer);
    this.updateHints(layer);
    if (!layer || this.device !== 'gamepad') return;
    const direction = this.heldDirection(pad.uiNavigateX, pad.uiNavigateY, pad.uiAxisX, pad.uiAxisY);
    const hasUiAction = Boolean(direction)
      || this.states.pressed('confirm') || this.states.pressed('cancel')
      || this.states.pressed('tabLeft') || this.states.pressed('tabRight')
      || this.states.pressed('pageLeft') || this.states.pressed('pageRight')
      || Math.abs(pad.uiScrollY) > 0;
    if (hasUiAction) layer.manager.invalidate();
    if (direction && (direction === 'left' || direction === 'right') && layer.manager.current?.adjust) {
      if (this.sliderRepeat.update(direction, now, UI_SLIDER_REPEAT)) {
        layer.manager.adjust(direction === 'left' ? -1 : 1);
        AudioManager.get().playSfx('menuHover');
      }
      this.navigationRepeat.reset();
    } else {
      this.sliderRepeat.reset();
      if (this.navigationRepeat.update(direction, now, UI_NAVIGATION_REPEAT) && direction) {
        if (layer.manager.move(direction)) AudioManager.get().playSfx('menuHover');
      }
    }

    if (this.states.pressed('confirm')) {
      const result = layer.manager.activate();
      if (result === 'blocked' || result === 'missing') AudioManager.get().playSfx('itemLocked');
      else if (layer.id.startsWith('dom:')) AudioManager.get().playSfx('menu');
    }
    if (this.states.pressed('cancel')) {
      if (layer.back()) AudioManager.get().playSfx('menu');
    }
    if (this.states.pressed('tabLeft')) layer.shortcut('tab-left') || layer.shortcut('page-left');
    if (this.states.pressed('tabRight')) layer.shortcut('tab-right') || layer.shortcut('page-right');
    if (this.states.pressed('pageLeft')) layer.shortcut('page-left');
    if (this.states.pressed('pageRight')) layer.shortcut('page-right');
    if (Math.abs(pad.uiScrollY) > 0 && layer.hasScrollableFocus) layer.scroll(pad.uiScrollY * 14);
  };

  private activeLayer(): NavigationLayer | null {
    let active: NavigationLayer | null = null;
    for (const layer of this.layers) {
      if (!layer.isAvailable() || (active && active.priority >= layer.priority)) continue;
      active = layer;
    }
    return active;
  }

  private heldDirection(uiX: -1 | 0 | 1, uiY: -1 | 0 | 1, analogX: number, analogY: number): UiFocusDirection | null {
    // Resolve a diagonal analog gesture by its dominant axis. D-pad cardinal
    // input remains deterministic, while every stick quadrant can still reach
    // both rows and columns without permanent vertical bias.
    if (uiX !== 0 && uiY !== 0) {
      if (Math.abs(analogX) >= Math.abs(analogY)) return uiX < 0 ? 'left' : 'right';
      return uiY < 0 ? 'up' : 'down';
    }
    if (this.states.held('navigateUp')) return 'up';
    if (this.states.held('navigateDown')) return 'down';
    if (this.states.held('navigateLeft')) return 'left';
    if (this.states.held('navigateRight')) return 'right';
    return null;
  }

  private updateHints(layer: NavigationLayer | null): void {
    if (typeof document === 'undefined') return;
    this.hints ??= this.createHints();
    const visible = this.device === 'gamepad' && Boolean(layer);
    this.hints.hidden = !visible;
    if (!visible) return;
    const confirm = resolveActionPrompt('confirm', 'gamepad', this.family, 'SOUTH');
    const cancel = resolveActionPrompt('cancel', 'gamepad', this.family, 'EAST');
    const shoulders = this.family === 'playstation' ? 'L1/R1' : 'LB/RB';
    this.hints.textContent = `${confirm} SELECT   ${cancel} BACK   ${shoulders} TAB/PAGE${layer?.hasScrollableFocus ? '   R-STICK SCROLL' : ''}`;
  }

  private createHints(): HTMLElement {
    const hints = document.createElement('div');
    hints.id = 'controller-ui-hints';
    hints.hidden = true;
    (document.querySelector('#game-ui-root') ?? document.body).append(hints);
    return hints;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (Math.abs(event.movementX) + Math.abs(event.movementY) < 2) return;
    this.keyboardActivityAt = performance.now();
    if (this.device !== 'keyboardMouse') {
      this.device = 'keyboardMouse';
      this.notifyPresentation();
    }
  };
  private readonly onPointerDown = (): void => {
    this.keyboardActivityAt = performance.now();
    if (this.device !== 'keyboardMouse') {
      this.device = 'keyboardMouse';
      this.notifyPresentation();
    }
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    this.keyboardActivityAt = performance.now();
    if (this.device !== 'keyboardMouse') {
      this.device = 'keyboardMouse';
      this.notifyPresentation();
    }
    const layer = this.activeLayer();
    if (!layer || layer.id.startsWith('dom:') || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const direction = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[event.key];
    if (direction) {
      if (layer.manager.current?.adjust && (direction === 'left' || direction === 'right')) layer.manager.adjust(direction === 'left' ? -1 : 1);
      else layer.manager.move(direction);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') layer.manager.activate();
  };

  private notifyPresentation(): void {
    for (const listener of this.presentationListeners) listener(this.device, this.family);
  }
}

export const installUiNavigation = (root: HTMLElement): (() => void) => UiNavigationController.get().installDomRoot(root);

export const configureSceneUiNavigation = (scene: Phaser.Scene, options: SceneUiNavigationOptions): void => {
  UiNavigationController.get().phaserLayer(scene, options);
};

export const registerUiFocusable = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  options: UiFocusableOptions = {}
): (() => void) => UiNavigationController.get().phaserLayer(scene).register(target, {
  ...options,
  modalDepth: options.modalDepth ?? Number(scene.data.get('ui-controller-modal-depth') ?? 0)
});

/** Tags controls created afterward as belonging to the active modal scope. */
export const setSceneUiModalDepth = (scene: Phaser.Scene, depth: number): void => {
  scene.data.set('ui-controller-modal-depth', Math.max(0, Math.floor(depth)));
};

export const subscribeUiInputPresentation = (
  listener: (device: InputDevice, family: GamepadFamily) => void
): (() => void) => UiNavigationController.get().subscribePresentation(listener);

export const getUiInputPresentation = (): { device: InputDevice; family: GamepadFamily } => ({
  device: UiNavigationController.get().activeDevice,
  family: UiNavigationController.get().activeFamily
});
