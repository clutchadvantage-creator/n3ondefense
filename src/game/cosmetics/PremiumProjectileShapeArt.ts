import type { CosmeticVisualShape } from '../types.ts';

export type PremiumProjectileShape = Extract<
  CosmeticVisualShape,
  'medicalNeedle' | 'hardwareBolt' | 'alienGoo' | 'cerealLoop' | 'fly' | 'joint' | 'tacticalMissile' | 'teardrop'
>;

const SVG_NS = 'http://www.w3.org/2000/svg';

const PROJECTILE_MARKUP: Record<PremiumProjectileShape, string> = {
  medicalNeedle: `
    <path class="pp-shadow" d="M11 42h69l20 7H17z"/><path class="pp-metal-dark" d="M7 24h15v20H7l5-5V29z"/>
    <path class="pp-metal" d="M19 20h8v28h-8zM3 16h7v35H3z"/><path class="pp-shell" d="M26 19h55l13 13-13 14H26z"/>
    <path class="pp-glass" d="M31 23h44l10 9-10 9H31z"/><path class="pp-fluid" d="M35 31h43l7 3-8 5H35z"/>
    <path class="pp-highlight" d="M31 23h43l5 4H35z"/><path class="pp-metal" d="m91 28 21 2 6 3-6 3-21 1z"/><path class="pp-line" d="M41 24v7m10-7v7m10-7v7m10-7v7"/><circle class="pp-light" cx="28" cy="33" r="3"/>
  `,
  hardwareBolt: `
    <path class="pp-shadow" d="m12 44 73-2 24 7-83 5z"/><path class="pp-metal-dark" d="m4 22 17-12 18 10v25L21 55 4 44z"/>
    <path class="pp-metal" d="m6 18 17-10 16 10-17 10z"/><path class="pp-shell" d="M34 21h67l15 12-15 13H34z"/>
    <path class="pp-highlight" d="M37 23h62l8 5H39z"/><path class="pp-metal-dark" d="M37 38h65l10-5-11 13H34z"/>
    <g class="pp-thread"><path d="m46 22-9 24m20-24-9 24m20-24-9 24m20-24-9 24m20-24-9 24"/></g><path class="pp-accent" d="M98 23h5l11 10-11 11h-5l9-11z"/>
  `,
  alienGoo: `
    <path class="pp-shadow" d="M15 47c17-8 59-10 88-2l9 7c-29 8-77 7-97-5z"/>
    <path class="pp-goo" d="M9 33c4-13 17-21 31-18 10-13 31-12 39 1 14-6 30 1 34 14 5 16-12 26-29 21-10 8-27 8-37 0-12 5-32 1-38-8-2-3-2-7 0-10z"/>
    <path class="pp-goo-core" d="M20 32c8-9 18-11 29-7 11-10 26-7 32 3 10-3 19 0 24 7-8 9-22 9-32 6-12 7-34 5-53-9z"/>
    <path class="pp-highlight" d="M23 27c8-8 19-8 27-3m36 1c8-1 14 2 18 7"/><g class="pp-bubbles"><circle cx="38" cy="38" r="5"/><circle cx="66" cy="25" r="4"/><circle cx="88" cy="39" r="6"/><circle cx="59" cy="45" r="3"/></g><path class="pp-accent" d="m103 26 15 7-13 8 5-8z"/>
  `,
  cerealLoop: `
    <ellipse class="pp-shadow" cx="62" cy="48" rx="38" ry="11"/><path class="pp-loop-side" d="M30 22c13-14 46-17 63-4 15 11 9 29-9 36-20 8-49 3-59-10-6-8-4-16 5-22zm17 12c-5 5-3 10 4 13 8 4 22 3 28-2 5-4 3-9-3-12-8-4-23-4-29 1z"/>
    <path class="pp-loop" d="M28 17c14-13 47-15 64-2 15 11 8 28-10 34-20 7-49 2-58-11-6-8-4-15 4-21zm18 11c-5 4-3 9 4 12 8 4 22 3 28-1 5-4 3-9-3-12-8-4-23-3-29 1z"/>
    <path class="pp-highlight" d="M38 18c13-7 34-7 47 1"/><g class="pp-sprinkles"><path d="m34 31 5 2m12-17 3 4m19-4-2 4m18 8-5 2M39 41l4-2m36 5 4-3"/></g>
  `,
  fly: `
    <path class="pp-shadow" d="M31 45h64l14 6H22z"/><path class="pp-wing" d="M54 31C35 24 22 10 31 5c10-5 27 8 35 22zM61 36c-16 7-27 22-17 25 10 3 24-11 30-21z"/>
    <path class="pp-wing back" d="M72 29C84 15 102 9 107 18c4 9-11 19-27 22z"/><ellipse class="pp-metal-dark" cx="70" cy="35" rx="26" ry="15"/>
    <ellipse class="pp-shell" cx="73" cy="31" rx="24" ry="14"/><path class="pp-band" d="M61 20v23m10-26v28m11-25v22"/><circle class="pp-eye" cx="98" cy="27" r="8"/><circle class="pp-light" cx="101" cy="24" r="3"/>
    <path class="pp-legs" d="M58 41 46 53m24-8-2 14m15-18 12 11M57 23 45 13m40 9 11-11"/>
  `,
  joint: `
    <path class="pp-smoke" d="M103 18c9-7-2-10 7-16m-1 19c13-6 2-11 10-16"/><path class="pp-shadow" d="m10 43 88-10 18 9-91 12z"/>
    <path class="pp-paper-side" d="m15 26 80-11 15 14-9 20-81 8-12-14z"/><path class="pp-paper" d="m13 22 81-10 15 13-10 17-81 9L7 39z"/>
    <path class="pp-highlight" d="m20 25 70-9 10 8-72 8z"/><path class="pp-twist" d="m7 27-7 8 7 8 11-4z"/><path class="pp-ember" d="m99 19 15 3 6 9-10 9-11-2 7-7z"/><path class="pp-ash" d="m109 22 6 3 3 6-7 6-5-2 6-5z"/>
    <path class="pp-leaf" d="M54 28c8-8 16-4 15 4-7 5-13 5-18 2 6-1 10-3 13-6-5 2-8 2-10 0z"/>
  `,
  tacticalMissile: `
    <path class="pp-shadow" d="m9 45 88-3 18 8-95 5z"/><path class="pp-fin-dark" d="m27 24-14-15 29 9m-15 24-15 16 31-10"/>
    <path class="pp-metal-dark" d="M13 24h74l27 10-27 15H13l11-13z"/><path class="pp-metal" d="M14 19h73l29 12-29 12H14l12-12z"/>
    <path class="pp-nose" d="m86 19 30 12-30 12 11-12z"/><path class="pp-panel" d="M38 20h27v22H38z"/><path class="pp-warning" d="M67 20h11v22H67z"/><path class="pp-highlight" d="M26 22h61l14 6H30z"/>
    <path class="pp-fin" d="m33 20-11-17 25 16m-14 23L22 59l25-17"/><path class="pp-exhaust" d="m15 24-15 7 15 7 9-7z"/><path class="pp-line" d="M42 23v16m6-16v16M83 23v16"/>
  `,
  teardrop: `
    <path class="pp-shadow" d="M18 45c26-10 62-8 89 2l10 6H29z"/><path class="pp-drop-side" d="M9 35C28 13 60 5 116 33 89 63 40 63 9 43z"/>
    <path class="pp-drop" d="M5 30C27 9 62 3 117 30 87 57 39 57 5 38z"/><path class="pp-drop-core" d="M26 31c19-13 43-14 72-2-21 15-47 18-72 7z"/>
    <path class="pp-highlight" d="M30 23c17-8 38-7 55-1"/><circle class="pp-sparkle" cx="74" cy="19" r="4"/><path class="pp-accent" d="m5 30 15 4-15 4z"/>
  `
};

