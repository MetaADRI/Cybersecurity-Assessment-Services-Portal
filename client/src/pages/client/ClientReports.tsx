import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import type { ClientReportSummary } from '../../../../shared/client-types';
import { FREE_SERVICE_COPY } from '../../../../shared/free-services';
import { clientApi, formatPublicError } from '../../lib/public-api';
import { ClientPageHeader } from '../../components/ClientLayout';
import { EmptyState, ErrorState, Spinner } from '../../components/ui';
import { formatDateTime, scoreColor } from '../../lib/format';

export default function ClientReports() {
  const [items, setItems] = useState<ClientReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    clientApi<{ items: ClientReportSummary[] }>('/reports')
      .then((response) => setItems(response.items))
      .catch((err) => setError(formatPublicError(err)));
  };

  useEffect(load, []);

  if (!items && !error) return <Spinner label="Loading your reports" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <ClientPageHeader title="Reports" subtitle="Download the PDF records tied to your account." />

      {!items || items.length === 0 ? (
        <EmptyState
          title="No reports available"
          description="Reports are created when you run a free check while signed in or linked to an account."
          action={
            <Link
              to="/free/website_check"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Run a free check
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((report) => (
            <article
              key={report.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">
                    {report.serviceKey
                      ? (FREE_SERVICE_COPY[report.serviceKey]?.name ?? report.serviceKey)
                      : 'Security report'}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {report.target ?? 'Self-assessment'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(report.createdAt)}</p>
                  {report.score !== null && (
                    <p
                      className="mt-2 text-xs font-semibold"
                      style={{ color: scoreColor(report.score) }}
                    >
                      Score {report.score}
                    </p>
                  )}
                </div>
              </div>
              <a
                href={report.downloadUrl}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> PDF
              </a>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
