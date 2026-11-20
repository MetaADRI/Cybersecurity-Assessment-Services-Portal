/** Fetch wrappers for the public and client-portal APIs (separate from staff auth). */
import { API_BASE_URL, apiUrl } from './config';

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

let clientCsrfToken: string | null = null;
let onClientUnauthorized: (() => void) | null = null;
let onClientActivity: (() => void) | null = null;

export function setClientCsrfToken(token: string | null): void {
  clientCsrfToken = token;
}

export function setClientUnauthorizedHandler(handler: (() => void) | null): void {
  onClientUnauthorized = handler;
}

export function setClientActivityHandler(handler: (() => void) | null): void {
  onClientActivity = handler;
}

const SAFE = new Set(['GET', 'HEAD']);

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  prefix: string,
  path: string,
  options: RequestOptions,
  withClientToken: boolean,
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (withClientToken && !SAFE.has(method) && clientCsrfToken) {
    headers['x-csrf-token'] = clientCsrfToken;
  }
  const res = await fetch(apiUrl(`${prefix}${path}`), {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text();
  if (!API_BASE_URL && prefix === '/public' && !isJson) {
    throw new PublicApiError(
      503,
      'The API address is not configured for this deployment. Set VITE_API_URL to the API service URL and rebuild the frontend.',
      'api_not_configured',
    );
  }
  if (!res.ok) {
    const error = (payload as { error?: { message?: string; code?: string; details?: unknown } })
      ?.error;
    if (withClientToken && res.status === 401 && onClientUnauthorized) onClientUnauthorized();
    throw new PublicApiError(
      res.status,
      error?.message ?? `Request failed with status ${res.status}`,
      error?.code ?? 'error',
      error?.details,
    );
  }
  if (withClientToken && onClientActivity) onClientActivity();
  return payload as T;
}

export function publicApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('/public', path, options, false);
}

export function clientApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('/client', path, options, true);
}

export function formatPublicError(err: unknown): string {
  if (err instanceof PublicApiError) return err.message;
  if (err instanceof TypeError) {
    return 'The API could not be reached. Check the API service and CORS settings, then try again.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
