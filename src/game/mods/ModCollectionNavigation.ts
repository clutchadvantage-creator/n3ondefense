import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys.ts';

export interface ModCollectionReturnRequest {
  returnScene?: SceneKeyValue;
  resumePausedScene?: boolean;
}

export interface ModCollectionReturnRoute {
  returnScene: SceneKeyValue;
  resumePausedScene: boolean;
}

const MAIN_MENU_ROUTE: ModCollectionReturnRoute = {
  returnScene: SceneKeys.MainMenu,
  resumePausedScene: false
};

export const resolveModCollectionReturnRoute = (
  request: ModCollectionReturnRequest | undefined,
  arenaCanResume: boolean
): ModCollectionReturnRoute => {
  if (request?.returnScene === SceneKeys.Arena) {
    return request.resumePausedScene === true && arenaCanResume
      ? { returnScene: SceneKeys.Arena, resumePausedScene: true }
      : { ...MAIN_MENU_ROUTE };
  }

  if (request?.returnScene === SceneKeys.RoundFinished || request?.returnScene === SceneKeys.Garage) {
    return { returnScene: request.returnScene, resumePausedScene: false };
  }

  return { ...MAIN_MENU_ROUTE };
};
