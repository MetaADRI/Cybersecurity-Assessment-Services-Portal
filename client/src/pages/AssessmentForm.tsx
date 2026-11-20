import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { assessmentSchema, type AssessmentInput } from '../../../shared/schemas';
import { api } from '../lib/api';
import { useApi, formatApiError } from '../hooks/useApi';
import type { Assessment, Customer } from '../../../shared/types';
import { todayIso, label } from '../lib/format';
import { ASSESSMENT_TYPES } from '../../../shared/constants';

export default function AssessmentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const presetCustomer = params.get('customerId') ?? '';
  const customers = useApi<{ items: Customer[]; total: number }>(
    '/customers?pageSize=100&status=active',
  );
  const existing = useApi<{ assessment: Assessment }>(isEdit ? `/assessments/${id}` : null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssessmentInput>({
    resolver: zodResolver<AssessmentInput>(assessmentSchema),
    defaultValues: {
      customerId: presetCustomer,
      title: '',
      type: 'baseline',
      scope: '',
      description: '',
      assessmentDate: todayIso(),
      assessor: '',
      status: 'draft',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await api<{ assessment: Assessment }>(`/assessments/${id}`, {
          method: 'PATCH',
          body: values,
        });
        navigate(`/assessments/${id}`);
      } else {
        const result = await api<{ assessment: Assessment }>('/assessments', {
          method: 'POST',
          body: values,
        });
        navigate(`/assessments/${result.assessment.id}`);
      }
    } catch (err) {
      const message = formatApiError(err);
      const field = (err as { details?: { path?: string }[] }).details?.[0]?.path;
      if (field) setError(field as keyof AssessmentInput, { message });
      else setError('root', { message });
    }
  });

  useEffect(() => {
    if (existing.data?.assessment) {
      const a = existing.data.assessment;
      reset({
        customerId: a.customerId,
        title: a.title,
        type: a.type,
        scope: a.scope,
        description: a.description ?? '',
        assessmentDate: a.assessmentDate,
        assessor: a.assessor,
        status: a.status === 'completed' || a.status === 'archived' ? 'draft' : a.status,
      });
    }
  }, [existing.data, reset]);

  if (customers.loading) return <Spinner label="Loading customers" />;
  if (customers.error)
    return <ErrorState message={customers.error.message} onRetry={customers.refetch} />;
  if (isEdit && existing.error)
    return <ErrorState message={existing.error.message} onRetry={existing.refetch} />;

  if (customers.data && customers.data.items.length === 0) {
    return (
      <>
        <PageHeader title="New assessment" />
        <Card>
          <p className="text-sm text-slate-600">Create a customer before starting an assessment.</p>
          <div className="mt-3">
            <Button onClick={() => navigate('/customers/new')}>Create customer</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit assessment' : 'New assessment'}
        subtitle={
          isEdit
            ? 'Scope changes affect how comparable this assessment is with previous ones'
            : 'The assessment starts as a draft and can be resumed at any time'
        }
      />
      <Card className="max-w-3xl">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {errors.root && (
            <div className="sm:col-span-2">
              <Notice tone="danger">{errors.root.message}</Notice>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field
              label="Customer"
              htmlFor="customerId"
              error={errors.customerId?.message}
              required
            >
              <Select id="customerId" {...register('customerId')}>
                <option value="">Select a customer</option>
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Assessment title" htmlFor="title" error={errors.title?.message} required>
              <Input
                id="title"
                {...register('title')}
                placeholder="Baseline cybersecurity assessment"
              />
            </Field>
          </div>
          <Field label="Assessment type" htmlFor="type" error={errors.type?.message} required>
            <Select id="type" {...register('type')}>
              {ASSESSMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Assessment date"
            htmlFor="assessmentDate"
            error={errors.assessmentDate?.message}
            required
          >
            <Input id="assessmentDate" type="date" {...register('assessmentDate')} />
          </Field>
          <Field label="Assessor" htmlFor="assessor" error={errors.assessor?.message} required>
            <Input id="assessor" {...register('assessor')} placeholder="Full name or team" />
          </Field>
          <Field label="Initial status" htmlFor="status" error={errors.status?.message}>
            <Select id="status" {...register('status')}>
              <option value="draft">Draft</option>
              <option value="in_progress">In progress</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Scope"
              htmlFor="scope"
              error={errors.scope?.message}
              hint="Describe exactly what is being assessed. Comparisons only run between assessments with matching scopes."
              required
            >
              <Textarea id="scope" rows={3} {...register('scope')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Description (optional)"
              htmlFor="description"
              error={errors.description?.message}
            >
              <Textarea id="description" rows={3} {...register('description')} />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create assessment'}
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
