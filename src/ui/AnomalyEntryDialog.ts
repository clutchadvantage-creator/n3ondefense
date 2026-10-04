import { ACCESS_CARD_NAMES, ACCESS_CARD_TYPES, ACCESS_CARD_DAILY_LIMIT, accessCardUseError, type AnomalyAccessCards } from '../game/anomalies/AnomalyAccessCards.ts';
import type { AnomalyId } from '../game/anomalies/types.ts';
import './anomaly-access.css';
import { getGameUiRoot } from './getGameUiRoot.ts';

export class AnomalyEntryDialog {
  private readonly root = document.createElement('div');
  private readonly panel = document.createElement('section');
  private readonly key = (event: KeyboardEvent) => {
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.cancel(); }
    if (event.code === 'Tab') {
      const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
  };
  constructor(offered: AnomalyId, cost: number, flux: number, cards: AnomalyAccessCards, lastStarted: string | undefined,
    private readonly cancel: () => void, confirm: (card?: AnomalyId) => {ok:boolean;message?:string}) {
    this.root.className = 'anomaly-entry-overlay'; this.panel.className = 'anomaly-entry-dialog';
    this.panel.setAttribute('role','dialog'); this.panel.setAttribute('aria-modal','true');
    this.panel.setAttribute('aria-label','Anomaly entry');
    const heading = document.createElement('h2'); heading.textContent = `PORTAL // ${ACCESS_CARD_NAMES[offered]}`;
    const info = document.createElement('p'); info.textContent = `Normal entry: ${cost} Flux · Available: ${flux}\nCards owned: HEIST ${cards.owned.heist} · SkyBreach ${cards.owned.skybreach}\nDaily card uses remaining: ${ACCESS_CARD_DAILY_LIMIT-cards.uses} / 3 (00:00 UTC reset)`;
    info.style.whiteSpace = 'pre-line';
    const message = document.createElement('p'); message.className='access-entry-message'; message.setAttribute('role','status');
    const button = (label:string, action:()=>void, disabled=false) => {
      const b = document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=disabled;
      b.addEventListener('click',action); this.panel.append(b); return b;
    };
    const enter = (id?:AnomalyId) => { const result=confirm(id); if(!result.ok)message.textContent=result.message??'ENTRY UNAVAILABLE'; };
    this.panel.append(heading,info,message);
    button(`ENTER ${ACCESS_CARD_NAMES[offered]} · PAY ${cost} FLUX`,()=>enter(),flux<cost);
    for(const id of ACCESS_CARD_TYPES)if(cards.owned[id]>0){
      const error=accessCardUseError(cards,id,lastStarted);
      button(error?`${ACCESS_CARD_NAMES[id]} CARD — ${error}`:`USE ${ACCESS_CARD_NAMES[id]} CARD · ENTER ${ACCESS_CARD_NAMES[id]} · NO FLUX`,()=>enter(id),!!error);
    }
    button('CANCEL',cancel);
    this.root.addEventListener('pointerdown',event=>event.stopPropagation());
    this.root.append(this.panel); getGameUiRoot().append(this.root);
    document.addEventListener('keydown',this.key,true);
    this.panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  destroy():void { document.removeEventListener('keydown',this.key,true);this.root.remove(); }
}
