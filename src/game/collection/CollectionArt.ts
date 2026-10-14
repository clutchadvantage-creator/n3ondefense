import { RELICS, TROPHIES } from './CollectionCatalog.ts';

const metal = `<defs>
  <linearGradient id="metal" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#effaff"/><stop offset=".18" stop-color="#7393a9"/><stop offset=".4" stop-color="#d9ebf4"/><stop offset=".51" stop-color="#334755"/><stop offset=".77" stop-color="#9eb6c5"/><stop offset="1" stop-color="#263843"/></linearGradient>
  <linearGradient id="dark" x2=".7" y2="1"><stop stop-color="#526574"/><stop offset=".38" stop-color="#18222e"/><stop offset="1" stop-color="#060b15"/></linearGradient>
  <linearGradient id="glass" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".3"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#b6eaff" stop-opacity=".14"/></linearGradient>
  <radialGradient id="well"><stop stop-color="#213a50"/><stop offset="1" stop-color="#030914"/></radialGradient>
  <linearGradient id="holo" x2="1" y2="1"><stop stop-color="#e4f7ff"/><stop offset=".28" stop-color="#80d6ff"/><stop offset=".48" stop-color="#dab9ff"/><stop offset=".62" stop-color="#334153"/><stop offset=".86" stop-color="#a8faff"/><stop offset="1" stop-color="#718796"/></linearGradient>
</defs>`;
const bolt = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="7" fill="#050a12" stroke="#8fa6b5" stroke-width="2"/><path d="M${x-3} ${y}h6" stroke="#bbcddb" stroke-width="2"/>`;
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const wrap = (body: string, locked = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${metal}<g${locked ? ' opacity=".72"' : ''}>${body}</g></svg>`;

