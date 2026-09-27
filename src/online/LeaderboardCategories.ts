/** Add score kinds here after deploying the matching server category contract. */
export const LEADERBOARD_CATEGORIES = [
  { key: 'highest_round', title: 'HIGHEST ROUND', color: 0x63f4ff },
  { key: 'enemies_destroyed', title: 'ENEMIES DESTROYED', color: 0x71ffad },
  { key: 'bomb_sites_destroyed', title: 'BOMB TARGETS DESTROYED', color: 0xff69d6 }
] as const;

export type OnlineLeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number]['key'];
export const LEADERBOARD_PAGE_SIZE = 3;
