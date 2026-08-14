import type { EnemyType } from '../types';

export type EnemyRobotChassis =
  | 'striker'
  | 'gunner'
  | 'engineer'
  | 'juggernaut'
  | 'jammer'
  | 'sentinel';

export interface EnemyRobotFrameDefinition {
  textureKey: string;
  chassis: EnemyRobotChassis;
}

/**
 * Visual-only robot identities. Combat color continues to come from the
 * authoritative enemy balance entry and is applied as a runtime tint.
 */
export const ENEMY_ROBOT_FRAMES: Record<EnemyType, EnemyRobotFrameDefinition> = {
  grunt: { textureKey: 'enemy-grunt', chassis: 'striker' },
  shooter: { textureKey: 'enemy-shooter', chassis: 'gunner' },
  defuser: { textureKey: 'enemy-defuser', chassis: 'engineer' },
  tank: { textureKey: 'enemy-tank', chassis: 'juggernaut' },
  disruptor: { textureKey: 'enemy-disruptor', chassis: 'jammer' },
  star: { textureKey: 'enemy-star', chassis: 'sentinel' }
};