const trophySymbols: Record<string, string> = {
  'demolition-expert': '<path d="m256 117 20 69 57-44-22 73 71 10-63 37 48 55-79-15-32 77-29-77-81 15 51-59-68-33 75-10-22-72 58 43Z"/><circle cx="256" cy="244" r="41" fill="url(#dark)"/><path d="m247 216 28 27-31 33" fill="none"/>',
  'exterminator': '<path d="m188 167 68-26 68 26 14 96-39 40-43 29-43-29-39-40Z"/><path d="m199 219 37 10-8 22-29-5m114-27-37 10 8 22 29-5" fill="#080b13"/><path d="M256 116v46m0 159v48M142 244h51m126 0h51" fill="none"/><path d="m237 279 19-14 19 14-19 20Z" fill="url(#dark)"/>',
  'anomaly-explorer': '<path d="m256 130 85 48v132l-85 48-85-48V178Z" fill="url(#dark)"/><ellipse cx="256" cy="244" rx="56" ry="87" fill="#10112e"/><ellipse cx="256" cy="244" rx="34" ry="64" fill="none"/><path d="m218 147 25 18m53-18-27 18m-73 130 24-5m97 8-24-8M241 214l36 31-36 31Z"/>',
  'boss-breaker': '<path d="m172 153 56 17 28-31 29 31 55-17-13 65 21 58-49 47-43 20-44-20-48-47 20-58Z"/><path d="m250 148 22 53-30 24 33 36-29 71" fill="none" stroke="#090d18" stroke-width="11"/><path d="m190 224 43 14-4 24-34-5m126-35-39 15 5 25 29-8" fill="#080b13"/>',
  'automated-warfare': '<path d="M214 258h84l20 47-18 26h-88l-18-26Z"/><path d="M192 195h128v67H192Z" fill="url(#dark)"/><path d="M218 137h24v81h-24Zm52 0h24v81h-24Z"/><path d="m214 302-43 39m127-39 43 39" fill="none" stroke-width="16"/><circle cx="256" cy="237" r="12"/>',
  'untouchable': '<path d="m256 131 87 38-12 115-75 67-75-67-12-115Z"/><path d="m256 163 57 27-8 78-49 44-49-44-8-78Z" fill="url(#dark)"/><path d="m227 237 22 24 44-51" fill="none" stroke-width="14"/><path d="M151 204v71m210-71v71" fill="none"/>',
  'speed-demon': '<path d="m278 128-93 132h65l-19 96 102-150h-71Z"/><path d="M153 190h52m-70 42h42m-33 43h36m-18 42h43m99-161h41m-31 156h34" fill="none" stroke-width="9"/>',
  'mod-collector': '<path d="m169 183 84-37 49 146-84 34Z" fill="url(#dark)"/><path d="m264 153 84 31-48 142-84-31Z" fill="url(#dark)"/><path d="M210 163h92v164h-92Z"/><path d="M223 182h66v111h-66Z" fill="url(#dark)"/><path d="m256 206 20 30-20 32-20-32Z"/><path d="M233 311h45" fill="none"/>',
  'veteran-operative': '<path d="m256 130 18 34 39 6-29 28 7 39-35-18-35 18 7-39-29-28 39-6Z"/><path d="m181 241 75 36 75-36v30l-75 36-75-36Zm0 51 75 36 75-36v24l-75 37-75-37Z"/><path d="m151 189 14 76m196-76-14 76" fill="none"/>',
  'credit-tycoon': '<path d="M174 242h74v81h-74Zm93-34h72v115h-72Z" fill="url(#dark)"/><path d="M174 261h74m-74 23h74m-74 23h74m19-79h72m-72 25h72m-72 25h72m-72 24h72" fill="none"/><path d="m252 131 50 30v55l-50 28-50-28v-55Z"/><path d="M266 166h-27v39h27m-14-46v54" fill="none" stroke="#10222c" stroke-width="8"/>'
};
export const trophySvg = (id: string, locked = false): string => {
  const trophy = TROPHIES.find(t => t.id === id)!;
  const accent = locked ? '#70818d' : hex(trophy.color);
  return wrap(`<path d="m256 37 154 75 24 201-92 110-86 47-86-47-92-110 24-201Z" fill="#02050b"/>
    <path d="m256 27 151 75 19 201-93 110-77 45-77-45-93-110 19-201Z" fill="url(#metal)" stroke="#d8e7ee" stroke-width="2"/>
    <path d="m256 47 132 66 18 182-85 101-65 39-65-39-85-101 18-182Z" fill="url(#dark)" stroke="${accent}" stroke-width="4"/>
    <path d="m256 77 109 51 14 157-75 89-48 30-48-30-75-89 14-157Z" fill="url(#well)" stroke="#617885" stroke-width="2"/>
    <g transform="translate(0 7)" fill="#02060c" stroke="#02060c" stroke-width="12" stroke-linejoin="round">${trophySymbols[id]}</g>
    <g fill="url(#metal)" stroke="${accent}" stroke-width="5" stroke-linejoin="round">${trophySymbols[id]}</g>
    <path d="m120 118 130-64 115 58-47 53-160 99Z" fill="url(#glass)"/>
    ${bolt(128, 123)}${bolt(384, 123)}${bolt(148, 322)}${bolt(364, 322)}
    <path d="m211 384 45 27 45-27" fill="none" stroke="${accent}" stroke-width="5"/>
    <path d="m178 398 22 12m112-12 22-12M139 146l-6 56m246-56 6 56" fill="none" stroke="#e9f6ff" stroke-width="2"/>
    ${Array.from({length: 8}, (_, i) => `<path d="m${109+i*2} ${169+i*15} 7 5m${403-i*2} ${169+i*15}-7 5" stroke="#657c8c" stroke-width="2"/>`).join('')}
    <path d="M210 109h92m-73 8h54M203 366l53 29 53-29" fill="none" stroke="${accent}" stroke-width="1"/>
    <text x="256" y="383" fill="#849ba9" font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="2">RWX // ${String(TROPHIES.indexOf(trophy)+1).padStart(2,'0')}</text>
    <path d="M245 92h22m-11-11v22" stroke="${accent}" stroke-width="2"/>`, locked);
};

