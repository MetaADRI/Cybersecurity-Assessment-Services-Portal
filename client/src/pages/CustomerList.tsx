import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Archive, ArchiveRestore } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { useApi, formatApiError } from '../hooks/useApi';
import { api, qs, type Paginated } from '../lib/api';
import { formatDate } from '../lib/format';
import { canWrite, useAuth } from '../auth';
import type { Customer } from '../../../shared/types';

export default function CustomerList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'active';
  const page = Number(params.get('page') ?? '1');

  const query = qs({ q, status, page, pageSize: 15, sort: 'name', dir: 'asc' });
  const { data, error, loading, refetch } = useApi<Paginated<Customer>>(`/customers${query}`);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
    setRefreshKey((k) => k + 1);
  };

  const toggleArchive = async (customer: Customer) => {
    try {
      await api(
        `/customers/${customer.id}/${customer.status === 'active' ? 'archive' : 'restore'}`,
        {
          method: 'POST',
        },
      );
      refetch();
    } catch (err) {
      alert(formatApiError(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Organisations under assessment. Archiving keeps all historical records."
        actions={
          canWrite(user) ? (
            <Link to="/customers/new">
              <Button>
                <Plus className="h-4 w-4" /> New customer
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              aria-label="Search customers"
              placeholder="Search by organisation, industry or contact"
              defaultValue={q}
              onChange={(e) => setParam('q', e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Status filter"
            value={status}
            onChange={(e) => setParam('status', e.target.value)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="">All</option>
          </Select>
        </div>

        {loading && <Spinner label="Loading customers" />}
        {error && <ErrorState message={error.message} onRetry={refetch} />}

        {data && data.items.length === 0 && (
          <EmptyState
            title="No customers found"
            description={
              q
                ? 'No organisation matches your search.'
                : 'Create your first customer to start an assessment.'
            }
            action={
              canWrite(user) ? (
                <Link to="/customers/new">
                  <Button>New customer</Button>
                </Link>
              ) : undefined
            }
          />
        )}

        {data && data.items.length > 0 && (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Organisation</th>
                  <th className="py-2 pr-3">Industry</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600"
                      >
                        {customer.name}
                      </Link>
                      {customer.isDemo && (
                        <span className="ml-2 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                          Demo
                        </span>
                      )}
                      <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                        {customer.description ?? 'No description'}
                      </p>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">{customer.industry}</td>
                    <td className="py-3 pr-3 text-xs text-slate-600">
                      {customer.contactName ?? '-'}
                      {customer.contactEmail && (
                        <span className="block text-slate-400">{customer.contactEmail}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={customer.status} />
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="py-3 text-right">
                      {canWrite(user) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toggleArchive(customer)}
                        >
                          {customer.status === 'active' ? (
                            <>
                              <Archive className="h-3.5 w-3.5" /> Archive
                            </>
                          ) : (
                            <>
                              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data.page ?? page}
              pageSize={data.pageSize ?? 15}
              total={data.total}
              onPage={(p) => setParam('page', String(p))}
            />
          </>
        )}
      </Card>
      <div key={refreshKey} hidden />
    </>
  );
}
