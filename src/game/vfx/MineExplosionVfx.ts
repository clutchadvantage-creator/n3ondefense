import Phaser from 'phaser';

export type ExplosionPalette = readonly [core: number, primary: number, secondary: number, outer: number];

const EXPLOSION_LIFETIME_MS = 680;
const MAX_ACTIVE_EXPLOSIONS = 18;
const REDUCED_ACTIVE_EXPLOSIONS = 10;
const FULL_RAY_COUNT = 18;
const REDUCED_RAY_COUNT = 10;
const FULL_FRAGMENT_COUNT = 12;
const REDUCED_FRAGMENT_COUNT = 6;
const FULL_NEBULA_LOBE_COUNT = 9;
const REDUCED_NEBULA_LOBE_COUNT = 5;
const FULL_ELECTRIC_BOLT_COUNT = 6;
const REDUCED_ELECTRIC_BOLT_COUNT = 3;

interface MineExplosionState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  startedAt: number;
  phase: number;
  coreColor: number;
  primaryColor: number;
  secondaryColor: number;
  outerColor: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

/**
 * One batched, allocation-free renderer for active mine and bomblet detonations.
 * Gameplay damage and radius remain owned by ArenaScene; this class only draws.
 */
export class MineExplosionVfx {
  readonly maximumActiveExplosions: number;
  private readonly smokeGraphics: Phaser.GameObjects.Graphics;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly states: MineExplosionState[];
  private readonly rayCos = new Float32Array(FULL_RAY_COUNT);
  private readonly raySin = new Float32Array(FULL_RAY_COUNT);
  private readonly fragmentCos = new Float32Array(FULL_FRAGMENT_COUNT);
  private readonly fragmentSin = new Float32Array(FULL_FRAGMENT_COUNT);
  private readonly nebulaCos = new Float32Array(FULL_NEBULA_LOBE_COUNT);
  private readonly nebulaSin = new Float32Array(FULL_NEBULA_LOBE_COUNT);
  private sequence = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly particlesEnabled: boolean) {
    this.maximumActiveExplosions = particlesEnabled ? MAX_ACTIVE_EXPLOSIONS : REDUCED_ACTIVE_EXPLOSIONS;
    this.smokeGraphics = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.NORMAL);
    this.graphics = scene.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    this.states = Array.from({ length: this.maximumActiveExplosions }, (): MineExplosionState => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      startedAt: 0,
      phase: 0,
      coreColor: 0xffffff,
      primaryColor: 0xffffff,
      secondaryColor: 0xffffff,
      outerColor: 0xffffff
    }));
    for (let index = 0; index < FULL_RAY_COUNT; index += 1) {
      const angle = index * Math.PI * 2 / FULL_RAY_COUNT;
      this.rayCos[index] = Math.cos(angle);
      this.raySin[index] = Math.sin(angle);
    }
    for (let index = 0; index < FULL_FRAGMENT_COUNT; index += 1) {
      const angle = index * Math.PI * 2 / FULL_FRAGMENT_COUNT + (index % 3) * 0.09;
      this.fragmentCos[index] = Math.cos(angle);
      this.fragmentSin[index] = Math.sin(angle);
    }
    for (let index = 0; index < FULL_NEBULA_LOBE_COUNT; index += 1) {
      const angle = index * Math.PI * 2 / FULL_NEBULA_LOBE_COUNT + (index % 2) * 0.17;
      this.nebulaCos[index] = Math.cos(angle);
      this.nebulaSin[index] = Math.sin(angle);
    }
  }

  emit(
    x: number,
    y: number,
    radius: number,
    palette: ExplosionPalette,
    now: number,
    cameraImpulse = true
  ): void {
    this.emitColors(x, y, radius, palette[0], palette[1], palette[2], palette[3], now, cameraImpulse);
  }

  /** Scalar-color variant used by projectile impacts to avoid a palette-array allocation per hit. */
  emitColors(
    x: number,
    y: number,
    radius: number,
    coreColor: number,
    primaryColor: number,
    secondaryColor: number,
    outerColor: number,
    now: number,
    cameraImpulse = true
  ): void {
    let state = this.states[0];
    let oldestStartedAt = Number.POSITIVE_INFINITY;
    for (const candidate of this.states) {
      if (!candidate.active) {
        state = candidate;
        oldestStartedAt = Number.NEGATIVE_INFINITY;
        break;
      }
      if (candidate.startedAt < oldestStartedAt) {
        oldestStartedAt = candidate.startedAt;
        state = candidate;
      }
    }
    state.active = true;
    state.x = x;
    state.y = y;
    state.radius = radius;
    state.startedAt = now;
    state.phase = (this.sequence * 2.399963229728653) % (Math.PI * 2);
    state.coreColor = coreColor;
    state.primaryColor = primaryColor;
    state.secondaryColor = secondaryColor;
    state.outerColor = outerColor;
    this.sequence += 1;

    // force=false prevents rapid mine chains from repeatedly restarting shake.
    // Bomblets retain their own lighter hazard shake and opt out here.
    if (cameraImpulse) this.scene.cameras.main.shake(260, 0.008, false);
  }

  update(now: number): void {
    this.smokeGraphics.clear();
    this.graphics.clear();
    for (const state of this.states) {
      if (!state.active) continue;
      const elapsed = now - state.startedAt;
      if (elapsed >= EXPLOSION_LIFETIME_MS) {
        state.active = false;
        continue;
      }
      this.drawSmokeNebula(state, elapsed);
      this.drawExplosion(state, elapsed);
    }
  }

  reset(): void {
    for (const state of this.states) state.active = false;
    this.smokeGraphics.clear();
    this.graphics.clear();
  }

  destroy(): void {
    this.reset();
    this.smokeGraphics.destroy();
    this.graphics.destroy();
  }

  get activeExplosionCount(): number {
    let count = 0;
    for (const state of this.states) if (state.active) count += 1;
    return count;
  }

  private drawExplosion(state: MineExplosionState, elapsed: number): void {
    const { x, y, radius, coreColor, primaryColor, secondaryColor, outerColor, phase } = state;
    const lifetimeProgress = clamp01(elapsed / EXPLOSION_LIFETIME_MS);
    const lifetimeFade = (1 - lifetimeProgress) ** 1.5;
    const phaseCos = Math.cos(phase);
    const phaseSin = Math.sin(phase);

    // A restrained floor response anchors the otherwise airborne neon energy.
    const floorProgress = easeOutCubic(clamp01(elapsed / 420));
    this.graphics.fillStyle(outerColor, 0.075 * lifetimeFade);
    this.graphics.fillCircle(x, y, radius * (0.25 + floorProgress * 0.72));
    this.graphics.lineStyle(Math.max(1, 3.5 * lifetimeFade), secondaryColor, 0.22 * lifetimeFade);
    this.graphics.strokeCircle(x, y, radius * (0.18 + floorProgress * 0.78));

    // The first 120 ms contains the concentrated white-hot core and plasma bloom.
    const coreFade = 1 - clamp01(elapsed / 125);
    if (coreFade > 0) {
      const flashProgress = easeOutCubic(clamp01(elapsed / 80));
      this.graphics.fillStyle(primaryColor, 0.24 * coreFade);
      this.graphics.fillCircle(x, y, radius * (0.25 + flashProgress * 0.19));
      this.graphics.fillStyle(coreColor, 0.88 * coreFade);
      this.graphics.fillCircle(x, y, radius * (0.08 + flashProgress * 0.11));
      this.graphics.fillStyle(0xffffff, 0.82 * coreFade);
      this.graphics.fillCircle(x, y, radius * (0.035 + flashProgress * 0.04));
    }

    // A rolling energy nebula fills the gap between the core and shock fronts.
    // Its fixed lobe table creates turbulent volume without particle objects.
    const nebulaFade = 1 - clamp01((elapsed - 105) / 500);
    if (nebulaFade > 0) {
      const nebulaProgress = easeOutCubic(clamp01(elapsed / 470));
      const lobeCount = this.particlesEnabled ? FULL_NEBULA_LOBE_COUNT : REDUCED_NEBULA_LOBE_COUNT;
      const rotation = phase - lifetimeProgress * 0.82;
      const rotationCos = Math.cos(rotation);
      const rotationSin = Math.sin(rotation);
      for (let index = 0; index < lobeCount; index += 1) {
        const baseX = this.nebulaCos[index];
        const baseY = this.nebulaSin[index];
        const directionX = baseX * rotationCos - baseY * rotationSin;
        const directionY = baseX * rotationSin + baseY * rotationCos;
        const distance = radius * (0.06 + nebulaProgress * (0.12 + (index % 3) * 0.035));
        const lobeRadius = radius * (0.14 + (index % 4) * 0.018) * (0.72 + nebulaProgress * 0.48);
        this.graphics.fillStyle(index % 2 === 0 ? primaryColor : secondaryColor, 0.075 * nebulaFade);
        this.graphics.fillCircle(x + directionX * distance, y + directionY * distance, lobeRadius);
      }
      this.graphics.lineStyle(Math.max(1, 2.2 * nebulaFade), secondaryColor, 0.32 * nebulaFade);
      this.graphics.beginPath();
      this.graphics.arc(
        x,
        y,
        radius * (0.19 + nebulaProgress * 0.2),
        phase + lifetimeProgress,
        phase + lifetimeProgress + 4.45,
        false
      );
      this.graphics.strokePath();
    }

    // Two thin wave fronts communicate the blast without creating opaque discs.
    const primaryProgress = easeOutCubic(clamp01((elapsed - 24) / 330));
    if (elapsed >= 24 && primaryProgress < 1) {
      const waveFade = 1 - primaryProgress;
      this.graphics.lineStyle(2 + waveFade * 5, primaryColor, 0.94 * waveFade);
      this.graphics.strokeCircle(x, y, radius * (0.1 + primaryProgress * 0.9));
      this.graphics.lineStyle(1.5 + waveFade * 2.5, coreColor, 0.48 * waveFade);
      this.graphics.strokeCircle(x, y, radius * (0.07 + primaryProgress * 0.93));
    }
    const secondaryProgress = easeOutCubic(clamp01((elapsed - 78) / 390));
    if (elapsed >= 78 && secondaryProgress < 1) {
      const waveFade = 1 - secondaryProgress;
      this.graphics.lineStyle(1.5 + waveFade * 3, secondaryColor, 0.72 * waveFade);
      this.graphics.strokeCircle(x, y, radius * (0.12 + secondaryProgress * 1.06));
    }

    // Sharp radial energy spikes peak early, then retract visually into fragments.
    const rayProgress = easeOutCubic(clamp01(elapsed / 250));
    const rayFade = 1 - clamp01((elapsed - 80) / 290);
    if (rayFade > 0) {
      const rayCount = this.particlesEnabled ? FULL_RAY_COUNT : REDUCED_RAY_COUNT;
      for (let index = 0; index < rayCount; index += 1) {
        const baseX = this.rayCos[index];
        const baseY = this.raySin[index];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const inner = radius * (0.05 + (index % 3) * 0.018);
        const outer = radius * (0.34 + rayProgress * (0.34 + (index % 4) * 0.075));
        const color = index % 4 === 0 ? coreColor : index % 2 === 0 ? primaryColor : secondaryColor;
        this.graphics.lineStyle(index % 4 === 0 ? 2 : 3.5, color, (index % 4 === 0 ? 0.9 : 0.68) * rayFade);
        this.graphics.lineBetween(
          x + directionX * inner,
          y + directionY * inner,
          x + directionX * outer,
          y + directionY * outer
        );
      }
    }

    // Jagged rotating plasma arcs keep the silhouette electrical rather than fiery.
    const arcFade = 1 - clamp01((elapsed - 55) / 470);
    if (elapsed >= 40 && arcFade > 0) {
      for (let index = 0; index < 5; index += 1) {
        const arcRadius = radius * (0.22 + index * 0.105 + lifetimeProgress * 0.18);
        const start = phase + index * 1.37 - lifetimeProgress * (index % 2 === 0 ? 0.9 : -0.7);
        this.graphics.lineStyle(index % 2 === 0 ? 2.5 : 1.5, index % 2 === 0 ? secondaryColor : primaryColor, 0.62 * arcFade);
        this.graphics.beginPath();
        this.graphics.arc(x, y, arcRadius, start, start + 0.48 + index * 0.06, false);
        this.graphics.strokePath();
      }
    }

    // Animated multi-segment bolts crackle through the nebula. The changing
    // phase makes the electricity crawl without spawning lines or tweens.
    const electricFade = 1 - clamp01((elapsed - 70) / 430);
    if (elapsed <= 500 && electricFade > 0) {
      const boltCount = this.particlesEnabled ? FULL_ELECTRIC_BOLT_COUNT : REDUCED_ELECTRIC_BOLT_COUNT;
      const boltReach = radius * (0.34 + easeOutCubic(clamp01(elapsed / 300)) * 0.5);
      for (let bolt = 0; bolt < boltCount; bolt += 1) {
        const directionIndex = bolt * 3;
        const baseX = this.rayCos[directionIndex];
        const baseY = this.raySin[directionIndex];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const tangentX = -directionY;
        const tangentY = directionX;
        const innerRadius = radius * 0.1;
        this.graphics.lineStyle(
          bolt % 2 === 0 ? 2.2 : 1.4,
          bolt % 2 === 0 ? coreColor : secondaryColor,
          0.84 * electricFade
        );
        this.graphics.beginPath();
        this.graphics.moveTo(x + directionX * innerRadius, y + directionY * innerRadius);
        for (let segment = 1; segment <= 4; segment += 1) {
          const segmentProgress = segment / 4;
          const jitter = Math.sin(elapsed * 0.052 + bolt * 3.17 + segment * 2.41)
            * radius * 0.045 * (1 - segmentProgress * 0.35);
          this.graphics.lineTo(
            x + directionX * boltReach * segmentProgress + tangentX * jitter,
            y + directionY * boltReach * segmentProgress + tangentY * jitter
          );
        }
        this.graphics.strokePath();
      }
    }

    // Bounded fragments are drawn into this same batch; there are no sprites,
    // physics bodies, particle emitters, or per-fragment tweens.
    const fragmentProgress = easeOutCubic(clamp01((elapsed - 45) / 540));
    const fragmentFade = 1 - clamp01((elapsed - 190) / 450);
    if (elapsed >= 45 && fragmentFade > 0) {
      const fragmentCount = this.particlesEnabled ? FULL_FRAGMENT_COUNT : REDUCED_FRAGMENT_COUNT;
      for (let index = 0; index < fragmentCount; index += 1) {
        const baseX = this.fragmentCos[index];
        const baseY = this.fragmentSin[index];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const distance = radius * fragmentProgress * (0.52 + (index % 4) * 0.17);
        const fragmentX = x + directionX * distance;
        const fragmentY = y + directionY * distance + radius * 0.08 * fragmentProgress * fragmentProgress;
        const size = Math.max(1.2, radius * (0.018 + (index % 3) * 0.006) * fragmentFade);
        const tangentX = -directionY * size;
        const tangentY = directionX * size;
        this.graphics.fillStyle(index % 3 === 0 ? coreColor : index % 2 === 0 ? primaryColor : secondaryColor, 0.88 * fragmentFade);
        this.graphics.fillTriangle(
          fragmentX + directionX * size * 1.8,
          fragmentY + directionY * size * 1.8,
          fragmentX + tangentX,
          fragmentY + tangentY,
          fragmentX - tangentX,
          fragmentY - tangentY
        );
      }
    }

    // Short, narrow crack traces vanish with the blast and never accumulate.
    const crackFade = 1 - clamp01(elapsed / 430);
    if (crackFade > 0) {
      for (let index = 0; index < 7; index += 1) {
        const baseX = this.rayCos[index * 2];
        const baseY = this.raySin[index * 2];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const middle = radius * (0.18 + (index % 3) * 0.04);
        const end = radius * (0.36 + (index % 2) * 0.08);
        this.graphics.lineStyle(1.5, index % 2 === 0 ? primaryColor : secondaryColor, 0.38 * crackFade);
        this.graphics.beginPath();
        this.graphics.moveTo(x + directionX * radius * 0.08, y + directionY * radius * 0.08);
        this.graphics.lineTo(
          x + directionX * middle - directionY * radius * 0.035,
          y + directionY * middle + directionX * radius * 0.035
        );
        this.graphics.lineTo(x + directionX * end, y + directionY * end);
        this.graphics.strokePath();
      }
    }

    // A compact plasma afterglow gives the fading blast some volume.
    const cloudFade = 1 - clamp01((elapsed - 90) / 500);
    if (elapsed >= 70 && cloudFade > 0) {
      for (let index = 0; index < 5; index += 1) {
        const baseX = this.fragmentCos[index * 2];
        const baseY = this.fragmentSin[index * 2];
        const offset = radius * (0.08 + index * 0.018);
        this.graphics.fillStyle(index % 2 === 0 ? primaryColor : secondaryColor, 0.055 * cloudFade);
        this.graphics.fillCircle(
          x + baseX * offset,
          y + baseY * offset,
          radius * (0.18 + index * 0.018) * (0.7 + lifetimeProgress * 0.55)
        );
      }
    }
  }

  private drawSmokeNebula(state: MineExplosionState, elapsed: number): void {
    if (elapsed < 45) return;
    const { x, y, radius, secondaryColor, outerColor, phase } = state;
    const progress = clamp01((elapsed - 45) / (EXPLOSION_LIFETIME_MS - 45));
    const fade = (1 - progress) ** 1.3;
    if (fade <= 0) return;
    const lobeCount = this.particlesEnabled ? FULL_NEBULA_LOBE_COUNT : REDUCED_NEBULA_LOBE_COUNT;
    const rotation = phase + progress * 0.62;
    const rotationCos = Math.cos(rotation);
    const rotationSin = Math.sin(rotation);
    for (let index = 0; index < lobeCount; index += 1) {
      const baseX = this.nebulaCos[index];
      const baseY = this.nebulaSin[index];
      const directionX = baseX * rotationCos - baseY * rotationSin;
      const directionY = baseX * rotationSin + baseY * rotationCos;
      const curl = Math.sin(progress * 5.2 + index * 1.71) * radius * 0.045;
      const distance = radius * progress * (0.18 + (index % 4) * 0.065);
      const smokeX = x + directionX * distance - directionY * curl;
      const smokeY = y + directionY * distance + directionX * curl
        - radius * progress * (0.025 + (index % 3) * 0.012);
      const smokeRadius = radius * (0.13 + (index % 3) * 0.025) * (0.78 + progress * 0.72);
      this.smokeGraphics.fillStyle(0x05070d, 0.12 * fade);
      this.smokeGraphics.fillCircle(smokeX, smokeY, smokeRadius * 1.12);
      this.smokeGraphics.fillStyle(index % 2 === 0 ? outerColor : secondaryColor, 0.095 * fade);
      this.smokeGraphics.fillCircle(smokeX, smokeY, smokeRadius);
    }
  }
}
