import Phaser from 'phaser';

interface TrailSample {
  x: number;
  y: number;
  color: number;
  radius: number;
  bornAt: number;
  expiresAt: number;
}

export interface ProjectileTrailBatchStats {
  active: number;
  retained: number;
  peak: number;
}

const TRAIL_LIFETIME_MS = 130;

/**
 * Draws combat trails through one Graphics object instead of creating a
 * display object and tween for every projectile every frame. WebGL batches the
 * existing white circle texture directly; Canvas retains the vector fallback.
 * Samples keep their authored colors, radii, 130ms fade/contract and recycling.
 */
export class ProjectileTrailBatch {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly active: TrailSample[] = [];
  private readonly available: TrailSample[] = [];
  private peak = 0;
  private readonly webgl:boolean;
  private readonly circleFrame:Phaser.Textures.Frame;
  private renderAt=0;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics()
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.webgl=scene.game.renderer.type===Phaser.WEBGL;
    this.circleFrame=scene.textures.getFrame('circle');
    if(this.webgl)Object.assign(this.graphics,{renderWebGL:this.renderWebGL.bind(this)});
  }

  /** Moves the tiny sample allocation cost out of the first live firefight. */
  prewarm(targetRetained: number): number {
    const target = Math.max(0, Math.floor(targetRetained));
    let added = 0;
    while (this.active.length + this.available.length < target) {
      this.available.push({ x: 0, y: 0, color: 0, radius: 1, bornAt: 0, expiresAt: 0 });
      added += 1;
    }
    return added;
  }

  beginFrame(now: number): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.active.length; readIndex += 1) {
      const sample = this.active[readIndex];
      if (sample.expiresAt <= now) {
        this.available.push(sample);
        continue;
      }
      this.active[writeIndex] = sample;
      writeIndex += 1;
    }
    this.active.length = writeIndex;
    this.graphics.clear();
  }

  emit(x: number, y: number, color: number, now: number): void {
    const sample = this.available.pop() ?? {
      x: 0,
      y: 0,
      color: 0,
      radius: 1,
      bornAt: 0,
      expiresAt: 0
    };
    sample.x = x;
    sample.y = y;
    sample.color = color;
    sample.radius = 1 + Math.floor(Math.random() * 3);
    sample.bornAt = now;
    sample.expiresAt = now + TRAIL_LIFETIME_MS;
    this.active.push(sample);
    this.peak = Math.max(this.peak, this.active.length);
  }

  /**
   * Small pooled emissive sample for authored-color projectile art. This lets
   * the equipped projectile color remain visible without tinting the whole
   * texture or creating another display object per shot.
   */
  emitAccent(x: number, y: number, color: number, now: number): void {
    const sample = this.available.pop() ?? {
      x: 0,
      y: 0,
      color: 0,
      radius: 1,
      bornAt: 0,
      expiresAt: 0
    };
    sample.x = x;
    sample.y = y;
    sample.color = color;
    sample.radius = 2.25;
    sample.bornAt = now;
    sample.expiresAt = now + 76;
    this.active.push(sample);
    this.peak = Math.max(this.peak, this.active.length);
  }

  render(now: number): void {
    this.renderAt=now;
    if(this.webgl)return;
    for (const sample of this.active) {
      const lifetime = Math.max(1, sample.expiresAt - sample.bornAt);
      const remaining = Math.max(0, (sample.expiresAt - now) / lifetime);
      this.graphics.fillStyle(sample.color, 0.62 * remaining);
      this.graphics.fillCircle(sample.x, sample.y, sample.radius * (0.3 + remaining * 0.7));
    }
  }

  /** One quad per sample, through Phaser's normal texture/tint pipeline. Avoid
   * allocating and tessellating a 100-point arc for every tiny trail each frame. */
  private renderWebGL(renderer:Phaser.Renderer.WebGL.WebGLRenderer,src:Phaser.GameObjects.Graphics,
    camera:Phaser.Cameras.Scene2D.Camera,parentMatrix?:Phaser.GameObjects.Components.TransformMatrix):void {
    const alpha=camera.alpha*src.alpha;if(!this.active.length||!alpha)return;
    camera.addToRenderList(src);
    const pipeline=renderer.pipelines.set(src.pipeline,src) as Phaser.Renderer.WebGL.Pipelines.MultiPipeline;
    renderer.pipelines.preBatch(src);
    const matrix=Phaser.GameObjects.GetCalcMatrix(src,camera,parentMatrix).calc,frame=this.circleFrame;
    let textureUnit=pipeline.setGameObject(src,frame);
    for(const sample of this.active){
      const remaining=Math.max(0,(sample.expiresAt-this.renderAt)/Math.max(1,sample.expiresAt-sample.bornAt));
      if(!remaining)continue;
      const radius=sample.radius*(.3+remaining*.7);
      const q=matrix.setQuad(sample.x-radius,sample.y-radius,sample.x+radius,sample.y+radius,camera.roundPixels);
      const tint=Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha(sample.color,.62*remaining*alpha);
      if(pipeline.batchQuad(src,q[0],q[1],q[2],q[3],q[4],q[5],q[6],q[7],frame.u0,frame.v0,frame.u1,frame.v1,
        tint,tint,tint,tint,false,frame.glTexture,textureUnit))textureUnit=pipeline.setGameObject(src,frame);
    }
    renderer.pipelines.postBatch(src);
  }

  reset(): void {
    while (this.active.length > 0) this.available.push(this.active.pop() as TrailSample);
    this.graphics.clear();
  }

  /** Drops only dormant high-water samples at an encounter boundary. Trail
   * behavior is unchanged and the next runtime still prewarms its calculated
   * reserve before combat becomes active. */
  trimRetained(maxRetained: number): number {
    const target = Math.max(0, Math.floor(maxRetained) - this.active.length);
    const before = this.available.length;
    if (before > target) this.available.length = target;
    return before - this.available.length;
  }

  stats(): ProjectileTrailBatchStats {
    return {
      active: this.active.length,
      retained: this.active.length + this.available.length,
      peak: this.peak
    };
  }

  ownsDisplayObject(object: unknown): boolean {
    return object === this.graphics;
  }

  destroy(): void {
    this.active.length = 0;
    this.available.length = 0;
    this.graphics.destroy();
  }
}
