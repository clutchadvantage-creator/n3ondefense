export const TUG_WHISTLE_TEXTURE = 'tug-life-steam-whistle';
export const TUG_STEAM_TEXTURE = 'tug-life-steam-cloud';
export const TUG_WHISTLE_BURST_MS = 520;
export const TUG_WHISTLE_LIFETIME_MS = 3400;
let sequence = 0;

const definitions = (id: string) => `<defs>
 <linearGradient id="${id}-gold"><stop stop-color="#6e3309"/><stop offset=".18" stop-color="#d88c23"/><stop offset=".34" stop-color="#fff3b3"/><stop offset=".46" stop-color="#ffcd58"/><stop offset=".7" stop-color="#b86a13"/><stop offset=".86" stop-color="#ffe390"/><stop offset="1" stop-color="#7c3909"/></linearGradient>
 <linearGradient id="${id}-rim" x2="0" y2="1"><stop stop-color="#fffbd8"/><stop offset=".35" stop-color="#ffdb6d"/><stop offset=".6" stop-color="#b8620e"/><stop offset="1" stop-color="#ffe9a3"/></linearGradient>
 <radialGradient id="${id}-steam"><stop stop-color="#fff" stop-opacity=".94"/><stop offset=".62" stop-color="#eafaff" stop-opacity=".76"/><stop offset="1" stop-color="#a8ebff" stop-opacity="0"/></radialGradient>
 <filter id="${id}-glow" x="-60%" y="-40%" width="220%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>`;

// Riveted base, valve wheel, split resonator mouth and domed brass bell.
const whistle = (id: string) => `<g stroke-linejoin="round">
 <path d="M89 256h62v31H89zM77 282h86v18H77zM99 219h42v42H99z" fill="url(#${id}-gold)" stroke="#ffd16c" stroke-width="2"/>
 <path d="M82 137V75Q82 43 120 38q38 5 38 37v62l-9 82H91z" fill="url(#${id}-gold)" stroke="#ffdf7f" stroke-width="3"/>
 <path d="M86 76q34-17 68 0M87 96q33-12 66 0M92 204q28 9 56 0" fill="none" stroke="#fff1bc" stroke-width="2"/>
 <path d="M99 78v107M107 71v124" stroke="#fff9d5" stroke-width="3" opacity=".72"/>
 <path d="M140 82v115" stroke="#6d310a" stroke-width="5" opacity=".65"/>
 <ellipse cx="120" cy="137" rx="39" ry="10" fill="#271b13" stroke="#fff0aa" stroke-width="2"/>
 <path d="M83 136v12q37 20 74 0v-12q-37 16-74 0" fill="url(#${id}-rim)" stroke="#ffd56e" stroke-width="2"/>
 <path d="M91 216q29 13 58 0l6 9q-35 17-70 0zM80 65q40-20 80 0l-2 10q-38-16-76 0z" fill="url(#${id}-rim)" stroke="#fff1b2" stroke-width="2"/>
 <path d="M120 39V25M112 25h16" stroke="#ffe69b" stroke-width="5"/>
 <path d="M149 209h26v40h-24M174 231h14" fill="none" stroke="#b57921" stroke-width="8"/>
 <circle cx="190" cy="231" r="17" fill="#10212a" stroke="#ffc550" stroke-width="4"/>
 <path d="M175 231h30M190 216v30m-10-25 20 20m0-20-20 20" stroke="#ffdf87" stroke-width="2"/>
 <circle cx="190" cy="231" r="5" fill="#fff0b4"/>
 <path d="M82 289h76M99 247h42" stroke="#fff3bb" stroke-width="2"/>
 <g fill="#fff0ae" stroke="#a76819"><circle cx="86" cy="291" r="3"/><circle cx="154" cy="291" r="3"/><circle cx="97" cy="223" r="2.5"/><circle cx="143" cy="223" r="2.5"/></g>
 <path d="M87 116v10m-5-5h10M148 177v10m-5-5h10" stroke="#fff" stroke-width="2"/>
</g>`;

export function createTugLifeWhistleHeroSvg(): string {
 const id = 'tug-brass';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320">${definitions(id)}<g opacity=".65" filter="url(#${id}-glow)">${whistle(id)}</g>${whistle(id)}</svg>`;
}

export function createTugLifeSteamSvg(): string {
 const id = 'tug-vapor';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130">${definitions(id)}<g fill="url(#${id}-steam)"><ellipse cx="77" cy="78" rx="70" ry="46"/><circle cx="44" cy="60" r="37"/><circle cx="85" cy="44" r="41"/><circle cx="121" cy="62" r="34"/></g><path d="M24 74q-6-27 22-28M59 31q25-19 45 5M99 89q30 10 40-13" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/></svg>`;
}

/** The storefront uses the same vector brass silhouette as the arena texture. */
export function createTugLifeWhistleSvg(): string {
 const id = `tug-preview-${sequence++}`;
 const clouds = Array.from({length:8}, (_,i) => `<g class="tug-steam" style="--steam-delay:${.5 + i*.13}s;--steam-x:${(i%2?1:-1)*(36+i*6)}px;--steam-y:${-90-i*9}px" fill="url(#${id}-steam)"><ellipse cx="160" cy="132" rx="34" ry="27"/><circle cx="146" cy="116" r="24"/><circle cx="176" cy="111" r="26"/></g>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" class="tug-whistle-svg" viewBox="0 0 320 340" role="img" aria-label="Tug Life golden steam whistle bursting with white steam">${definitions(id)}
 <ellipse cx="160" cy="294" rx="108" ry="23" fill="none" stroke="#ffcd63" stroke-opacity=".45"/>
 <ellipse cx="160" cy="294" rx="89" ry="15" fill="none" stroke="#8cf5ff" stroke-opacity=".35"/>
 <g transform="translate(40,-7)"><g class="tug-whistle-body"><g opacity=".6" filter="url(#${id}-glow)">${whistle(id)}</g>${whistle(id)}</g></g>${clouds}
 </svg>`;
}
