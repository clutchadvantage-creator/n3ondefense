import type { CosmeticOption } from '../types.ts';

export type FenceMotif = 'circuit' | 'industrial' | 'tesla' | 'void' | 'fire' | 'cryo' | 'marine' | 'organic' | 'medical' | 'breakfast' | 'eye' | 'aviation' | 'witch' | 'bats' | 'pumpkin';
export interface FenceAppearance { id: string; motif: FenceMotif; color: number; accent: number }
const families: ReadonlyArray<readonly [string, FenceMotif, readonly string[]]> = [
  ['critical-crunch','breakfast',['player-critical-crunch','mine-breakfast-blast']],
  ['probe-ably-fine','organic',['player-probe-ably-fine','player-ufo','mine-hatchling']],
  ['midlife-crisis','industrial',['player-midlife-crisis-mk4','mine-road-hazard']],
  ['highly-tactical','organic',['player-highly-tactical','mine-roll-station']],
  ['tug-life','marine',['player-tug-life','turret-harbor-beacon','mine-lifeline']],
  ['air-superiority','aviation',['player-air-superiority-complex','player-spaceship']],
  ['watcher','eye',['player-eye-dont-like-that','mine-watcher']],
  ['medical','medical',['player-roll-model','mine-bed-side-manner']],
  ['ribbit-exe','organic',['player-ribbit-exe','mine-pond-trap']],
  ['old-reliable','industrial',['mine-old-reliable']],
  ['void-reactor','void',['turret-void-reactor']], ['arc-tesla','tesla',['turret-arc-tesla']],
  ['cyber-shark','marine',['turret-cyber-shark']], ['glitch-phantom','circuit',['turret-glitch-phantom']],
  ['hellfire-core','fire',['turret-hellfire-core']], ['arctic-zero','cryo',['turret-arctic-zero']],
  ['mini-orbital','void',['turret-mini-orbital']], ['bomb-buddy','industrial',['turret-bomb-buddy']]
];

