import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { clientProfileSchema } from '../../../../shared/client-schemas';
import type { ClientUser } from '../../../../shared/client-types';
import { clientApi, formatPublicError } from '../../lib/public-api';
import { useClientAuth } from '../../client-auth';
import { ClientPageHeader } from '../../components/ClientLayout';
import { Field, Input, Notice } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

export default function ClientProfile() {
  const { user, refresh } = useClientAuth();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    company: user?.company ?? '',
    phone: user?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user) return null;

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setSuccess(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const parsed = clientProfileSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        if (!next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      await clientApi<{ user: ClientUser }>('/profile', { method: 'PATCH', body: parsed.data });
      await refresh();
      setSuccess('Your profile has been updated.');
    } catch (err) {
      setError(formatPublicError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ClientPageHeader
        title="Profile"
        subtitle="Keep your contact details current so we can respond to requests."
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {error && (
            <div className="mb-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}
          {success && (
            <div className="mb-4">
              <Notice tone="success">{success}</Notice>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <Field label="Full name" htmlFor="profile-name" error={errors.name} required>
              <Input
                id="profile-name"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                autoComplete="name"
                required
              />
            </Field>
            <Field label="Organisation" htmlFor="profile-company" error={errors.company} required>
              <Input
                id="profile-company"
                value={form.company}
                onChange={(event) => update('company', event.target.value)}
                autoComplete="organization"
                required
              />
            </Field>
            <Field label="Contact number" htmlFor="profile-phone" error={errors.phone} required>
              <Input
                id="profile-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                autoComplete="tel"
                required
              />
            </Field>
            <Field label="Email address" htmlFor="profile-email">
              <Input id="profile-email" value={user.email} disabled />
            </Field>
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <h2 className="font-semibold text-slate-900">Account</h2>
            <dl className="mt-3 space-y-2 text-slate-600">
              <div className="flex justify-between gap-3">
                <dt>Email status</dt>
                <dd className="font-medium text-emerald-700">
                  {user.emailVerified ? 'Verified' : 'Unverified'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Member since</dt>
                <dd>{formatDateTime(user.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Last sign in</dt>
                <dd>{formatDateTime(user.lastLoginAt)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs leading-6 text-slate-500">
            For safety, sessions end after five minutes of inactivity. Password reset is not
            available in this demonstration; contact OpenDefenders if you need help with access.
          </div>
        </aside>
      </div>
    </>
  );
}
