import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { History, MessageSquare, Save } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  PriorityBadge,
  Select,
  SeverityBadge,
  Spinner,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { formatApiError, useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { zodResolver } from '../lib/zodResolver';
import { findingSchema, progressNoteSchema } from '../../../shared/schemas';
import type { z } from 'zod';
import { formatDate, formatDateTime, label } from '../lib/format';
import { canWrite, useAuth } from '../auth';
import {
  BUSINESS_IMPACT,
  EXPLOITABILITY,
  EXPOSURE,
  FINDING_TRANSITIONS,
  PRIORITIES,
  SEVERITIES,
} from '../../../shared/constants';
import type { Finding, RemediationActivity, StatusHistoryEntry } from '../../../shared/types';

interface DetailResponse {
  finding: Finding;
  history: StatusHistoryEntry[];
  activities: RemediationActivity[];
  suggestedPriority: { score: number; priority: string };
}

type FindingForm = z.infer<typeof findingSchema>;
type NoteForm = z.infer<typeof progressNoteSchema>;

export default function FindingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const writable = canWrite(user);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const { data, error, loading, refetch } = useApi<DetailResponse>(
    id ? `/findings/${id}?v=${refresh}` : null,
  );

  const bump = () => setRefresh((r) => r + 1);

  if (loading) return <Spinner label="Loading finding" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  const { finding, history, activities, suggestedPriority } = data;
  const allowedTransitions = FINDING_TRANSITIONS[finding.status] ?? [];

  return (
    <>
      <PageHeader
        title={`${finding.findingKey} - ${finding.title}`}
        subtitle={`${finding.customerName}${finding.assessmentTitle ? ` - ${finding.assessmentTitle}` : ''} - discovered ${formatDate(finding.discoveredDate)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/customers/${finding.customerId}`}>
              <span className="inline-block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Customer
              </span>
            </Link>
            {writable && (
              <Button
                variant={editing ? 'secondary' : 'primary'}
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? 'Close editor' : 'Edit finding'}
              </Button>
            )}
          </div>
        }
      />

      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Finding details">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <PriorityBadge priority={finding.priority} />
              <StatusBadge status={finding.status} />
              {finding.prioritySource === 'manual' && (
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  Analyst-confirmed priority
                </span>
              )}
              {finding.prioritySource === 'calculated' && (
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                  Suggested priority (score {suggestedPriority.score})
                </span>
              )}
              {finding.overdue && (
                <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  Overdue
                </span>
              )}
              {finding.isDemo && (
                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  Demo
                </span>
              )}
            </div>

            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt>
                <dd className="whitespace-pre-wrap text-slate-700">{finding.description}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Evidence</dt>
                <dd className="whitespace-pre-wrap text-slate-700">
                  {finding.evidence ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Recommended remediation
                </dt>
                <dd className="whitespace-pre-wrap text-slate-700">
                  {finding.recommendedRemediation ?? 'Not provided'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Resolution notes</dt>
                <dd className="whitespace-pre-wrap text-slate-700">
                  {finding.resolutionNotes ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Verification evidence
                </dt>
                <dd className="whitespace-pre-wrap text-slate-700">
                  {finding.verificationEvidence ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  External reference
                </dt>
                <dd className="text-slate-700">{finding.externalRef ?? 'None'}</dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Affected asset</p>
                <p className="text-slate-700">{finding.asset ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Component</p>
                <p className="text-slate-700">{finding.component ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Assignee</p>
                <p className="text-slate-700">{finding.assigneeName ?? 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Target date</p>
                <p className={finding.overdue ? 'font-medium text-red-700' : 'text-slate-700'}>
                  {finding.targetDate ? formatDate(finding.targetDate) : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Resolved at</p>
                <p className="text-slate-700">
                  {finding.resolvedAt ? formatDateTime(finding.resolvedAt) : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Priority factors</p>
                <p className="text-slate-700">
                  {label(finding.exploitability)} / {label(finding.exposure)} /{' '}
                  {label(finding.businessImpact)}
                </p>
              </div>
            </div>
          </Card>

          {editing && writable && (
            <EditFinding
              finding={finding}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setNotice({ tone: 'success', text: 'Finding updated' });
                bump();
              }}
              onError={(message) => setNotice({ tone: 'danger', text: message })}
            />
          )}

          <Card
            title="Status change"
            description="Transitions are validated on the server. Resolution and acceptance require evidence."
          >
            {!writable ? (
              <Notice tone="info">Read-only reviewers cannot change finding status.</Notice>
            ) : (
              <StatusFormPanel
                finding={finding}
                allowed={allowedTransitions}
                onDone={(message) => {
                  setNotice({ tone: 'success', text: message });
                  bump();
                }}
                onError={(message) => setNotice({ tone: 'danger', text: message })}
              />
            )}
          </Card>

          <Card title="Change history" description="Every status change is recorded and preserved">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                  <p className="text-slate-800">
                    {h.fromStatus ? `${label(h.fromStatus)} -> ` : ''}
                    <strong>{label(h.toStatus)}</strong>
                  </p>
                  {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
                  <p className="text-xs text-slate-400">
                    {formatDateTime(h.changedAt)} - {h.changedByName ?? 'System'}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Add progress note">
            {!writable ? (
              <Notice tone="info">Read-only reviewers cannot add notes.</Notice>
            ) : (
              <NoteFormPanel
                findingId={finding.id}
                onDone={() => {
                  setNotice({ tone: 'success', text: 'Progress note added' });
                  bump();
                }}
                onError={(message) => setNotice({ tone: 'danger', text: message })}
              />
            )}
            <ul className="mt-4 space-y-3">
              {activities.length === 0 && (
                <li className="text-sm text-slate-500">No progress notes yet.</li>
              )}
              {activities.map((a) => (
                <li key={a.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="whitespace-pre-wrap text-slate-700">{a.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    <MessageSquare className="mr-1 inline h-3 w-3" />
                    {formatDateTime(a.createdAt)} - {a.authorName ?? 'System'}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Assessment context">
            {finding.assessmentId ? (
              <Link
                to={`/assessments/${finding.assessmentId}`}
                className="text-sm text-blue-600 hover:underline"
              >
                {finding.assessmentTitle} - open assessment
              </Link>
            ) : (
              <p className="text-sm text-slate-500">This finding is not linked to an assessment.</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              <History className="mr-1 inline h-3 w-3" />
              Created {formatDateTime(finding.createdAt)} - last updated{' '}
              {formatDateTime(finding.updatedAt)}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function EditFinding({
  finding,
  onCancel,
  onSaved,
  onError,
}: {
  finding: Finding;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FindingForm>({
    resolver: zodResolver<FindingForm>(findingSchema),
    defaultValues: {
      customerId: finding.customerId,
      assessmentId: finding.assessmentId,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      priority: finding.prioritySource === 'manual' ? finding.priority : undefined,
      priorityJustification: finding.priorityJustification ?? '',
      exploitability: finding.exploitability,
      exposure: finding.exposure,
      businessImpact: finding.businessImpact,
      compensatingControls: finding.compensatingControls ?? '',
      evidence: finding.evidence ?? '',
      asset: finding.asset ?? '',
      component: finding.component ?? '',
      assigneeId: finding.assigneeId,
      recommendedRemediation: finding.recommendedRemediation ?? '',
      targetDate: finding.targetDate ?? '',
      externalRef: finding.externalRef ?? '',
      discoveredDate: finding.discoveredDate,
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await api(`/findings/${finding.id}`, { method: 'PATCH', body: values });
      onSaved();
    } catch (err) {
      onError(formatApiError(err));
    }
  });

  return (
    <Card title="Edit finding">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" htmlFor="f-title" error={errors.title?.message} required>
            <Input id="f-title" {...register('title')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="f-desc" error={errors.description?.message} required>
            <Textarea id="f-desc" rows={4} {...register('description')} />
          </Field>
        </div>
        <Field label="Severity" htmlFor="f-sev" error={errors.severity?.message}>
          <Select id="f-sev" {...register('severity')}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Priority override"
          htmlFor="f-prio"
          error={errors.priority?.message}
          hint="Leave as suggested unless you have evidence to override it."
        >
          <Select id="f-prio" {...register('priority')}>
            <option value="">Use calculated priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Priority justification"
            htmlFor="f-prio-just"
            error={errors.priorityJustification?.message}
            hint="Required whenever the calculated priority is overridden."
          >
            <Textarea id="f-prio-just" rows={2} {...register('priorityJustification')} />
          </Field>
        </div>
        <Field label="Exploitability" htmlFor="f-exp" error={errors.exploitability?.message}>
          <Select id="f-exp" {...register('exploitability')}>
            {EXPLOITABILITY.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Exposure" htmlFor="f-expos" error={errors.exposure?.message}>
          <Select id="f-expos" {...register('exposure')}>
            {EXPOSURE.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Business impact" htmlFor="f-impact" error={errors.businessImpact?.message}>
          <Select id="f-impact" {...register('businessImpact')}>
            {BUSINESS_IMPACT.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee" htmlFor="f-assignee" error={errors.assigneeId?.message}>
          <AssigneeSelect register={register} />
        </Field>
        <Field label="Target date" htmlFor="f-target" error={errors.targetDate?.message}>
          <Input id="f-target" type="date" {...register('targetDate')} />
        </Field>
        <Field label="External reference" htmlFor="f-ref" error={errors.externalRef?.message}>
          <Input id="f-ref" {...register('externalRef')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Evidence" htmlFor="f-evidence" error={errors.evidence?.message}>
            <Textarea id="f-evidence" rows={3} {...register('evidence')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Recommended remediation"
            htmlFor="f-rem"
            error={errors.recommendedRemediation?.message}
          >
            <Textarea id="f-rem" rows={3} {...register('recommendedRemediation')} />
          </Field>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={isSubmitting}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AssigneeSelect({
  register,
}: {
  register: ReturnType<typeof useForm<FindingForm>>['register'];
}) {
  const users = useApi<{ items: { id: string; fullName: string }[] }>('/users/options');
  return (
    <Select id="f-assignee" {...register('assigneeId')}>
      <option value="">Unassigned</option>
      {users.data?.items.map((u) => (
        <option key={u.id} value={u.id}>
          {u.fullName}
        </option>
      ))}
    </Select>
  );
}

function StatusFormPanel({
  finding,
  allowed,
  onDone,
  onError,
}: {
  finding: Finding;
  allowed: string[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState(allowed[0] ?? '');
  const [note, setNote] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [verificationEvidence, setVerificationEvidence] = useState('');
  const [riskJustification, setRiskJustification] = useState('');
  const [riskDecisionMaker, setRiskDecisionMaker] = useState('');
  const [riskReviewDate, setRiskReviewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/findings/${finding.id}/status`, {
        method: 'POST',
        body: {
          status,
          note: note || undefined,
          resolutionNotes: resolutionNotes || undefined,
          verificationEvidence: verificationEvidence || undefined,
          riskJustification: riskJustification || undefined,
          riskDecisionMaker: riskDecisionMaker || undefined,
          riskReviewDate: riskReviewDate || undefined,
        },
      });
      onDone(`Finding moved to ${label(status)}`);
      setNote('');
      setResolutionNotes('');
      setVerificationEvidence('');
      setRiskJustification('');
      setRiskDecisionMaker('');
    } catch (err) {
      const message = formatApiError(err);
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        This finding is in a terminal state with no further transitions.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Next status" htmlFor="next-status" required>
        <Select id="next-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {allowed.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </Select>
      </Field>

      {status === 'resolved' && (
        <>
          <Field
            label="Resolution notes"
            htmlFor="res-notes"
            required
            hint="A status change alone does not prove the issue is fixed."
          >
            <Textarea
              id="res-notes"
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </Field>
          <Field
            label="Verification evidence"
            htmlFor="res-ev"
            hint="How the fix was independently confirmed."
          >
            <Textarea
              id="res-ev"
              rows={2}
              value={verificationEvidence}
              onChange={(e) => setVerificationEvidence(e.target.value)}
            />
          </Field>
        </>
      )}

      {status === 'accepted_risk' && (
        <>
          <Field label="Justification" htmlFor="risk-just" required>
            <Textarea
              id="risk-just"
              rows={3}
              value={riskJustification}
              onChange={(e) => setRiskJustification(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Decision maker" htmlFor="risk-dm" required>
              <Input
                id="risk-dm"
                value={riskDecisionMaker}
                onChange={(e) => setRiskDecisionMaker(e.target.value)}
              />
            </Field>
            <Field label="Review date" htmlFor="risk-review">
              <Input
                id="risk-review"
                type="date"
                value={riskReviewDate}
                onChange={(e) => setRiskReviewDate(e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {status === 'false_positive' && (
        <Field label="Explanation" htmlFor="fp-note" required>
          <Textarea id="fp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}

      {!['resolved', 'accepted_risk', 'false_positive'].includes(status) && (
        <Field label="Note (optional)" htmlFor="status-note">
          <Textarea
            id="status-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      )}

      <Button onClick={submit} loading={busy} disabled={!status}>
        Apply status change
      </Button>
      <p className="text-xs text-slate-500">
        Allowed from {label(finding.status)}: {allowed.map(label).join(', ')}
      </p>
    </div>
  );
}

function NoteFormPanel({
  findingId,
  onDone,
  onError,
}: {
  findingId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NoteForm>({ resolver: zodResolver<NoteForm>(progressNoteSchema) });

  const submit = handleSubmit(async (values) => {
    try {
      await api(`/findings/${findingId}/activities`, { method: 'POST', body: values });
      reset();
      onDone();
    } catch (err) {
      onError(formatApiError(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Progress note" htmlFor="note" error={errors.body?.message} required>
        <Textarea
          id="note"
          rows={3}
          {...register('body')}
          placeholder="What changed, what is blocking, what happens next"
        />
      </Field>
      <div className="mt-2">
        <Button type="submit" loading={isSubmitting} size="sm">
          Add note
        </Button>
      </div>
    </form>
  );
}
