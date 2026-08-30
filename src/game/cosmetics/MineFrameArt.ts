import type { MineFrameCosmeticEffectId } from '../types.ts';

export type MineFrameArtId = 'default' | MineFrameCosmeticEffectId;

const SVG_NS = 'http://www.w3.org/2000/svg';

const MINE_FRAME_MARKUP: Record<MineFrameArtId, string> = {
  default: `
    <ellipse class="mf-shadow" cx="100" cy="142" rx="56" ry="16"/>
    <g class="mf-spikes"><path d="m100 18 9 30H91zM100 152l9-30H91zM24 85l30-9v18zm152 0-30-9v18zM46 31l28 15-13 13zm108 0-28 15 13 13zM46 139l28-15-13-13zm108 0-28-15 13-13z"/></g>
    <ellipse class="mf-side" cx="104" cy="91" rx="51" ry="49"/><circle class="mf-shell" cx="100" cy="84" r="50"/>
    <circle class="mf-panel" cx="100" cy="84" r="31"/><circle class="mf-core" cx="100" cy="84" r="13"/>
    <path class="mf-line" d="m100 39 9 15-9 9-9-9zM145 84l-15 9-9-9 9-9zM100 129l-9-15 9-9 9 9zM55 84l15-9 9 9-9 9z"/>
  `,
  'road-hazard': `
    <ellipse class="mf-shadow" cx="100" cy="145" rx="64" ry="17"/><ellipse class="mf-side" cx="105" cy="92" rx="58" ry="54"/>
    <circle class="mf-tire" cx="100" cy="84" r="57"/><circle class="mf-rim" cx="100" cy="84" r="37"/>
    <g class="mf-tread"><path d="M69 32 57 45l12 9M45 58 35 76l15 5M36 95l10 18 14-8M58 126l17 10 7-15M131 32l12 13-12 9M155 58l10 18-15 5M164 95l-10 18-14-8M142 126l-17 10-7-15"/></g>
    <g class="mf-spokes"><path d="m100 49 9 25-9 10-9-10zm35 35-25 9-10-9 10-9zm-35 35-9-25 9-10 9 10zM65 84l25-9 10 9-10 9z"/></g>
    <circle class="mf-panel" cx="100" cy="84" r="18"/><g class="mf-lugs"><circle cx="100" cy="70" r="3"/><circle cx="113" cy="80" r="3"/><circle cx="108" cy="96" r="3"/><circle cx="92" cy="96" r="3"/><circle cx="87" cy="80" r="3"/></g><circle class="mf-core" cx="100" cy="84" r="7"/>
  `,
  lifeline: `
    <ellipse class="mf-shadow" cx="100" cy="144" rx="65" ry="17"/><ellipse class="mf-side" cx="104" cy="92" rx="61" ry="51"/>
    <ellipse class="mf-shell" cx="100" cy="83" rx="61" ry="52"/><ellipse class="mf-dark" cx="100" cy="83" rx="31" ry="25"/>
    <path class="mf-white" d="M58 45 76 61 63 75 43 64zM142 45l-18 16 13 14 20-11zM58 121l18-16-13-14-20 11zM142 121l-18-16 13-14 20 11z"/>
    <path class="mf-rope" d="M31 81c2-38 31-65 69-65s67 27 69 65-29 70-69 70-71-32-69-70z"/>
    <g class="mf-rope-knots"><circle cx="34" cy="79" r="5"/><circle cx="100" cy="17" r="5"/><circle cx="166" cy="79" r="5"/><circle cx="100" cy="148" r="5"/></g>
    <circle class="mf-panel" cx="100" cy="83" r="17"/><circle class="mf-core" cx="100" cy="83" r="8"/>
  `,
  hatchling: `
    <ellipse class="mf-shadow" cx="100" cy="146" rx="57" ry="16"/><path class="mf-slime" d="M47 137c12-18 20-7 31-12 10-4 10 9 23 4 15-6 14 7 31 2 11-3 16 5 21 12-29 13-81 13-106-6z"/>
    <path class="mf-side" d="M55 91C55 44 74 18 100 18s45 26 45 73c0 36-18 56-45 56S55 127 55 91z"/>
    <path class="mf-glass" d="M51 83C51 36 72 12 98 12s47 27 47 74c0 35-19 54-45 54S51 119 51 83z"/>
    <path class="mf-shell-plate" d="m60 55 19-29 10 31-17 21zm80 0-19-29-10 31 17 21zM57 96l24-18 13 28-20 25zm86 0-24-18-13 28 20 25z"/>
    <path class="mf-vein" d="m99 24-8 28 9 18-12 23 12 34m27-90-17 24 12 18-17 17M70 43l13 20-12 22 17 15"/>
    <ellipse class="mf-creature" cx="100" cy="88" rx="18" ry="27"/><path class="mf-white" d="m86 82 12 5-12 6zm28 0-12 5 12 6z"/><circle class="mf-core" cx="100" cy="113" r="8"/>
  `,
  'bed-side-manner': `
    <ellipse class="mf-shadow" cx="100" cy="145" rx="66" ry="17"/><path class="mf-side" d="M34 82c0-31 25-52 66-52s66 21 66 52v39c0 18-27 29-66 29s-66-11-66-29z"/>
    <path class="mf-enamel" d="M30 76c0-32 28-55 70-55s70 23 70 55-28 52-70 52-70-20-70-52z"/>
    <ellipse class="mf-dark" cx="100" cy="76" rx="45" ry="31"/><ellipse class="mf-glass" cx="100" cy="73" rx="35" ry="22"/>
    <path class="mf-handle" d="M47 105 24 121l14 18 34-22"/><path class="mf-line" d="M46 50c28-26 81-25 108 2M44 101c31 24 84 24 113-2"/>
    <ellipse class="mf-panel" cx="100" cy="76" rx="21" ry="14"/><circle class="mf-core" cx="100" cy="76" r="7"/>
  `,
  'old-reliable': `
    <ellipse class="mf-shadow" cx="100" cy="147" rx="62" ry="17"/><circle class="mf-side" cx="104" cy="93" r="56"/><circle class="mf-bomb" cx="98" cy="85" r="56"/>
    <path class="mf-highlight" d="M60 72c7-22 23-35 45-39-14 8-23 20-27 36z"/><path class="mf-panel" d="m78 35 4-20h35l6 24-13 10H90z"/>
    <path class="mf-fuse" d="M101 18c8-13 21-9 29-10 8-1 12-5 19-1"/><g class="mf-sparks"><path d="m151 6 15-4m-13 12 16 4m-27-14-3-3"/></g>
    <path class="mf-line" d="M54 93c12 24 29 37 54 42M65 52c19-15 45-19 68-5"/><circle class="mf-core" cx="99" cy="89" r="12"/>
  `,
  'pond-trap': `
    <ellipse class="mf-shadow" cx="100" cy="145" rx="70" ry="16"/><path class="mf-side" d="M29 95c5-42 33-64 72-62 44 2 72 28 70 64-2 34-34 49-73 48-42-1-73-18-69-50z"/>
    <path class="mf-leaf" d="M25 87c5-42 38-66 78-62 43 4 72 32 67 67-5 34-37 47-77 43-39-4-72-22-68-48z"/>
    <path class="mf-notch" d="m100 81 39-48-22 62z"/><path class="mf-vein" d="M99 82 52 58m46 25-51 20m52-20 15 41M99 82 81 34"/>
    <g class="mf-droplets"><ellipse cx="54" cy="83" rx="7" ry="4"/><ellipse cx="79" cy="113" rx="5" ry="3"/><ellipse cx="139" cy="103" rx="6" ry="3"/></g>
    <g class="mf-flower"><ellipse cx="101" cy="72" rx="10" ry="22"/><ellipse cx="101" cy="72" rx="10" ry="22" transform="rotate(60 101 72)"/><ellipse cx="101" cy="72" rx="10" ry="22" transform="rotate(120 101 72)"/></g><circle class="mf-core" cx="101" cy="72" r="8"/>
  `,
  'breakfast-blast': `
    <ellipse class="mf-shadow" cx="100" cy="147" rx="69" ry="17"/><path class="mf-side" d="M35 79h130l-15 54c-6 18-94 18-100 0z"/>
    <ellipse class="mf-bowl-rim" cx="100" cy="76" rx="66" ry="34"/><ellipse class="mf-milk" cx="100" cy="73" rx="56" ry="25"/>
    <g class="mf-cereal"><circle cx="58" cy="69" r="9"/><circle cx="78" cy="58" r="8"/><circle cx="99" cy="72" r="10"/><circle cx="122" cy="58" r="8"/><circle cx="143" cy="73" r="9"/><circle cx="72" cy="84" r="7"/><circle cx="128" cy="85" r="7"/></g>
    <path class="mf-spoon" d="m125 57 37-46 10 8-35 48z"/><ellipse class="mf-spoon-bowl" cx="168" cy="14" rx="13" ry="9" transform="rotate(-48 168 14)"/>
    <path class="mf-line" d="M51 107c27 17 72 18 99 0"/><circle class="mf-panel" cx="100" cy="74" r="15"/><circle class="mf-core" cx="100" cy="74" r="7"/>
  `,
  'roll-station': `
    <ellipse class="mf-shadow" cx="101" cy="149" rx="78" ry="15"/>
    <path class="mf-tray-side" d="m20 47 137-16 20 82-8 17-126 23-13-12z"/>
    <path class="mf-tray-front" d="m39 129 130-24 8 8-8 17-126 23-13-12z"/>
    <path class="mf-tray" d="m18 36 141-17 19 87-140 25z"/><path class="mf-tray-inset" d="m33 50 113-14 14 59-109 20z"/>
    <path class="mf-tray-rim" d="M18 36 159 19l19 87-140 25zm15 14 18 65 109-20-14-59z"/>
    <path class="mf-tray-highlight" d="m28 40 126-15m17 77L45 125"/>
    <g class="mf-weed-leaf" transform="translate(68 72) rotate(-9)"><path d="M0 22C-1 13 0 2 3-13 8-2 9 6 7 13 11 4 16-3 22-7 20 2 16 10 10 15 17 10 24 8 31 9 25 16 18 20 10 20l12 8c-8 1-14-1-20-5-5 5-10 8-17 9l10-11c-8 1-16-1-23-6 8-2 16-1 23 2-7-6-12-13-14-22 8 4 14 11 18 20-2-8-1-17 1-27 5 10 7 21 5 32z"/><path class="mf-weed-stem" d="M2 17 1 34"/></g>
    <path class="mf-paper" d="m82 99 52-10 12 14-54 11z"/><path class="mf-line" d="m88 100 49-9m-45 15 49-10"/>
    <ellipse class="mf-grinder-side" cx="141" cy="69" rx="18" ry="15"/><circle class="mf-grinder" cx="138" cy="60" r="18"/><path class="mf-grinder-teeth" d="m138 46 4 9 10 1-8 7 2 10-8-5-9 5 2-10-8-7 11-1z"/><circle class="mf-core" cx="99" cy="78" r="9"/>
  `,
  watcher: `
    <ellipse class="mf-shadow" cx="100" cy="144" rx="72" ry="17"/><path class="mf-side" d="M18 84c20-34 48-52 82-52s62 18 82 52c-20 38-48 57-82 57S38 122 18 84z"/>
    <path class="mf-sclera" d="M13 76c22-35 51-53 87-53s65 18 87 53c-22 36-51 54-87 54S35 112 13 76z"/>
    <path class="mf-lid" d="M14 76c23-43 58-62 99-51 27 7 52 25 74 51-29-22-58-33-87-33S43 54 14 76z"/>
    <path class="mf-vein" d="M52 57 30 43m31 8L47 28m98 28 23-15m-31 10 14-23M49 96l-24 12m35-6-15 22m102-28 24 12m-35-6 15 22"/>
    <circle class="mf-iris" cx="100" cy="76" r="39"/><circle class="mf-ring" cx="100" cy="76" r="27"/><circle class="mf-pupil" cx="100" cy="76" r="17"/>
    <ellipse class="mf-white" cx="88" cy="64" rx="7" ry="5"/><circle class="mf-core" cx="103" cy="79" r="6"/>
  `
};

