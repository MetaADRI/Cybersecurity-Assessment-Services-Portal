import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, History, Lightbulb } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  ScoreBar,
  SeverityBadge,
  Spinner,
  StatusBadge,
  Textarea,
  Select,
} from '../components/ui';
import { formatApiError, useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatDate, label } from '../lib/format';
import { canWrite, useAuth } from '../auth';
import { CONTROL_STATUSES, scoreBand } from '../../../shared/constants';
import type { Assessment, Finding, ScoreResult } from '../../../shared/types';

interface ControlRow {
  id: string;
  controlId: string;
  controlKey: string;
  controlName: string;
  description: string;
  categoryName: string;
  categoryKey: string;
  status: string;
  score: number | null;
  justification: string | null;
  evidenceNotes: string | null;
  evidenceRef: string | null;
  guidance: string;
  applicability: string;
  evidenceRequirements: string;
  rubric: string;
}

interface Recommendation {
  ruleId: string;
  title: string;
  explanation: string;
  trigger: string;
  priority: string;
  nextSteps: string[];
  timeframe?: string;
}

interface DetailResponse {
  assessment: Assessment;
  controls: ControlRow[];
  score: ScoreResult;
  findings: Finding[];
}

export default function AssessmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const writable = canWrite(user);
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, error, loading, refetch } = useApi<DetailResponse>(
    id ? `/assessments/${id}?v=${refresh}` : null,
  );
  const recommendations = useApi<{ recommendations: Recommendation[] }>(
    id ? `/assessments/${id}/recommendations` : null,
  );

  const saveControl = async (control: ControlRow, values: Record<string, string>) => {
    try {
      await api(`/assessments/${id}/controls/${control.controlId}`, {
        method: 'POST',
        body: values,
      });
      setMessage({ tone: 'success', text: `${control.controlKey} saved` });
      setExpanded(null);
      setRefresh((r) => r + 1);
      recommendations.refetch();
    } catch (err) {
      setMessage({ tone: 'danger', text: formatApiError(err) });
    }
  };

  const complete = async () => {
    try {
      await api(`/assessments/${id}/complete`, { method: 'POST' });
      setMessage({ tone: 'success', text: 'Assessment completed and the score frozen.' });
      setRefresh((r) => r + 1);
    } catch (err) {
      setMessage({ tone: 'danger', text: formatApiError(err) });
    }
  };

  if (loading) return <Spinner label="Loading assessment" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  const { assessment, controls, score, findings } = data;
  const band = score.overallScore !== null ? scoreBand(score.overallScore) : null;
  const editable =
    writable && assessment.status !== 'completed' && assessment.status !== 'archived';

  const categories: { name: string; controls: ControlRow[] }[] = [];
  for (const control of controls) {
    let group = categories.find((c) => c.name === control.categoryName);
    if (!group) {
      group = { name: control.categoryName, controls: [] };
      categories.push(group);
    }
    group.controls.push(control);
  }

  return (
    <>
      <PageHeader
        title={`${assessment.assessmentKey} - ${assessment.title}`}
        subtitle={`${assessment.customerName} - ${label(assessment.type)} - ${formatDate(assessment.assessmentDate)} - assessor: ${assessment.assessor}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/assessments/${id}/history`}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <History className="h-4 w-4" /> Score history
              </span>
            </Link>
            <Link to={`/reports?assessmentId=${id}`}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Generate report
              </span>
            </Link>
            <Link to={`/assessments/${id}/edit`}>
              <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Edit details
              </span>
            </Link>
            {editable && (assessment.status === 'draft' || assessment.status === 'in_progress') && (
              <Button onClick={complete}>
                <CheckCircle2 className="h-4 w-4" /> Complete assessment
              </Button>
            )}
          </div>
        }
      />

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone === 'success' ? 'success' : 'danger'}>{message.text}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Health score" className="lg:col-span-1">
          <div className="flex items-end gap-3">
            <p
              className="text-5xl font-bold"
              style={{ color: score.overallScore !== null ? undefined : 'var(--od-muted)' }}
            >
              {score.overallScore === null ? '--' : score.overallScore.toFixed(1)}
            </p>
            <p className="pb-2 text-sm text-slate-500">
              / 100 {band && <span className="font-medium text-slate-700">- {band.label}</span>}
            </p>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Methodology v{score.methodologyVersion} - calculated{' '}
            {new Date(score.computedAt).toLocaleString()}
          </p>

          <div className="mt-4 space-y-2">
            {score.categories.map((c) => (
              <ScoreBar key={c.categoryId} label={`${c.name} (${c.weight}%)`} value={c.score} />
            ))}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <p>
              Coverage: <strong>{score.coveragePct}%</strong> ({score.assessedControls} of{' '}
              {score.applicableControls} applicable controls assessed)
            </p>
            <p>Unassessed: {score.unassessedControls}</p>
            <p>Not applicable (excluded): {score.notApplicableControls}</p>
          </div>

          {score.eligible ? (
            <div className="mt-3">
              <Notice tone="success">
                Score is final: all eligibility requirements are satisfied.
              </Notice>
            </div>
          ) : (
            <div className="mt-3">
              <Notice tone="warning">
                <p className="font-medium">Provisional score</p>
                <ul className="mt-1 list-disc pl-4">
                  {score.eligibilityReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-5">
          <Card
            title="Findings linked to this assessment"
            actions={
              <Link
                to={`/findings?assessmentId=${id}`}
                className="text-xs font-medium text-blue-600"
              >
                View all
              </Link>
            }
          >
            {findings.length === 0 ? (
              <p className="text-sm text-slate-500">
                No findings recorded yet.{' '}
                <Link to={`/findings/new?assessmentId=${id}`} className="text-blue-600 underline">
                  Add one
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {findings.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                    <Link
                      to={`/findings/${f.id}`}
                      className="min-w-0 truncate text-slate-900 hover:text-blue-600"
                    >
                      {f.findingKey} - {f.title}
                    </Link>
                    <span className="flex shrink-0 gap-2">
                      <SeverityBadge severity={f.severity} />
                      <StatusBadge status={f.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Recommendations"
            description="Rule-based, linked to the recorded control results and findings"
          >
            {recommendations.loading && <Spinner label="Loading recommendations" />}
            {recommendations.data && recommendations.data.recommendations.length === 0 && (
              <p className="text-sm text-slate-500">
                No rule has been triggered by this assessment yet.
              </p>
            )}
            <ul className="space-y-4">
              {recommendations.data?.recommendations.map((r) => (
                <li key={r.ruleId} className="rounded-md border border-slate-200 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Lightbulb className="h-4 w-4 text-blue-600" /> {r.title}
                    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                      {r.priority}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{r.explanation}</p>
                  <ol className="mt-2 list-decimal pl-5 text-sm text-slate-600">
                    {r.nextSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-slate-500">
                    Trigger: {r.trigger}
                    {r.timeframe ? ` - suggested timeframe: ${r.timeframe}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <Card
          title="Control evaluation"
          description="Missing data never counts as a pass. Not applicable requires a justification."
        >
          {!editable && (
            <div className="mb-4">
              <Notice tone="info">
                This assessment is {label(assessment.status)}, so its recorded results are frozen to
                keep the published score reproducible.
              </Notice>
            </div>
          )}

          {categories.map((category) => {
            const assessed = category.controls.filter((c) =>
              ['effective', 'partially_effective', 'ineffective'].includes(c.status),
            );
            const catScore = score.categories.find((s) => s.name === category.name);
            return (
              <div key={category.name} className="mb-6 last:mb-0">
                <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900">{category.name}</h3>
                  <span className="text-xs text-slate-500">
                    {assessed.length}/{category.controls.length} assessed -{' '}
                    {catScore?.score === null || !catScore
                      ? 'no score yet'
                      : `${catScore.score.toFixed(1)}/100`}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {category.controls.map((control) => (
                    <ControlRowItem
                      key={control.controlId}
                      control={control}
                      editable={editable}
                      expanded={expanded === control.controlId}
                      onToggle={() =>
                        setExpanded(expanded === control.controlId ? null : control.controlId)
                      }
                      onSave={saveControl}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}

function ControlRowItem({
  control,
  editable,
  expanded,
  onToggle,
  onSave,
}: {
  control: ControlRow;
  editable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (control: ControlRow, values: Record<string, string>) => Promise<void>;
}) {
  const [status, setStatus] = useState(control.status);
  const [justification, setJustification] = useState(control.justification ?? '');
  const [evidenceNotes, setEvidenceNotes] = useState(control.evidenceNotes ?? '');
  const [evidenceRef, setEvidenceRef] = useState(control.evidenceRef ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const mark = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    await onSave(control, { status, justification, evidenceNotes, evidenceRef });
    setSaving(false);
    setDirty(false);
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            <span className="mr-2 text-xs text-slate-400">{control.controlKey}</span>
            {control.controlName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{control.description}</p>
          <p className="mt-1 text-xs">
            <StatusBadge status={control.status} />
            {control.score !== null && (
              <span className="ml-2 text-slate-500">score {control.score}</span>
            )}
            {!dirty && control.evidenceNotes && (
              <span className="ml-2 text-slate-400">evidence recorded</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button size="sm" onClick={save} loading={saving}>
              Save
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Details
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Result" htmlFor={`status-${control.controlId}`} hint={control.guidance}>
              <Select
                id={`status-${control.controlId}`}
                value={status}
                disabled={!editable}
                onChange={(e) => mark(setStatus)(e.target.value)}
              >
                {CONTROL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Evidence reference"
              htmlFor={`ref-${control.controlId}`}
              hint={control.evidenceRequirements}
            >
              <Input
                id={`ref-${control.controlId}`}
                value={evidenceRef}
                disabled={!editable}
                onChange={(e) => mark(setEvidenceRef)(e.target.value)}
                placeholder="Ticket, document or file reference"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Evidence notes"
                htmlFor={`notes-${control.controlId}`}
                hint={`Applicability: ${control.applicability}`}
              >
                <Textarea
                  id={`notes-${control.controlId}`}
                  rows={3}
                  value={evidenceNotes}
                  disabled={!editable}
                  onChange={(e) => mark(setEvidenceNotes)(e.target.value)}
                />
              </Field>
            </div>
            {status === 'not_applicable' && (
              <div className="sm:col-span-2">
                <Field
                  label="Justification (required for not applicable)"
                  htmlFor={`just-${control.controlId}`}
                  required
                >
                  <Textarea
                    id={`just-${control.controlId}`}
                    rows={2}
                    value={justification}
                    disabled={!editable}
                    onChange={(e) => mark(setJustification)(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
          <div className="mt-3 text-xs text-slate-500">Scoring rubric: {control.rubric}</div>
          {editable && dirty && (
            <div className="mt-3">
              <Button size="sm" onClick={save} loading={saving}>
                Save control result
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
