import { SceneKeys } from '../flow/SceneKeys.ts';
import type { AnomalyId } from './types.ts';

export const ANOMALY_SCENES = {
  heist: SceneKeys.Heist,
  skybreach: SceneKeys.SkyBreach
} satisfies Record<AnomalyId, string>;
