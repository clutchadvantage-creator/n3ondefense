import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import type { AnomalyMetricEvent } from './types.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';

export const recordAnomalyMetric = (event: AnomalyMetricEvent): void => {
  if (event.name === 'anomaly_entry_confirmed') SaveSystem.recordCollectionMetric('portals');
  GameplayTelemetryRecorder.recordAnomalyEvent(event);
};

