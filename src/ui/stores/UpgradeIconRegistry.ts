import type { UpgradeDirection, UpgradeEffectIcon, UpgradeSystemIcon } from '../../game/types.ts';

type StoreUpgradeIcon = UpgradeSystemIcon | UpgradeEffectIcon | 'plus' | 'arrowUp' | 'arrowDown';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Small, dependency-free line icons for the Upgrade Store terminal. Geometry is
 * created only when a card/detail view is rendered; there is no per-frame work.
 */
const ICON_GEOMETRY: Record<StoreUpgradeIcon, string> = {
  operative: '<circle cx="32" cy="23" r="10"/><path d="M18 55c1-13 6-21 14-21s13 8 14 21M23 43l9 10 9-10"/>',
  weapon: '<path d="M8 34h29l10-10 9 4-7 11-14 4H20l-7 8H7l5-13z"/><path d="M25 43l5 10h10l-4-10M46 27l7 7"/>',
  fence: '<path d="M13 11v42M51 11v42M8 18h10M46 18h10M8 48h10M46 48h10"/><path d="M16 23l8 7-7 6 10 7 9-12 10 7"/>',
  turret: '<path d="M16 49h32M22 49l4-12h12l4 12M20 37h24V24H20zM32 24V14"/><path d="M32 18h18l6 6-6 6H44"/>',
  mine: '<circle cx="32" cy="32" r="16"/><circle cx="32" cy="32" r="7"/><path d="M32 4v10M32 50v10M4 32h10M50 32h10M12 12l7 7M45 45l7 7M52 12l-7 7M19 45l-7 7"/>',
  health: '<path d="M25 10h14v15h15v14H39v15H25V39H10V25h15z"/>',
  speed: '<path d="M10 20h22M6 31h21M12 42h18"/><path d="M28 15h13l13 17-13 17H28l13-17z"/>',
  dash: '<path d="M7 21h20M4 32h25M9 43h18"/><path d="M28 15l28 17-28 17 8-17z"/>',
  pickupRadius: '<circle cx="32" cy="32" r="7"/><circle cx="32" cy="32" r="16"/><path d="M32 4v9M32 51v9M4 32h9M51 32h9"/>',
  shield: '<path d="M32 7l20 8v14c0 13-8 22-20 28C20 51 12 42 12 29V15z"/><path d="M22 31l7 7 14-16"/>',
  battery: '<rect x="12" y="18" width="37" height="28" rx="3"/><path d="M49 26h5v12h-5M18 24v16M26 24v16M34 24v16"/>',
  energyRegen: '<path d="M36 7L19 34h13l-4 23 18-30H33z"/><path d="M11 17a27 27 0 0 1 39-3M53 47a27 27 0 0 1-39 3"/>',
  damage: '<path d="M32 5l5 17 13-10-7 16 17 4-17 5 7 15-14-9-4 16-5-16-13 9 7-16-17-4 17-5-7-15 14 9z"/>',
  fireRate: '<path d="M7 20h23M4 31h27M9 42h21"/><path d="M34 19h9l14 13-14 13h-9l11-13z"/>',
  projectileSpeed: '<path d="M5 20h25M9 31h25M4 42h26"/><path d="M35 20l22 12-22 12 7-12z"/>',
  critical: '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="3"/><path d="M32 5v9M32 50v9M5 32h9M50 32h9"/>',
  efficiency: '<path d="M10 42a25 25 0 1 1 44 0"/><path d="M32 32l14-12M19 47h26"/><circle cx="32" cy="32" r="4"/>',
  duration: '<circle cx="32" cy="34" r="21"/><path d="M25 7h14M32 13v6M32 34V22M32 34l10 6"/>',
  armor: '<path d="M32 6l21 9-4 26-17 17-17-17-4-26z"/><path d="M21 32h22M32 21v22"/>',
  capacity: '<rect x="11" y="13" width="30" height="38" rx="3"/><path d="M41 22h7v29H18M20 25h12M20 33h12M20 41h12"/>',
  range: '<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="11"/><circle cx="32" cy="32" r="3"/><path d="M32 4v8M32 52v8M4 32h8M52 32h8"/>',
  explosion: '<path d="M32 5l6 16 14-9-8 15 16 5-16 5 8 15-14-9-6 16-6-16-14 9 8-15-16-5 16-5-8-15 14 9z"/><circle cx="32" cy="32" r="5"/>',
  arming: '<circle cx="30" cy="35" r="18"/><path d="M30 35V23M30 35l9 6M23 9h14M47 18l5-5"/><path d="M48 31h10M53 26v10"/>',
  plus: '<path d="M27 9h10v18h18v10H37v18H27V37H9V27h18z"/>',
  arrowUp: '<path d="M32 7l20 22H39v28H25V29H12z"/>',
  arrowDown: '<path d="M25 7h14v28h13L32 57 12 35h13z"/>'
};

export const directionIcon = (direction: UpgradeDirection): StoreUpgradeIcon =>
  direction === 'add' ? 'plus' : direction === 'decrease' ? 'arrowDown' : 'arrowUp';

export const createUpgradeSvgIcon = (icon: StoreUpgradeIcon, className = ''): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  svg.innerHTML = ICON_GEOMETRY[icon] ?? ICON_GEOMETRY.operative;
  return svg;
};

