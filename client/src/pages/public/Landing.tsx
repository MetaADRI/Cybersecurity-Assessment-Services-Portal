import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Fish,
  Globe,
  LockKeyhole,
  Mail,
  Network,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  FREE_SERVICE_COPY,
  SERVICE_CATALOG,
  type FreeServiceKey,
} from '../../../../shared/free-services';
import { Logo } from '../../components/Logo';
import { Reveal } from '../../components/Reveal';

const FREE_ICONS: Record<FreeServiceKey, typeof Globe> = {
  website_check: Globe,
  email_check: Mail,
  email_phishing_check: ShieldAlert,
  hygiene_assessment: ClipboardCheck,
  phishing_quiz: Fish,
  subnet_calculator: Network,
};

const FREE_ORDER: FreeServiceKey[] = [
  'website_check',
  'email_check',
  'email_phishing_check',
  'hygiene_assessment',
  'phishing_quiz',
  'subnet_calculator',
];

const STEPS = [
  {
    title: 'Pick one free check',
    body: 'Start with what worries you most: your website, your email domain, your daily habits or your team.',
  },
  {
    title: 'Get a plain-language result',
    body: 'See the score, what each finding means, what it could lead to and the first fix to make.',
  },
  {
    title: 'Decide what happens next',
    body: 'Download the PDF, keep it in a free account, or ask us to help with the deeper work.',
  },
];

const PROOF = [
  'Passive checks only - no break-in attempts',
  'Written for owners and managers, not just engineers',
  'Zambian context, practical recommendations',
];

