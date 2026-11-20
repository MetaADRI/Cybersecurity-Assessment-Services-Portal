import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
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
  StatusBadge,
} from '../components/ui';
import { zodResolver } from '../lib/zodResolver';
import { createUserSchema } from '../../../shared/schemas';
import { api } from '../lib/api';
import { formatApiError, useApi } from '../hooks/useApi';
import { useAuth } from '../auth';
import { ROLES, ROLE_LABELS } from '../../../shared/constants';
import type { User } from '../../../shared/types';

type CreateForm = z.infer<typeof createUserSchema>;

export default function Users() {
  const { user: me } = useAuth();
  const { data, error, loading, refetch } = useApi<{ items: User[] }>('/users');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver<CreateForm>(createUserSchema),
    defaultValues: { email: '', fullName: '', role: 'analyst', password: '' },
  });

  const create = handleSubmit(async (values) => {
    try {
      await api('/users', { method: 'POST', body: values });
      setMessage({ tone: 'success', text: `User ${values.email} created` });
      reset();
      refetch();
    } catch (err) {
      setMessage({ tone: 'danger', text: formatApiError(err) });
    }
  });

  const update = async (id: string, patch: Record<string, unknown>) => {
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: patch });
      setMessage({ tone: 'success', text: 'User updated' });
      refetch();
    } catch (err) {
      setMessage({ tone: 'danger', text: formatApiError(err) });
    }
  };

  if (loading) return <Spinner label="Loading users" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Users and roles"
        subtitle="Administrators manage access. Roles are enforced on the server."
      />

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Current users" className="lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3 font-medium text-slate-900">{u.fullName}</td>
                  <td className="py-2.5 pr-3 text-xs text-slate-600">{u.email}</td>
                  <td className="py-2.5 pr-3">
                    <Select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => update(u.id, { role: e.target.value })}
                      className="w-36"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={u.status === 'active' ? 'active' : 'archived'} />
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={u.id === me?.id}
                      onClick={() =>
                        update(u.id, { status: u.status === 'active' ? 'disabled' : 'active' })
                      }
                    >
                      {u.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Roles: Administrator manages users and scoring configuration. Analyst manages customers,
            assessments, findings and reports. Read-only reviewer can view but not change records.
          </p>
        </Card>

        <Card title="Create user">
          <form onSubmit={create} noValidate className="space-y-4">
            <Field label="Full name" htmlFor="u-name" error={errors.fullName?.message} required>
              <Input id="u-name" {...register('fullName')} />
            </Field>
            <Field label="Email" htmlFor="u-email" error={errors.email?.message} required>
              <Input id="u-email" type="email" {...register('email')} />
            </Field>
            <Field label="Role" htmlFor="u-role" error={errors.role?.message} required>
              <Select id="u-role" {...register('role')}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Temporary password"
              htmlFor="u-pass"
              error={errors.password?.message}
              required
              hint="Minimum 10 characters. Ask the user to change it after first sign-in."
            >
              <Input id="u-pass" type="password" {...register('password')} />
            </Field>
            <Button type="submit" loading={isSubmitting}>
              Create user
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
