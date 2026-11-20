import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import { loginSchema, type LoginInput } from '../../../shared/schemas';
import { zodResolver } from '../lib/zodResolver';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button, Field, Input, Notice } from '../components/ui';
import { formatApiError } from '../hooks/useApi';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver<LoginInput>(loginSchema), mode: 'onBlur' });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(formatApiError(err));
    }
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle className="border-slate-600 bg-navy-800 text-slate-200 hover:bg-navy-700 hover:text-white" />
      </div>
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="h-10" />
        </div>

        {serverError && (
          <div className="mb-4">
            <Notice tone="danger">{serverError}</Notice>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              {...register('email')}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message} required>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          Accounts are created by an administrator. Sessions expire automatically and passwords are
          stored only as salted hashes.
        </p>
      </div>
    </div>
  );
}
