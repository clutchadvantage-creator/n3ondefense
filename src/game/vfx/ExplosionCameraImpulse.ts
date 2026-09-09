export type ExplosionImpulseSource = 'mine' | 'bombsite' | 'bomblet' | 'boss-artillery' | 'grenade-round' | 'none';

export interface ExplosionCameraImpulse {
  durationMs: number;
  intensity: number;
}

const IMPULSES: Readonly<Partial<Record<ExplosionImpulseSource, ExplosionCameraImpulse>>> = {
  mine: { durationMs: 260, intensity: 0.008 },
  bombsite: { durationMs: 760, intensity: 0.02 },
  bomblet: { durationMs: 150, intensity: 0.0036 },
  'boss-artillery': { durationMs: 240, intensity: 0.007 }
};

export const explosionCameraImpulse = (source: ExplosionImpulseSource): ExplosionCameraImpulse | null => (
  IMPULSES[source] ?? null
);
