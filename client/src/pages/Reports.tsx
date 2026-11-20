import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileText, Eye } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  Select,
  Spinner,
} from '../components/ui';
import { formatApiError, useApi } from '../hooks/useApi';
import { api, qs, type Paginated } from '../lib/api';
import { apiUrl } from '../lib/config';
import { formatDateTime, label } from '../lib/format';
import { canWrite, useAuth } from '../auth';
import { REPORT_TYPES, REPORT_TYPE_LABELS } from '../../../shared/constants';
import type { Assessment, ReportRecord } from '../../../shared/types';
import type { ReportContent } from '../lib/reportTypes';

export default function Reports() {
  const { user } = useAuth();
  const writable = canWrite(user);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [assessmentId, setAssessmentId] = useState(params.get('assessmentId') ?? '');
  const [type, setType] = useState<'executive' | 'technical' | 'remediation'>('executive');
  const [preview, setPreview] = useState<ReportContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assessments = useApi<Paginated<Assessment>>('/assessments?pageSize=100');
  const reports = useApi<Paginated<ReportRecord>>(`/reports${qs({ pageSize: 25 })}`);

  const selected = assessments.data?.items.find((a) => a.id === assessmentId);

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ content: ReportContent }>(
        `/reports/preview${qs({ assessmentId, type })}`,
      );
      setPreview(result.content);
    } catch (err) {
      setError(formatApiError(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ report: ReportRecord }>('/reports/generate', {
        method: 'POST',
        body: { assessmentId, type },
      });
      navigate(`/reports/${result.report.id}`);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Professional PDF reports generated from stored application data"
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Generate a report" className="lg:col-span-2">
          {!writable && (
            <div className="mb-3">
              <Notice tone="info">
                Read-only reviewers can open and download existing reports but cannot generate new
                ones.
              </Notice>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Assessment"
              htmlFor="r-assessment"
              required
              hint="Reports require a draft-free assessment (draft assessments are blocked)."
            >
              <Select
                id="r-assessment"
                value={assessmentId}
                disabled={!writable}
                onChange={(e) => setAssessmentId(e.target.value)}
              >
                <option value="">Select an assessment</option>
                {assessments.data?.items
                  .filter((a) => a.status !== 'draft')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assessmentKey} - {a.customerName} - {a.title} ({label(a.status)})
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Report type" htmlFor="r-type" required>
              <Select
                id="r-type"
                value={type}
                disabled={!writable}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {selected && (
            <p className="mt-3 text-xs text-slate-500">
              Scope: {selected.scope} - score:{' '}
              {selected.overallScore === null ? 'provisional' : selected.overallScore.toFixed(1)} -
              coverage {selected.coveragePct}%
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={runPreview}
              disabled={!assessmentId || !writable}
              loading={busy}
            >
              <Eye className="h-4 w-4" /> Preview contents
            </Button>
            <Button onClick={generate} disabled={!assessmentId || !writable} loading={busy}>
              <FileText className="h-4 w-4" /> Generate PDF
            </Button>
          </div>

          {error && (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}

          {preview && (
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Preview - {preview.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {preview.blocks.length} content blocks - report {preview.reportKey} - customer{' '}
                {preview.customer.name}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {preview.blocks.slice(0, 12).map((block, i) => (
                  <li key={i} className="truncate">
                    <span className="font-medium uppercase text-slate-400">{block.kind}:</span>{' '}
                    {block.kind === 'heading' || block.kind === 'paragraph'
                      ? block.text
                      : block.kind === 'kv'
                        ? `${block.pairs.length} fields`
                        : block.kind === 'table'
                          ? `${block.rows.length} rows x ${block.headers.length} columns`
                          : block.kind === 'bullets'
                            ? `${block.items.length} items`
                            : block.kind === 'chart'
                              ? block.title
                              : 'page break'}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                The PDF renders the same stored data shown above - no screenshots and no sample
                text.
              </p>
            </div>
          )}
        </Card>

        <Card title="Report types">
          <ul className="space-y-3 text-sm text-slate-600">
            <li>
              <strong className="text-slate-900">Executive</strong>
              <p>
                Score, interpretation, strengths and weaknesses, prioritised recommendations and
                next steps.
              </p>
            </li>
            <li>
              <strong className="text-slate-900">Technical</strong>
              <p>
                Methodology, control results, full finding detail with evidence, status and
                verification.
              </p>
            </li>
            <li>
              <strong className="text-slate-900">Remediation status</strong>
              <p>
                Findings by severity and status, overdue items, progress and management attention
                list.
              </p>
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Every generated report stores a snapshot, so later changes to the assessment do not
            alter an issued report.
          </p>
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Report history">
          {reports.loading && <Spinner label="Loading reports" />}
          {reports.error && (
            <ErrorState message={reports.error.message} onRetry={reports.refetch} />
          )}
          {reports.data && reports.data.items.length === 0 && (
            <EmptyState
              title="No reports yet"
              description="Generated reports are listed here with their snapshot metadata."
            />
          )}
          {reports.data && reports.data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Report</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Assessment</th>
                    <th className="py-2 pr-3">Generated</th>
                    <th className="py-2 pr-3">By</th>
                    <th className="py-2 text-right">Files</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reports.data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 pr-3">
                        <Link
                          to={`/reports/${r.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {r.reportKey}
                        </Link>
                        <p className="max-w-xs truncate text-xs text-slate-500">{r.title}</p>
                      </td>
                      <td className="py-3 pr-3 text-xs">{label(r.type)}</td>
                      <td className="py-3 pr-3 text-xs">{r.customerName}</td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {r.assessmentTitle ?? '-'}
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {formatDateTime(r.generatedAt)}
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {r.generatedByName ?? '-'}
                      </td>
                      <td className="py-3 text-right">
                        {r.status === 'generated' ? (
                          <a href={apiUrl(`/reports/${r.id}/download`)}>
                            <Button variant="secondary" size="sm">
                              <Download className="h-3.5 w-3.5" /> PDF
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-red-700">Failed: {r.errorMessage}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
