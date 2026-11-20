import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ClientAuthShell } from './AuthShell';
import { Field, Input, Notice } from '../../components/ui';
import { formatPublicError, publicApi, PublicApiError } from '../../lib/public-api';

export default function ClientLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from;
  const expired = params.get('expired') === '1';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await publicApi('/client/login', { method: 'POST', body: { email, password } });
      navigate(from && from.startsWith('/client') ? from : '/client', { replace: true });
    } catch (err) {
      if (err instanceof PublicApiError && err.code === 'email_unverified') {
        const details = err.details as { email?: string; devCode?: string } | undefined;
        navigate('/client/verify', {
          state: { email: details?.email ?? email, devCode: details?.devCode },
        });
        return;
      }
      setError(formatPublicError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientAuthShell
      title="Welcome back"
      subtitle="Sign in to see your reports, requests and recommended next steps."
    >
      {expired && (
        <div className="mb-4">
          <Notice tone="warning">
            Your session ended after five minutes of inactivity. Sign in again to continue.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email address" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="you@company.co.zm"
          />
        </Field>
        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            placeholder="Your password"
          />
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Signing in' : 'Sign in'}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New here?{' '}
        <Link to="/client/signup" className="font-medium text-blue-600 hover:text-blue-700">
          Create a free account
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">
        Staff member?{' '}
        <Link to="/login" className="underline">
          Sign in to ODCMP
        </Link>
      </p>
    </ClientAuthShell>
  );
}
