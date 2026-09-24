import Phaser from 'phaser';
import { isDefaultCircleFillPath } from './CircleFillPath.ts';

const KEY = 'n3on-circle-fill';

/** Same MultiPipeline shader and authored paths; skip Earcut only for proven
 * uniform-color full circles. Phaser still owns strokes, transforms and batching.
 */
export class CircleFillPipeline extends Phaser.Renderer.WebGL.Pipelines.MultiPipeline {
  // Initialized by MultiPipeline. Phaser 3.90 omits this Graphics-facing field
  // from its declarations, although GraphicsWebGLRenderer uses it directly.
  declare fillTint: { TL: number; TR: number; BL: number; BR: number };

  override batchFillPath(path: Phaser.Types.Math.Vector2Like[], currentMatrix: Phaser.GameObjects.Components.TransformMatrix,
    parentMatrix: Phaser.GameObjects.Components.TransformMatrix): void {
    const tint = this.fillTint;
    if (tint.TL !== tint.TR || tint.TL !== tint.BL || tint.TL !== tint.BR || !isDefaultCircleFillPath(path)) {
      super.batchFillPath(path, currentMatrix, parentMatrix);
      return;
    }
    this.renderer.pipelines.set(this);
    const matrix = this.calcMatrix;
    if (parentMatrix) parentMatrix.multiply(currentMatrix, matrix);
    const first = path[0];
    const x0 = matrix.getX(first.x, first.y), y0 = matrix.getY(first.x, first.y);
    let previousX = matrix.getX(path[1].x, path[1].y), previousY = matrix.getY(path[1].x, path[1].y);
    for (let i = 2; i < path.length; i++) {
      const x = matrix.getX(path[i].x, path[i].y), y = matrix.getY(path[i].x, path[i].y);
      this.batchTri(null, x0, y0, previousX, previousY, x, y, 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, 2);
      previousX = x; previousY = y;
    }
  }
}

/** One renderer-owned pipeline per game; no per-explosion or per-scene cache. */
export function useCircleFillPipeline(graphics: Phaser.GameObjects.Graphics): void {
  const game = graphics.scene.game;
  if (game.renderer.type !== Phaser.WEBGL) return;
  const manager = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines;
  if (!manager.has(KEY)) manager.add(KEY, new CircleFillPipeline({ game }));
  graphics.setPipeline(KEY);
}
