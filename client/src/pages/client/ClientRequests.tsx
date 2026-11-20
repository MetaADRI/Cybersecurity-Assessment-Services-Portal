import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList } from 'lucide-react';
import type { ClientServiceRequest } from '../../../../shared/client-types';
import { clientApi, formatPublicError } from '../../lib/public-api';
import { ClientPageHeader } from '../../components/ClientLayout';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '../../components/ui';
import { formatDateTime, label } from '../../lib/format';

export default function ClientRequests() {
  const [items, setItems] = useState<ClientServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    clientApi<{ items: ClientServiceRequest[] }>('/requests')
      .then((response) => setItems(response.items))
      .catch((err) => setError(formatPublicError(err)));
  };

  useEffect(load, []);

  if (!items && !error) return <Spinner label="Loading your requests" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <ClientPageHeader
        title="Service requests"
        subtitle="Track what you have asked us to look at and the latest status."
        actions={
          <Link
            to="/client/services"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New request <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {!items || items.length === 0 ? (
        <EmptyState
          title="No service requests yet"
          description="When you ask about a service from the catalogue, it will appear here with its status."
          action={
            <Link
              to="/client/services"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Browse services <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((request) => (
            <article
              key={request.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{request.serviceName}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sent {formatDateTime(request.createdAt)} · Preferred contact:{' '}
                      {label(request.contactPreference)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={request.status} />
              </div>

              {request.message && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  {request.message}
                </div>
              )}

              {request.staffNote && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm text-blue-900">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                    Note from OpenDefenders
                  </p>
                  <p className="mt-1 leading-6">{request.staffNote}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>
                  {request.assignedToName
                    ? `Assigned to ${request.assignedToName}`
                    : 'Waiting for assignment'}
                </span>
                <span>Last updated {formatDateTime(request.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
