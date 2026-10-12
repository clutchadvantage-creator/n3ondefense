import type { CosmeticOption, CosmeticVisualShape } from '../types.ts';
import { HALLOWEEN_SETS } from '../../data/halloweenCosmetics.ts';

export type HalloweenSet = keyof typeof HALLOWEEN_SETS;
export type HalloweenArtKind = 'operative' | 'turret' | 'mine' | 'projectile' | 'bomb';
export type HalloweenPart = 'hero' | 'jaw' | 'wing' | 'bat-body' | 'seal' | 'spark' | 'hand';
export const HALLOWEEN_PARTS: readonly HalloweenPart[] = ['hero', 'jaw', 'wing', 'bat-body', 'seal', 'spark', 'hand'];
export const halloweenTexture = (set: HalloweenSet, part: HalloweenPart): string => `halloween-${set}-${part}`;
export const halloweenSetFromEffect = (effect: string | undefined): HalloweenSet | null =>
  effect === 'witch-signal' || effect === 'halloween-witch' ? 'witch'
    : effect === 'neon-bats' || effect === 'halloween-bats' ? 'bats'
      : effect === 'pumpkin-reactor' || effect === 'halloween-pumpkin' ? 'pumpkin' : null;
export const halloweenSetFromShape = (shape: CosmeticVisualShape | undefined): HalloweenSet | null =>
  shape === 'witchFrame' || shape === 'witchBolt' ? 'witch'
    : shape === 'batFrame' || shape === 'batShard' ? 'bats'
      : shape === 'pumpkinFrame' || shape === 'pumpkinSeed' ? 'pumpkin' : null;
export const halloweenArtKind = (category: CosmeticOption['category']): HalloweenArtKind =>
  category === 'playerShape' ? 'operative' : category === 'turretSkin' ? 'turret'
    : category === 'mineFrame' ? 'mine' : category === 'projectileShape' ? 'projectile' : 'bomb';

let svgSequence = 0;
const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
const bolts = (points: number[][]): string => points.map(([x, y]) => `<circle class="hw-metal" cx="${x}" cy="${y}" r="3"/><path class="hw-etch" d="M${x - 1.5} ${y}h3"/>`).join('');
const seal = (): string => `<circle class="hw-ring" cx="128" cy="128" r="109"/><circle class="hw-line" cx="128" cy="128" r="98" stroke-dasharray="18 9 3 9"/><circle class="hw-ring" cx="128" cy="128" r="79"/>
  ${Array.from({ length: 12 }, (_, i) => `<g transform="rotate(${i * 30} 128 128)"><path class="hw-rune" d="m122 32 6-9 6 9-6 9zM125 46h6M128 42v8"/><path class="hw-etch" d="M128 53v13"/></g>`).join('')}
  <path class="hw-line" opacity=".35" d="m128 50 68 117H60zM128 206 60 89h136z"/>`;
const wing = (): string => `<path class="hw-shadow" d="M132 112Q81 40 15 29l15 95q19-30 40 8 19-21 46 31l24-35z"/>
  <path class="hw-shell" d="M132 106Q86 32 14 20l19 94q20-30 43 7 19-17 46 33l21-32z"/>
  <path class="hw-panel" d="M32 39 115 100 79 108 68 79 40 95z"/><path class="hw-glass" d="m41 46 33 15 41 40-34 7z"/>
  <path class="hw-ridge" d="M22 29 69 70 125 121M69 70l8 44M69 70l-32 33"/>
  <path class="hw-rune" d="m28 30 12 47M52 39l13 10M90 65l12 12"/>${bolts([[69, 70], [118, 114]])}`;
const batBody = (): string => `<path class="hw-shell" d="m106 111-8-41 22 14h16l22-14-8 41 8 34-30 33-30-33z"/>
  <path class="hw-metal" d="m113 143 15 27 15-27-15 7z"/><path class="hw-dark" d="m104 100 24-13 24 13-10 27h-28z"/>
  <path class="hw-hot" d="m108 105 15 5-4 7-9-4zm40 0-15 5 4 7 9-4z"/><path class="hw-light" d="m117 122 3 12 5-10m14-2-3 12-5-10"/>
  <path class="hw-rune" d="m128 133 7 7-7 7-7-7z"/>`;
