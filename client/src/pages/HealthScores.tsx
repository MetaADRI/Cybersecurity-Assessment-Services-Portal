import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { PageHeader } from '../components/Layout';
import {
  Card,
  EmptyState,
  ErrorState,
  Notice,
  ScoreBar,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { formatDate } from '../lib/format';
import type { Customer } from '../../../shared/types';

interface ScoreSummary {
  items: {
    id: string;
    assessmentKey: string;
    title: string;
    customerId: string;
    customerName: string;
    status: string;
    overallScore: number | null;
    coveragePct: number;
    assessmentDate: string;
    scope: string;
  }[];
  total: number;
}

export default function HealthScores() {
  const completed = useApi<ScoreSummary>('/assessments?status=completed&pageSize=50');
  const inProgress = useApi<ScoreSummary>('/assessments?status=in_progress&pageSize=50');
  const customers = useApi<{ items: Customer[] }>('/customers?pageSize=100&status=active');

  if (completed.loading) return <Spinner label="Loading health scores" />;
  if (completed.error)
    return <ErrorState message={completed.error.message} onRetry={completed.refetch} />;

  const items = completed.data?.items ?? [];
  const trend = [...items]
    .sort((a, b) => a.assessmentDate.localeCompare(b.assessmentDate))
    .filter((a) => a.overallScore !== null)
    .map((a) => ({
      date: formatDate(a.assessmentDate),
      score: a.overallScore,
      coverage: a.coveragePct,
      title: a.title,
    }));

  return (
    <>
      <PageHeader
        title="Health scores"
        subtitle="Completed assessments and provisional scores. A score is a risk indicator, not proof of security."
      />

      <div className="mb-4">
        <Notice tone="info">
          Scores from different customers or scopes should never be averaged without saying so.
          Compare assessments only where the scope text and methodology match.
        </Notice>
      </div>

      <Card
        title="Score trend across completed assessments"
        description="Solid line: score. Dashed line: coverage %"
      >
        {trend.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No completed assessments yet.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--od-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--od-muted)' }} />
                <Tooltip
                  labelFormatter={(_l, p) => p?.[0]?.payload?.title ?? ''}
                  contentStyle={{
                    background: 'var(--od-surface)',
                    border: '1px solid var(--od-border)',
                    borderRadius: 8,
                    color: 'var(--od-text)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--chart-primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="coverage"
                  stroke="var(--chart-secondary)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Completed assessments"
          description="Scores frozen with the methodology used at completion"
        >
          {items.length === 0 ? (
            <EmptyState
              title="Nothing completed yet"
              description="Complete an assessment to publish a final score."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/assessments/${a.id}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600"
                      >
                        {a.assessmentKey} - {a.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        <Link to={`/customers/${a.customerId}`} className="hover:text-blue-600">
                          {a.customerName}
                        </Link>{' '}
                        - {formatDate(a.assessmentDate)} - coverage {a.coveragePct}%
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-slate-800">
                      {a.overallScore?.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ScoreBar label={a.scope.slice(0, 70)} value={a.overallScore} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Provisional scores"
          description="In-progress assessments - not eligible for a final score yet"
        >
          {(inProgress.data?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No in-progress assessments.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inProgress.data!.items.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to={`/assessments/${a.id}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600"
                    >
                      {a.assessmentKey} - {a.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {a.customerName} - coverage {a.coveragePct}%
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={a.status} />
                    <span className="text-sm font-semibold text-slate-500">Provisional</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {customers.data && customers.data.items.length > 0 && (
        <div className="mt-5">
          <Card title="Scores by customer" description="Latest completed score per organisation">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customers.data.items.map((c) => {
                const forCustomer = items.filter((a) => a.customerId === c.id);
                const latest = forCustomer[0];
                return (
                  <li key={c.id} className="rounded-md border border-slate-200 p-3">
                    <Link
                      to={`/customers/${c.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-blue-600"
                    >
                      {c.name}
                    </Link>
                    {latest ? (
                      <>
                        <p className="mt-1 text-2xl font-bold text-slate-800">
                          {latest.overallScore?.toFixed(1)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {latest.assessmentKey} - {formatDate(latest.assessmentDate)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">No completed assessment</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
