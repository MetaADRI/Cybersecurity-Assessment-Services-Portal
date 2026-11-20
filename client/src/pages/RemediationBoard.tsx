import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import {
  Card,
  EmptyState,
  ErrorState,
  Notice,
  PriorityBadge,
  SeverityBadge,
  Spinner,
  StatTile,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { qs, type Paginated } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Customer, Finding } from '../../../shared/types';

interface ListResponse extends Paginated<Finding> {
  counts: {
    total: number;
    open: number;
    criticalOpen: number;
    highOpen: number;
    inProgress: number;
    pendingVerification: number;
    overdue: number;
    resolved: number;
    acceptedRisk: number;
    falsePositive: number;
  };
}

const COLUMNS: { status: string; title: string; tone: string }[] = [
  { status: 'open', title: 'Open', tone: 'border-t-red-500' },
  { status: 'in_progress', title: 'In progress', tone: 'border-t-sky-500' },
  { status: 'pending_verification', title: 'Pending verification', tone: 'border-t-blue-500' },
  { status: 'accepted_risk', title: 'Accepted risk', tone: 'border-t-amber-500' },
  { status: 'resolved', title: 'Resolved', tone: 'border-t-emerald-500' },
];

/** Board view of the remediation lifecycle, grouped by status. */
export default function RemediationBoard() {
  const [customerId, setCustomerId] = useState('');
  const customers = useApi<Paginated<Customer>>('/customers?pageSize=100');
  const board = useApi<ListResponse>(
    `/findings${qs({ customerId, pageSize: 100, sort: 'priority', dir: 'desc' })}`,
  );

  const columns = COLUMNS.map((column) => ({
    ...column,
    items: (board.data?.items ?? []).filter((f) => f.status === column.status),
  }));

  return (
    <>
      <PageHeader
        title="Remediation board"
        subtitle="Findings grouped by lifecycle status - drag-free, readable status view"
        actions={
          <select
            aria-label="Filter by customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All customers</option>
            {customers.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />

      {board.data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Open" value={board.data.counts.open} />
          <StatTile
            label="Overdue"
            value={board.data.counts.overdue}
            tone={board.data.counts.overdue > 0 ? 'warning' : 'good'}
          />
          <StatTile label="Pending verification" value={board.data.counts.pendingVerification} />
          <StatTile label="Resolved" value={board.data.counts.resolved} tone="good" />
        </div>
      )}

      {board.data && board.data.counts.criticalOpen > 0 && (
        <div className="mb-5">
          <Notice tone="danger">
            {board.data.counts.criticalOpen} critical finding(s) are still open. These stay visible
            regardless of any health score.
          </Notice>
        </div>
      )}

      {board.loading && <Spinner label="Loading board" />}
      {board.error && <ErrorState message={board.error.message} onRetry={board.refetch} />}

      {board.data && board.data.items.length === 0 && (
        <EmptyState
          title="No findings"
          description="Create a finding to populate the remediation board."
        />
      )}

      {board.data && board.data.items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          {columns.map((column) => (
            <div
              key={column.status}
              className={`rounded-lg border border-slate-200 border-t-2 bg-white ${column.tone} shadow-sm`}
            >
              <header className="border-b border-slate-100 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-900">{column.title}</p>
                <p className="text-xs text-slate-500">{column.items.length} finding(s)</p>
              </header>
              <ul className="space-y-2 p-2">
                {column.items.map((f) => (
                  <li key={f.id} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                    <Link
                      to={`/findings/${f.id}`}
                      className="block text-sm font-medium text-slate-900 hover:text-blue-600"
                    >
                      <span className="mr-1 text-xs text-slate-400">{f.findingKey}</span>
                      {f.title}
                    </Link>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={f.severity} />
                      <PriorityBadge priority={f.priority} />
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {f.customerName}
                      {f.assigneeName ? ` - ${f.assigneeName}` : ''}
                    </p>
                    {f.targetDate && (
                      <p
                        className={`text-xs ${f.overdue ? 'font-medium text-red-700' : 'text-slate-500'}`}
                      >
                        {f.overdue ? 'Overdue since ' : 'Due '}
                        {formatDate(f.targetDate)}
                      </p>
                    )}
                  </li>
                ))}
                {column.items.length === 0 && (
                  <li className="px-1 py-3 text-center text-xs text-slate-400">Nothing here</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {board.data && (
        <div className="mt-5">
          <Card
            title="Closed records"
            description="Resolved and false-positive findings are preserved, never deleted"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Resolved
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {board.data.items
                    .filter((f) => f.status === 'resolved')
                    .map((f) => (
                      <li key={f.id}>
                        <Link to={`/findings/${f.id}`} className="text-blue-600 hover:underline">
                          {f.findingKey} - {f.title}
                        </Link>
                      </li>
                    ))}
                  {board.data.counts.resolved === 0 && <li className="text-slate-500">None yet</li>}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  False positives
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {board.data.items
                    .filter((f) => f.status === 'false_positive')
                    .map((f) => (
                      <li key={f.id}>
                        <Link to={`/findings/${f.id}`} className="text-blue-600 hover:underline">
                          {f.findingKey} - {f.title}
                        </Link>
                      </li>
                    ))}
                  {board.data.items.filter((f) => f.status === 'false_positive').length === 0 && (
                    <li className="text-slate-500">None</li>
                  )}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
