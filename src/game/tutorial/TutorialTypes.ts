export type TutorialMode = 'hard-pause' | 'slow' | 'live' | 'menu';
export type TutorialSpotlightShape = 'rect' | 'circle';

export interface TutorialTargetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TutorialEvent<T = unknown> {
  type: string;
  payload: T;
}

export interface TutorialStepDefinition {
  id: string;
  target?: string;
  eyebrow?: string;
  title: string;
  body: string;
  illustration?: string;
  inputDemo?: string[];
  mode: TutorialMode;
  spotlight?: TutorialSpotlightShape;
  targetPadding?: number;
  completion: { type: 'auto'; delayMs?: number } | { type: 'event'; event: string } | { type: 'manual' };
}

export interface TutorialSequenceDefinition {
  id: string;
  scene: string;
  title: string;
  steps: TutorialStepDefinition[];
  autoStart?: boolean;
  prerequisite?: string;
  triggerEvent?: string;
  contextual?: boolean;
  skippable?: boolean;
}

export interface TutorialHost {
  scene: string;
  resolveTarget(target: string): TutorialTargetBounds | null;
  setMode(mode: TutorialMode): void;
  /** Return false when a real action is currently impossible (for example, no affordable upgrade). */
  isEventActionAvailable?: (event: string) => boolean;
  onComplete?: (sequenceId: string) => void;
}
