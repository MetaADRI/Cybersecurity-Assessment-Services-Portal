import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Download, FileText, ShieldAlert, Sparkles } from 'lucide-react';
import type { ClientDashboardData } from '../../../../shared/client-types';
import { FREE_SERVICE_COPY } from '../../../../shared/free-services';
import { clientApi, formatPublicError } from '../../lib/public-api';
import { ClientPageHeader } from '../../components/ClientLayout';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '../../components/ui';
import { formatDateTime, scoreColor } from '../../lib/format';

export default function ClientDashboard() {
  const [data, setData] = useState<ClientDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    clientApi<ClientDashboardData>('/dashboard')
      .then(setData)
      .catch((err) => setError(formatPublicError(err)));
  };

  useEffect(load, []);

  if (!data && !error) return <Spinner label="Loading your dashboard" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const latest = data.latestRun;
  const result = latest?.result;
  const firstName = data.user.name.split(' ')[0];

  return (
    <>
      <ClientPageHeader
        title={`Good to see you, ${firstName}`}
        subtitle={`${data.user.company} - your free checks, reports and service requests in one place.`}
        actions={
          <Link
            to="/client/services"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Browse services <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Latest free result</h2>
            {latest && (
              <span className="text-xs text-slate-500">{formatDateTime(latest.createdAt)}</span>
            )}
          </div>
          {!latest || !result ? (
            <div className="mt-4">
              <EmptyState
                title="No free result yet"
                description="Your free checks will appear here after you run one from the public site."
                action={
                  <Link
                    to="/free/website_check"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Run a free check
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <div
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(${scoreColor(result.score)} ${result.score * 3.6}deg, var(--od-border) 0deg)`,
                }}
              >
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-2xl font-semibold text-slate-900">{result.score}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    Grade {result.grade}
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {FREE_SERVICE_COPY[latest.serviceKey]?.name ?? latest.serviceKey}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {latest.target ?? 'Self-assessment'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{result.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/client/reports`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> View reports
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Recommended next steps</h2>
          <p className="mt-1 text-xs text-slate-500">Based on your latest result.</p>
          <div className="mt-4 space-y-2">
            {data.recommended.map((service) => (
              <Link
                key={service.key}
                to={`/client/services?service=${service.key}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{service.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{service.tagline}</p>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ClipboardList className="h-4 w-4 text-blue-600" /> Service requests
            </h2>
            <Link to="/client/requests" className="text-xs font-medium text-blue-600">
              View all
            </Link>
          </div>
          {data.requests.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No requests yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.requests.slice(0, 3).map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{request.serviceName}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(request.createdAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileText className="h-4 w-4 text-blue-600" /> Reports
            </h2>
            <Link to="/client/reports" className="text-xs font-medium text-blue-600">
              View all
            </Link>
          </div>
          {data.reports.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Your reports will appear here.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.reports.slice(0, 3).map((report) => (
                <a
                  key={report.id}
                  href={report.downloadUrl}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:border-blue-300"
                >
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {report.serviceKey
                          ? (FREE_SERVICE_COPY[report.serviceKey]?.name ?? report.serviceKey)
                          : 'Security report'}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(report.createdAt)}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-600">PDF</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Free checks are point-in-time risk indicators, not penetration tests. Use the recommended
          service when you need assurance, evidence or help fixing the finding.
        </p>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <Sparkles className="h-3.5 w-3.5" /> Tip: keep your contact details current so we can reach
        you about open requests.
      </p>
    </>
  );
}