const bat = (): string => `<g class="hw-wing-flap">${wing()}<g transform="translate(256 0) scale(-1 1)">${wing()}</g></g>${batBody()}`;
const witch = (): string => `<path class="hw-shadow" d="m55 192 11-73 19-12h84l20 83-27 36-34-14-35 14z"/>
  <path class="hw-panel" d="m65 170 8-47 34-13h44l30 20 12 76-39-16-27 22-24-18-39 13z"/>
  <path class="hw-ridge" d="m79 145-7 45 25-15M178 145l7 45-22-15"/>
  <path class="hw-face" d="m85 107 12-24h59l19 30-10 49-23 29-29-3-28-27-6-28z"/>
  <path class="hw-glass" d="m91 116 25 5-8 16-19-5zm67 4 14-7-8 20-21 4z"/>
  <path class="hw-hot" d="m91 122 22 3-8 5-13-2zm72 0-19 5 6 5 12-4z"/>
  <path class="hw-ridge" d="m128 117-9 31 20 3-8 7"/><path class="hw-rune" d="m92 141 9 5m53-4 7-3M109 107l10 2m17 0 12-3"/>
  <g class="hw-hat"><path class="hw-shell" d="m52 105 22-22 33-67 38 4 34 28-32-9 20 47 36 23-60 16-64-5z"/>
  <path class="hw-panel" d="m93 78 22-52 21 4 13 48z"/><path class="hw-dark" d="m78 86 79-8 12 18-87 9z"/>
  <path class="hw-ridge" d="m59 107 74 8 61-7M106 36l-8 22M145 47l12 25"/>
  <path class="hw-hot" d="m123 83 12-1 5 14-15 2z"/><path class="hw-dark" d="m127 86 5-1 3 8-6 1z"/>
  <path class="hw-rune" d="m112 49 8-8 6 7-8 10zm-11 22 9-8 4 9-8 5z"/></g>`;
const pumpkin = (): string => `<path class="hw-shadow" d="M49 140q-6-68 56-73h46q67 7 58 74-7 64-80 68-71-1-80-69z"/>
  <path class="hw-shell" d="M43 136Q37 65 99 67q29-18 58 0 63-3 57 69-1 64-53 63-32 14-65-1-49 0-53-62z"/>
  <path class="hw-panel" d="M97 71q-35 62 3 122M156 72q35 60 3 121"/><path class="hw-ridge" d="M124 66q-23 61-3 132m14-130q23 61 3 130"/>
  <path class="hw-metal" d="m112 70 4-32 19-8 9 9-15 8 13 22z"/><path class="hw-rune" d="M139 59q27-32 39-8t-21 10"/>
  <path class="hw-dark" d="m67 104 49 15-24 21-30-9zm121 0-49 15 24 21 30-9z"/>
  <path class="hw-hot" d="m71 112 36 10-15 10-24-4zm113 0-36 10 15 10 24-4zM128 135l-9 15h19z"/>
  <path class="hw-etch" d="m53 94 14-15 18-3M170 77l16 4 14 17M53 151l9 22 15 11m104-1 17-14 6-22"/>
  ${bolts([[57, 137], [199, 137], [107, 81], [150, 82], [85, 186], [171, 186]])}`;
const jaw = (set: HalloweenSet): string => set === 'pumpkin'
  ? `<path class="hw-dark" d="m69 153 30 8 15-6 14 8 16-8 14 6 29-8-21 31-24 8-29-3-24-14z"/><path class="hw-hot" d="m77 160 18 6 5 12 11-11 17 6 15-6 11 10 6-13 18-4-18 22-23 5-25-3-20-12z"/>`
  : `<path class="hw-dark" d="m99 159 26 5 27-8-6 23-21 8-22-13z"/><path class="hw-light" d="m104 162 10 2-2 8-6-2zm13 3 10 1-1 8-8-2zm13 0 13-4-2 8-10 5z"/><path class="hw-rune" d="m107 182 16 8 21-11"/>`;
const hands = (): string => `<path class="hw-shell" d="m54 173 29-23 23 15-17 36-24-3z"/><path class="hw-face" d="m69 156-4-31 6-6 8 28 2-38 7-3 3 39 7-27 8 2-8 33 15-12 6 6-21 26-24 4z"/><path class="hw-rune" d="m80 155 9-7 6 8-8 7z"/>`;
const thrusters = (): string => `<g class="hw-engine"><path class="hw-metal" d="m50 153 17-9 18 49-12 12-17-9zm140 0-17-9-18 49 12 12 17-9z"/><path class="hw-hot" d="m60 186 14 3-1 34-9 16-7-19zm120 0-14 3 1 34 9 16 7-19z"/><path class="hw-light" d="m63 192 6 2-2 29-4-10zm114 0-6 2 2 29 4-10z"/></g>`;

