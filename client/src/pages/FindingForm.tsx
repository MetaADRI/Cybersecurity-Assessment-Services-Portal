import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  Select,
  Spinner,
  Textarea,
} from '../components/ui';
import { zodResolver } from '../lib/zodResolver';
import { findingSchema, type FindingInput } from '../../../shared/schemas';
import { api, type Paginated } from '../lib/api';
import { useApi, formatApiError } from '../hooks/useApi';
import { todayIso, label } from '../lib/format';
import { SEVERITIES, BUSINESS_IMPACT, EXPLOITABILITY, EXPOSURE } from '../../../shared/constants';
import type { Assessment, Customer, Finding } from '../../../shared/types';

export default function FindingForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetCustomer = params.get('customerId') ?? '';
  const presetAssessment = params.get('assessmentId') ?? '';

  const customers = useApi<Paginated<Customer>>('/customers?pageSize=100&status=active');
  const assessments = useApi<Paginated<Assessment>>(
    presetCustomer
      ? `/assessments?customerId=${presetCustomer}&pageSize=100`
      : '/assessments?pageSize=100',
  );
  const users = useApi<{ items: { id: string; fullName: string }[] }>('/users/options');

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FindingInput>({
    resolver: zodResolver<FindingInput>(findingSchema),
    defaultValues: {
      customerId: presetCustomer,
      assessmentId: presetAssessment || null,
      title: '',
      description: '',
      severity: 'medium',
      asset: '',
      component: '',
      discoveredDate: todayIso(),
      targetDate: '',
      assigneeId: null,
      recommendedRemediation: '',
      evidence: '',
      externalRef: '',
      exploitability: 'unknown',
      exposure: 'unknown',
      businessImpact: 'unknown',
      compensatingControls: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await api<{ finding: Finding }>('/findings', { method: 'POST', body: values });
      navigate(`/findings/${result.finding.id}`);
    } catch (err) {
      const message = formatApiError(err);
      const field = (err as { details?: { path?: string }[] }).details?.[0]?.path;
      if (field) setError(field as keyof FindingInput, { message });
      else setError('root', { message });
    }
  });

  if (customers.loading) return <Spinner label="Loading" />;
  if (customers.error)
    return <ErrorState message={customers.error.message} onRetry={customers.refetch} />;

  return (
    <>
      <PageHeader
        title="New finding"
        subtitle="Only record findings supported by evidence. Do not invent scan results."
      />
      <Card className="max-w-4xl">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {errors.root && (
            <div className="sm:col-span-2">
              <Notice tone="danger">{errors.root.message}</Notice>
            </div>
          )}

          <Field label="Customer" htmlFor="customerId" error={errors.customerId?.message} required>
            <Select id="customerId" {...register('customerId')}>
              <option value="">Select a customer</option>
              {customers.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Linked assessment (optional)"
            htmlFor="assessmentId"
            error={errors.assessmentId?.message}
          >
            <Select id="assessmentId" {...register('assessmentId')}>
              <option value="">Not linked</option>
              {assessments.data?.items
                .filter((a) => !watch('customerId') || a.customerId === watch('customerId'))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assessmentKey} - {a.title}
                  </option>
                ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Title" htmlFor="title" error={errors.title?.message} required>
              <Input
                id="title"
                {...register('title')}
                placeholder="Short statement of the weakness"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field
              label="Description"
              htmlFor="description"
              error={errors.description?.message}
              required
              hint="Describe what was observed and how it was verified."
            >
              <Textarea id="description" rows={4} {...register('description')} />
            </Field>
          </div>

          <Field label="Severity" htmlFor="severity" error={errors.severity?.message} required>
            <Select id="severity" {...register('severity')}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Discovery date"
            htmlFor="discoveredDate"
            error={errors.discoveredDate?.message}
            required
          >
            <Input id="discoveredDate" type="date" {...register('discoveredDate')} />
          </Field>

          <Field label="Affected asset / system" htmlFor="asset" error={errors.asset?.message}>
            <Input id="asset" {...register('asset')} placeholder="srv-web-01" />
          </Field>

          <Field label="Affected component" htmlFor="component" error={errors.component?.message}>
            <Input id="component" {...register('component')} placeholder="Apache httpd" />
          </Field>

          <Field
            label="Target remediation date"
            htmlFor="targetDate"
            error={errors.targetDate?.message}
          >
            <Input id="targetDate" type="date" {...register('targetDate')} />
          </Field>

          <Field label="Assignee" htmlFor="assigneeId" error={errors.assigneeId?.message}>
            <Select id="assigneeId" {...register('assigneeId')}>
              <option value="">Unassigned</option>
              {users.data?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2 border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Priority factors (unknown contributes nothing - no assumptions are made)
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Exploitability"
                htmlFor="exploitability"
                error={errors.exploitability?.message}
              >
                <Select id="exploitability" {...register('exploitability')}>
                  {EXPLOITABILITY.map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Exposure" htmlFor="exposure" error={errors.exposure?.message}>
                <Select id="exposure" {...register('exposure')}>
                  {EXPOSURE.map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Business impact"
                htmlFor="businessImpact"
                error={errors.businessImpact?.message}
              >
                <Select id="businessImpact" {...register('businessImpact')}>
                  {BUSINESS_IMPACT.map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4">
              <Field
                label="Compensating controls (optional)"
                htmlFor="compensatingControls"
                error={errors.compensatingControls?.message}
              >
                <Textarea
                  id="compensatingControls"
                  rows={2}
                  {...register('compensatingControls')}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              The suggested priority is calculated from these factors. You can override it after
              saving, with a recorded justification.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Field label="Evidence" htmlFor="evidence" error={errors.evidence?.message}>
              <Textarea id="evidence" rows={3} {...register('evidence')} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field
              label="Recommended remediation"
              htmlFor="recommendedRemediation"
              error={errors.recommendedRemediation?.message}
            >
              <Textarea
                id="recommendedRemediation"
                rows={3}
                {...register('recommendedRemediation')}
              />
            </Field>
          </div>

          <Field
            label="External reference (e.g. CVE)"
            htmlFor="externalRef"
            error={errors.externalRef?.message}
          >
            <Input
              id="externalRef"
              {...register('externalRef')}
              placeholder="CVE-YYYY-NNNN (only if verified)"
            />
          </Field>

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={isSubmitting}>
              Create finding
            </Button>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
