import type { CosmeticVisualShape } from '../../game/types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const BASE_SHAPES = new Set<CosmeticVisualShape>(['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond', 'cross']);

const OUTER_SHAPE_MARKUP: Partial<Record<CosmeticVisualShape, string>> = {
  circle: '<circle cx="50" cy="48" r="32"/>',
  square: '<path d="M20 18h58v58H20z"/>',
  triangle: '<path d="m50 12 36 65H14z"/>',
  star: '<path d="m50 8 10 25 27 2-21 18 7 27-23-15-23 15 7-27-21-18 27-2z"/>',
  hexagon: '<path d="m25 17 50 0 15 31-15 31H25L10 48z"/>',
  diamond: '<path d="m50 7 41 41-41 41L9 48z"/>',
  cross: '<path d="M35 8h30v25h25v30H65v25H35V63H10V33h25z"/>'
};
const silhouette = (shape: CosmeticVisualShape): string => OUTER_SHAPE_MARKUP[shape] ?? '';

const INSET_SHAPE_MARKUP: Partial<Record<CosmeticVisualShape, string>> = {
  circle: '<circle cx="47" cy="45" r="22"/>',
  square: '<path d="M29 27h40v40H29z"/>',
  triangle: '<path d="m50 27 22 40H28z"/>',
  star: '<path d="m50 25 6 14 16 2-12 10 4 16-14-9-14 9 4-16-12-10 16-2z"/>',
  hexagon: '<path d="m31 29 37 0 10 19-10 19H31L21 48z"/>',
  diamond: '<path d="m50 23 25 25-25 25-25-25z"/>',
  cross: '<path d="M42 23h16v17h17v16H58v17H42V56H25V40h17z"/>'
};
const inset = (shape: CosmeticVisualShape): string => INSET_SHAPE_MARKUP[shape] ?? '';

const frameMarkup = (shape: CosmeticVisualShape): string => {
  if (!BASE_SHAPES.has(shape)) return '';
  const outer = silhouette(shape);
  const inner = inset(shape);
  return `
    <g class="bf-depth" transform="translate(7 8)">${outer}</g>
    <g class="bf-shell">${outer}</g>
    <path class="bf-side" d="M19 70 26 78h49l8-8-8 13H24z"/>
    <g class="bf-panel">${inner}</g>
    <circle class="bf-core-ring" cx="50" cy="48" r="11"/>
    <path class="bf-core" d="m50 38 9 6v10l-9 6-9-6V44z"/>
    <path class="bf-highlight" d="M27 25q20-15 43-5M24 32l5-7"/>
    <g class="bf-seams"><path d="M50 18v9M50 69v10M18 48h9M73 48h10"/></g>
    <g class="bf-bolts"><circle cx="27" cy="28" r="2"/><circle cx="73" cy="28" r="2"/><circle cx="27" cy="68" r="2"/><circle cx="73" cy="68" r="2"/></g>
  `;
};

export const isBaseOperativeFrameShape = (shape: CosmeticVisualShape | undefined): boolean => Boolean(shape && BASE_SHAPES.has(shape));

export const createBaseOperativeFrameSvg = (shape: CosmeticVisualShape | undefined): SVGSVGElement | null => {
  if (!shape) return null;
  const markup = frameMarkup(shape);
  if (!markup) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('base-frame-svg');
  svg.setAttribute('viewBox', '0 0 100 96');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = markup;
  return svg;
};

/** Shared Phaser source for the exact same layered silhouette shown in Store UI. */
export const createBaseOperativeFrameSvgDataUri = (shape: CosmeticVisualShape | undefined): string | null => {
  if (!shape) return null;
  const markup = frameMarkup(shape);
  if (!markup) return null;
  const styles = `
    .bf-depth{fill:#101821;stroke:#05080c;stroke-width:5;stroke-linejoin:round}
    .bf-shell{fill:#d9e2e8;stroke:#fff;stroke-width:3;stroke-linejoin:round}
    .bf-side{fill:#4c5d68;stroke:#101820;stroke-width:2;stroke-linejoin:round}
    .bf-panel{fill:#758893;stroke:#e7fbff;stroke-width:2;stroke-linejoin:round}
    .bf-core-ring{fill:#111a22;stroke:#fff;stroke-width:2}.bf-core{fill:#fff;stroke:#283944;stroke-width:2}
    .bf-highlight,.bf-seams{fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round}.bf-bolts{fill:#fff;stroke:#1a2831;stroke-width:1}
  `;
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 96"><style>${styles}</style>${markup}</svg>`;
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
};
