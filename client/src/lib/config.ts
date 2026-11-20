const configured = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

/** Absolute API origin when the SPA is hosted separately from the Express server. */
export const API_BASE_URL = configured;

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/api/v1${path}`;
}
