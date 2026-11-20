import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Card, ErrorState, Pagination, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../lib/format';
import type { AuditEvent } from '../../../shared/types';

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1');
  const { data, error, loading, refetch } = useApi<{
    items: AuditEvent[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/settings/audit?page=${page}&pageSize=30`);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Security-relevant actions recorded by the application. There is no API to edit or delete these records."
      />
      <Card>
        {loading && <Spinner label="Loading audit log" />}
        {error && <ErrorState message={error.message} onRetry={refetch} />}
        {data && (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Entity</th>
                  <th className="py-2">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {e.actorEmail ?? 'Anonymous'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                        {e.action}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {e.entityType}
                      {e.entityId ? ` (${e.entityId.slice(0, 8)})` : ''}
                    </td>
                    <td className="py-2 text-xs text-slate-700">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data.page ?? page}
              pageSize={data.pageSize ?? 30}
              total={data.total}
              onPage={(p) => {
                const next = new URLSearchParams(params);
                next.set('page', String(p));
                setParams(next, { replace: true });
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
