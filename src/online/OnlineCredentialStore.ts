import type { OnlineCredentials } from './onlineTypes';

const PREFIX = 'n3on-defense.online.credentials.';

export class OnlineCredentialStore {
  static load(profileId: string): OnlineCredentials | null {
    try {
      const parsed = JSON.parse(localStorage.getItem(`${PREFIX}${profileId}`) ?? 'null') as Partial<OnlineCredentials> | null;
      if (!parsed || parsed.profileId !== profileId || typeof parsed.refreshToken !== 'string') return null;
      return parsed as OnlineCredentials;
    } catch {
      return null;
    }
  }

  static save(credentials: OnlineCredentials): void {
    try {
      localStorage.setItem(`${PREFIX}${credentials.profileId}`, JSON.stringify(credentials));
    } catch {
      // Online identity remains usable for this page even when storage is unavailable.
    }
  }

  static clear(profileId: string): void {
    try { localStorage.removeItem(`${PREFIX}${profileId}`); } catch { /* no-op */ }
  }
}
