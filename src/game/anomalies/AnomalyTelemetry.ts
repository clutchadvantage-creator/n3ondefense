import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import type { AnomalyMetricEvent } from './types.ts';

export const recordAnomalyMetric = (event: AnomalyMetricEvent): void => {
  GameplayTelemetryRecorder.recordAnomalyEvent(event);
};

