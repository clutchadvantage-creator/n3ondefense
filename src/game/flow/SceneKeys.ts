export const SceneKeys = {
  Boot: 'boot',
  Splash: 'splash',
  Leaderboards: 'leaderboards',
  OnlineLeaderboards: 'online-leaderboards',
  LocalProfiles: 'local-profiles',
  MainMenu: 'menu',
  Loading: 'loading',
  Arena: 'arena',
  Results: 'results',
  RoundFinished: 'round-finished',
  Options: 'options',
  Upgrades: 'upgrades',
  Cosmetics: 'cosmetics',
  Mods: 'mods'
} as const;

export const SceneStatusOrder = [
  SceneKeys.Boot,
  SceneKeys.Splash,
  SceneKeys.Leaderboards,
  SceneKeys.OnlineLeaderboards,
  SceneKeys.LocalProfiles,
  SceneKeys.MainMenu,
  SceneKeys.Loading,
  SceneKeys.Arena,
  SceneKeys.Results,
  SceneKeys.RoundFinished,
  SceneKeys.Options,
  SceneKeys.Upgrades,
  SceneKeys.Cosmetics,
  SceneKeys.Mods
] as const;

export type SceneKeyValue = (typeof SceneKeys)[keyof typeof SceneKeys];
