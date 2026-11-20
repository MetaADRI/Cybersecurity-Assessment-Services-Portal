import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ClipboardList,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { StaffServiceRequest } from '../../../shared/client-types';
import { SERVICE_REQUEST_STATUSES, type ServiceRequestStatus } from '../../../shared/constants';
import { canWrite, useAuth } from '../auth';
import { api, ApiError } from '../lib/api';
import { PageHeader } from '../components/Layout';
import {
  EmptyState,
  ErrorState,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { formatDateTime, label } from '../lib/format';

interface Assignee {
  id: string;
  name: string;
  role: string;
}

interface Draft {
  status: ServiceRequestStatus;
  assignedTo: string;
  staffNote: string;
}

const CONTACT_ICON = {
  email: Mail,
  phone: Phone,
  whatsapp: MessageSquare,
};

export default function ServiceRequests() {
  const { user } = useAuth();
  const writable = canWrite(user);
  const [items, setItems] = useState<StaffServiceRequest[] | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ServiceRequestStatus>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [requests, staff] = await Promise.all([
        api<{ items: StaffServiceRequest[] }>('/service-requests'),
        api<{ items: Assignee[] }>('/service-requests/assignees'),
      ]);
      setItems(requests.items);
      setAssignees(staff.items);
      setDrafts(
        Object.fromEntries(
          requests.items.map((item) => [
            item.id,
            {
              status: item.status,
              assignedTo: item.assignedTo ?? '',
              staffNote: item.staffNote ?? '',
            },
          ]),
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'Could not load requests',
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!term) return true;
      return [
        item.clientName,
        item.clientEmail,
        item.clientCompany,
        item.serviceName,
        item.message,
        item.freeTarget,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [items, search, statusFilter]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: items?.length ?? 0 };
    for (const status of SERVICE_REQUEST_STATUSES) {
      base[status] = (items ?? []).filter((item) => item.status === status).length;
    }
    return base;
  }, [items]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setNotice(null);
  };

  const save = async (item: StaffServiceRequest) => {
    const draft = drafts[item.id];
    if (!draft) return;
    setSavingId(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ request: StaffServiceRequest }>(`/service-requests/${item.id}`, {
        method: 'PATCH',
        body: {
          status: draft.status,
          assignedTo: draft.assignedTo || null,
          staffNote: draft.staffNote,
        },
      });
      setItems((prev) =>
        prev ? prev.map((row) => (row.id === item.id ? response.request : row)) : prev,
      );
      setDrafts((prev) => ({
        ...prev,
        [item.id]: {
          status: response.request.status,
          assignedTo: response.request.assignedTo ?? '',
          staffNote: response.request.staffNote ?? '',
        },
      }));
      setNotice(`Updated request for ${response.request.serviceName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request');
    } finally {
      setSavingId(null);
    }
  };

  if (!items && !error) return <Spinner label="Loading service requests" />;
  if (error && !items) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <>
      <PageHeader
        title="Service requests & leads"
        subtitle="Requests from client accounts and high-intent free-check visitors. Review, assign and respond."
        actions={
          <span className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600">
            {counts.all} total · {counts.new ?? 0} new
          </span>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} />
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search client, company, service or target"
            className="pl-9"
            aria-label="Search service requests"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | ServiceRequestStatus)}
          className="w-auto min-w-40"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {SERVICE_REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {label(status)} ({counts[status] ?? 0})
            </option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No matching requests"
          description={
            items && items.length > 0
              ? 'Try a different search term or status filter.'
              : 'Client service requests and qualified free-check leads will appear here.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const draft = drafts[item.id] ?? {
              status: item.status,
              assignedTo: item.assignedTo ?? '',
              staffNote: item.staffNote ?? '',
            };
            const dirty =
              draft.status !== item.status ||
              draft.assignedTo !== (item.assignedTo ?? '') ||
              draft.staffNote !== (item.staffNote ?? '');
            const ContactIcon = CONTACT_ICON[item.contactPreference];
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-blue-300">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900">{item.serviceName}</h2>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(item.createdAt)} ·{' '}
                        <span className="inline-flex items-center gap-1">
                          <ContactIcon className="h-3 w-3" /> {label(item.contactPreference)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {item.freeScore !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Free score{' '}
                        {item.freeScore}
                      </span>
                    ) : (
                      <span>No linked free result</span>
                    )}
                    {item.freeTarget && (
                      <p className="mt-1 max-w-52 truncate" title={item.freeTarget}>
                        {item.freeTarget}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <Building2 className="h-3.5 w-3.5" /> Lead
                    </p>
                    {item.clientName || item.clientEmail ? (
                      <>
                        <p className="mt-1 font-medium text-slate-800">
                          {item.clientName ?? 'Client account'}
                        </p>
                        {item.clientCompany && <p className="text-xs">{item.clientCompany}</p>}
                        {item.clientEmail && <p className="text-xs">{item.clientEmail}</p>}
                      </>
                    ) : (
                      <p className="mt-1 text-xs">Anonymous free-check visitor</p>
                    )}
                    {item.message && (
                      <div className="mt-3 border-t border-slate-200 pt-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Message
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm leading-6">{item.message}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-600">
                        Status
                        <Select
                          value={draft.status}
                          disabled={!writable || savingId === item.id}
                          onChange={(event) =>
                            updateDraft(item.id, {
                              status: event.target.value as ServiceRequestStatus,
                            })
                          }
                          className="mt-1"
                        >
                          {SERVICE_REQUEST_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        Assigned to
                        <Select
                          value={draft.assignedTo}
                          disabled={!writable || savingId === item.id}
                          onChange={(event) =>
                            updateDraft(item.id, { assignedTo: event.target.value })
                          }
                          className="mt-1"
                        >
                          <option value="">Unassigned</option>
                          {assignees.map((assignee) => (
                            <option key={assignee.id} value={assignee.id}>
                              {assignee.name} ({label(assignee.role)})
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                    <label className="block text-xs font-medium text-slate-600">
                      Internal / client-visible note
                      <Textarea
                        rows={2}
                        value={draft.staffNote}
                        disabled={!writable || savingId === item.id}
                        onChange={(event) =>
                          updateDraft(item.id, { staffNote: event.target.value })
                        }
                        className="mt-1"
                        maxLength={1000}
                        placeholder="Short update shown to the client in their portal."
                      />
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        Updated {formatDateTime(item.updatedAt)}
                        {item.assignedToName ? ` · ${item.assignedToName}` : ''}
                      </p>
                      <div className="flex items-center gap-2">
                        {item.freeTarget && item.freeTarget.startsWith('http') && (
                          <a
                            href={item.freeTarget}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            Target <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={!writable || savingId === item.id || !dirty}
                          onClick={() => void save(item)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingId === item.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {savingId === item.id ? 'Saving' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
