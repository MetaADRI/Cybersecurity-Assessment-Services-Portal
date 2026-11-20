import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, FileText, LayoutDashboard, LogOut, UserRound, Wrench } from 'lucide-react';
import { useClientAuth } from '../client-auth';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Spinner } from './ui';

const NAV = [
  { to: '/client', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/client/services', label: 'Services', icon: Wrench },
  { to: '/client/requests', label: 'Requests', icon: ClipboardList },
  { to: '/client/reports', label: 'Reports', icon: FileText },
  { to: '/client/profile', label: 'Profile', icon: UserRound },
];

export function RequireClient({ children }: { children: React.ReactNode }) {
  const { user, loading } = useClientAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Checking your client session" />
      </div>
    );
  }
  if (!user) return <Navigate to="/client/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function ClientLayout() {
  const { user, logout, warning, staySignedIn } = useClientAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/client" aria-label="OpenDefenders client portal">
            <Logo className="h-9" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user?.company}</span>
            <ThemeToggle />
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/client/login');
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </header>

      {warning && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900 sm:px-6">
            <span>Your session will expire in about 30 seconds.</span>
            <button
              type="button"
              onClick={() => void staySignedIn()}
              className="rounded-md bg-amber-800 px-3 py-1 text-xs font-medium text-white hover:bg-amber-900"
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="mt-8 border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500">
        OpenDefenders Technologies - Lusaka, Zambia. Free checks are risk indicators, not proof of
        security.
      </footer>
    </div>
  );
}

export function ClientPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
