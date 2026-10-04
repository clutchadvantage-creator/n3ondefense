/** Same base, housing, barrel, muzzle and core proportions as abilities/Turret.ts. */
export const createStandardTurretSvg = (): SVGSVGElement => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 58"
    role="img" aria-label="Standard Sentinel turret frame" class="standard-turret-svg">
    <g transform="translate(24 30)">
      <circle cy="1" r="15" fill="var(--item-color)" fill-opacity=".12" stroke="var(--item-color)" stroke-opacity=".32"/>
      <circle cy="4" r="10" fill="#07131d" fill-opacity=".98" stroke="var(--item-color)" stroke-width="2"/>
      <rect x="-7.5" y="-6" width="15" height="12" fill="#102838" stroke="var(--item-color)" stroke-width="2"/>
      <rect x="-3" y="-20" width="6" height="18" fill="var(--item-color)" fill-opacity=".92" stroke="#fff" stroke-opacity=".72"/>
      <rect x="-5" y="-23.5" width="10" height="5" fill="#07131d" stroke="var(--item-color)" stroke-width="2"/>
      <circle cy="1" r="3" fill="#fff" fill-opacity=".95"/>
    </g>
  </svg>`;
  return wrapper.firstElementChild as SVGSVGElement;
};
