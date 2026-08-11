import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys.ts';

export interface StoreReturnRequest {
  returnScene?: SceneKeyValue;
  resumePausedScene?: boolean;
}

export interface StoreReturnRoute {
  returnScene: SceneKeyValue;
  resumePausedScene: boolean;
}

const MAIN_MENU_ROUTE: StoreReturnRoute = {
  returnScene: SceneKeys.MainMenu,
  resumePausedScene: false
};

export const resolveStoreReturnRoute = (
  request: StoreReturnRequest | undefined,
  arenaCanResume: boolean
): StoreReturnRoute => {
  if (request?.returnScene === SceneKeys.Arena) {
    return request.resumePausedScene === true && arenaCanResume
      ? { returnScene: SceneKeys.Arena, resumePausedScene: true }
      : { ...MAIN_MENU_ROUTE };
  }

  if (request?.returnScene === SceneKeys.RoundFinished) {
    return { returnScene: SceneKeys.RoundFinished, resumePausedScene: false };
  }

  return { ...MAIN_MENU_ROUTE };
};
