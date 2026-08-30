import type { TurretSkinCosmeticEffectId } from '../../game/types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TURRET_MARKUP: Record<TurretSkinCosmeticEffectId, string> = {
  'void-reactor': `
    <ellipse class="pt-shadow" cx="100" cy="137" rx="66" ry="18"/><path class="pt-base" d="m40 126 20-20h80l20 20-19 21H59z"/>
    <path class="pt-shell" d="m47 94 12-49 28-21 45 10 24 39-20 41-59 9z"/><path class="pt-dark" d="m48 92 24-17 7-36-20 8zM137 36l-17 29 17 46 19-38z"/>
    <circle class="pt-ring orbit" cx="103" cy="75" r="43"/><circle class="pt-ring orbit reverse" cx="103" cy="75" r="31"/><circle class="pt-core pulse" cx="103" cy="75" r="20"/>
    <path class="pt-energy" d="m61 72 18 5 10-15 13 18 15-28 23 14M68 95l18-8 14 17 18-16 20 9"/><path class="pt-barrel" d="m95 48-4-38h24l-4 40z"/>
  `,
  'arc-tesla': `
    <ellipse class="pt-shadow" cx="100" cy="139" rx="65" ry="17"/><path class="pt-base" d="m43 125 20-20h74l20 20-18 22H61z"/>
    <path class="pt-shell" d="M59 109 52 53l22-25h52l22 25-7 56z"/><path class="pt-panel" d="M77 43h46v61H77z"/>
    <g class="pt-coils"><path d="M60 50h-18m20 12H38m26 12H41m98-24h18m-20 12h25m-28 12h23"/><path d="m48 41-9-20m113 20 9-20"/></g>
    <path class="pt-prongs" d="M76 45 64 11l25 20M124 45l12-34-25 20"/><path class="pt-energy spark" d="m63 46 20 12 11-17 16 21 27-18M81 76l17-9 13 17 18-8"/><path class="pt-barrel" d="M93 52V8h14v44"/>
  `,
  'cyber-shark': `
    <ellipse class="pt-shadow" cx="100" cy="139" rx="70" ry="17"/><path class="pt-base" d="m42 126 21-19h76l20 19-18 21H60z"/>
    <path class="pt-shell" d="M27 89 48 48l42-24 54 12 29 35-31 44-79 4z"/><path class="pt-panel" d="m78 32 23-27 18 27-17 13z"/>
    <path class="pt-eye" d="m50 61 31-5-17 15z"/><path class="pt-jaw" d="m48 86 98 3-21 22-57 2z"/>
    <path class="pt-teeth" d="m60 89 8 13 9-12 9 13 10-12 10 12 10-11 9 10 9-12"/><path class="pt-barrel" d="M91 55V8h20v47"/><path class="pt-energy aqua" d="M88 8 73 0m39 8 18-8M86 18 70 10m44 7 18-8"/>
  `,
  'glitch-phantom': `
    <ellipse class="pt-shadow" cx="100" cy="138" rx="66" ry="16"/><path class="pt-base" d="m42 126 17-20h82l17 20-20 21H61z"/>
    <path class="pt-shell ghost-a" d="m47 102 7-55 35-25 54 20 13 50-27 28-64-3z"/><path class="pt-shell ghost-b" d="m58 92 7-51 44-17 45 27-8 54-43 20z"/>
    <path class="pt-dark" d="m65 52 29-17-6 72-30-8zM118 31l28 22-5 45-24 15z"/><path class="pt-barrel ghost-a" d="M88 52 84 9h19l4 43"/><path class="pt-barrel ghost-b" d="m104 50 5-37h14l-2 43"/>
    <g class="pt-pixels"><path d="M28 49h30v8H28zM143 67h35v7h-35zM40 95h21v6H40zM128 111h42v7h-42zM78 15h18v6H78z"/></g><path class="pt-scan" d="M38 43h126M32 68h142M40 94h121M55 116h100"/>
  `,
  'hellfire-core': `
    <ellipse class="pt-shadow" cx="100" cy="140" rx="69" ry="18"/><path class="pt-base heavy" d="m35 127 21-26h88l22 26-17 23H51z"/>
    <path class="pt-shell heavy" d="M45 111 40 49l25-29h70l25 29-5 62-23 15H68z"/><path class="pt-panel" d="M68 38h64v69H68z"/>
    <g class="pt-vents"><path d="M50 58h23m-24 13h24M127 58h24m-24 13h24M74 91h52"/></g><circle class="pt-core furnace" cx="100" cy="69" r="23"/>
    <path class="pt-barrel heavy" d="M86 51 82 3h36l-4 48z"/><path class="pt-energy ember" d="M54 35 47 13m22 14L66 4m66 28 7-21m-25 15 3-25"/>
  `,
  'arctic-zero': `
    <ellipse class="pt-shadow" cx="100" cy="139" rx="65" ry="17"/><path class="pt-base ice" d="m43 127 18-23h78l19 23-20 20H61z"/>
    <path class="pt-shell ice" d="M51 105 43 60l20-34 36-15 38 17 21 37-15 47-41 15-39-10z"/><path class="pt-panel ice" d="m69 39 31-18 31 20-6 63-25 15-28-17z"/>
    <path class="pt-crystal" d="M52 62 24 44l25 44M145 53l31-22-23 59M66 30 62 2l21 22M129 31l12-26 4 34"/><path class="pt-barrel ice" d="M88 54 84 8h32l-4 46z"/><circle class="pt-ring" cx="100" cy="24" r="14"/>
    <g class="pt-snow"><circle cx="35" cy="84" r="3"/><circle cx="160" cy="102" r="4"/><circle cx="148" cy="20" r="3"/><circle cx="55" cy="14" r="2"/></g>
  `,
  'mini-orbital': `
    <ellipse class="pt-shadow" cx="100" cy="142" rx="62" ry="16"/><path class="pt-base" d="m47 128 18-20h70l19 20-18 19H64z"/><path class="pt-support" d="M61 120 74 79m65 41-13-41M69 86l-17-25m79 25 18-25"/>
    <circle class="pt-shell" cx="100" cy="67" r="37"/><circle class="pt-core pulse" cx="100" cy="67" r="16"/><ellipse class="pt-ring orbit" cx="100" cy="67" rx="68" ry="23"/><ellipse class="pt-ring orbit reverse" cx="100" cy="67" rx="29" ry="57"/>
    <path class="pt-barrel" d="M93 39 90 1h20l-3 38z"/><path class="pt-energy convergence" d="m57 47 31 14M143 47l-31 14M65 92l24-17m46 17-24-17"/>
  `,
  'bomb-buddy': `
    <ellipse class="pt-shadow" cx="100" cy="140" rx="69" ry="18"/><path class="pt-base heavy" d="m37 127 20-24h87l20 24-17 22H53z"/>
    <path class="pt-shell heavy" d="M43 109V47l22-25h70l22 25v62l-21 18H64z"/><path class="pt-panel" d="M62 42h76v60H62z"/><path class="pt-hazard" d="M63 85h75v18H63z"/>
    <path class="pt-barrel heavy" d="M86 50 82 4h36l-4 46z"/><circle class="pt-status green" cx="72" cy="55" r="6"/><circle class="pt-status red" cx="128" cy="55" r="6"/>
    <path class="pt-telemetry" d="M82 57h36M78 68h18m8 0h18M66 114h26m15 0h27"/><text class="pt-label" x="100" y="97" text-anchor="middle">BUDDY//01</text>
  `,
  'harbor-beacon': `
    <ellipse class="pt-shadow" cx="100" cy="142" rx="68" ry="17"/>
    <path class="pt-base harbor" d="m39 127 17-23h88l18 23-15 22H53z"/><path class="pt-footing" d="m50 119 14-19h72l14 19-13 17H63z"/>
    <g class="pt-bolts"><circle cx="58" cy="124" r="5"/><circle cx="142" cy="124" r="5"/><circle cx="72" cy="139" r="4"/><circle cx="128" cy="139" r="4"/></g>
    <path class="pt-harbor-side" d="M59 103 55 46l17-21 55 4 18 22-7 57-20 14-39-3z"/>
    <path class="pt-harbor-shell" d="M55 96 53 42l18-20h55l19 21-5 55-21 14H77z"/>
    <path class="pt-harbor-panel" d="M72 35h51l10 15-4 50-18 9H82l-17-12-2-47z"/>
    <path class="pt-hazard harbor" d="M62 79h70"/><path class="pt-rope" d="M58 71c27 15 58 15 84-2M59 66c27 15 57 15 82-2"/>
    <path class="pt-emitter" d="m73 36 4-27h17l-2 29zm35 2-2-29h17l4 27z"/>
    <path class="pt-beacon-cap" d="m72 35 7-18h42l8 18-12 8H84z"/><path class="pt-beacon-glass pulse" d="M83 18 89 4h23l8 14-7 15H91z"/>
    <path class="pt-beacon-cage" d="M83 18h37M89 4l2 29M112 4l1 29M79 18h42"/><path class="pt-scan orbit" d="M60 17h80"/>
    <path class="pt-marine-id" d="M77 91h46v12H77z"/><text class="pt-label harbor-label" x="100" y="100" text-anchor="middle">PORT//07</text>
  `
};

export const createPremiumTurretSkinSvg = (effect: TurretSkinCosmeticEffectId | undefined): SVGSVGElement | null => {
  if (!effect) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 160');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('premium-turret-svg');
  svg.dataset.turretSkin = effect;
  svg.innerHTML = TURRET_MARKUP[effect];
  return svg;
};
