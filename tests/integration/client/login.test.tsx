/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../../../client/src/pages/Login';
import { installFetchMock, jsonResponse, renderWithProviders } from './helpers';

describe('login page', () => {
  beforeEach(() => {
    installFetchMock({ user: null, routes: {} });
  });

  it('shows validation errors when the form is submitted empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />, '/login');

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    expect(screen.getAllByText(/invalid email/i).length).toBeGreaterThan(0);
  });

  it('shows a server error message for bad credentials', async () => {
    const user = userEvent.setup();
    installFetchMock({
      user: null,
      routes: {
        '/auth/login': () =>
          jsonResponse(401, {
            error: { code: 'unauthorized', message: 'Incorrect email or password' },
          }),
      },
    });
    renderWithProviders(<Login />, '/login');

    await user.type(screen.getByLabelText(/email address/i), 'analyst@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument();
  });

  it('sends the submitted credentials and clears the error on success', async () => {
    const user = userEvent.setup();
    const { calls } = installFetchMock({
      user: null,
      routes: {
        '/auth/login': () =>
          jsonResponse(200, {
            user: { id: '1', email: 'analyst@example.com', role: 'analyst' },
            csrfToken: 'csrf-123',
          }),
      },
    });
    renderWithProviders(<Login />, '/login');

    await user.type(screen.getByLabelText(/email address/i), 'analyst@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const loginCall = calls.find((c) => c.url.includes('/auth/login'));
      expect(loginCall).toBeTruthy();
      expect(JSON.parse(String(loginCall!.init?.body))).toEqual({
        email: 'analyst@example.com',
        password: 'correct-horse-battery',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText(/incorrect email or password/i)).not.toBeInTheDocument();
    });
  });

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    installFetchMock({
      user: null,
      routes: {
        '/auth/login': () => {
          return new Promise<Response>((resolve) => {
            release = () => resolve(jsonResponse(200, { user: null, csrfToken: null }));
          }) as unknown as Response;
        },
      },
    });
    renderWithProviders(<Login />, '/login');

    await user.type(screen.getByLabelText(/email address/i), 'analyst@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'correct-horse-battery');
    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await act(async () => {
      release?.();
    });
  });
});
