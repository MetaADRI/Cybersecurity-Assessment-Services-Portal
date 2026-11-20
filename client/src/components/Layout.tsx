import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  Target,
  ShieldAlert,
  FileText,
  Settings,
  Users,
  History,
  Upload,
  LogOut,
  ScrollText,
  Inbox,
} from 'lucide-react';
import { useAuth, isAdmin, canWrite } from '../auth';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/service-requests', label: 'Service requests', icon: Inbox },
  { to: '/customers', label: 'Customers', icon: Building2 },
  { to: '/assessments', label: 'Assessments', icon: ClipboardCheck },
  { to: '/health-score', label: 'Health scores', icon: History },
  { to: '/findings', label: 'Findings', icon: ShieldAlert },
  { to: '/remediation', label: 'Remediation board', icon: Target },
  { to: '/import', label: 'CSV import / export', icon: Upload },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 flex w-60 flex-col bg-navy-900 text-slate-200">
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-5 py-4">
          <Logo variant="markReversed" className="h-9 w-9" />
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">OpenDefenders</p>
            <p className="text-xs text-slate-400">Cybersecurity Management Platform</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
          {NAV.filter((item) => !item.adminOnly || isAdmin(user)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `mb-1 flex items-center gap-3 rounded-md px-3 py-2 transition ${
                    isActive
                      ? 'bg-blue-600/20 text-white ring-1 ring-blue-500/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-slate-700/60 px-4 py-4">
          <p className="truncate text-sm font-medium text-white">{user?.fullName}</p>
          <p className="text-xs text-slate-400">{user?.role}</p>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pl-60">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
          <div>
            <p className="text-sm font-semibold text-slate-900">ODCMP</p>
            <p className="text-xs text-slate-500">
              Demonstration environment - all seeded customer data is fictional
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {!canWrite(user) && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                Read-only reviewer
              </span>
            )}
            <span className="hidden sm:inline">Signed in as {user?.email}</span>
            <ThemeToggle />
          </div>
        </header>
        <main key={location.pathname} className="flex-1 px-6 py-6">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 px-6 py-3 text-xs text-slate-400">
          OpenDefenders Technologies - Lusaka, Zambia. Health scores are risk indicators, not proof
          of security.
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({
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