/** Same catalog/ownership/equipped slot as all other cosmetics. Related equipment shares one family fence. */
export function createSetFenceCosmetics(items: readonly CosmeticOption[]): CosmeticOption[] {
  const result: CosmeticOption[] = [], seen = new Set<string>();
  for (const item of items) {
    if (!item.nativeTextureKey && !item.turretSkinEffect && !item.mineFrameEffect
      && !['player-ufo','player-spaceship'].includes(item.id)) continue;
    const family = families.find(([, , ids]) => ids.includes(item.id));
    const key = item.halloweenSet ? `halloween-${item.halloweenSet}` : family?.[0] ?? item.id.replace(/^(player|turret|mine)-/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const source=family?items.find(candidate=>candidate.id===family[2][0])??item:item;
    const motif = item.halloweenSet ?? family?.[1] ?? 'circuit';
    result.push({ id: `fence-${key}`, category: 'fenceStyle', label: `${source.label.replace(/ Operative$/, '')} Barrier`,
      currency: 'credits', cost: 8_500, additionalCosts: { coreTokens: 180, plasmaChips: 15 }, priceTier: 'prestige',
      color: source.color, accentColor: source.accentColor ?? 0xeaffff, fenceMotif: motif,
      holiday: item.holiday, halloweenSet: item.halloweenSet,
      description: `Matching ${source.label.replace(/ Operative$/, '')} emitter pylons and an animated barrier with activation, impact, damage and shutdown feedback. Supports Fence Link and Fence Rail.` });
  }
  return result;
}

export function resolveFenceAppearance(item?: CosmeticOption): FenceAppearance {
  return { id: item?.id ?? 'fence-default', motif: item?.fenceMotif ?? (item?.id === 'fence-amber' ? 'industrial' : item?.id === 'fence-violet' ? 'void' : 'tesla'),
    color: item?.color ?? 0x41d8ff, accent: item?.accentColor ?? 0xeaffff };
}
export const fenceTexture = (id: string): string => `pylon-${id}`;
const hex = (color: number): string => `#${color.toString(16).padStart(6,'0')}`;
let svgSequence = 0;
const emblems: Record<FenceMotif, string> = {
  circuit:'<path d="M34 48h12v18h15M36 72h13V58h15"/><circle cx="34" cy="48" r="3"/><circle cx="64" cy="58" r="3"/>',
  industrial:'<path d="m31 53 8-8 19 0 8 8v22H31zM35 63l11-11m-3 23 18-18m-6 20 8-8"/>',
  tesla:'<path d="m54 39-21 24h16l-8 20 24-27H48z"/>',
  void:'<circle cx="48" cy="60" r="13"/><ellipse cx="48" cy="60" rx="22" ry="6" transform="rotate(-30 48 60)"/>',
  fire:'<path d="M46 79Q23 65 43 45l3 12 10-22q25 34 0 43l-5-17z"/>',
  cryo:'<path d="M48 37v45M29 49l38 23M29 72l38-23m-24-9 5 7 5-7m-22 9 8 1-2 8m26 10-8-1 2-8"/>',
  marine:'<path d="M48 44v34M39 54h18M28 63q20 34 40 0l-9 4m-31-4 9 4"/><circle cx="48" cy="41" r="5"/>',
  organic:'<path d="M48 78Q20 67 29 44q22 2 19 34Q75 65 67 44q-24 4-19 34M36 54l12 24 12-24"/>',
  medical:'<path d="M42 41h13v13h13v13H55v13H42V67H29V54h13z"/>',
  breakfast:'<circle cx="39" cy="54" r="10"/><circle cx="58" cy="65" r="10"/><circle cx="38" cy="76" r="6"/>',
  eye:'<path d="M24 61q24-28 48 0-24 28-48 0z"/><circle cx="48" cy="61" r="10"/><circle cx="48" cy="61" r="3"/>',
  aviation:'<path d="m48 37-7 21-18 14 20-3 5 12 5-12 20 3-18-14z"/>',
  witch:'<path d="m30 71 12-34 14 4-6 8 11 22M23 73h50m-37 6 5 3m13-3 5 3"/>',
  bats:'<path d="m26 43 15 13 7-8 7 8 15-13-3 27-10-6-9 17-9-17-10 6z"/>',
  pumpkin:'<path d="M28 64q-3-23 20-18 22-5 20 18-1 20-20 18-19 2-20-18zm20-18 3-12M34 57l8 5m20-5-8 5m-17 9 11 5 11-5"/>'
};

/** Cached pylon artwork. Distinct cap silhouettes and family emblems, no live Graphics paths. */
export function createFencePylonSvg(appearance: FenceAppearance): string {
  const metal = `fence-metal-${++svgSequence}`;
  const { motif } = appearance, color = hex(appearance.color), accent = hex(appearance.accent);
  const cap = motif === 'cryo' ? 'M24 44 30 12l10 21 8-28 10 28 10-21 5 32'
    : motif === 'bats' || motif === 'aviation' ? 'M18 44 10 15l30 17 8-19 8 19 30-17-8 29'
    : motif === 'industrial' || motif === 'fire' ? 'M23 44V20h12v12h26V20h12v24'
    : motif === 'witch' ? 'M23 44 39 9l23 6-13 8 23 21' : 'M25 44 31 24l17-10 17 10 6 20';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 160"><defs><linearGradient id="${metal}" x2="1" y2=".6"><stop stop-color="#476273"/><stop offset=".38" stop-color="#102130"/><stop offset="1" stop-color="#030b13"/></linearGradient></defs>
    <ellipse cx="48" cy="149" rx="40" ry="9" fill="#000" opacity=".55"/>
    <path d="M17 130 28 119h40l11 11-5 19H22z" fill="url(#${metal})" stroke="${color}" stroke-width="2"/>
    <path d="M29 129 25 45l11-13h24l11 13-4 84-19 12z" fill="url(#${metal})" stroke="${color}" stroke-width="2"/>
    <path d="${cap}" fill="#152330" stroke="${accent}" stroke-width="2"/>
    <path d="M33 93h30M34 101h28m-27 8h26m-23 20 10 5 10-5" fill="none" stroke="${color}" stroke-width="3"/>
    <path d="M25 50h-5v55h8m43-55h5v55h-8" fill="none" stroke="#668a9b" stroke-width="2"/>
    <g fill="none" stroke="${accent}" stroke-width="2.6" stroke-linejoin="round">${emblems[motif]}</g>
    <path d="M27 140h13m16 0h13" stroke="${accent}" stroke-width="3"/>
    <g fill="#c5e6ea">${[28,68].flatMap(x=>[132,144].map(y=>`<circle cx="${x}" cy="${y}" r="2"/>`)).join('')}</g></svg>`;
}

export function createFencePreviewSvg(item: CosmeticOption): string {
  const a=resolveFenceAppearance(item),color=hex(a.color);
  const pylon=(x:number)=>`<svg x="${x}" y="4" width="92" height="162" viewBox="0 0 96 160">${createFencePylonSvg(a).replace(/^<svg[^>]*>|<\/svg>$/g,'')}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 180" role="img" aria-label="${item.label.replace(/["<>]/g,'')}" class="premium-fence-svg"><path d="M45 146h190" stroke="${color}" stroke-width="16" opacity=".15"/><path class="fence-current" d="M45 90h190m-190 18h190m-190 18h190" stroke="${color}" stroke-width="3" fill="none" stroke-dasharray="15 4"/>${pylon(0)}${pylon(188)}</svg>`;
}
