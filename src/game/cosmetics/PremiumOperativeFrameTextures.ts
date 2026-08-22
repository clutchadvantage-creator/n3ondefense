import Phaser from 'phaser';

const transparentCanvas = (graphics: Phaser.GameObjects.Graphics, width: number, height: number): void => {
  graphics.clear();
  graphics.fillStyle(0x000000, 0);
  graphics.fillRect(0, 0, width, height);
};

const finish = (graphics: Phaser.GameObjects.Graphics, key: string, width: number, height: number): void => {
  graphics.generateTexture(key, width, height);
};

/**
 * Detailed grayscale source art for premium operative frames. Player tinting is
 * applied by the existing runtime, so material values remain shaded while the
 * equipped operative color stays authoritative.
 */
export const createPremiumOperativeFrameTextures = (g: Phaser.GameObjects.Graphics): void => {
  // CRITICAL CRUNCH // folded cereal carton, mascot, bowl, side label, and barcode.
  transparentCanvas(g, 44, 54);
  g.fillStyle(0x202a35, 1).fillRoundedRect(6, 5, 32, 46, 3);
  g.lineStyle(2, 0xffffff, 1).strokeRoundedRect(6, 5, 32, 46, 3);
  g.fillStyle(0xcbd7e2, 1).fillPoints([{ x: 6, y: 10 }, { x: 12, y: 2 }, { x: 32, y: 2 }, { x: 38, y: 10 }], true);
  g.lineStyle(1, 0x344252, 1).strokePoints([{ x: 6, y: 10 }, { x: 12, y: 2 }, { x: 32, y: 2 }, { x: 38, y: 10 }], true);
  g.lineBetween(22, 3, 22, 9);
  g.fillStyle(0xf5fbff, 1).fillRoundedRect(9, 12, 21, 15, 2);
  g.fillStyle(0x111821, 1).fillTriangle(11, 23, 16, 14, 20, 23).fillTriangle(17, 23, 22, 14, 28, 23);
  g.fillStyle(0x8d9dab, 1).fillEllipse(19, 34, 18, 8);
  g.fillStyle(0xf7fcff, 1).fillEllipse(19, 32, 15, 6);
  for (const cereal of [{ x: 14, y: 31 }, { x: 19, y: 33 }, { x: 23, y: 30 }, { x: 17, y: 29 }]) {
    g.fillStyle(0x445363, 1).fillCircle(cereal.x, cereal.y, 2);
  }
  g.fillStyle(0x0b1119, 1).fillRoundedRect(30, 12, 5, 27, 1);
  for (let y = 14; y <= 24; y += 3) g.fillStyle(0xdde8ef, 1).fillRect(31, y, 3, 1);
  for (let x = 9; x < 35; x += 3) g.fillStyle(x % 2 ? 0xf5fbff : 0x738595, 1).fillRect(x, 43, 1, 5);
  g.fillStyle(0x05090e, 1).fillCircle(14, 19, 1.3).fillCircle(24, 19, 1.3);
  g.lineStyle(1, 0x0b1119, 1).beginPath().arc(19, 20, 5, 0.2, Math.PI - 0.2, false).strokePath();
  finish(g, 'player-premium-critical-crunch', 44, 54);

  // PROBE-ABLY FINE // elongated alien skull, reflective eyes, scan glyphs.
  transparentCanvas(g, 48, 54);
  g.fillStyle(0x9eafbc, 1).fillEllipse(24, 21, 40, 37);
  g.fillPoints([{ x: 7, y: 21 }, { x: 12, y: 37 }, { x: 24, y: 51 }, { x: 36, y: 37 }, { x: 41, y: 21 }], true);
  g.lineStyle(2, 0xf7fcff, 1).strokeEllipse(24, 21, 40, 37);
  g.strokePoints([{ x: 7, y: 21 }, { x: 12, y: 37 }, { x: 24, y: 51 }, { x: 36, y: 37 }, { x: 41, y: 21 }], false);
  g.fillStyle(0x02060b, 1);
  g.fillPoints([{ x: 10, y: 19 }, { x: 22, y: 22 }, { x: 18, y: 34 }, { x: 9, y: 27 }], true);
  g.fillPoints([{ x: 38, y: 19 }, { x: 26, y: 22 }, { x: 30, y: 34 }, { x: 39, y: 27 }], true);
  g.fillStyle(0xe9faff, 0.88).fillEllipse(14, 22, 4, 2).fillEllipse(34, 22, 4, 2);
  g.fillStyle(0x25313d, 1).fillEllipse(21, 37, 2, 1).fillEllipse(27, 37, 2, 1);
  g.lineStyle(1, 0x2e3c49, 1).lineBetween(20, 43, 28, 43);
  g.lineBetween(5, 14, 11, 10).lineBetween(37, 10, 43, 14);
  g.lineStyle(1, 0xf1f8fc, 0.8).lineBetween(4, 29, 9, 29).lineBetween(39, 29, 44, 29);
  g.fillStyle(0xffffff, 1).fillCircle(5, 29, 1.5).fillCircle(43, 29, 1.5);
  finish(g, 'player-premium-probe-fine', 48, 54);

  // MIDLIFE CRISIS Mk. IV // top-down hypercar with aero, cockpit, intakes, and lamps.
  transparentCanvas(g, 52, 58);
  g.fillStyle(0x05090e, 1).fillRoundedRect(2, 13, 7, 15, 2).fillRoundedRect(43, 13, 7, 15, 2);
  g.fillRoundedRect(2, 36, 7, 15, 2).fillRoundedRect(43, 36, 7, 15, 2);
  const carBody = [
    { x: 26, y: 2 }, { x: 37, y: 8 }, { x: 43, y: 19 }, { x: 41, y: 45 },
    { x: 35, y: 54 }, { x: 17, y: 54 }, { x: 11, y: 45 }, { x: 9, y: 19 }, { x: 15, y: 8 }
  ];
  g.fillStyle(0xdce7ee, 1).fillPoints(carBody, true);
  g.lineStyle(2, 0xffffff, 1).strokePoints(carBody, true);
  g.fillStyle(0x15212c, 1).fillPoints([{ x: 18, y: 15 }, { x: 34, y: 15 }, { x: 37, y: 32 }, { x: 15, y: 32 }], true);
  g.lineStyle(1, 0x748797, 1).strokePoints([{ x: 18, y: 15 }, { x: 34, y: 15 }, { x: 37, y: 32 }, { x: 15, y: 32 }], true);
  g.fillStyle(0x2e3d49, 1).fillTriangle(11, 24, 17, 25, 14, 38).fillTriangle(41, 24, 35, 25, 38, 38);
  g.fillStyle(0xffffff, 1).fillPoints([{ x: 15, y: 9 }, { x: 22, y: 6 }, { x: 19, y: 12 }], true);
  g.fillPoints([{ x: 37, y: 9 }, { x: 30, y: 6 }, { x: 33, y: 12 }], true);
  g.fillStyle(0x536675, 1).fillRect(14, 47, 24, 4);
  g.fillStyle(0x101820, 1).fillRect(10, 52, 32, 3);
  g.lineStyle(1, 0x4f6170, 1).lineBetween(26, 3, 26, 14).lineBetween(26, 33, 26, 53);
  g.fillStyle(0xffffff, 1).fillRect(13, 42, 4, 2).fillRect(35, 42, 4, 2);
  finish(g, 'player-premium-midlife-crisis', 52, 58);

  // HIGHLY TACTICAL // seven serrated cyber-leaf blades, veins, circuit nodes.
  transparentCanvas(g, 56, 60);
  g.lineStyle(5, 0x1c2831, 1).lineBetween(28, 31, 28, 57);
  g.lineStyle(2, 0xf5fbff, 1).lineBetween(28, 31, 28, 57);
  const leafBlades = [
    [{ x: 28, y: 34 }, { x: 22, y: 18 }, { x: 28, y: 1 }, { x: 34, y: 18 }],
    [{ x: 27, y: 36 }, { x: 13, y: 23 }, { x: 9, y: 7 }, { x: 23, y: 17 }],
    [{ x: 25, y: 39 }, { x: 8, y: 34 }, { x: 1, y: 21 }, { x: 17, y: 25 }],
    [{ x: 24, y: 42 }, { x: 10, y: 46 }, { x: 4, y: 38 }, { x: 17, y: 35 }],
    [{ x: 29, y: 36 }, { x: 43, y: 23 }, { x: 47, y: 7 }, { x: 33, y: 17 }],
    [{ x: 31, y: 39 }, { x: 48, y: 34 }, { x: 55, y: 21 }, { x: 39, y: 25 }],
    [{ x: 32, y: 42 }, { x: 46, y: 46 }, { x: 52, y: 38 }, { x: 39, y: 35 }]
  ];
  for (let index = 0; index < leafBlades.length; index += 1) {
    g.fillStyle(index % 2 === 0 ? 0xd9e8df : 0x879c91, 1).fillPoints(leafBlades[index], true);
    g.lineStyle(1.5, 0xf8fffb, 1).strokePoints(leafBlades[index], true);
  }
  g.lineStyle(1, 0x23342c, 0.95);
  g.lineBetween(28, 36, 28, 6).lineBetween(26, 37, 12, 12).lineBetween(24, 39, 4, 25);
  g.lineBetween(30, 37, 44, 12).lineBetween(32, 39, 52, 25);
  for (const node of [{ x: 28, y: 20 }, { x: 17, y: 25 }, { x: 39, y: 25 }, { x: 13, y: 36 }, { x: 43, y: 36 }]) {
    g.fillStyle(0xffffff, 1).fillCircle(node.x, node.y, 1.5);
  }
  finish(g, 'player-premium-highly-tactical', 56, 60);

  // TUG LIFE // top-down tug with fendered hull, wheelhouse, rails, stack, and radar.
  transparentCanvas(g, 46, 60);
  const tugHull = [{ x: 23, y: 2 }, { x: 38, y: 13 }, { x: 41, y: 46 }, { x: 34, y: 57 }, { x: 12, y: 57 }, { x: 5, y: 46 }, { x: 8, y: 13 }];
  g.fillStyle(0x7f919f, 1).fillPoints(tugHull, true);
  g.lineStyle(2, 0xffffff, 1).strokePoints(tugHull, true);
  g.fillStyle(0x1b2731, 1).fillRoundedRect(11, 17, 24, 22, 2);
  g.lineStyle(1, 0xdfeaf0, 1).strokeRoundedRect(11, 17, 24, 22, 2);
  g.fillStyle(0xeef8fc, 1).fillRect(14, 20, 8, 7).fillRect(24, 20, 8, 7);
  g.fillStyle(0x18242d, 1).fillRect(16, 8, 14, 8);
  g.fillStyle(0xffffff, 1).fillRect(20, 4, 6, 9);
  g.lineStyle(1, 0xf4fbff, 0.9).lineBetween(9, 42, 37, 42).lineBetween(11, 48, 35, 48);
  for (const x of [10, 17, 29, 36]) g.lineBetween(x, 40, x, 48);
  g.fillStyle(0x151d24, 1).fillCircle(5, 20, 3).fillCircle(41, 20, 3).fillCircle(5, 35, 3).fillCircle(41, 35, 3);
  g.lineStyle(1, 0xffffff, 1).lineBetween(23, 4, 23, 1).lineBetween(18, 3, 28, 3);
  g.fillStyle(0xffffff, 1).fillCircle(10, 13, 1.5).fillCircle(36, 13, 1.5);
  finish(g, 'player-premium-tug-life', 46, 60);

  // AIR SUPERIORITY COMPLEX // broad flying-wing interceptor, not the existing conventional aircraft.
  transparentCanvas(g, 62, 50);
  const wing = [
    { x: 31, y: 2 }, { x: 38, y: 15 }, { x: 59, y: 34 }, { x: 39, y: 29 },
    { x: 43, y: 46 }, { x: 31, y: 38 }, { x: 19, y: 46 }, { x: 23, y: 29 }, { x: 3, y: 34 }, { x: 24, y: 15 }
  ];
  g.fillStyle(0xaebdc8, 1).fillPoints(wing, true);
  g.lineStyle(2, 0xffffff, 1).strokePoints(wing, true);
  g.fillStyle(0x111b25, 1).fillPoints([{ x: 31, y: 7 }, { x: 38, y: 25 }, { x: 31, y: 34 }, { x: 24, y: 25 }], true);
  g.fillStyle(0xdde9ef, 1).fillEllipse(31, 17, 8, 13);
  g.lineStyle(1, 0x334451, 1).lineBetween(31, 3, 31, 38).lineBetween(24, 16, 8, 31).lineBetween(38, 16, 54, 31);
  g.fillStyle(0x17232d, 1).fillTriangle(16, 27, 26, 23, 22, 34).fillTriangle(46, 27, 36, 23, 40, 34);
  g.fillStyle(0xffffff, 1).fillCircle(8, 32, 2).fillCircle(54, 32, 2);
  g.fillStyle(0xd9e8ef, 1).fillRect(24, 40, 5, 5).fillRect(33, 40, 5, 5);
  finish(g, 'player-premium-air-superiority', 62, 50);

  // EYE DON'T LIKE THAT // layered iris, glossy pupil, eyelid, and crawling veins.
  transparentCanvas(g, 58, 50);
  g.fillStyle(0xe8edf0, 1).fillEllipse(29, 25, 54, 40);
  g.lineStyle(2, 0xffffff, 1).strokeEllipse(29, 25, 54, 40);
  g.fillStyle(0x9aabba, 1).fillCircle(29, 25, 15);
  g.lineStyle(2, 0x344554, 1).strokeCircle(29, 25, 15);
  g.lineStyle(1, 0xf8fcff, 0.8).strokeCircle(29, 25, 11);
  g.fillStyle(0x05080d, 1).fillCircle(29, 25, 7);
  g.fillStyle(0xffffff, 1).fillCircle(25, 20, 3).fillCircle(33, 29, 1.4);
  g.lineStyle(1, 0x525f6c, 1);
  for (const vein of [
    [3, 24, 13, 22, 17, 17], [7, 34, 15, 31, 18, 35], [55, 20, 45, 22, 40, 17],
    [53, 35, 44, 31, 41, 36], [17, 7, 21, 13, 23, 15], [40, 6, 37, 12, 35, 15]
  ]) {
    g.beginPath().moveTo(vein[0], vein[1]).lineTo(vein[2], vein[3]).lineTo(vein[4], vein[5]).strokePath();
  }
  g.lineStyle(1, 0x1f2b36, 1).beginPath().arc(29, 25, 22, Math.PI * 1.08, Math.PI * 1.92, false).strokePath();
  finish(g, 'player-premium-eye-dont-like-that', 58, 50);

  // ROLL MODEL // top-down racing chair with rims, spokes, seat, casters, and thrusters.
  transparentCanvas(g, 54, 58);
  g.lineStyle(3, 0xf6fbff, 1).strokeCircle(11, 34, 10).strokeCircle(43, 34, 10);
  g.lineStyle(1, 0x9babb7, 1);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    g.lineBetween(11, 34, 11 + Math.cos(angle) * 9, 34 + Math.sin(angle) * 9);
    g.lineBetween(43, 34, 43 + Math.cos(angle) * 9, 34 + Math.sin(angle) * 9);
  }
  g.fillStyle(0x24313c, 1).fillRoundedRect(17, 18, 20, 24, 3);
  g.lineStyle(2, 0xffffff, 1).strokeRoundedRect(17, 18, 20, 24, 3);
  g.fillStyle(0xaab9c3, 1).fillRoundedRect(17, 5, 20, 15, 3);
  g.lineStyle(2, 0xf8fcff, 1).strokeRoundedRect(17, 5, 20, 15, 3);
  g.lineStyle(2, 0xc6d4dd, 1).lineBetween(17, 22, 8, 19).lineBetween(37, 22, 46, 19);
  g.lineBetween(20, 42, 16, 51).lineBetween(34, 42, 38, 51).lineBetween(16, 51, 23, 51).lineBetween(38, 51, 31, 51);
  g.fillStyle(0xffffff, 1).fillCircle(8, 18, 3).fillCircle(46, 18, 3);
  g.fillStyle(0x536472, 1).fillRect(20, 44, 5, 8).fillRect(29, 44, 5, 8);
  finish(g, 'player-premium-roll-model', 54, 58);

  // RIBBIT.EXE // expressive frog with broad head, limbs, webbed toes, and circuit markings.
  transparentCanvas(g, 58, 54);
  g.fillStyle(0x91a89a, 1).fillEllipse(29, 25, 38, 31);
  g.fillCircle(19, 13, 10).fillCircle(39, 13, 10);
  g.lineStyle(2, 0xf7fff9, 1).strokeEllipse(29, 25, 38, 31).strokeCircle(19, 13, 10).strokeCircle(39, 13, 10);
  g.fillStyle(0xf7fcff, 1).fillCircle(19, 12, 6).fillCircle(39, 12, 6);
  g.fillStyle(0x05090d, 1).fillCircle(19, 12, 3).fillCircle(39, 12, 3);
  g.fillStyle(0x6f8678, 1).fillEllipse(11, 39, 18, 11).fillEllipse(47, 39, 18, 11);
  g.lineStyle(2, 0xe9f5ed, 1).strokeEllipse(11, 39, 18, 11).strokeEllipse(47, 39, 18, 11);
  g.lineStyle(4, 0x8fa497, 1).lineBetween(20, 36, 13, 49).lineBetween(38, 36, 45, 49);
  g.lineStyle(2, 0xf4fbf6, 1);
  for (const x of [8, 13, 18, 40, 45, 50]) g.lineBetween(x, 48, x + (x < 29 ? -3 : 3), 52);
  g.lineStyle(1.5, 0x1e2b23, 1).beginPath().arc(29, 27, 11, 0.12, Math.PI - 0.12, false).strokePath();
  g.fillStyle(0x26382e, 1).fillCircle(25, 22, 1.4).fillCircle(33, 22, 1.4);
  g.lineStyle(1, 0xffffff, 0.85).lineBetween(22, 31, 28, 35).lineBetween(28, 35, 35, 30);
  g.fillStyle(0xffffff, 1).fillCircle(28, 35, 1.5);
  finish(g, 'player-premium-ribbit-exe', 58, 54);
};

