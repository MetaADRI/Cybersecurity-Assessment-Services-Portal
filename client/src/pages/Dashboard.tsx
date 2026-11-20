import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Card,
  EmptyState,
  ErrorState,
  Notice,
  SeverityBadge,
  Spinner,
  StatTile,
  StatusBadge,
  PriorityBadge,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { formatDateTime, formatDate, label } from '../lib/format';

interface DashboardResponse {
  counts: Record<string, unknown> & {
    activeCustomers: number;
    archivedCustomers: number;
    completedAssessments: number;
    averageScore: number | null;
    averageScoreBasis: number;
    averageScoreDistinctScopes: number;
    total: number;
    open: number;
    criticalOpen: number;
    highOpen: number;
    inProgress: number;
    pendingVerification: number;
    overdue: number;
    resolved: number;
    acceptedRisk: number;
    severities: {
      severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
      count: number;
    }[];
  };
  trend: {
    key: string;
    title: string;
    date: string;
    score: number;
    coverage: number;
    scope: string;
  }[];
  recentAssessments: {
    id: string;
    assessmentKey: string;
    title: string;
    customerName: string;
    status: string;
    overallScore: number | null;
    coveragePct: number;
    assessmentDate: string;
  }[];
  topIssues: {
    id: string;
    findingKey: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
    priority: string;
    status: string;
    customerName: string;
    overdue?: boolean;
  }[];
  recentActivity: {
    findingKey: string;
    findingTitle: string;
    from: string | null;
    to: string;
    at: string;
    actor: string | null;
    note: string | null;
  }[];
  empty: boolean;
}

export default function Dashboard() {
  const { data, error, loading, refetch } = useApi<DashboardResponse>('/dashboard/summary');

  if (loading) return <Spinner label="Loading dashboard" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  if (data.empty) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          subtitle="Welcome to the OpenDefenders cybersecurity platform"
        />
        <EmptyState
          title="No data yet"
          description="The database is empty. Load the clearly labelled demonstration dataset, or create your first customer to begin an assessment."
          action={
            <div className="flex flex-col items-center gap-2 text-sm">
              <Link to="/customers/new" className="text-blue-600 underline">
                Create a customer
              </Link>
              <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                npm run db:seed
              </code>
              <span className="text-xs text-slate-500">
                loads fictional "(Demo)" organisations only
              </span>
            </div>
          }
        />
      </>
    );
  }

  const c = data.counts;
  const trendData = data.trend.map((t) => ({
    ...t,
    shortDate: formatDate(t.date),
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="All figures are computed from live database records"
        actions={
          <Link
            to="/customers/new"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            New customer
          </Link>
        }
      />

      {c.averageScoreDistinctScopes > 1 && (
        <div className="mb-4">
          <Notice tone="warning">
            The average score combines {c.averageScoreBasis} completed assessments across{' '}
            {c.averageScoreDistinctScopes} different assessment scopes. Scopes differ, so the
            average is a broad indicator rather than a like-for-like comparison.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active customers"
          value={c.activeCustomers}
          to="/customers"
          hint={`${c.archivedCustomers} archived`}
        />
        <StatTile
          label="Completed assessments"
          value={c.completedAssessments}
          to="/assessments?status=completed"
          hint={
            c.averageScore !== null
              ? `Average score ${c.averageScore}`
              : 'No scored assessments yet'
          }
        />
        <StatTile
          label="Open critical findings"
          value={c.criticalOpen}
          tone={c.criticalOpen > 0 ? 'critical' : 'good'}
          to="/findings?severity=critical"
        />
        <StatTile
          label="Overdue remediation"
          value={c.overdue}
          tone={c.overdue > 0 ? 'warning' : 'good'}
          to="/remediation"
          hint={`${c.pendingVerification} awaiting verification`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card
          title="Health score trend"
          description="Completed assessments over time (see scopes before comparing)"
          className="lg:col-span-2"
        >
          {trendData.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No completed assessments yet. Complete an assessment to start the trend.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: 'var(--od-muted)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--od-muted)' }} />
                  <Tooltip
                    formatter={(value, name) => [value, name === 'score' ? 'Score' : 'Coverage %']}
                    labelFormatter={(_l, payload) => payload?.[0]?.payload?.title ?? ''}
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

        <Card
          title="Open findings by severity"
          description="Customer-wide open and in-flight findings"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={c.severities.map((s) => ({ name: label(s.severity), count: s.count }))}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'var(--od-muted)' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 11, fill: 'var(--od-muted)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--od-surface)',
                    border: '1px solid var(--od-border)',
                    borderRadius: 8,
                    color: 'var(--od-text)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--chart-bar)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card
          title="Highest-priority open issues"
          className="lg:col-span-2"
          actions={
            <Link to="/findings" className="text-xs font-medium text-blue-600">
              View all
            </Link>
          }
        >
          {data.topIssues.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              No open findings. Nothing needs escalation right now.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topIssues.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to={`/findings/${f.id}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600"
                    >
                      {f.findingKey} - {f.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <SeverityBadge severity={f.severity} />
                      <PriorityBadge priority={f.priority} />
                      <StatusBadge status={f.status} />
                      <span>{f.customerName}</span>
                      {f.overdue && (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <AlertTriangle className="h-3 w-3" /> Overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent remediation activity">
          {data.recentActivity.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No status changes recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.recentActivity.map((a, i) => (
                <li key={`${a.findingKey}-${i}`} className="text-xs">
                  <p className="text-slate-700">
                    <span className="font-semibold">{a.findingKey}</span>{' '}
                    {a.from ? `${label(a.from)} -> ${label(a.to)}` : label(a.to)}
                  </p>
                  <p className="text-slate-500">
                    {formatDateTime(a.at)} - {a.actor ?? 'System'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Recent assessments">
          {data.recentAssessments.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No assessments created yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Key</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Score</th>
                  <th className="py-2 text-right">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentAssessments.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 text-xs text-slate-500">{a.assessmentKey}</td>
                    <td className="py-2 pr-3">
                      <Link to={`/assessments/${a.id}`} className="text-blue-600 hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{a.customerName}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">
                      {a.overallScore === null ? 'Provisional' : a.overallScore.toFixed(1)}
                    </td>
                    <td className="py-2 text-right text-xs text-slate-500">{a.coveragePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
