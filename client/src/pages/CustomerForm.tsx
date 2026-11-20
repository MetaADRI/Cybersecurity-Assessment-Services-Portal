import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  Spinner,
  Textarea,
} from '../components/ui';
import { zodResolver } from '../lib/zodResolver';
import { customerSchema, type CustomerInput } from '../../../shared/schemas';
import { api } from '../lib/api';
import { useApi, formatApiError } from '../hooks/useApi';
import type { Customer } from '../../../shared/types';

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEdit = Boolean(id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver<CustomerInput>(customerSchema),
    defaultValues: {
      name: '',
      industry: '',
      description: '',
      contactName: '',
      contactEmail: '',
      phone: '',
      scope: '',
    },
  });

  const existing = useApi<{ customer: Customer }>(isEdit ? `/customers/${id}` : null);

  useEffect(() => {
    if (existing.data?.customer) {
      const c = existing.data.customer;
      reset({
        name: c.name,
        industry: c.industry,
        description: c.description ?? '',
        contactName: c.contactName ?? '',
        contactEmail: c.contactEmail ?? '',
        phone: c.phone ?? '',
        scope: c.scope ?? '',
      });
    }
  }, [existing.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        const result = await api<{ customer: Customer }>(`/customers/${id}`, {
          method: 'PATCH',
          body: values,
        });
        navigate(`/customers/${result.customer.id}`);
      } else {
        const result = await api<{ customer: Customer }>('/customers', {
          method: 'POST',
          body: values,
        });
        navigate(`/customers/${result.customer.id}`);
      }
    } catch (err) {
      const message = formatApiError(err);
      const field = (err as { details?: { path?: string }[] }).details?.[0]?.path;
      if (field) setError(field as keyof CustomerInput, { message });
      else setError('root', { message });
    }
  });

  if (isEdit && existing.loading) return <Spinner label="Loading customer" />;
  if (isEdit && existing.error)
    return <ErrorState message={existing.error.message} onRetry={existing.refetch} />;

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit customer' : 'New customer'}
        subtitle={
          location.state && (location.state as { from?: string }).from
            ? undefined
            : 'Only record details you are authorised to store. Do not enter sensitive personal data.'
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
            <Field label="Organisation name" htmlFor="name" error={errors.name?.message} required>
              <Input id="name" {...register('name')} placeholder="Example Ltd" />
            </Field>
          </div>
          <Field
            label="Industry / sector"
            htmlFor="industry"
            error={errors.industry?.message}
            required
          >
            <Input
              id="industry"
              {...register('industry')}
              placeholder="Banking, logistics, healthcare..."
            />
          </Field>
          <Field
            label="Primary contact name"
            htmlFor="contactName"
            error={errors.contactName?.message}
          >
            <Input id="contactName" {...register('contactName')} />
          </Field>
          <Field label="Contact email" htmlFor="contactEmail" error={errors.contactEmail?.message}>
            <Input id="contactEmail" type="email" {...register('contactEmail')} />
          </Field>
          <Field label="Phone (optional)" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register('phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Organisation description"
              htmlFor="description"
              error={errors.description?.message}
            >
              <Textarea id="description" rows={3} {...register('description')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Assessment scope / environment"
              htmlFor="scope"
              error={errors.scope?.message}
              hint="Used to decide whether two assessments are comparable."
            >
              <Textarea id="scope" rows={3} {...register('scope')} />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create customer'}
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
