import type { AnomalyId } from '../game/anomalies/types.ts';
import { ACCESS_CARD_NAMES } from '../game/anomalies/AnomalyAccessCards.ts';
import './anomaly-access.css';

export function createAccessCardView(id: AnomalyId, owned: number): HTMLElement {
  const card = document.createElement('article');
  card.className = `anomaly-access-card ${id}`;
  const sky = id === 'skybreach';
  card.innerHTML = `<header><span>RWG // OPERATIONS</span><b>${sky ? 'AERIAL' : 'SECURE'}</b></header>
    <svg viewBox="0 0 240 180" aria-hidden="true"><path class="access-frame" d="M18 20 40 6h160l22 14v134l-22 18H40l-22-18z"/>
    <path class="access-grid" d="M30 50h180M30 90h180M30 130h180M70 20v140M120 20v140M170 20v140"/>
    ${sky ? '<path class="access-cloud" d="M30 140q-8-25 18-27 5-32 35-14 26-15 32 18 25-5 29 23zM151 58q-8-25 18-27 5-21 27-8 28-5 26 35z"/><path class="access-icon" d="m120 30 12 54 56 29-3 15-53-15-2 26 14 13-1 8-23-8-23 8-1-8 14-13-2-26-53 15-3-15 56-29z"/>'
      : '<path class="access-icon" d="M69 39h102v107H69zM81 50h78v85H81z"/><circle class="access-icon" cx="120" cy="88" r="23"/><path class="access-detail" d="M120 65v46M97 88h46M41 44v94M199 44v94"/>'}
    <path class="access-detail" d="M24 18h30M24 18v25M216 18h-30M216 18v25M24 159h30M216 159h-30"/></svg>
    <h3>${ACCESS_CARD_NAMES[id]}</h3><p>ANOMALY ACCESS CARD</p><div class="access-clearance">ONE ENTRY // NO FLUX FEE</div>
    <footer><span class="access-barcode" aria-hidden="true"></span><strong>OWNED ${owned}</strong></footer>`;
  return card;
}
