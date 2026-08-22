import { COSMETICS } from '../../data/cosmetics';
import type { ProfileSummary } from '../../game/save/LocalSaveTypes';

const avatarColorMap = new Map<string, string>(
  COSMETICS.filter((cosmetic) => cosmetic.category === 'playerColor').map((cosmetic) => [cosmetic.id, `#${cosmetic.color.toString(16).padStart(6, '0')}`])
);

export interface ProfileCardOptions {
  profile: ProfileSummary;
  selected: boolean;
  active: boolean;
  onSelect(profileId: string): void;
}

export const formatProfileDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const getProfileAvatarColor = (profile: ProfileSummary): string => {
  if (!profile.equippedPlayerColor) return '#61f4ff';
  return avatarColorMap.get(profile.equippedPlayerColor) ?? '#61f4ff';
};

export const usesNativeProfilePalette = (profile: ProfileSummary): boolean =>
  profile.equippedPlayerColor === 'player-native';

export const createProfileCard = ({ profile, selected, active, onSelect }: ProfileCardOptions): HTMLButtonElement => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = selected ? 'profile-card selected' : 'profile-card';
  card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  card.dataset.profileStatus = active ? 'ACTIVE' : selected ? 'SELECTED' : 'STANDBY';
  card.addEventListener('click', () => onSelect(profile.id));

  const top = document.createElement('div');
  top.className = 'profile-card-top';

  const avatar = document.createElement('div');
  avatar.className = `profile-avatar${usesNativeProfilePalette(profile) ? ' native-palette' : ''}`;
  avatar.style.setProperty('--avatar-color', getProfileAvatarColor(profile));

  const heading = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = profile.name;
  const meta = document.createElement('p');
  meta.textContent = `Last played ${formatProfileDate(profile.lastPlayedAt)}`;
  heading.append(title, meta);

  top.append(avatar, heading);

  const stats = document.createElement('dl');
  stats.className = 'profile-stat-grid';
  stats.append(
    createStat('Credits', profile.credits.toLocaleString()),
    createStat('Core Tokens', profile.coreTokens.toLocaleString()),
    createStat('Highest Round', profile.highestRound.toLocaleString()),
    createStat('Rounds Completed', profile.roundsCompleted.toLocaleString())
  );

  const footer = document.createElement('div');
  footer.className = 'profile-card-footer';
  if (active) {
    const badge = document.createElement('span');
    badge.className = 'profile-badge active';
    badge.textContent = 'ACTIVE PROFILE';
    footer.append(badge);
  } else if (selected) {
    const badge = document.createElement('span');
    badge.className = 'profile-badge selected';
    badge.textContent = 'SELECTED';
    footer.append(badge);
  }

  card.append(top, stats, footer);
  return card;
};

const createStat = (label: string, value: string): HTMLDivElement => {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
};
