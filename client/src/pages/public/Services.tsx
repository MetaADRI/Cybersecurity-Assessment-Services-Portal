import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, PhoneCall, ShieldCheck } from 'lucide-react';
import {
  SERVICE_CATALOG,
  FREE_SERVICE_KEYS,
  type ServiceCatalogItem,
} from '../../../../shared/free-services';
import { Reveal } from '../../components/Reveal';

const CATEGORY_ORDER = [
  'Free checks',
  'Offensive security',
  'Defensive security',
  'Assurance',
  'Governance and risk',
  'Compliance',
  'People and awareness',
  'Resilience',
];

function groupServices(): { category: string; items: ServiceCatalogItem[] }[] {
  const groups = new Map<string, ServiceCatalogItem[]>();
  for (const item of SERVICE_CATALOG) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0]);
      const bi = CATEGORY_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([category, items]) => ({ category, items }));
}

export default function Services() {
  const groups = groupServices();
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Services
          </p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                Security work that ends with a decision, not a document nobody reads.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
                Start with a free check if you want a first signal. When you need deeper assurance,
                incident help or a programme that lasts, choose the service that matches the
                question you are trying to answer.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Not sure where to start?
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Run one free check. The result points to the most relevant next service, and you can
                ask about it from your account.
              </p>
              <Link
                to="/free/website_check"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Run a free check <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                <PhoneCall className="h-3.5 w-3.5" /> Lusaka-based, working across Zambia.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6">
          {groups.map((group, groupIndex) => (
            <Reveal key={group.category} delay={groupIndex * 40}>
              <div>
                <div className="flex items-end justify-between gap-3">
                  <h2 className="text-xl font-semibold text-slate-900">{group.category}</h2>
                  <span className="text-xs text-slate-500">
                    {group.items.length} service{group.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => {
                    const isFree = FREE_SERVICE_KEYS.includes(
                      item.key as (typeof FREE_SERVICE_KEYS)[number],
                    );
                    return (
                      <div
                        key={item.key}
                        className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                          {isFree && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                              Free
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-600">{item.tagline}</p>
                        <p className="mt-3 flex-1 text-sm leading-6 text-slate-500">
                          {item.description}
                        </p>
                        <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                          <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                            Clear scope before work begins
                          </li>
                          <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                            Findings written for decision-makers
                          </li>
                        </ul>
                        <Link
                          to={isFree ? `/free/${item.key}` : `/client/signup?service=${item.key}`}
                          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          {isFree ? 'Run free check' : 'Ask about this service'}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-navy-900 py-12 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-4 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Have a specific concern?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Create a free account, keep your free result and send a request. We will respond using
              your preferred contact method.
            </p>
          </div>
          <Link
            to="/client/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-3 text-sm font-semibold text-navy-950 hover:bg-blue-400"
          >
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
