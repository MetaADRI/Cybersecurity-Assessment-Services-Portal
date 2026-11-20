import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import {
  Card,
  EmptyState,
  ErrorState,
  ScoreBar,
  SeverityBadge,
  Spinner,
  StatusBadge,
  StatTile,
  Notice,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { formatDate, label } from '../lib/format';
import type { Customer, Finding } from '../../../shared/types';

interface CustomerDetailResponse {
  customer: Customer;
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
  severities: { severity: Finding['severity']; count: number }[];
  completedAssessments: {
    id: string;
    assessmentKey: string;
    title: string;
    assessmentDate: string;
    score: number | null;
    coveragePct: number;
    scope: string;
    methodologyVersion: number;
  }[];
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { data, error, loading, refetch } = useApi<CustomerDetailResponse>(
    id ? `/customers/${id}` : null,
  );
  const findings = useApi<{ items: Finding[]; total: number }>(
    id ? `/findings${id ? `?customerId=${id}&pageSize=5&sort=severity` : ''}` : null,
  );
  const assessments = useApi<{
    items: {
      id: string;
      assessmentKey: string;
      title: string;
      status: string;
      overallScore: number | null;
      coveragePct: number;
      assessmentDate: string;
    }[];
  }>(id ? `/assessments?customerId=${id}&pageSize=10` : null);

  if (loading) return <Spinner label="Loading customer" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  const { customer, counts, severities, completedAssessments } = data;
  const latest = completedAssessments[0];
  const previous = completedAssessments[1];
  const change =
    latest && previous && latest.score !== null && previous.score !== null
      ? Math.round((latest.score - previous.score) * 10) / 10
      : null;

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.industry} - created ${formatDate(customer.createdAt)}`}
        actions={
          <div className="flex gap-2">
            <Link to={`/assessments/new?customerId=${customer.id}`}>
              <span className="inline-block rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">
                New assessment
              </span>
            </Link>
            <Link to={`/findings/new?customerId=${customer.id}`}>
              <span className="inline-block rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                New finding
              </span>
            </Link>
            <Link to={`/customers/${customer.id}/edit`}>
              <span className="inline-block rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Edit
              </span>
            </Link>
          </div>
        }
      />

      {customer.status === 'archived' && (
        <div className="mb-4">
          <Notice tone="warning">
            This customer is archived. Historical assessments, findings and reports are preserved
            and remain readable.
          </Notice>
        </div>
      )}
      {customer.isDemo && (
        <div className="mb-4">
          <Notice tone="info">Demonstration record - this organisation is fictional.</Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Latest health score"
          value={latest?.score !== null && latest?.score !== undefined ? latest.score : 'n/a'}
          hint={latest ? `Coverage ${latest.coveragePct}%` : 'No completed assessment'}
        />
        <StatTile
          label="Change vs previous"
          value={change === null ? '-' : `${change > 0 ? '+' : ''}${change}`}
          tone={change === null ? 'default' : change >= 0 ? 'good' : 'critical'}
        />
        <StatTile
          label="Open findings"
          value={counts.open}
          hint={`${counts.inProgress} in progress`}
        />
        <StatTile
          label="Critical open"
          value={counts.criticalOpen}
          tone={counts.criticalOpen > 0 ? 'critical' : 'good'}
          hint={`${counts.overdue} overdue overall`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Organisation details" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt>
              <dd className="text-slate-700">{customer.description ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Contact</dt>
              <dd className="text-slate-700">
                {customer.contactName ?? '-'}
                {customer.contactEmail && (
                  <span className="block text-xs text-slate-500">{customer.contactEmail}</span>
                )}
                {customer.phone && (
                  <span className="block text-xs text-slate-500">{customer.phone}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Scope</dt>
              <dd className="text-slate-700">{customer.scope ?? 'Not defined'}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Findings by severity" className="lg:col-span-1">
          {severities.length === 0 ? (
            <p className="text-sm text-slate-500">No findings recorded.</p>
          ) : (
            <ul className="space-y-2">
              {severities.map((s) => (
                <li key={s.severity} className="flex items-center justify-between text-sm">
                  <SeverityBadge severity={s.severity} />
                  <span className="font-semibold text-slate-700">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Resolved: {counts.resolved} - Accepted risk: {counts.acceptedRisk} - False positive:{' '}
            {counts.falsePositive}
          </div>
        </Card>

        <Card
          title="Score history"
          description="Completed assessments only"
          className="lg:col-span-1"
        >
          {completedAssessments.length === 0 ? (
            <p className="text-sm text-slate-500">No completed assessments yet.</p>
          ) : (
            <ul className="space-y-4">
              {completedAssessments.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/assessments/${a.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {a.assessmentKey} - {formatDate(a.assessmentDate)}
                  </Link>
                  <ScoreBar label={label(a.title)} value={a.score} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Assessments"
          actions={
            <Link
              to={`/assessments?customerId=${customer.id}`}
              className="text-xs font-medium text-blue-600"
            >
              View all
            </Link>
          }
        >
          {assessments.loading && <Spinner label="Loading assessments" />}
          {assessments.data && assessments.data.items.length === 0 && (
            <EmptyState
              title="No assessments"
              description="Create the first assessment for this customer."
            />
          )}
          {assessments.data && assessments.data.items.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {assessments.data.items.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={`/assessments/${a.id}`}
                      className="block truncate font-medium text-slate-900 hover:text-blue-600"
                    >
                      {a.assessmentKey} - {a.title}
                    </Link>
                    <p className="text-xs text-slate-500">{formatDate(a.assessmentDate)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={a.status} />
                    <span className="text-sm font-semibold">
                      {a.overallScore === null ? 'Provisional' : a.overallScore.toFixed(1)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent findings"
          actions={
            <Link
              to={`/findings?customerId=${customer.id}`}
              className="text-xs font-medium text-blue-600"
            >
              View all
            </Link>
          }
        >
          {findings.loading && <Spinner label="Loading findings" />}
          {findings.data && findings.data.items.length === 0 && (
            <EmptyState
              title="No findings"
              description="Record findings discovered during an assessment."
            />
          )}
          {findings.data && findings.data.items.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {findings.data.items.map((f) => (
                <li key={f.id} className="py-2.5">
                  <Link
                    to={`/findings/${f.id}`}
                    className="block truncate font-medium text-slate-900 hover:text-blue-600"
                  >
                    {f.findingKey} - {f.title}
                  </Link>
                  <p className="mt-1 flex items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <StatusBadge status={f.status} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
