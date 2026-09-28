import Phaser from 'phaser';

/** Shared authored artillery marker used by Arena bosses and anomaly batteries. */
export function createArtilleryMarker(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, artillery = true) {
    const targetRing = scene.add.circle(0, 0, radius, color, 0.055)
      .setStrokeStyle(3, color, 0.94)
      .setBlendMode(Phaser.BlendModes.ADD);
    const timingRing = scene.add.circle(0, 0, radius * 0.72, 0x000000, 0)
      .setStrokeStyle(2, 0xffffff, 0.82)
      .setBlendMode(Phaser.BlendModes.ADD);
    const reticle = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    reticle.lineStyle(2, color, 0.78);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI / 6;
      const inner = radius * (index % 3 === 0 ? 0.7 : 0.82);
      const outer = radius * (index % 3 === 0 ? 1.18 : 1.04);
      reticle.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    reticle.lineStyle(1, 0xffffff, 0.56)
      .lineBetween(-radius * 0.34, 0, radius * 0.34, 0)
      .lineBetween(0, -radius * 0.34, 0, radius * 0.34);
    const payload = scene.add.image(0, -270, 'projectile-missile')
      .setDisplaySize(34, 17)
      .setTint(artillery ? 0xffd070 : color)
      .setRotation(Math.PI * 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(artillery);
    const marker = scene.add.container(x, y, [targetRing, timingRing, reticle, payload]).setDepth(7);
  return {marker, targetRing, timingRing, reticle, payload};
}