export default function Landing() {
  const featured = SERVICE_CATALOG.filter((item) => !item.isFree).slice(0, 6);
  return (
    <>
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(circle at 82% 18%, rgba(3,114,229,0.38), transparent 34%), radial-gradient(circle at 12% 82%, rgba(56,189,248,0.14), transparent 32%)',
          }}
        />
        <div className="hero-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="hero-grid-floor pointer-events-none absolute inset-x-0 bottom-0 h-[58%] opacity-60" />
        <div className="hero-scanlines pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-navy-950 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-navy-950 to-transparent" />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div>
            <Logo variant="reversed" className="hero-rise h-12" />
            <p className="hero-rise mt-7 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-200">
              <Sparkles className="h-3.5 w-3.5" />
              Free checks. Clear answers. No jargon.
            </p>
            <h1 className="hero-rise mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Know what an <span className="hero-glitch inline-block text-blue-300">attacker</span>{' '}
              can see before they use it.
            </h1>
            <p className="hero-rise-delay mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              OpenDefenders gives Zambian organisations a practical first look at their security
              posture. Run a free check, understand the result, and decide what deserves attention
              first.
            </p>
            <div className="hero-rise-delay mt-8 flex flex-wrap gap-3">
              <Link
                to="/free/website_check"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-3 text-sm font-semibold text-navy-950 shadow-[0_0_28px_rgba(42,114,245,0.35)] transition hover:bg-blue-400"
              >
                Check my website free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/services"
                className="inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-blue-300/50 hover:bg-blue-400/10"
              >
                Explore services
              </Link>
            </div>
            <ul className="hero-rise-delay mt-8 space-y-2 text-sm text-slate-300">
              {PROOF.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="hero-rise-delay relative">
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <div className="absolute h-[27rem] w-[27rem] rounded-full border border-blue-400/10" />
              <div className="absolute h-80 w-80 rounded-full border border-dashed border-blue-300/15" />
              <div className="absolute h-[22rem] w-[22rem] rounded-full border border-blue-400/20" />
              <span className="hero-node absolute left-[11%] top-[26%] h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.95)]" />
              <span className="hero-node absolute right-[8%] top-[42%] h-1.5 w-1.5 rounded-full bg-blue-300 shadow-[0_0_16px_rgba(127,174,255,0.95)] [animation-delay:900ms]" />
              <span className="hero-node absolute bottom-[14%] left-[24%] h-1.5 w-1.5 rounded-full bg-sky-200 shadow-[0_0_14px_rgba(186,230,253,0.9)] [animation-delay:1700ms]" />
            </div>

            <div className="hero-drift relative overflow-hidden rounded-2xl border border-blue-400/20 bg-navy-900/85 shadow-[0_0_80px_rgba(3,114,229,0.24)] backdrop-blur-xl">
              <div className="hero-scanline pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-300/80" />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400/70" />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600/70" />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-blue-200">
                    odcmp // posture
                  </span>
                </div>
                <span className="rounded-full border border-amber-300/20 bg-amber-400/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200">
                  Needs attention
                </span>
              </div>

              <div className="p-5">
                <div className="flex items-end gap-4">
                  <p className="text-6xl font-semibold tracking-tight text-white">68</p>
                  <div className="pb-1">
                    <p className="text-sm font-medium text-blue-300">Grade C</p>
                    <p className="text-xs text-slate-400">Website security check</p>
                  </div>
                  <ShieldCheck className="ml-auto mb-2 h-5 w-5 text-blue-400" />
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-amber-400 via-blue-400 to-sky-300" />
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="rounded-lg border border-white/5 bg-white/[0.05] p-3">
                    <p className="font-medium text-white">HSTS is not enabled</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Browsers are not told to always use HTTPS. A downgrade attack can go
                      unnoticed.
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.05] p-3">
                    <p className="font-medium text-white">Content-Security-Policy is missing</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      If an injection flaw exists, the browser has fewer defences.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded border border-blue-400/15 bg-navy-950/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-200">
                  <span className="hero-node h-1.5 w-1.5 rounded-full bg-sky-300" />
                  passive scan // example output
                </div>
                <p className="mt-4 text-[11px] leading-5 text-slate-500">
                  Illustrative result. A free check is a risk indicator, not a guarantee of
                  security.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                Free checks and tools
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                Start with the question that keeps you up at night.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Each check is passive, fast and written for a business owner. Run the ones that
                matter to you - no account needed to see a result.
              </p>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FREE_ORDER.map((key, index) => {
              const Icon = FREE_ICONS[key];
              return (
                <Reveal key={key} delay={index * 70}>
                  <Link
                    to={`/free/${key}`}
                    className="group flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-lg"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-slate-900">
                      {FREE_SERVICE_COPY[key].name}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                      {FREE_SERVICE_COPY[key].short}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
                      Run this check{' '}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  How it works
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  Useful in minutes, not weeks.
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  No sales call required to see a result. If you want help beyond the free check, a
                  free account makes it easy to keep the report and ask for a specific service.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {STEPS.map((step, index) => (
                  <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-blue-300">
                      {index + 1}
                    </span>
                    <h3 className="mt-4 text-sm font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  Deeper work
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  When the basics are not enough.
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  We test, investigate, train and help you build the controls that fit your
                  organisation. Every engagement starts with a clear scope and an honest
                  conversation.
                </p>
              </div>
              <Link
                to="/services"
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                See all services <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((item, index) => (
              <Reveal key={item.key} delay={index * 50}>
                <div className="flex h-full flex-col rounded-xl border border-slate-200 p-5">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    {item.category}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">{item.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{item.tagline}</p>
                  <Link
                    to={`/client/signup?service=${item.key}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Ask about this <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy-900 py-16 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid items-center gap-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="flex items-center gap-2 text-blue-300">
                  <LockKeyhole className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Start safely
                  </span>
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                  Run one free check. Keep the result.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">
                  A free account saves your report, shows the recommended next step and lets you ask
                  for a specific service without repeating the information.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 md:justify-end">
                <Link
                  to="/free/website_check"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-3 text-sm font-semibold text-navy-950 hover:bg-blue-400"
                >
                  Run a free check <ScanSearch className="h-4 w-4" />
                </Link>
                <Link
                  to="/client/signup"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-500 px-5 py-3 text-sm font-medium hover:bg-white/5"
                >
                  Create free account <BadgeCheck className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
