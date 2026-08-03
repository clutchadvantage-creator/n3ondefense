const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (typeof configuredApiBaseUrl !== 'string' || configuredApiBaseUrl.trim() === '') {
  throw new Error(
    'VITE_API_BASE_URL is required. Set it in the appropriate Vite environment file before starting N3ONDefense.',
  );
}

/** Absolute leaderboard API origin with trailing slashes removed. */
export const API_BASE_URL = configuredApiBaseUrl.trim().replace(/\/+$/, '');
