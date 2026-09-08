import type Phaser from 'phaser';
import type { RectSpec } from '../types.ts';

/** Bake unchanged local artwork at 2x resolution to retain smooth vector edges
 * in WebGL render targets without multisampling. Bounds include strokes
 * and shadows. The caller attaches the result to its existing scene/container
 * owner; destroying that RenderTexture also releases its private texture. */
export const bakeStaticGraphics = (
  scene: Phaser.Scene,
  source: Phaser.GameObjects.Graphics,
  bounds: RectSpec
): Phaser.GameObjects.RenderTexture => {
  const x = Math.floor(bounds.x);
  const y = Math.floor(bounds.y);
  const width = Math.ceil(bounds.x + bounds.w) - x;
  const height = Math.ceil(bounds.y + bounds.h) - y;
  let cached: Phaser.GameObjects.RenderTexture | undefined;
  try {
    cached = scene.make.renderTexture({ x, y, width: width * 2, height: height * 2 }, false).setOrigin(0).setScale(0.5);
    source.setScale(2);
    cached.draw(source, -x * 2, -y * 2);
    return cached;
  } catch (error) {
    cached?.destroy();
    throw error;
  } finally {
    source.destroy();
  }
};
