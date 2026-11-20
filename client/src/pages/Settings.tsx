import { useEffect, useState } from 'react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { formatApiError, useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { isAdmin, useAuth } from '../auth';
import type { Category, Control } from '../../../shared/types';

interface ScoringResponse {
  settings: {
    coverageThreshold: number;
    rubric: { effective: number; partially_effective: number; ineffective: number };
  };
  categories: Category[];
  weights: Record<string, number>;
}

export default function Settings() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const { data, error, loading, refetch } = useApi<ScoringResponse>('/settings/scoring');
  const controls = useApi<{ items: Control[] }>('/settings/controls');

  const [weights, setWeights] = useState<Record<string, number>>({});
  const [threshold, setThreshold] = useState(80);
  const [rubric, setRubric] = useState({ effective: 100, partially_effective: 50, ineffective: 0 });
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setWeights(data.weights);
      setThreshold(data.settings.coverageThreshold);
      setRubric(data.settings.rubric);
    }
  }, [data]);

  if (loading) return <Spinner label="Loading settings" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api('/settings/scoring', {
        method: 'PUT',
        body: { weights, coverageThreshold: threshold, rubric },
      });
      setMessage({
        tone: 'success',
        text: 'Scoring configuration saved. Completed assessments keep their frozen snapshots and are not recalculated.',
      });
      refetch();
    } catch (err) {
      setMessage({ tone: 'danger', text: formatApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const saveControl = async (control: Control, patch: Partial<Control>) => {
    try {
      await api(`/settings/controls/${control.id}`, { method: 'PATCH', body: patch });
      setMessage({ tone: 'success', text: `${control.controlKey} updated` });
      controls.refetch();
    } catch (err) {
      setMessage({ tone: 'danger', text: formatApiError(err) });
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Scoring configuration and control library"
        actions={
          !admin ? (
            <span className="text-xs text-slate-500">Administrator only for changes</span>
          ) : undefined
        }
      />

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <Card
        title="Scoring configuration"
        description="Weights must be whole numbers totalling 100. Historical assessments keep the methodology they were completed with."
      >
        {!admin && (
          <div className="mb-4">
            <Notice tone="info">Your role can view this configuration but cannot change it.</Notice>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {data.categories.map((category) => (
            <Field
              key={category.id}
              label={`${category.name} weight (%)`}
              htmlFor={`w-${category.categoryKey}`}
              hint={category.description}
            >
              <Input
                id={`w-${category.categoryKey}`}
                type="number"
                min={0}
                max={100}
                disabled={!admin}
                value={weights[category.categoryKey] ?? 0}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, [category.categoryKey]: Number(e.target.value) }))
                }
              />
            </Field>
          ))}
          <Field
            label="Coverage threshold for a final score (%)"
            htmlFor="threshold"
            hint="Below this coverage the score stays provisional."
          >
            <Input
              id="threshold"
              type="number"
              min={0}
              max={100}
              disabled={!admin}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Effective" htmlFor="r-eff">
              <Input
                id="r-eff"
                type="number"
                min={0}
                max={100}
                disabled={!admin}
                value={rubric.effective}
                onChange={(e) => setRubric((r) => ({ ...r, effective: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Partial" htmlFor="r-part">
              <Input
                id="r-part"
                type="number"
                min={0}
                max={100}
                disabled={!admin}
                value={rubric.partially_effective}
                onChange={(e) =>
                  setRubric((r) => ({ ...r, partially_effective: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label="Ineffective" htmlFor="r-ineff">
              <Input
                id="r-ineff"
                type="number"
                min={0}
                max={100}
                disabled={!admin}
                value={rubric.ineffective}
                onChange={(e) => setRubric((r) => ({ ...r, ineffective: Number(e.target.value) }))}
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} loading={saving} disabled={!admin}>
            Save configuration
          </Button>
          <span
            className={`text-sm font-semibold ${total === 100 ? 'text-emerald-700' : 'text-red-700'}`}
          >
            Total weight: {total}% {total === 100 ? '(valid)' : '(must equal 100%)'}
          </span>
        </div>
      </Card>

      <div className="mt-5">
        <Card
          title="Control library"
          description="Maintain controls without touching source code. Changes apply to future assessments."
        >
          {controls.loading && <Spinner label="Loading controls" />}
          {controls.error && (
            <ErrorState message={controls.error.message} onRetry={controls.refetch} />
          )}
          {controls.data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Key</th>
                    <th className="py-2 pr-3">Control</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Weight</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {controls.data.items.map((control) => (
                    <tr key={control.id}>
                      <td className="py-2 pr-3 text-xs text-slate-500">{control.controlKey}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-900">{control.name}</p>
                        <p className="max-w-lg text-xs text-slate-500">{control.description}</p>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{control.categoryName}</td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          disabled={!admin}
                          value={control.weight}
                          className="w-20"
                          onChange={(e) => saveControl(control, { weight: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={control.active ? 'active' : 'archived'} />
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!admin}
                          onClick={() => saveControl(control, { active: !control.active })}
                        >
                          {control.active ? 'Deactivate' : 'Activate'}
                        </Button>
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