const colorHex = (color: number): string => `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`;

export const isPremiumProjectileShape = (shape: CosmeticVisualShape | undefined): shape is PremiumProjectileShape =>
  !!shape && Object.prototype.hasOwnProperty.call(PROJECTILE_MARKUP, shape);

export const createPremiumProjectileShapeSvgMarkup = (
  shape: PremiumProjectileShape,
  primaryColor: number,
  accentColor: number
): string => {
  const primary = colorHex(primaryColor);
  const accent = colorHex(accentColor);
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 120 64" role="img" aria-label="Premium projectile shape preview" class="premium-projectile-shape-svg" data-projectile-shape="${shape}">
    <style>
      .pp-shadow{fill:#000;opacity:.44}.pp-shell{fill:#162733;stroke:${primary};stroke-width:2;stroke-linejoin:round}.pp-metal{fill:#9aabb6;stroke:#e9fbff;stroke-width:1.7;stroke-linejoin:round}.pp-metal-dark{fill:#26333d;stroke:#647985;stroke-width:1.6;stroke-linejoin:round}.pp-highlight{fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;opacity:.82}.pp-accent,.pp-light,.pp-fluid{fill:${primary};stroke:#efffff;stroke-width:1.2;filter:drop-shadow(0 0 4px ${primary})}.pp-line,.pp-thread,.pp-legs{fill:none;stroke:${accent};stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.pp-glass{fill:#0b2d34;fill-opacity:.78;stroke:#bfffff;stroke-width:1.6}.pp-goo{fill:${primary};fill-opacity:.58;stroke:#dfffbf;stroke-width:2.2;filter:drop-shadow(0 0 5px ${primary})}.pp-goo-core{fill:#9cff57;fill-opacity:.48}.pp-bubbles{fill:#efffcf;fill-opacity:.5;stroke:${accent};stroke-width:1}.pp-loop{fill:${primary};stroke:#fff0bd;stroke-width:2.2}.pp-loop-side{fill:#6e254f;stroke:${accent};stroke-width:2}.pp-sprinkles{fill:none;stroke:#ffef75;stroke-width:2.4;stroke-linecap:round}.pp-wing{fill:#9ff9ff;fill-opacity:.62;stroke:${accent};stroke-width:1.7}.pp-wing.back{opacity:.52}.pp-band{fill:none;stroke:${primary};stroke-width:3}.pp-eye{fill:${accent};stroke:#fff;stroke-width:1.4;filter:drop-shadow(0 0 4px ${accent})}.pp-paper{fill:#e9dfc7;stroke:#fff;stroke-width:1.7}.pp-paper-side{fill:#877c6a;stroke:#38434b;stroke-width:1.5}.pp-twist{fill:#d8cdb6;stroke:#fff;stroke-width:1.4}.pp-ember{fill:#ff6a35;stroke:#ffd260;stroke-width:2;filter:drop-shadow(0 0 5px #ff6a35)}.pp-ash{fill:#4e5358;stroke:#aeb6bb;stroke-width:1}.pp-smoke{fill:none;stroke:#bac5c9;stroke-width:2;stroke-linecap:round;opacity:.55}.pp-leaf{fill:#66f477;stroke:#dbff8b;stroke-width:1}.pp-fin-dark{fill:#26323c;stroke:#53646f;stroke-width:1.6}.pp-nose{fill:#dce8ed;stroke:${primary};stroke-width:1.7}.pp-panel{fill:#354752;stroke:${accent};stroke-width:1.4}.pp-warning{fill:#ffbe4f;stroke:#592f19;stroke-width:1}.pp-fin{fill:#617480;stroke:#c9e4ec;stroke-width:1.5}.pp-exhaust{fill:${primary};stroke:#fff;stroke-width:1.2;filter:drop-shadow(0 0 5px ${primary})}.pp-drop{fill:#57dcff;fill-opacity:.62;stroke:#d9fbff;stroke-width:2.2;filter:drop-shadow(0 0 5px ${primary})}.pp-drop-side{fill:#143d72;fill-opacity:.74;stroke:${accent};stroke-width:1.7}.pp-drop-core{fill:${primary};fill-opacity:.34}.pp-sparkle{fill:#fff;stroke:${accent};stroke-width:1;filter:drop-shadow(0 0 4px ${accent})}
    </style>${PROJECTILE_MARKUP[shape]}</svg>`;
};

export const createPremiumProjectileShapeSvgDataUri = (
  shape: PremiumProjectileShape,
  primaryColor: number,
  accentColor: number
): string => {
  const source = createPremiumProjectileShapeSvgMarkup(shape, primaryColor, accentColor);
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
};

export const createPremiumProjectileShapeSvg = (
  shape: CosmeticVisualShape | undefined,
  primaryColor: number,
  accentColor: number
): SVGSVGElement | null => {
  if (!isPremiumProjectileShape(shape)) return null;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createPremiumProjectileShapeSvgMarkup(shape, primaryColor, accentColor);
  return wrapper.firstElementChild as SVGSVGElement;
};
