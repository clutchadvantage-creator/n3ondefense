import { ACCESS_CARD_NAMES, ACCESS_CARD_TYPES, ACCESS_CARD_DAILY_LIMIT, accessCardUseError, type AnomalyAccessCards } from '../game/anomalies/AnomalyAccessCards.ts';
import type { AnomalyId } from '../game/anomalies/types.ts';
import './anomaly-access.css';
import { getGameUiRoot } from './getGameUiRoot.ts';

interface AnomalyEntryState {
  flux: number;
  cards: AnomalyAccessCards;
  lastStarted?: string;
}

export class AnomalyEntryDialog {
  private readonly root = document.createElement('div');
  private readonly panel = document.createElement('section');
  private readonly info = document.createElement('p');
  private readonly paidButton: HTMLButtonElement;
  private readonly cardButtons = new Map<AnomalyId, HTMLButtonElement>();
  private destroyed = false;
  private readonly key = (event: KeyboardEvent) => {
    this.refresh();
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.cancel(); }
    if (event.code === 'Tab') {
      const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
  };
  constructor(offered: AnomalyId, private readonly cost: number, private readonly readState: () => AnomalyEntryState,
    private readonly cancel: () => void, confirm: (card?: AnomalyId) => {ok:boolean;message?:string}) {
    this.root.className = 'anomaly-entry-overlay'; this.panel.className = 'anomaly-entry-dialog';
    this.panel.setAttribute('role','dialog'); this.panel.setAttribute('aria-modal','true');
    this.panel.setAttribute('aria-label','Anomaly entry');
    const heading = document.createElement('h2'); heading.textContent = `PORTAL // ${ACCESS_CARD_NAMES[offered]}`;
    this.info.style.whiteSpace = 'pre-line';
    const help = document.createElement('p');
    help.textContent = 'Card entry requires an owned card of that type. Buy cards in Store → Upgrades → Access Cards: up to 3 total per day, in any combination.';
    const message = document.createElement('p'); message.className='access-entry-message'; message.setAttribute('role','status');
    const button = (label:string, action:()=>void, disabled=false) => {
      const b = document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=disabled;
      b.addEventListener('click', () => { if (!b.disabled && !this.destroyed) action(); });
      this.panel.append(b); return b;
    };
    const enter = (id?: AnomalyId) => {
      // Re-read on activation as well as presentation; a stale button grants no entry.
      const state = this.refresh();
      const error = id ? accessCardUseError(state.cards, id, state.lastStarted)
        : state.flux < cost ? 'INSUFFICIENT FLUX CORES' : null;
      const result = error ? { ok: false, message: error } : confirm(id);
      if (!result.ok) {
        this.refresh();
        message.textContent = result.message ?? 'ENTRY UNAVAILABLE';
        if ((document.activeElement as HTMLButtonElement)?.disabled)
          this.panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      }
    };
    this.panel.append(heading, this.info, help, message);
    this.paidButton = button(`ENTER ${ACCESS_CARD_NAMES[offered]} · PAY ${cost} FLUX`, () => enter());
    this.paidButton.dataset.controllerFocusId = 'anomaly-entry-flux';
    for (const id of ACCESS_CARD_TYPES) {
      const cardButton = button('', () => enter(id), true);
      cardButton.dataset.controllerFocusId = `anomaly-entry-card-${id}`;
      this.cardButtons.set(id, cardButton);
    }
    button('CANCEL',cancel);
    this.refresh();
    this.root.addEventListener('pointerdown', event => { this.refresh(); event.stopPropagation(); });
    this.root.addEventListener('focusin', () => this.refresh());
    this.root.append(this.panel); getGameUiRoot().append(this.root);
    document.addEventListener('keydown',this.key,true);
    this.panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  private refresh(): AnomalyEntryState {
    const state = this.readState();
    const { cards, flux, lastStarted } = state;
    this.info.textContent = `Normal entry: ${this.cost} Flux · Available: ${flux}\nCards owned: HEIST ${cards.owned.heist} · SkyBreach ${cards.owned.skybreach}\nDaily card uses remaining: ${ACCESS_CARD_DAILY_LIMIT - cards.uses} / ${ACCESS_CARD_DAILY_LIMIT} (00:00 UTC reset)`;
    this.paidButton.disabled = flux < this.cost;
    for (const [id, cardButton] of this.cardButtons) {
      const error = accessCardUseError(cards, id, lastStarted);
      cardButton.disabled = error !== null;
      cardButton.textContent = error
        ? `${ACCESS_CARD_NAMES[id]} CARD · ${cards.owned[id]} OWNED — ${error}`
        : `USE ${ACCESS_CARD_NAMES[id]} CARD · ${cards.owned[id]} OWNED · ENTER ${ACCESS_CARD_NAMES[id]} · NO FLUX`;
    }
    return state;
  }

  destroy(): void { this.destroyed = true; document.removeEventListener('keydown', this.key, true); this.root.remove(); }
}
