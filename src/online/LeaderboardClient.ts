import { GAME_VERSION } from '../game/config/version';
import { API_BASE_URL } from '../config/api';
import { OnlineCredentialStore } from './OnlineCredentialStore';
import type { OnlineCredentials, OnlineLeaderboardCategory, OnlineLeaderboardEntry } from './onlineTypes';

interface TokenResponse {
  player: { public_id: string; display_name: string };
  access_token: string;
  access_expires_in_seconds: number;
  refresh_token: string;
  refresh_expires_in_seconds: number;
}

export class OnlineApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
  get invalidCredential(): boolean { return this.status === 401 || this.status === 403; }
  get retryable(): boolean { return this.status === undefined || this.status === 408 || this.status === 429 || (this.status >= 500); }
}

const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 7000): Promise<Response> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

export class LeaderboardClient {
  static configured(): boolean {
    return API_BASE_URL.startsWith('https://') || (import.meta.env.DEV && API_BASE_URL.startsWith('http://'));
  }

  static async ensureIdentity(profileId: string, preferredName: string): Promise<OnlineCredentials> {
    const existing = OnlineCredentialStore.load(profileId);
    if (existing) return await this.ensureAccess(existing);
    const cleaned = preferredName.replace(/[^A-Za-z0-9 _-]/g, '').trim();
    let displayName = (cleaned.length >= 3 ? cleaned : `Pilot-${profileId.replace(/-/g, '').slice(-5)}`).slice(0, 24);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetchWithTimeout(`${API_BASE_URL}/v1/auth/anonymous`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: displayName })
      });
      if (response.status === 409 && attempt === 0) {
        displayName = `${displayName.slice(0, 17)}-${profileId.replace(/-/g, '').slice(-5)}`;
        continue;
      }
      if (!response.ok) throw new OnlineApiError('Online identity could not be created.', response.status);
      return this.storeTokenResponse(profileId, await response.json() as TokenResponse);
    }
    throw new Error('Unable to allocate a unique online display name.');
  }

  static async restoreIdentity(profileId: string): Promise<OnlineCredentials | null> {
    const existing = OnlineCredentialStore.load(profileId);
    return existing ? this.ensureAccess(existing, true) : null;
  }

  static async startRun(credentials: OnlineCredentials): Promise<{ run_id: string; seed: number; run_token: string; run_token_expires_in_seconds: number; status: 'pending' }> {
    const current = await this.ensureAccess(credentials);
    return await this.request('/v1/runs', current, { method: 'POST', body: JSON.stringify({ game_version: GAME_VERSION }) });
  }

  static async submit(path: string, credentials: OnlineCredentials, runToken: string, body: Record<string, unknown>): Promise<{ status: string; verification_reason?: string }> {
    const current = await this.ensureAccess(credentials);
    return await this.request(path, current, { method: 'POST', headers: { 'X-Run-Token': runToken }, body: JSON.stringify(body) });
  }

  static async leaderboard(category: OnlineLeaderboardCategory): Promise<OnlineLeaderboardEntry[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/v1/leaderboards/${category}?limit=50`);
    if (!response.ok) throw new OnlineApiError('Leaderboard unavailable.', response.status);
    return ((await response.json()) as { entries: OnlineLeaderboardEntry[] }).entries;
  }

  static async aroundPlayer(profileId: string, category: OnlineLeaderboardCategory): Promise<OnlineLeaderboardEntry[]> {
    const credentials = OnlineCredentialStore.load(profileId);
    if (!credentials) return [];
    const current = await this.ensureAccess(credentials);
    const response = await this.request<{ entries: OnlineLeaderboardEntry[] }>(
      `/v1/leaderboards/${category}/around-me?radius=3`, current, { method: 'GET' }
    );
    return response.entries;
  }

  static async personalBests(profileId: string): Promise<Record<OnlineLeaderboardCategory, OnlineLeaderboardEntry | null> | null> {
    const credentials = OnlineCredentialStore.load(profileId);
    if (!credentials) return null;
    const current = await this.ensureAccess(credentials);
    return await this.request('/v1/leaderboards/me/bests', current, { method: 'GET' });
  }

  private static async ensureAccess(credentials: OnlineCredentials, forceRefresh = false): Promise<OnlineCredentials> {
    if (!forceRefresh && credentials.accessExpiresAt > Date.now() + 30_000) return credentials;
    if (credentials.refreshExpiresAt <= Date.now()) {
      OnlineCredentialStore.clear(credentials.profileId);
      throw new OnlineApiError('Online session expired. Reconnect your anonymous identity.', 401);
    }
    const response = await fetchWithTimeout(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: credentials.refreshToken })
    });
    if (!response.ok) {
      const error = new OnlineApiError('Online identity refresh failed.', response.status);
      if (error.invalidCredential) OnlineCredentialStore.clear(credentials.profileId);
      throw error;
    }
    return this.storeTokenResponse(credentials.profileId, await response.json() as TokenResponse);
  }

  private static storeTokenResponse(profileId: string, response: TokenResponse): OnlineCredentials {
    const now = Date.now();
    const credentials: OnlineCredentials = {
      profileId,
      publicId: response.player.public_id,
      displayName: response.player.display_name,
      accessToken: response.access_token,
      accessExpiresAt: now + response.access_expires_in_seconds * 1000,
      refreshToken: response.refresh_token,
      refreshExpiresAt: now + response.refresh_expires_in_seconds * 1000
    };
    OnlineCredentialStore.save(credentials);
    return credentials;
  }

  private static async request<T>(path: string, credentials: OnlineCredentials, init: RequestInit): Promise<T> {
    const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.accessToken}`, ...(init.headers ?? {}) }
    });
    if (!response.ok) throw new OnlineApiError('Leaderboard service rejected the request.', response.status);
    return await response.json() as T;
  }
}