const turret = (set: HalloweenSet): string => `<ellipse class="hw-shadow" cx="128" cy="218" rx="89" ry="20"/>
  <path class="hw-metal" d="m49 203 18-24h122l18 24-20 25H69z"/><path class="hw-shell" d="m64 192 21-18h86l21 18-15 24H79z"/>
  <ellipse class="hw-ring" cx="128" cy="196" rx="55" ry="16"/>
  ${set === 'witch' ? `<path class="hw-panel" d="m82 186 12-64h68l14 64-47 16z"/><g transform="translate(43 29) scale(.66)">${witch()}${jaw('witch')}</g>` : set === 'bats' ? `<g transform="translate(0 23)">${bat()}</g><path class="hw-panel" d="m100 166-12 30h80l-12-30z"/>` : `<g transform="translate(11 -2) scale(.92)">${pumpkin()}${jaw('pumpkin')}</g>`}
  <g class="hw-turret-barrel"><path class="hw-metal" d="m106 112 4-69h36l4 69-14 13h-16z"/><path class="hw-dark" d="M116 44h24v58h-24z"/>
  <path class="hw-shell" d="m104 45 9-20h30l9 20-9 16h-30z"/><path class="hw-hot" d="m117 30 10-8 12 8-4 21h-14z"/><path class="hw-light" d="M127 29v17"/>
  <path class="hw-rune" d="M110 68h7m22 0h8m-38 14h8m22 0h9m-39 14h8m22 0h9"/></g>
  ${bolts([[73, 201], [184, 201], [99, 216], [157, 216]])}`;

const mine = (set: HalloweenSet): string => `<ellipse class="hw-shadow" cx="128" cy="214" rx="91" ry="17"/>
  <path class="hw-metal" d="m56 181 18-18 18 28-20 23-25-8zm144 0-18-18-18 28 20 23 25-8zM118 196h20l12 31h-44z"/>
  ${set === 'witch' ? `<path class="hw-shell" d="M64 112h128l-10 76-31 22h-45l-32-23z"/><path class="hw-panel" d="M74 124h108l-10 56-28 17h-36l-24-20z"/>
  <ellipse class="hw-metal" cx="128" cy="111" rx="76" ry="25"/><ellipse class="hw-glass" cx="128" cy="108" rx="63" ry="18"/>
  <path class="hw-hot" d="M76 107q21-13 43 0t57-4q-9 14-48 14t-52-10z"/><path class="hw-rune" d="m128 140 20 23-20 23-20-23zM121 159h14m-7-7v22"/>
  <g class="hw-bubbles"><circle class="hw-hot" cx="97" cy="88" r="7"/><circle class="hw-hot" cx="144" cy="64" r="9"/><circle class="hw-light" cx="122" cy="85" r="4"/></g>
  <path class="hw-ridge" d="M62 130q-30-10-26 17t37 13m120-30q30-10 26 17t-37 13"/>`
    : set === 'bats' ? `<path class="hw-shell" d="m128 60 79 77-21 61-58 17-58-17-21-61z"/><path class="hw-panel" d="m55 141 49-34-25 86-11-34zm146 0-49-34 25 86 11-34z"/><g transform="translate(23 22) scale(.82)">${batBody()}</g><path class="hw-rune" d="m78 143 28-10-11 33m83-23-28-10 11 33"/><circle class="hw-ring" cx="128" cy="178" r="12"/><circle class="hw-hot" cx="128" cy="178" r="5"/>`
      : `<g transform="translate(15 28) scale(.88 .86)">${pumpkin()}${jaw('pumpkin')}</g><path class="hw-rune" d="M104 204h48M128 57v-17"/>`}
  ${bolts([[66, 193], [190, 193], [128, 218]])}`;

const projectile = (set: HalloweenSet): string => set === 'witch'
  ? `<path class="hw-line" d="M16 126h58M32 143h40M40 106h29"/><path class="hw-metal" d="M108 66q-72 57 0 122-40-63 0-122z"/><path class="hw-shell" d="m76 126 61-36 87 37-87 35z"/><path class="hw-hot" d="m91 127 48-23 65 23-65 21z"/><path class="hw-light" d="m99 124 40-11 49 13-50-4z"/><path class="hw-rune" d="m124 94 8-17 12 8m-20 78 8 16 12-8"/>`
  : set === 'bats' ? `<g transform="translate(0 -2) rotate(90 128 128)">${bat()}</g><path class="hw-line" d="M20 128h31m-22-16h20m-20 32h20"/>`
    : `<path class="hw-panel" d="m92 109-37-34 7 49-7 47 37-26z"/><path class="hw-shell" d="M74 127q36-71 148 0-111 72-148 0z"/><path class="hw-hot" d="M87 127q55-24 117 0-65 29-117 0z"/><path class="hw-metal" d="m90 104 6 10-6 26-4 12-9-12v-26z"/><path class="hw-light" d="m102 124 66-5 33 8-46-2z"/><path class="hw-rune" d="M16 128h40M31 109l19 6m-19 32 19-6"/>`;

