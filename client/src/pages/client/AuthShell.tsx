import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';

const POINTS = [
  'Keep your free reports in one place',
  'Request a service without repeating your details',
  'Return to the same recommendation whenever you need it',
];

export function ClientAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(3,114,229,0.38), transparent 38%), radial-gradient(circle at 80% 80%, rgba(56,189,248,0.16), transparent 36%)',
          }}
        />
        <Link to="/" className="relative" aria-label="OpenDefenders home">
          <Logo variant="reversed" className="h-11" />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Your security picture should stay in one place.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            A free account keeps your check results, reports and service requests together. No
            obligation and no sales call required.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">
          Lusaka, Zambia · Passive checks and authorised testing only
        </p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link to="/" className="lg:hidden" aria-label="OpenDefenders home">
            <Logo className="h-9" />
          </Link>
          <Link to="/" className="ml-auto text-sm text-slate-500 hover:text-slate-900">
            Back to public site
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
