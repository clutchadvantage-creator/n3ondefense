import type { CosmeticVisualShape } from '../../game/types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PREMIUM_FRAME_MARKUP: Partial<Record<CosmeticVisualShape, string>> = {
  cerealBox: `
    <g class="pf-shadow"><path d="M49 23 64 8h72l15 15v123H49z"/><path d="m64 8 13 17h60l-1-17M100 8v17"/></g>
    <path class="pf-shell" d="M52 27h96v116H52z"/><path class="pf-panel" d="M119 27h29v116h-29z"/>
    <path class="pf-accent" d="M58 35h54v35H58z"/><text class="pf-brand" x="85" y="50" text-anchor="middle">CR!T</text><text class="pf-micro" x="85" y="63" text-anchor="middle">CRUNCH.EXE</text>
    <ellipse class="pf-metal" cx="86" cy="94" rx="28" ry="13"/><ellipse class="pf-light" cx="86" cy="89" rx="24" ry="9"/>
    <g class="pf-panel-dark"><circle cx="72" cy="87" r="5"/><circle cx="84" cy="92" r="5"/><circle cx="99" cy="86" r="5"/><circle cx="91" cy="84" r="4"/></g>
    <g class="pf-mascot"><circle cx="71" cy="52" r="3"/><circle cx="99" cy="52" r="3"/><path d="M72 58q13 13 26 0"/></g>
    <g class="pf-lines"><path d="M124 36h19M124 42h19M124 48h15M124 58h19M124 64h12M124 70h19"/><path d="M58 126h54"/></g>
    <g class="pf-barcode"><path d="M59 132v8M64 130v10M68 133v7M73 129v11M79 131v9M84 128v12M91 132v8M96 130v10M103 133v7M109 129v11"/></g>
  `,
  alienHead: `
    <path class="pf-shell" d="M100 10c-43 0-68 24-63 61 4 35 24 65 63 82 39-17 59-47 63-82 5-37-20-61-63-61Z"/>
    <path class="pf-panel" d="M48 43c11-17 27-25 52-25s41 8 52 25l-8 57-44 48-44-48Z"/>
    <path class="pf-eye" d="M48 62c17-13 35-10 46 1-3 27-17 39-37 28-8-5-11-16-9-29ZM152 62c-17-13-35-10-46 1 3 27 17 39 37 28 8-5 11-16 9-29Z"/>
    <path class="pf-light" d="M57 65q15-8 25 0M143 65q-15-8-25 0"/>
    <g class="pf-lines"><path d="M93 107 88 116M107 107l5 9M88 130h24"/><path d="M35 57 22 48v-15M165 57l13-9v-15"/><path d="M53 28h-17v8M147 28h17v8"/></g>
    <g class="pf-glyph"><path d="m30 108 8-8 8 8-8 8zM170 108l-8-8-8 8 8 8z"/><circle cx="100" cy="22" r="4"/></g>
  `,
  hypercar: `
    <g class="pf-wheel"><rect x="32" y="38" width="22" height="35" rx="8"/><rect x="146" y="38" width="22" height="35" rx="8"/><rect x="32" y="102" width="22" height="35" rx="8"/><rect x="146" y="102" width="22" height="35" rx="8"/></g>
    <path class="pf-shell" d="M100 7 132 20l26 34-6 69-20 28H68l-20-28-6-69 26-34Z"/>
    <path class="pf-panel" d="m75 39 50 0 17 38-9 40H67l-9-40Z"/><path class="pf-glass" d="m74 45 52 0 10 27H64Z"/>
    <path class="pf-panel-dark" d="m48 70 27 8-12 26-17 12M152 70l-27 8 12 26 17 12"/>
    <path class="pf-accent" d="M67 26 91 15l-10 24ZM133 26l-24-11 10 24Z"/>
    <path class="pf-light" d="m55 55 25-11-11 20ZM145 55l-25-11 11 20Z"/>
    <path class="pf-metal" d="M58 128h84l-7 17H65z"/><path class="pf-panel-dark" d="M54 145h92v8H54z"/>
    <g class="pf-lines"><path d="M100 10v34M100 80v67M68 119h64"/><path d="M48 93h17M152 93h-17"/></g>
  `,
  cyberLeaf: `
    <g class="pf-shell"><path d="M100 96 83 47 100 5l17 42Z"/><path d="M94 99 54 55 47 17l33 26Z"/><path d="M88 105 37 85 14 48l44 16Z"/><path d="M84 115 38 121 9 101l48-7Z"/><path d="M106 99l40-44 7-38-33 26Z"/><path d="M112 105l51-20 23-37-44 16Z"/><path d="M116 115l46 6 29-20-48-7Z"/></g>
    <path class="pf-stem" d="M100 88v68"/>
    <g class="pf-veins"><path d="M100 104V18M98 106 54 31M92 110 25 61M91 116 25 108M102 106l44-75M108 110l67-49M109 116l66-8"/></g>
    <g class="pf-glyph"><circle cx="100" cy="57" r="4"/><circle cx="70" cy="72" r="4"/><circle cx="130" cy="72" r="4"/><circle cx="51" cy="103" r="4"/><circle cx="149" cy="103" r="4"/></g>
  `,
  tugboat: `
    <path class="pf-shadow" d="m100 8 48 35 10 83-25 27H67l-25-27 10-83Z"/>
    <path class="pf-shell" d="m100 12 43 33 8 77-22 24H71l-22-24 8-77Z"/>
    <path class="pf-panel-dark" d="M66 53h68v55H66z"/><path class="pf-panel" d="M72 58h56v42H72z"/>
    <path class="pf-glass" d="M76 64h20v16H76zM104 64h20v16h-20z"/>
    <path class="pf-metal" d="M82 32h36v21H82z"/><path class="pf-accent" d="M92 20h16v26H92z"/>
    <g class="pf-rail"><path d="M59 113h82M63 127h74"/><path d="M63 108v19M78 108v19M122 108v19M137 108v19"/></g>
    <g class="pf-fender"><circle cx="50" cy="65" r="9"/><circle cx="150" cy="65" r="9"/><circle cx="50" cy="99" r="9"/><circle cx="150" cy="99" r="9"/></g>
    <g class="pf-light"><circle cx="60" cy="44" r="5"/><circle cx="140" cy="44" r="5"/><circle cx="100" cy="17" r="4"/></g><path class="pf-lines" d="M100 12V3M80 7h40"/>
  `,
  stealthWing: `
    <path class="pf-shell" d="m100 7 22 38 70 78-69-18 13 47-36-23-36 23 13-47-69 18 70-78Z"/>
    <path class="pf-panel" d="m100 17 20 52-20 45-20-45Z"/><path class="pf-glass" d="m100 28 14 35-14 20-14-20Z"/>
    <path class="pf-panel-dark" d="m58 75 30-15-16 34-42 17ZM142 75l-30-15 16 34 42 17Z"/>
    <path class="pf-metal" d="M76 116h17v24H76zM107 116h17v24h-17z"/>
    <g class="pf-lines"><path d="M100 8v121M78 46 21 112M122 46l57 66"/><path d="m55 107 22-2M145 107l-22-2"/></g>
    <g class="pf-light"><circle cx="18" cy="120" r="5"/><circle cx="182" cy="120" r="5"/><rect x="80" y="135" width="10" height="8"/><rect x="110" y="135" width="10" height="8"/></g>
  `,
  eyeball: `
    <path class="pf-eye-white" d="M8 81Q39 22 100 20t92 61q-31 59-92 61T8 81Z"/>
    <circle class="pf-iris-outer" cx="100" cy="81" r="48"/><circle class="pf-iris" cx="100" cy="81" r="37"/><circle class="pf-pupil" cx="100" cy="81" r="20"/>
    <circle class="pf-light" cx="86" cy="65" r="10"/><circle class="pf-light" cx="112" cy="96" r="4"/>
    <g class="pf-vein"><path d="M12 79 38 72l15-13M20 107l28-14 11 8M188 70l-28 7-14-15M179 110l-25-17-13 9M53 29l14 23M146 29l-14 23M52 135l17-24M148 135l-17-24"/></g>
    <g class="pf-glitch"><path d="M75 48h18v5H75zM121 112h16v5h-16zM93 21h22v4H93z"/></g>
  `,
  wheelchair: `
    <g class="pf-wheel-ring"><circle cx="57" cy="98" r="43"/><circle cx="57" cy="98" r="35"/><circle cx="154" cy="112" r="20"/></g>
    <g class="pf-spoke"><path d="M57 63v70M22 98h70M32 73l50 50M82 73l-50 50"/><path d="M154 94v36M136 112h36M141 99l26 26M167 99l-26 26"/></g>
    <path class="pf-shell" d="M71 33h45v54H71z"/><path class="pf-panel" d="M76 38h35v43H76z"/>
    <path class="pf-metal" d="M77 87h66v17H77z"/><path class="pf-frame" d="m87 101 38 42M126 101l-24 42M103 143h39"/>
    <path class="pf-frame" d="M111 52h31M142 52v42"/><path class="pf-accent" d="M43 89h28v18H43z"/>
    <g class="pf-light"><circle cx="57" cy="98" r="6"/><circle cx="154" cy="112" r="5"/><rect x="115" y="135" width="11" height="9"/></g>
  `,
  frog: `
    <ellipse class="pf-shell" cx="100" cy="83" rx="61" ry="50"/><circle class="pf-shell" cx="67" cy="42" r="31"/><circle class="pf-shell" cx="133" cy="42" r="31"/>
    <circle class="pf-eye-white" cx="67" cy="41" r="18"/><circle class="pf-eye-white" cx="133" cy="41" r="18"/><circle class="pf-pupil" cx="67" cy="41" r="9"/><circle class="pf-pupil" cx="133" cy="41" r="9"/>
    <path class="pf-panel" d="M57 104 24 119 5 144l49-6 28-27ZM143 104l33 15 19 25-49-6-28-27Z"/>
    <path class="pf-frame" d="M82 111 57 151M118 111l25 40"/><path class="pf-web" d="M48 144 30 157M48 144l-3 18M52 144l11 15M152 144l18 13M152 144l3 18M148 144l-11 15"/>
    <path class="pf-mouth" d="M62 82q38 36 76 0"/><circle class="pf-panel-dark" cx="88" cy="72" r="4"/><circle class="pf-panel-dark" cx="112" cy="72" r="4"/>
    <g class="pf-glyph"><path d="m75 100 18 12 17-20 18 12"/><circle cx="93" cy="112" r="4"/></g>
  `
};

export const createPremiumOperativeFrameSvg = (shape: CosmeticVisualShape | undefined): SVGSVGElement | null => {
  if (!shape) return null;
  const markup = PREMIUM_FRAME_MARKUP[shape];
  if (!markup) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('premium-frame-svg');
  svg.setAttribute('viewBox', '0 0 200 160');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = markup;
  return svg;
};