// All plates share a canvas and complementary seams: the fragments ARE the artifact.
const cipherPlates = ['M256 49 400 120 356 250 256 219 156 250 112 120Z', 'M112 120 156 250 256 219 256 340 177 438 83 308Z', 'M400 120 429 308 335 438 177 438 256 340 256 219 356 250Z'];
const corePlates = ['M90 109 230 62 268 127 214 219 143 285 68 249Z', 'M268 127 377 103 443 204 399 308 278 302 214 219Z', 'M143 285 214 219 278 302 399 308 367 415 225 447 116 393Z'];
export const relicSvg = (id: string, piece?: number, locked = false): string => {
  const cipher = id === 'identity-cipher', accent = locked ? '#73828c' : cipher ? '#9d82ff' : '#ff405e', secondary = locked ? '#84929c' : cipher ? '#7cffff' : '#ff9b73';
  const plates = cipher ? cipherPlates : corePlates;
  const shape = cipher ? `<path d="m256 101 104 56-23 131-81 82-81-82-23-131Z" fill="none" stroke="${secondary}" stroke-width="5"/>
    <path d="m256 139 57 34-10 86-47 45-47-45-10-86Z" fill="url(#dark)" stroke="${accent}" stroke-width="6"/>
    <path d="M229 263v-77l27 38 27-38v77m-70 55 43 23 43-23" fill="none" stroke="${secondary}" stroke-width="8"/>
    <path d="m164 140 17 11m149 0 17-11M130 285l27 16m198 0 27-16m-171 87 12-15m78 15-12-15" stroke="#edfaff" stroke-width="5"/>
    <path d="M208 401h96m-72 13h48" stroke="${accent}" stroke-width="4"/>`
    : `<path d="m241 134 101-3 63 85-36 60-99-2-51-62Z" fill="#040811" stroke="${accent}" stroke-width="7"/>
    <path d="m275 156 48 4 43 54-26 38-57-8-35-35Z" fill="url(#dark)" stroke="${secondary}" stroke-width="4"/>
    <path d="m302 169 32 42-29 25-31-39Z" fill="${accent}"/><path d="m111 143 67-23 18 41-63 25Z" fill="#0a111c" stroke="#8f9caa" stroke-width="4"/>
    <path d="m149 315 56-39 57 58 84-2-12 47-105 26-60-25Z" fill="url(#dark)" stroke="${accent}" stroke-width="4"/>
    <path d="m119 211 36-12m-28 30 36-12m-10 113 34-24m-23 42 34-24m48 38 74-13" stroke="${secondary}" stroke-width="6"/>
    <path d="m193 112 24-8 10 17-24 8m133 290 5-21 15-5-5 21" fill="${secondary}"/>`;
  const selected = piece === undefined ? [0, 1, 2] : [piece];
  return wrap(selected.map(i => `<defs><clipPath id="plate${i}"><path d="${plates[i]}"/></clipPath></defs>
    <path d="${plates[i]}" transform="translate(0 9)" fill="#01030a" stroke="#01030a" stroke-width="9"/>
    <path d="${plates[i]}" fill="url(#${cipher && !locked ? 'holo' : 'metal'})" stroke="#afc5d4" stroke-width="3"/>
    <g clip-path="url(#plate${i})"><path d="${plates[i]}" fill="url(#dark)" stroke="${accent}" stroke-width="3" transform="translate(256 256) scale(.948) translate(-256 -256)"/>
    ${shape}<path d="M70 104 241 44 437 111 335 172 89 339Z" fill="url(#glass)"/>
    ${Array.from({length: 9}, (_, n) => `<path d="M${103+n*3} ${238+n*9}h${22+n%3*4}l12-12h17m${218-n*3} ${-109-n*4}h${16+n%2*6}v12" fill="none" stroke="${secondary}" stroke-width="1" opacity=".3"/>`).join('')}
    <path d="M190 124l66-31 92 46m-199 206 43 49h34m65 15h22l42-49m-84-29 19-17h48" fill="none" stroke="#bdd4e2" stroke-width="2" opacity=".6"/>
    ${Array.from({length: 7}, (_, n) => `<path d="M${282+n*7} 351v${13+n%3*4}" stroke="${secondary}" stroke-width="2" opacity=".65"/>`).join('')}
    <text x="257" y="389" fill="${secondary}" font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="2">${cipher ? 'RWX // ID-01' : 'RESTRICTED'}</text>
    ${[ [126,144],[369,154],[138,321],[320,395],[251,253] ].map(([x,y]) => bolt(x,y)).join('')}
    <path d="M78 241h72l39-41m148 129h69m-241 56 40 22" fill="none" stroke="${secondary}" stroke-width="2" opacity=".7"/></g>
    <path d="${plates[i]}" fill="none" stroke="#000813" stroke-width="4"/>`).join(''), locked);
};
export const collectionArtAssets = (): { key: string; svg: string }[] => [
  ...TROPHIES.flatMap(t => [{ key: `trophy-${t.id}`, svg: trophySvg(t.id) }, { key: `trophy-${t.id}-locked`, svg: trophySvg(t.id, true) }]),
  ...RELICS.flatMap(r => [{ key: `relic-${r.id}-locked`, svg: relicSvg(r.id, undefined, true) }, { key: `relic-${r.id}`, svg: relicSvg(r.id) },
    ...r.fragments.map((f, i) => ({ key: `fragment-${f.id}`, svg: relicSvg(r.id, i) }))])
];
