/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerList from '../../../client/src/pages/CustomerList';
import {
  adminUser,
  installFetchMock,
  jsonResponse,
  renderWithProviders,
  reviewerUser,
} from './helpers';
import type { MockUser } from './helpers';

const customerRoute = '/api/v1/customers';

function listResponse(items: unknown[]) {
  return jsonResponse(200, { items, total: items.length, page: 1, pageSize: 15 });
}

describe('customer list', () => {
  beforeEach(() => {
    installFetchMock({ user: adminUser as MockUser, routes: {} });
  });

  it('shows onboarding guidance when there are no customers', async () => {
    installFetchMock({
      user: adminUser as MockUser,
      routes: { [customerRoute]: () => listResponse([]) },
    });
    renderWithProviders(<CustomerList />, '/customers');

    expect(await screen.findByText('No customers found')).toBeInTheDocument();
    expect(screen.getByText(/create your first customer/i)).toBeInTheDocument();
  });

  it('renders customers from the API', async () => {
    installFetchMock({
      user: adminUser as MockUser,
      routes: {
        [customerRoute]: () =>
          listResponse([
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              name: 'Copperbelt Financial Group (Demo)',
              description: 'Fictional bank',
              industry: 'Banking',
              contactName: 'Mwansa Banda (fictional)',
              contactEmail: 'contact@example.com',
              phone: null,
              scope: 'Core banking platform',
              status: 'active',
              isDemo: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              createdBy: null,
            },
          ]),
      },
    });
    renderWithProviders(<CustomerList />, '/customers');

    expect(await screen.findByText('Copperbelt Financial Group (Demo)')).toBeInTheDocument();
    expect(screen.getByText('Banking')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new customer/i })).toBeInTheDocument();
  });

  it('hides the create action from read-only reviewers', async () => {
    installFetchMock({
      user: reviewerUser as MockUser,
      routes: { [customerRoute]: () => listResponse([]) },
    });
    renderWithProviders(<CustomerList />, '/customers');

    await screen.findByText('No customers found');
    expect(screen.queryByRole('link', { name: /new customer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('surfaces a readable error when the request fails', async () => {
    installFetchMock({
      user: adminUser as MockUser,
      routes: {
        [customerRoute]: () =>
          jsonResponse(500, { error: { code: 'internal_error', message: 'Server exploded' } }),
      },
    });
    renderWithProviders(<CustomerList />, '/customers');

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('sends a search query to the API when the user types', async () => {
    const user = userEvent.setup();
    const { calls } = installFetchMock({
      user: adminUser as MockUser,
      routes: { [customerRoute]: () => listResponse([]) },
    });
    renderWithProviders(<CustomerList />, '/customers');
    await screen.findByText('No customers found');

    await user.type(screen.getByLabelText(/search customers/i), 'copper');
    await waitFor(() => {
      const call = calls.find((c) => c.url.includes(customerRoute) && c.url.includes('q=copper'));
      expect(call).toBeTruthy();
    });
  });
});
