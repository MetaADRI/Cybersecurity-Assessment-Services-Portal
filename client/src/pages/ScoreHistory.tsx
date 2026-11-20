import { Link, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Card,
  EmptyState,
  ErrorState,
  Notice,
  ScoreBar,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { formatDate, label } from '../lib/format';
import type { Assessment, Finding, ScoreResult } from '../../../shared/types';

interface Comparison {
  previousScore: number | null;
  currentScore: number | null;
  scoreChange: number | null;
  coverageChange: number | null;
  categoryChanges: {
    name: string;
    previous: number | null;
    current: number | null;
    change: number | null;
  }[];
  comparable: boolean;
  caveats: string[];
  methodologyChanged: boolean;
  scopeChanged: boolean;
}

interface HistoryResponse {
  previous: Assessment | null;
  current: Assessment;
  comparison: Comparison | null;
  previousScore?: ScoreResult;
  currentScore?: ScoreResult;
  newlyDiscovered?: Finding[];
  resolvedSince?: Finding[];
  remainingHighPriority?: Finding[];
  note?: string;
}

export default function ScoreHistory() {
  const { id } = useParams();
  const { data, error, loading, refetch } = useApi<HistoryResponse>(
    id ? `/assessments/${id}/history` : null,
  );

  if (loading) return <Spinner label="Loading score history" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  const { previous, current, comparison } = data;

  if (!previous || !comparison) {
    return (
      <>
        <PageHeader
          title="Score history"
          subtitle={`${current.assessmentKey} - ${current.title}`}
        />
        <EmptyState
          title="No comparable assessment found"
          description={
            data.note ??
            'A previous completed assessment with a matching scope is required before a comparison can be shown.'
          }
          action={
            <Link to={`/assessments/${current.id}`} className="text-blue-600 underline">
              Back to assessment
            </Link>
          }
        />
      </>
    );
  }

  const delta = comparison.scoreChange;

  return (
    <>
      <PageHeader
        title="Score history and comparison"
        subtitle={`${previous.assessmentKey} (${formatDate(previous.assessmentDate)}) compared with ${current.assessmentKey} (${formatDate(current.assessmentDate)})`}
      />

      {comparison.caveats.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning">
            <p className="font-medium">Read this comparison with care</p>
            <ul className="mt-1 list-disc pl-5">
              {comparison.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Previous score">
          <p className="text-4xl font-bold text-slate-800">
            {comparison.previousScore?.toFixed(1) ?? '--'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {previous.assessmentKey} - {formatDate(previous.assessmentDate)} - coverage{' '}
            {data.previousScore?.coveragePct ?? '-'}%
          </p>
        </Card>
        <Card title="Current score">
          <p className="text-4xl font-bold text-slate-800">
            {comparison.currentScore?.toFixed(1) ?? '--'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {current.assessmentKey} - {formatDate(current.assessmentDate)} - coverage{' '}
            {data.currentScore?.coveragePct ?? '-'}%
          </p>
        </Card>
        <Card title="Change">
          <p
            className={`text-4xl font-bold ${
              delta === null
                ? 'text-slate-400'
                : delta > 0
                  ? 'text-emerald-700'
                  : delta < 0
                    ? 'text-red-700'
                    : 'text-slate-700'
            }`}
          >
            {delta === null ? '--' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Coverage change:{' '}
            {comparison.coverageChange !== null
              ? `${comparison.coverageChange > 0 ? '+' : ''}${comparison.coverageChange}`
              : '-'}{' '}
            points
          </p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Category-level changes">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 text-left">Category</th>
                <th className="py-2 text-right">Previous</th>
                <th className="py-2 text-right">Current</th>
                <th className="py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparison.categoryChanges.map((c) => (
                <tr key={c.name}>
                  <td className="py-2 text-left">{c.name}</td>
                  <td className="py-2 text-right">
                    {c.previous === null ? 'Unknown' : c.previous.toFixed(1)}
                  </td>
                  <td className="py-2 text-right">
                    {c.current === null ? 'Unknown' : c.current.toFixed(1)}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold ${
                      c.change === null
                        ? 'text-slate-400'
                        : c.change > 0
                          ? 'text-emerald-700'
                          : c.change < 0
                            ? 'text-red-700'
                            : 'text-slate-500'
                    }`}
                  >
                    {c.change === null ? '-' : `${c.change > 0 ? '+' : ''}${c.change.toFixed(1)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Current category scores">
          <div className="space-y-2">
            {data.currentScore?.categories.map((c) => (
              <ScoreBar key={c.categoryId} label={c.name} value={c.score} />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Newly discovered findings" className="lg:col-span-1">
          {(data.newlyDiscovered ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No new findings since the previous assessment.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.newlyDiscovered!.map((f) => (
                <li key={f.id}>
                  <Link to={`/findings/${f.id}`} className="text-blue-600 hover:underline">
                    {f.findingKey} - {f.title}
                  </Link>
                  <span className="ml-2">
                    <SeverityBadge severity={f.severity} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Resolved since previous assessment" className="lg:col-span-1">
          {(data.resolvedSince ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No findings have been resolved since then.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.resolvedSince!.map((f) => (
                <li key={f.id}>
                  <Link to={`/findings/${f.id}`} className="text-blue-600 hover:underline">
                    {f.findingKey} - {f.title}
                  </Link>
                  <span className="ml-2">
                    <StatusBadge status={f.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Remaining high-priority risks" className="lg:col-span-1">
          {(data.remainingHighPriority ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No open critical or high findings remain.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.remainingHighPriority!.map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  <div>
                    <Link to={`/findings/${f.id}`} className="text-blue-600 hover:underline">
                      {f.findingKey} - {f.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {label(f.severity)} - {label(f.status)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Scope of both assessments">
          <p className="text-sm text-slate-700">
            <strong>{previous.assessmentKey}:</strong> {previous.scope}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            <strong>{current.assessmentKey}:</strong> {current.scope}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            A higher score is only meaningful when both assessments measured the same scope with
            similar coverage and methodology.
          </p>
        </Card>
      </div>
    </>
  );
}
