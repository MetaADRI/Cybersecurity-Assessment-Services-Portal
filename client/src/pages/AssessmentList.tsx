import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { qs, type Paginated } from '../lib/api';
import { formatDate } from '../lib/format';
import { canWrite, useAuth } from '../auth';
import type { Assessment } from '../../../shared/types';

export default function AssessmentList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const customerId = params.get('customerId') ?? '';
  const page = Number(params.get('page') ?? '1');

  const { data, error, loading, refetch } = useApi<Paginated<Assessment> & { items: Assessment[] }>(
    `/assessments${qs({ status, customerId, page, pageSize: 15 })}`,
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Assessments"
        subtitle="Draft, in-progress and completed assessments across all customers"
        actions={
          canWrite(user) ? (
            <Link to="/assessments/new">
              <Button>
                <Plus className="h-4 w-4" /> New assessment
              </Button>
            </Link>
          ) : undefined
        }
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Select
            aria-label="Status filter"
            value={status}
            onChange={(e) => setParam('status', e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
          {customerId && (
            <Button variant="secondary" onClick={() => setParam('customerId', '')}>
              Clear customer filter
            </Button>
          )}
        </div>

        {loading && <Spinner label="Loading assessments" />}
        {error && <ErrorState message={error.message} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState
            title="No assessments"
            description="Assessments you create will appear here."
            action={
              canWrite(user) ? (
                <Link to="/assessments/new">
                  <Button>New assessment</Button>
                </Link>
              ) : undefined
            }
          />
        )}

        {data && data.items.length > 0 && (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Key</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Score</th>
                  <th className="py-2 text-right">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3 text-xs text-slate-500">{a.assessmentKey}</td>
                    <td className="py-3 pr-3">
                      <Link
                        to={`/assessments/${a.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600"
                      >
                        {a.title}
                      </Link>
                      <p className="text-xs text-slate-500">{a.assessor}</p>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">
                      <Link to={`/customers/${a.customerId}`} className="hover:text-blue-600">
                        {a.customerName}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500">
                      {formatDate(a.assessmentDate)}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold">
                      {a.overallScore === null ? (
                        <span className="text-xs text-slate-400">Provisional</span>
                      ) : (
                        a.overallScore.toFixed(1)
                      )}
                    </td>
                    <td className="py-3 text-right text-xs text-slate-500">{a.coveragePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data.page ?? page}
              pageSize={data.pageSize ?? 15}
              total={data.total}
              onPage={(p) => setParam('page', String(p))}
            />
          </>
        )}
      </Card>
    </>
  );
}
