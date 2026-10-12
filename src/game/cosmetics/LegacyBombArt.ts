/** Authored vector layers; rasterized once at boot and shared by live effects and previews. */
export const LEGACY_BOMB_THEMES = ['violet-plasma','scarlet-heat','cryo-shatter','emerald-ion','solar-flare','prism-spectrum','death-signal','neon-bloom'] as const;
export type LegacyBombTheme = typeof LEGACY_BOMB_THEMES[number];
export const LEGACY_BOMB_PARTS = ['hero','ring','fragment','halo'] as const;
export type LegacyBombPart = typeof LEGACY_BOMB_PARTS[number];
export const isLegacyBomb = (id: string): id is LegacyBombTheme => (LEGACY_BOMB_THEMES as readonly string[]).includes(id);
export const legacyBombTexture = (id: LegacyBombTheme, part: LegacyBombPart): string => `celebration-${id}-${part}`;
const colors: Record<LegacyBombTheme, readonly [string,string]> = {
  'violet-plasma':['#bd67ff','#e6aaff'],'scarlet-heat':['#ff4830','#ffca5b'],'cryo-shatter':['#4eeaff','#ecffff'],
  'emerald-ion':['#53ff90','#dcff99'],'solar-flare':['#ffb82e','#fff4af'],'prism-spectrum':['#71eaff','#ff6ddd'],
  'death-signal':['#5af6ff','#ff56d1'],'neon-bloom':['#ff63d6','#74ffae']
};
let sequence=0;
export function createLegacyBombSvg(id: LegacyBombTheme, part: LegacyBombPart): string {
  const [c,a]=colors[id],uid=`blast-${++sequence}`;
  let art='';
  if(part==='halo') art=`<circle cx="128" cy="128" r="124" fill="url(#${uid}-halo)"/>`;
  else if(part==='ring') {
    art=`<circle cx="128" cy="128" r="110" fill="none" stroke="${c}" stroke-width="8" opacity=".16"/><circle cx="128" cy="128" r="110" fill="none" stroke="${a}" stroke-width="2"/><circle cx="128" cy="128" r="101" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="28 11 5 11"/>`;
    art+=Array.from({length:12},(_,i)=>`<path d="M128 8v13m-3-9h6" stroke="${a}" stroke-width="2" transform="rotate(${i*30} 128 128)"/>`).join('');
  } else if(part==='fragment') {
    if(id==='neon-bloom') art=`<path d="M128 233Q-12 30 92 30q42-12 36 87 12-103 69-70 51 56-69 186z" fill="${c}" stroke="${a}" stroke-width="4"/><path d="M128 222V87" stroke="#fff" stroke-width="3"/>`;
    else if(id==='cryo-shatter') art=`<path d="m128 10 49 101-49 133-51-133z" fill="#103c58" stroke="${a}" stroke-width="5"/><path d="m128 10-4 155 53-54-100 0 47 54 4 79" fill="none" stroke="${c}" stroke-width="3"/>`;
    else art=`<path d="m111 12 52 75-29 155-41-57z" fill="${c}" stroke="${a}" stroke-width="4"/><path d="m119 38 17 54-16 92" fill="none" stroke="#fff" stroke-width="5"/>`;
  } else if(id==='death-signal') {
    art=`<path d="M35 121 28 89 40 43 75 17h106l35 27 13 45-8 35-26 20-6 43-34 42H98l-34-39-4-45z" fill="#050d21" stroke="${c}" stroke-width="4"/>
    <path d="M43 86 64 38l37-11h58l31 11 22 48-10 29-35-28h-24l-14 9-13-9H90l-36 28z" fill="#17374f" stroke="${a}" stroke-width="2"/>
    <path d="m62 111 37-11 16 31-17 10-31-9zm132 0-37-11-16 31 17 10 31-9z" fill="${c}"/>
    <path d="m128 136-13 27h26zM82 174l22 13h49l22-13-10 28h-61z" fill="${a}"/>
    <path d="M112 187v25m17-25v28m16-28v25M50 53l24 5 13-15m91-1 12 13 20-4M46 144l16 16m149-16-16 16" fill="none" stroke="#ecfdff" stroke-width="3"/>
    <g fill="${c}"><rect x="5" y="78" width="25" height="3"/><rect x="218" y="157" width="33" height="4"/><rect x="15" y="179" width="32" height="2"/></g>`;
  } else if(id==='neon-bloom') {
    art=Array.from({length:8},(_,i)=>`<g transform="rotate(${i*45} 128 128)"><path d="M128 130Q55 66 99 24q33-24 57 16 26 43-28 90z" fill="${i%2?'#174538':'#522440'}" stroke="${i%2?a:c}" stroke-width="3"/><path d="M128 122 119 43m9 52-13-23m13 8 12-22" fill="none" stroke="${a}" stroke-width="2"/></g>`).join('');
    art+=`<circle cx="128" cy="128" r="22" fill="#fff4c8" stroke="${c}" stroke-width="5"/><circle cx="128" cy="128" r="11" fill="${a}"/>`;
  } else if(id==='scarlet-heat'||id==='solar-flare') {
    art=Array.from({length:12},(_,i)=>`<path d="M128 128Q25 84 108 12q-26 66 20 116z" transform="rotate(${i*30} 128 128)" fill="${i%2?c:a}" opacity=".72"/>`).join('');
    art+=`<circle cx="128" cy="128" r="41" fill="${a}"/><circle cx="128" cy="128" r="28" fill="#fffbe4"/>`;
  } else if(id==='cryo-shatter') {
    art=Array.from({length:6},(_,i)=>`<path d="m128 128-13-55 13-60 14 60zM128 70l-24-20m24 20 24-20" transform="rotate(${i*60} 128 128)" fill="#22465d" stroke="${a}" stroke-width="3"/>`).join('');
  } else {
    const palette=id==='prism-spectrum'?['#58eaff','#ff68dd','#ffe262','#82ffaf','#be7bff','#ffa06b']:[c,a];
    art=Array.from({length:6},(_,i)=>`<g transform="rotate(${i*60} 128 128)"><path d="m128 16 45 29-11 36-34 17-35-17-10-36z" fill="#10283e" stroke="${palette[i%palette.length]}" stroke-width="3"/><path d="m110 45 18-11 18 11-5 22-13 9-13-9z" fill="${palette[i%palette.length]}"/><path d="M128 84v26" stroke="#fff" stroke-width="2"/></g>`).join('');
    art+=`<circle cx="128" cy="128" r="27" fill="${a}"/><circle cx="128" cy="128" r="14" fill="#fff"/>`;
  }
  // Surface facets and baked neon bloom cost no runtime filters or extra combat objects.
  if(part==='hero')art=art.replaceAll('fill="#10283e"',`fill="url(#${uid}-metal)"`)
    .replaceAll('fill="#17374f"',`fill="url(#${uid}-metal)"`)
    .replaceAll('fill="#522440"',`fill="url(#${uid}-petal)"`)
    .replaceAll('fill="#174538"',`fill="url(#${uid}-leaf)"`)
    .replaceAll('fill="#22465d"',`fill="url(#${uid}-metal)"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs>
    <radialGradient id="${uid}-halo"><stop stop-color="${a}" stop-opacity=".8"/><stop offset=".3" stop-color="${c}" stop-opacity=".3"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${uid}-metal" x2=".8" y2="1"><stop stop-color="${a}" stop-opacity=".75"/><stop offset=".22" stop-color="#304c63"/><stop offset=".58" stop-color="#101a31"/><stop offset="1" stop-color="#030912"/></linearGradient>
    <linearGradient id="${uid}-petal"><stop stop-color="#190e2c"/><stop offset=".6" stop-color="#823e81"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <linearGradient id="${uid}-leaf"><stop stop-color="#051e24"/><stop offset=".6" stop-color="#20614d"/><stop offset="1" stop-color="${a}"/></linearGradient>
    <filter id="${uid}-neon" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur"/><feFlood flood-color="${c}" flood-opacity=".6"/><feComposite in2="blur" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs><g${part==='hero'||part==='fragment'?` filter="url(#${uid}-neon)"`:''}>${art}</g></svg>`;
}

export function createLegacyBombPreviewSvg(id: LegacyBombTheme): string {
  const layer=(part:LegacyBombPart,cls:string)=>`<g class="${cls}">${createLegacyBombSvg(id,part).replace(/^<svg[^>]*>|<\/svg>$/g,'')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 296 296" class="premium-bomb-svg">${layer('halo','bomb-halo')}${layer('ring','bomb-orbit')}${layer('hero','bomb-hero')}</svg>`;
}