const partMarkup = (set: HalloweenSet, part: HalloweenPart): string => {
  if (part === 'seal') return seal();
  if (part === 'wing') return wing();
  if (part === 'bat-body') return batBody();
  if (part === 'jaw') return jaw(set);
  if (part === 'hand') return hands();
  if (part === 'spark') return `<path class="hw-hot" d="m128 66 14 46 44 16-44 14-14 48-14-48-46-14 46-16z"/><path class="hw-light" d="m128 100 7 21 19 7-19 7-7 21-7-21-21-7 21-7z"/>`;
  return set === 'witch' ? witch() : set === 'bats' ? bat() : pumpkin();
};

const celebration = (set: HalloweenSet): string => `<g transform="translate(0 22)"><g class="hw-seal-turn">${seal()}</g></g>
  <g class="hw-burst-rays">${Array.from({ length: 16 }, (_, i) => `<path class="hw-rune" transform="rotate(${i * 22.5} 128 138)" d="M128 99v-66l4 16"/>`).join('')}</g>
  <g class="hw-reveal"><g class="hw-hover">${partMarkup(set, 'hero')}${set === 'bats' ? '' : `<g class="hw-cackle">${jaw(set)}</g>`}</g></g>
  ${set === 'witch' ? `<g class="hw-cast">${hands()}<g transform="translate(256 0) scale(-1 1)">${hands()}</g></g>` : ''}
  <g class="hw-swarm">${Array.from({ length: set === 'bats' ? 7 : 5 }, (_, i) => `<g transform="translate(${[7, 188, 25, 200, 105, 173, 2][i]} ${[30, 45, 193, 170, 215, 5, 110][i]}) scale(${set === 'bats' ? '.22' : '.14'})"><g class="hw-satellite" style="animation-delay:${-i * .24}s">${set === 'bats' ? `<g class="hw-wing-flap">${wing()}<g transform="translate(256 0) scale(-1 1)">${wing()}</g></g>${batBody()}` : partMarkup(set, 'spark')}</g></g>`).join('')}</g>`;