const colorHex = (color: number): string => `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`;

export const createMineFrameSvgMarkup = (
  artId: MineFrameArtId,
  primaryColor: number,
  accentColor: number
): string => {
  const primary = colorHex(primaryColor);
  const accent = colorHex(accentColor);
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 200 170" role="img" aria-label="Mine frame preview" class="premium-mine-frame-svg" data-mine-frame="${artId}">
    <style>
      .mf-shadow{fill:#000;opacity:.58}.mf-side{fill:#03070c;stroke:#233440;stroke-width:5}.mf-shell,.mf-enamel,.mf-leaf,.mf-tray,.mf-sclera,.mf-bomb,.mf-tire,.mf-glass{fill:#132531;stroke:${primary};stroke-width:5;stroke-linejoin:round}.mf-side,.mf-shell,.mf-enamel,.mf-leaf,.mf-tray,.mf-sclera,.mf-bomb,.mf-tire,.mf-glass{filter:drop-shadow(0 0 5px ${primary})}.mf-panel,.mf-rim,.mf-ring,.mf-bowl-rim,.mf-grinder{fill:#0a151e;stroke:${accent};stroke-width:4}.mf-dark,.mf-pupil{fill:#02050a;stroke:#536773;stroke-width:3}.mf-core{fill:${primary};stroke:#fff;stroke-width:3;filter:drop-shadow(0 0 8px ${primary});transform-box:fill-box;transform-origin:center;animation:mfPulse 1.25s ease-in-out infinite}.mf-line,.mf-vein,.mf-tread,.mf-rope,.mf-handle,.mf-fuse,.mf-sparks,.mf-spoon{fill:none;stroke:${accent};stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.mf-tread{stroke:#51616d;stroke-width:9}.mf-rope{stroke:#f3fbff;stroke-width:5;stroke-dasharray:8 6}.mf-rope-knots{fill:${accent};stroke:#fff;stroke-width:2}.mf-spokes,.mf-lugs,.mf-droplets,.mf-cereal,.mf-flower,.mf-grinder-teeth{fill:${accent};stroke:#efffff;stroke-width:2}.mf-spikes{fill:${primary};stroke:${accent};stroke-width:3}.mf-white,.mf-highlight,.mf-milk,.mf-spoon-bowl{fill:#effcff;stroke:${accent};stroke-width:2}.mf-glass{fill:${primary};fill-opacity:.28}.mf-shell-plate{fill:#16232d;fill-opacity:.72;stroke:${accent};stroke-width:3}.mf-slime{fill:${primary};fill-opacity:.55;stroke:${primary};stroke-width:3}.mf-creature{fill:#090511;stroke:${accent};stroke-width:4}.mf-enamel{fill:#d7f0f5;stroke:${primary}}.mf-handle{stroke:#d8f7ff;stroke-width:14}.mf-highlight{opacity:.58}.mf-leaf{fill:#0c3928}.mf-notch{fill:#02070a}.mf-droplets{fill:#bffcff;opacity:.85}.mf-flower{fill:${accent};fill-opacity:.75;stroke:${primary};stroke-width:2}.mf-bowl-rim{fill:#172c38}.mf-milk{stroke:#9eefff;stroke-width:3}.mf-cereal circle:nth-child(3n+1){fill:#ff5acb}.mf-cereal circle:nth-child(3n+2){fill:#65efff}.mf-cereal circle:nth-child(3n){fill:#ffe35d}.mf-tray{fill:#182731}.mf-tray-side{fill:#02070b;stroke:#263b46;stroke-width:5;stroke-linejoin:round}.mf-tray-front{fill:#081119;stroke:${accent};stroke-width:3;stroke-linejoin:round}.mf-tray-inset{fill:#07120e;stroke:${accent};stroke-width:3}.mf-tray-rim{fill-rule:evenodd;fill:#293c45;fill-opacity:.84;stroke:${primary};stroke-width:4;stroke-linejoin:round}.mf-tray-highlight{fill:none;stroke:#dffcff;stroke-width:2;stroke-linecap:round;opacity:.72}.mf-weed-leaf{fill:${primary};stroke:#e7ff8a;stroke-width:1.7;stroke-linejoin:round;filter:drop-shadow(0 0 4px ${primary})}.mf-weed-stem{fill:none;stroke:#dfff73;stroke-width:2.5;stroke-linecap:round}.mf-paper{fill:#effcff;stroke:${accent};stroke-width:3}.mf-grinder-side{fill:#02070b;stroke:#334550;stroke-width:3}.mf-grinder-teeth{fill:${primary}}.mf-sclera{fill:#ddecf0}.mf-lid{fill:#121b26;stroke:${accent};stroke-width:4}.mf-iris{fill:${primary};stroke:${accent};stroke-width:5}.mf-ring{fill:${accent};fill-opacity:.28}.mf-pupil{stroke:#ff4f94;stroke-width:4}.mf-fuse{stroke:#d9b77b;stroke-width:7}.mf-sparks{stroke:#fff16d;stroke-width:5}.mf-panel{filter:drop-shadow(0 0 4px ${accent})}@keyframes mfPulse{50%{opacity:.64;transform:scale(1.16)}}
    </style>${MINE_FRAME_MARKUP[artId]}</svg>`;
};

export const createMineFrameSvgDataUri = (
  artId: MineFrameArtId,
  primaryColor: number,
  accentColor: number
): string => {
  // Phaser's SVG loader treats inline data as base64 and decodes it with
  // `atob()`. A percent-encoded UTF-8 URI therefore throws during BootScene's
  // preload and prevents the game from starting. Match the established
  // operative-frame texture path and explicitly encode the SVG as UTF-8
  // base64 before handing it to Phaser.
  const source = createMineFrameSvgMarkup(artId, primaryColor, accentColor);
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
};

export const createMineFrameSvg = (
  artId: MineFrameArtId,
  primaryColor: number,
  accentColor: number
): SVGSVGElement => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createMineFrameSvgMarkup(artId, primaryColor, accentColor);
  return wrapper.firstElementChild as SVGSVGElement;
};
