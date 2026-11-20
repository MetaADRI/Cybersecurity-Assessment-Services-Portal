import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { ClientAuthShell } from './AuthShell';
import { Field, Input, Notice } from '../../components/ui';
import { formatPublicError, publicApi, PublicApiError } from '../../lib/public-api';

interface VerifyState {
  email?: string;
  devCode?: string;
}

interface VerifyResponse {
  user: { email: string };
  csrfToken?: string;
  expiresAt?: string;
  alreadyVerified?: boolean;
}

export default function ClientVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as VerifyState | null) ?? {};
  const [email, setEmail] = useState(state.email ?? '');
  const [code, setCode] = useState('');
  const devCode = state.devCode;
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const response = await publicApi<VerifyResponse>('/client/verify', {
        method: 'POST',
        body: { email, code },
      });
      if (!response.csrfToken) {
        setMessage('Your email is already verified. Please sign in.');
        window.setTimeout(() => navigate('/client/login', { replace: true }), 900);
        return;
      }
      navigate('/client', { replace: true });
    } catch (err) {
      setError(formatPublicError(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setMessage(null);
    if (!email) {
      setError('Enter your email address first.');
      return;
    }
    setResending(true);
    try {
      await publicApi('/client/resend-code', { method: 'POST', body: { email } });
      setMessage('If that account needs verification, a new code has been generated.');
    } catch (err) {
      if (err instanceof PublicApiError) setError(err.message);
      else setError(formatPublicError(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <ClientAuthShell
      title="Verify your email"
      subtitle="Enter the six-digit code we generated for your account. This keeps your reports tied to you."
    >
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <p>
          Email delivery is not configured in this demonstration. In development, the code is shown
          below and written to the server log.
        </p>
      </div>

      {devCode && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            Development code
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[0.25em]">{devCode}</p>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Notice tone="info">{message}</Notice>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email address" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Six-digit code" htmlFor="code" required>
          <Input
            id="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            placeholder="000000"
            className="text-center text-lg tracking-[0.3em]"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Verifying' : 'Verify and continue'}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
        >
          {resending ? 'Generating...' : 'Send a new code'}
        </button>
        <Link to="/client/login" className="text-slate-500 hover:text-slate-900">
          Back to sign in
        </Link>
      </div>
    </ClientAuthShell>
  );
}
