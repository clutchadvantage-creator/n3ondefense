/** Cached street-level six-lane expressway. No runtime geometry or text. */
export function drawSkyHighway(c: CanvasRenderingContext2D): void {
  const height = 2048;
  c.fillStyle = '#081521'; c.fillRect(0, 0, 512, height);
  c.fillStyle = '#122535'; c.fillRect(110, 0, 292, height);
  const asphalt = c.createLinearGradient(130, 0, 382, 0);
  asphalt.addColorStop(0, '#1b2c39'); asphalt.addColorStop(.5, '#111e2b'); asphalt.addColorStop(1, '#213340');
  c.fillStyle = asphalt; c.fillRect(130, 0, 252, height);
  // Three lanes in each direction, separated by a continuous lit median.
  c.fillStyle = '#07111c'; c.fillRect(249, 0, 14, height);
  for (const x of [132, 380, 246, 266]) {
    c.fillStyle = x === 246 || x === 266 ? '#a58b58' : '#829ba4'; c.fillRect(x, 0, 2, height);
  }
  c.strokeStyle = '#82929c'; c.lineWidth = 2; c.setLineDash([29, 27]);
  for (const x of [171, 208, 303, 340]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, height); c.stroke(); }
  c.setLineDash([]);
  for (const x of [115, 123, 389, 397]) {
    c.fillStyle = '#344858'; c.fillRect(x, 0, 2, height);
  }
  for (let y = 0; y < height; y += 64) {
    c.fillStyle = '#69b9c2'; c.fillRect(118, y, 3, 12); c.fillRect(391, y, 3, 12);
    c.fillStyle = '#628692'; c.fillRect(254, y + 30, 4, 7);
  }
  // Direction arrows are markings on asphalt, not scattered roof tiles.
  for (const y of [190, 770, 1260, 1800]) for (const x of [152, 190, 228, 284, 322, 360]) {
    c.save(); c.translate(x, y); if (x > 256) c.rotate(Math.PI);
    c.strokeStyle = '#8999a5'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, 15); c.lineTo(0, -15); c.moveTo(-6, -8); c.lineTo(0, -15); c.lineTo(6, -8); c.stroke(); c.restore();
  }
  // Narrow merge shoulders and long diagonal striping leave the through lanes clear.
  for (const [x, sign] of [[101, 1], [411, -1]]) {
    c.strokeStyle = '#365766'; c.lineWidth = 1;
    for (let y = 70; y < height; y += 44) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + sign * 9, y + 20); c.stroke(); }
  }
  const board = (x: number, y: number, color: string, brand: string, line: string, tag: string) => {
    c.fillStyle = '#00081188'; c.fillRect(x + 7, y + 15, 96, 123);
    c.fillStyle = '#3b5160'; c.fillRect(x + 12, y + 103, 5, 39); c.fillRect(x + 76, y + 103, 5, 39);
    c.fillStyle = '#040e1b'; c.fillRect(x, y, 96, 112);
    c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = 7; c.strokeRect(x + 1, y + 1, 94, 110); c.shadowBlur = 0;
    c.save(); c.translate(x + 48, y + 36);
    c.strokeStyle = color; c.lineWidth = 2; c.beginPath();
    c.moveTo(0, -22); c.lineTo(20, 0); c.lineTo(0, 22); c.lineTo(-20, 0); c.closePath(); c.stroke();
    c.fillStyle = color; c.font = 'bold 21px monospace'; c.textAlign = 'center'; c.fillText(tag, 0, 7);
    c.font = 'bold 11px monospace'; c.fillText(brand, 0, 36, 89);
    c.fillStyle = '#c5dfe7'; c.font = '8px monospace'; c.fillText(line, 0, 55, 88);
    c.fillStyle = color; c.fillRect(-30, 65, 60, 2); c.restore();
  };
  board(7, 245, '#56d9e7', 'N3ONDEFENSE', 'DEFEND YOUR FUTURE', 'N3');
  board(409, 840, '#ffaf59', 'FLUX CORE', 'POWER. WITHOUT LIMITS.', 'FC');
  board(7, 1320, '#b098f3', 'LYRA LINK', 'STAY ONE STEP AHEAD', 'L');
  board(409, 1760, '#66e5b2', 'RWG ARMORY', 'BUILT FOR OVERDRIVE', 'RW');
  for (const [y, title, exit] of [[440, 'N3 / NEON DISTRICT', 'EXIT 07'], [1470, 'RWG / SKYPORT', 'EXIT 12']] as const) {
    c.fillStyle = '#02081277'; c.fillRect(121, y + 12, 270, 56);
    c.fillStyle = '#48616e'; c.fillRect(119, y, 4, 78); c.fillRect(389, y, 4, 78); c.fillRect(119, y + 5, 274, 4);
    c.fillStyle = '#143c40'; c.fillRect(140, y - 9, 233, 43);
    c.strokeStyle = '#97c3c7'; c.strokeRect(140, y - 9, 233, 43);
    c.fillStyle = '#d6eef0'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(title, 256, y + 8);
    c.font = '10px monospace'; c.fillText('↑  ↑  ↑    ' + exit + ' ↗', 256, y + 25);
  }
}