/** One authored SVG source for the showroom, locker, and rasterized combat sprites. */
export const createHalloweenSvg = (set: HalloweenSet, kind: HalloweenArtKind | HalloweenPart, options: { animate?: boolean; neutral?: boolean; part?: boolean } = {}): string => {
  const id = `hw-${set}-${++svgSequence}`;
  const primary = options.neutral ? '#eeeeee' : hex(HALLOWEEN_SETS[set].color);
  const accent = options.neutral ? '#ffffff' : hex(HALLOWEEN_SETS[set].accentColor);
  const body = options.part ? partMarkup(set, kind as HalloweenPart)
    : kind === 'bomb' ? celebration(set)
      : kind === 'turret' ? turret(set) : kind === 'mine' ? mine(set) : kind === 'projectile' ? projectile(set)
        : `${set === 'bats' ? '<path class="hw-metal" d="m109 143-32 18-7 30 13 4 11-24 23-13zm38 0 32 18 7 30-13 4-11-24-23-13z"/>' : ''}${thrusters()}${partMarkup(set, 'hero')}${set === 'bats' ? '' : jaw(set)}${set === 'witch' ? `<path class="hw-rune" d="m106 213 22-12 22 12-22 14z"/>` : ''}`;
  const source = `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" viewBox="0 0 256 256" class="hw-svg ${options.animate ? 'hw-animated' : ''}" data-halloween-set="${set}" data-halloween-art="${kind}" role="img" aria-label="${HALLOWEEN_SETS[set].label} ${kind}">
  <defs><linearGradient id="${id}-shell" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${primary}" stop-opacity=".55"/><stop offset=".42" stop-color="#162031"/><stop offset=".74" stop-color="#060b16"/><stop offset="1" stop-color="${primary}" stop-opacity=".35"/></linearGradient>
  <linearGradient id="${id}-metal" x2=".3" y2="1"><stop stop-color="#d7e9f0"/><stop offset=".3" stop-color="#465567"/><stop offset=".65" stop-color="#0d1724"/><stop offset="1" stop-color="#789099"/></linearGradient>
  <radialGradient id="${id}-glass"><stop stop-color="${accent}" stop-opacity=".7"/><stop offset="1" stop-color="#081420"/></radialGradient></defs>
  <style>
  .hw-svg{overflow:visible}.hw-svg path,.hw-svg circle,.hw-svg ellipse{stroke-linejoin:round;stroke-linecap:round}
  .hw-svg .hw-shadow{fill:#01030a;opacity:.65}.hw-svg .hw-shell{fill:url(#${id}-shell);stroke:${primary};stroke-width:2.4}
  .hw-svg .hw-panel{fill:#101727;stroke:${primary};stroke-width:1.6}.hw-svg .hw-metal{fill:url(#${id}-metal);stroke:#9aafb8;stroke-width:1.5}
  .hw-svg .hw-glass{fill:url(#${id}-glass);stroke:${accent};stroke-width:1.7}.hw-svg .hw-dark{fill:#01040b;stroke:${primary};stroke-width:1}
  .hw-svg .hw-face{fill:url(#${id}-glass);stroke:${accent};stroke-width:2}.hw-svg .hw-ridge{fill:none;stroke:${primary};stroke-width:2.4}
  .hw-svg .hw-rune,.hw-svg .hw-line,.hw-svg .hw-ring{fill:none;stroke:${accent};stroke-width:1.8}.hw-svg .hw-ring{stroke:${primary};stroke-width:2;opacity:.55}
  .hw-svg .hw-hot{fill:${accent};stroke:${accent};stroke-width:1.8;filter:drop-shadow(0 0 4px ${accent})}.hw-svg .hw-light{fill:#edfffa;stroke:#edfffa;stroke-width:1}
  .hw-svg .hw-etch{fill:none;stroke:#bad1e1;stroke-width:1;opacity:.65}
  .hw-animated .hw-seal-turn{transform-origin:128px 128px;animation:hwSeal 9s linear infinite}.hw-animated .hw-reveal{transform-origin:128px 160px;animation:hwReveal 4.2s ease-in-out infinite}
  .hw-animated .hw-hover{transform-origin:128px 128px;animation:hwHover 2.1s ease-in-out infinite}.hw-animated .hw-cackle{animation:hwCackle .42s ease-in-out infinite}
  .hw-animated .hw-satellite{animation:hwSatellite 1.7s ease-in-out infinite alternate}.hw-animated .hw-wing-flap{transform-origin:128px 110px;animation:hwFlap .25s ease-in-out infinite alternate}
  .hw-animated .hw-cast{animation:hwCast 2.1s ease-in-out infinite}.hw-animated .hw-bubbles{animation:hwSatellite 1.8s ease-in-out infinite}
  .hw-animated .hw-burst-rays{transform-origin:128px 138px;animation:hwBurst 4.2s ease-out infinite}.hw-animated .hw-engine{animation:hwEngine .8s ease-in-out infinite alternate}
  @keyframes hwSeal{to{transform:rotate(360deg)}}@keyframes hwReveal{0%,100%{transform:scale(.18);opacity:0}12%{transform:scale(1.08);opacity:1}22%,72%{transform:scale(1);opacity:1}90%{transform:scale(1.12);opacity:0}}
  @keyframes hwHover{50%{transform:translateY(-5px) rotate(-2deg)}}@keyframes hwCackle{50%{transform:translateY(7px)}}@keyframes hwSatellite{to{transform:translate(9px,-22px) rotate(12deg)}}@keyframes hwFlap{to{transform:scaleY(.38)}}
  @keyframes hwCast{50%{transform:translateY(-13px)}}@keyframes hwBurst{0%{transform:scale(.2);opacity:0}10%{opacity:1}35%,100%{transform:scale(1.3);opacity:0}}@keyframes hwEngine{to{opacity:.6}}
  @media(prefers-reduced-motion:reduce){.hw-animated *{animation:none!important}}
  </style>${body}</svg>`;
  // Each inline SVG owns its gradients and palette, including mixed-set store grids.
  return source.replaceAll('.hw-svg', `#${id}`).replaceAll('.hw-animated', `#${id}.hw-animated`);
};

export const halloweenSvgDataUri = (source: string): string => `data:image/svg+xml;base64,${btoa(source)}`;
export const createHalloweenSvgElement = (set: HalloweenSet, kind: HalloweenArtKind, animate = true): SVGSVGElement => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createHalloweenSvg(set, kind, { animate });
  return wrapper.firstElementChild as SVGSVGElement;
};
