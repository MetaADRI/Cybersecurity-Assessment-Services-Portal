/** @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../client/src/auth';
import type { ReactNode } from 'react';

export interface MockUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'analyst' | 'reviewer';
  status: 'active';
  createdAt: string;
  updatedAt: string;
}

export function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Install a fetch mock that answers /auth/me with the given user and delegates
 * every other request to the supplied handler map (keyed by path substring).
 */
export function installFetchMock(options: {
  user: MockUser | null;
  routes: Record<string, (init?: RequestInit) => Response>;
}): { calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const meBody = { user: options.user, csrfToken: options.user ? 'test-csrf-token' : null };

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    if (url.includes('/auth/me')) return Promise.resolve(jsonResponse(200, meBody));
    const match = Object.keys(options.routes).find((key) => url.includes(key));
    if (match) return Promise.resolve(options.routes[match](init));
    return Promise.resolve(
      jsonResponse(404, { error: { code: 'not_found', message: 'Not mocked' } }),
    );
  }) as typeof fetch;

  return { calls };
}

export function renderWithProviders(ui: ReactNode, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}

export const adminUser: MockUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@example.com',
  fullName: 'Admin User',
  role: 'admin',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const reviewerUser: MockUser = {
  ...adminUser,
  email: 'reviewer@example.com',
  role: 'reviewer',
};
