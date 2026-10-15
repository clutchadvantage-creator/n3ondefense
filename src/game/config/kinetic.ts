/** Arena contact tuning. Operative input and pre-contact launch speeds retain
 * the bombsite's .35 Arcade timeScale and original native damping. */
export const KINETIC = {
  threshold: 90, fullResponseSpeed: 330,
  restitution: { outer: 1, inner: .96, obstacle: .88, body: .72 },
  highSpeedAmplification: .08, // Included in, never added beyond, the restitution ceiling.
  tangentRetention: .99,
  // Only collision responses are bounded; ordinary movement and Dash have no added speed cap.
  operativeReboundSeconds: .10, operativeReboundSpeedMin: 140, operativeReboundSpeedMax: 360,
  impulseDecayPerSecond: .8,
  enemyMomentumSeconds: .62, enemySteeringPerSecond: 2.4,
  mass: { operative: 1, grunt: .65, shooter: .85, defuser: .7, disruptor: 1.4, tank: 4.5, star: 7, controlledBoss: 9 },
  controlledRestitution: .42,
  repeatedImpactSeconds: .055, repeatedImpactDamping: .3,
  cornerEpsilon: .000001, contactSkin: .35,
  maxIterations: 12, maxSweepDisplacement: 2048,
  // Work limits, not speed limits. Exhausted sweeps keep velocity for next step.
  neighborVisitsPerFrame: 768, playerNeighborVisitsPerStep: 128, enemyNeighborVisitsPerStep: 24,
  contactsPerFrame: 96, dynamicPadding: 100,
  presentation: { slots: 12, durationMs: 300, minimumSpeed: 150, fullSpeed: 1600,
    squash: .22, stretch: .28, audioThreshold: 420, audioCooldownMs: 100 },
  // Register a dedicated recording in AudioManager before assigning a cue.
  impactSound: null
} as const;
export type KineticSurface = keyof typeof KINETIC.restitution;
