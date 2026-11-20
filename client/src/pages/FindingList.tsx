import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus, Search } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  PriorityBadge,
  Select,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { qs, type Paginated } from '../lib/api';
import { apiUrl } from '../lib/config';
import { formatDate, label } from '../lib/format';
import { canWrite, useAuth } from '../auth';
import type { Customer, Finding } from '../../../shared/types';
import { FINDING_STATUSES, SEVERITIES } from '../../../shared/constants';

interface ListResponse extends Paginated<Finding> {
  counts: Record<string, number>;
  severities: { severity: string; count: number }[];
}

export default function FindingList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const page = Number(get('page') || '1');

  const query = qs({
    q: get('q'),
    customerId: get('customerId'),
    assessmentId: get('assessmentId'),
    severity: get('severity'),
    status: get('status'),
    assigneeId: get('assigneeId'),
    overdue: get('overdue'),
    page,
    pageSize: 15,
    sort: get('sort') || 'severity',
    dir: 'desc',
  });

  const { data, error, loading, refetch } = useApi<ListResponse>(`/findings${query}`);
  const customers = useApi<Paginated<Customer>>('/customers?pageSize=100');
  const users = useApi<{ items: { id: string; fullName: string }[] }>('/users/options');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const hasFilters = ['q', 'customerId', 'severity', 'status', 'assigneeId', 'overdue'].some((k) =>
    get(k),
  );

  return (
    <>
      <PageHeader
        title="Findings"
        subtitle="Security findings across every customer and assessment"
        actions={
          <>
            <a href={apiUrl(`/findings/export${query}`)}>
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </a>
            {canWrite(user) && (
              <Link to="/findings/new">
                <Button>
                  <Plus className="h-4 w-4" /> New finding
                </Button>
              </Link>
            )}
          </>
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              aria-label="Search findings"
              placeholder="Search key, title, asset, CVE"
              defaultValue={get('q')}
              onChange={(e) => setParam('q', e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Customer"
            value={get('customerId')}
            onChange={(e) => setParam('customerId', e.target.value)}
          >
            <option value="">All customers</option>
            {customers.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Severity"
            value={get('severity')}
            onChange={(e) => setParam('severity', e.target.value)}
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            value={get('status')}
            onChange={(e) => setParam('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {FINDING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Assignee"
            value={get('assigneeId')}
            onChange={(e) => setParam('assigneeId', e.target.value)}
          >
            <option value="">Any assignee</option>
            {users.data?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Overdue"
            value={get('overdue')}
            onChange={(e) => setParam('overdue', e.target.value)}
          >
            <option value="">Any due date</option>
            <option value="true">Overdue only</option>
          </Select>
          {hasFilters && (
            <Button
              variant="secondary"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Clear filters
            </Button>
          )}
        </div>

        {loading && <Spinner label="Loading findings" />}
        {error && <ErrorState message={error.message} onRetry={refetch} />}

        {data && data.items.length === 0 && (
          <EmptyState
            title="No findings match"
            description={
              hasFilters
                ? 'Adjust or clear the filters.'
                : 'Record the findings from your first assessment.'
            }
          />
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>Total: {data.total}</span>
              <span>Open: {data.counts.open}</span>
              <span className="text-red-700">Critical open: {data.counts.criticalOpen}</span>
              <span className="text-orange-700">High open: {data.counts.highOpen}</span>
              <span className="text-amber-700">Overdue: {data.counts.overdue}</span>
              <span>Pending verification: {data.counts.pendingVerification}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Key</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2">Assignee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-3 text-xs text-slate-500">{f.findingKey}</td>
                      <td className="max-w-xs py-3 pr-3">
                        <Link
                          to={`/findings/${f.id}`}
                          className="block truncate font-medium text-slate-900 hover:text-blue-600"
                        >
                          {f.title}
                        </Link>
                        <span className="text-xs text-slate-500">{f.asset ?? '-'}</span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-600">{f.customerName}</td>
                      <td className="py-3 pr-3">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="py-3 pr-3">
                        <PriorityBadge priority={f.priority} />
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <span className={f.overdue ? 'font-medium text-red-700' : 'text-slate-500'}>
                          {f.targetDate ? formatDate(f.targetDate) : '-'}
                        </span>
                        {f.overdue && (
                          <span className="block text-[10px] uppercase text-red-600">Overdue</span>
                        )}
                      </td>
                      <td className="py-3 text-xs text-slate-600">
                        {f.assigneeName ?? 'Unassigned'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page ?? page}
              pageSize={data.pageSize ?? 15}
              total={data.total}
              onPage={(p) => setParam('page', String(p))}
            />
          </>
        )}
      </Card>
    </>
  );
}
