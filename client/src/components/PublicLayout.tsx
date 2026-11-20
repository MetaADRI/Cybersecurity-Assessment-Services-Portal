import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services' },
  { to: '/free/website_check', label: 'Free checks' },
  { to: '/client', label: 'Client portal' },
];

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="OpenDefenders home">
            <Logo className="h-10" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <ThemeToggle className="ml-2" />
            <Link
              to="/client/login"
              className="ml-1 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="rounded-md border border-slate-300 p-2"
              onClick={() => setOpen((value) => !value)}
              aria-label="Toggle menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="space-y-1 border-t border-slate-200 px-4 py-3 md:hidden">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              to="/client/login"
              onClick={() => setOpen(false)}
              className="block rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
            >
              Client sign in
            </Link>
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-navy-950 text-slate-400">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <Logo variant="reversed" className="h-10" />
            <p className="mt-3 max-w-xs text-sm leading-6">
              Practical cybersecurity for organisations that need clear answers, not more jargon.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Explore</p>
            <div className="mt-2 space-y-1 text-sm">
              <Link to="/services" className="block hover:text-white">
                Services
              </Link>
              <Link to="/free/website_check" className="block hover:text-white">
                Free website check
              </Link>
              <Link to="/client/login" className="block hover:text-white">
                Client portal
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              A note on results
            </p>
            <p className="mt-2 text-sm leading-6">
              Free checks are passive risk indicators, not penetration tests or guarantees. Only
              test systems you own or are authorised to test.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs">
          OpenDefenders Technologies - Lusaka, Zambia. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
