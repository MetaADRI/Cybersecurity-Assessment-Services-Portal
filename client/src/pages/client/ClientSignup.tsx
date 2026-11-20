import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { clientSignupSchema } from '../../../../shared/client-schemas';
import { SERVICE_CATALOG } from '../../../../shared/free-services';
import { ClientAuthShell } from './AuthShell';
import { Field, Input, Notice } from '../../components/ui';
import { formatPublicError, publicApi, PublicApiError } from '../../lib/public-api';

interface SignupResponse {
  requiresVerification: boolean;
  email: string;
  devCode?: string;
}

export default function ClientSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedService = params.get('service');
  const service = SERVICE_CATALOG.find((item) => item.key === requestedService);

  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = clientSignupSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        if (!next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setLoading(true);
    try {
      const response = await publicApi<SignupResponse>('/client/signup', {
        method: 'POST',
        body: parsed.data,
      });
      navigate('/client/verify', {
        state: { email: response.email, devCode: response.devCode },
      });
    } catch (err) {
      if (err instanceof PublicApiError && err.status === 409) {
        setError(err.message);
      } else {
        setError(formatPublicError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientAuthShell
      title="Create your free account"
      subtitle="Save your result, keep your reports and ask for help when you need it."
    >
      {service && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          You are asking about <strong>{service.name}</strong>. You can send the request after
          verifying your email.
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Organisation" htmlFor="company" error={errors.company} required>
            <Input
              id="company"
              value={form.company}
              onChange={(event) => update('company', event.target.value)}
              autoComplete="organization"
              required
            />
          </Field>
        </div>
        <Field label="Work email" htmlFor="email" error={errors.email} required>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            autoComplete="email"
            placeholder="you@company.co.zm"
            required
          />
        </Field>
        <Field label="Contact number" htmlFor="phone" error={errors.phone} required>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
            autoComplete="tel"
            placeholder="+260 97 000 0000"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password}
            hint="At least 10 characters."
            required
          >
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword}
            required
          >
            <Input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => update('confirmPassword', event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Creating account' : 'Create account'}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/client/login" className="font-medium text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
      <p className="mt-4 text-center text-xs leading-5 text-slate-500">
        We use your email to verify the account and contact you about requests you send. Free checks
        remain risk indicators, not a guarantee of security.
      </p>
    </ClientAuthShell>
  );
}
