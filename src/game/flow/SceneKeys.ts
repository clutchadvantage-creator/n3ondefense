export const SceneKeys = {
  Boot: 'boot',
  Splash: 'splash',
  Leaderboards: 'leaderboards',
  OnlineLeaderboards: 'online-leaderboards',
  LocalProfiles: 'local-profiles',
  MainMenu: 'menu',
  Loading: 'loading',
  Arena: 'arena',
  Heist: 'anomaly-heist',
  LegendaryModReveal: 'legendary-mod-reveal',
  SupremeMilestone: 'supreme-milestone',
  Results: 'results',
  RoundFinished: 'round-finished',
  Options: 'options',
  Upgrades: 'upgrades',
  Cosmetics: 'cosmetics',
  Mods: 'mods',
  Garage: 'garage'
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
  SceneKeys.Heist,
  SceneKeys.LegendaryModReveal,
  SceneKeys.SupremeMilestone,
  SceneKeys.Results,
  SceneKeys.RoundFinished,
  SceneKeys.Options,
  SceneKeys.Upgrades,
  SceneKeys.Cosmetics,
  SceneKeys.Mods,
  SceneKeys.Garage
] as const;

export type SceneKeyValue = (typeof SceneKeys)[keyof typeof SceneKeys];
