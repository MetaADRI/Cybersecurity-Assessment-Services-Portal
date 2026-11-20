import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  FREE_SERVICE_COPY,
  SERVICE_CATALOG,
  explainScore,
  findingPenalty,
  severityLabel,
  type FreeSeverity,
  type FreeFinding,
  type ScoreExplanation,
  type SubnetMeta,
  type WebsiteMeta,
} from '../../../../shared/free-services';
import type { FreeRunSummary } from '../../../../shared/client-types';
import { formatPublicError, publicApi } from '../../lib/public-api';
import { apiUrl } from '../../lib/config';
import { Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

const SEVERITY_STYLE: Record<FreeSeverity, string> = {
  high: 'border-red-200 bg-red-50 text-red-900',
  medium: 'border-amber-200 bg-amber-50 text-amber-900',
  low: 'border-sky-200 bg-sky-50 text-sky-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

const SEVERITY_DOT: Record<FreeSeverity, string> = {
  high: 'bg-red-600',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
  info: 'bg-slate-400',
};

const ORDER: FreeSeverity[] = ['high', 'medium', 'low', 'info'];

const HEADER_LABELS: Record<string, string> = {
  'strict-transport-security': 'HSTS',
  'content-security-policy': 'Content Security Policy',
  'x-frame-options': 'Clickjacking protection',
  'x-content-type-options': 'MIME sniffing protection',
  'referrer-policy': 'Referrer policy',
  'permissions-policy': 'Permissions policy',
};

const SCORE_HEADERS = Object.keys(HEADER_LABELS);

function scoreTone(score: number): { ring: string; text: string } {
  if (score >= 80) return { ring: 'var(--chart-primary)', text: 'text-blue-600' };
  if (score >= 60) return { ring: '#b45309', text: 'text-amber-700' };
  return { ring: '#b91c1c', text: 'text-red-700' };
}

export default function Result() {
  const { id } = useParams();
  const [run, setRun] = useState<FreeRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [hasReport, setHasReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    publicApi<{ run: FreeRunSummary }>(`/free-runs/${id}`)
      .then((response) => {
        setRun(response.run);
        setHasReport(response.run.hasReport);
        window.scrollTo(0, 0);
      })
      .catch((err) => setError(formatPublicError(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const findings = useMemo(() => {
    if (!run?.result) return [];
    return [...run.result.findings].sort(
      (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
    );
  }, [run]);

  const recommended = useMemo(() => {
    const keys = new Set(findings.map((finding) => finding.serviceKey));
    return SERVICE_CATALOG.filter((service) => keys.has(service.key) && !service.isFree).slice(
      0,
      3,
    );
  }, [findings]);

  const scoreExplanation = useMemo(
    () => (run?.result ? explainScore(run.result) : null),
    [run],
  );

  const generateReport = async () => {
    if (!id) return;
    setReportLoading(true);
    setReportError(null);
    try {
      await publicApi(`/free-runs/${id}/report`, { method: 'POST' });
      setHasReport(true);
    } catch (err) {
      setReportError(formatPublicError(err));
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <Spinner label="Loading your result" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Result not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          {error ?? 'That result could not be found in this browser.'}
        </p>
        <Link
          to="/services"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Explore services <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (run.status !== 'completed' || !run.result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">This check did not complete</h1>
        <p className="mt-2 text-sm text-slate-600">
          The target may have been unreachable. Please try again later or ask us to investigate.
        </p>
        <Link
          to="/services"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to services <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const result = run.result;
  const tone = scoreTone(result.score);
  const serviceName = FREE_SERVICE_COPY[result.serviceKey]?.name ?? 'Free check';
  const subnet = result.meta?.subnet ?? null;

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Your free result
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {serviceName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {result.meta?.target ?? run.target ?? 'Self-assessment'} ·{' '}
              {formatDateTime(result.checkedAt)}
            </p>
          </div>
          {!subnet && (
            <div className="flex flex-wrap gap-2">
              {hasReport ? (
                <a
                  href={apiUrl(`/public/free-runs/${run.id}/report`)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              ) : (
                <button
                  type="button"
                  onClick={generateReport}
                  disabled={reportLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {reportLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {reportLoading ? 'Preparing PDF' : 'Prepare PDF'}
                </button>
              )}
            </div>
          )}
        </div>

        {reportError && !subnet && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {reportError}
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          {subnet ? (
            <SubnetBreakdown subnet={subnet} summary={result.summary} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div
                className="mx-auto flex h-40 w-40 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(${tone.ring} ${result.score * 3.6}deg, var(--od-border) 0deg)`,
                }}
              >
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white">
                  <span className={`text-4xl font-semibold ${tone.text}`}>{result.score}%</span>
                  <span className="text-xs uppercase tracking-wider text-slate-500">
                    Grade {result.grade}
                  </span>
                </div>
              </div>
              <p className="mt-5 text-center text-sm leading-6 text-slate-600">{result.summary}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                <div>
                  <p className="text-lg font-semibold text-red-700">
                    {findings.filter((f) => f.severity === 'high').length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">High</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-amber-700">
                    {findings.filter((f) => f.severity === 'medium').length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Medium</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-sky-700">
                    {findings.filter((f) => f.severity === 'low' || f.severity === 'info').length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Low / info</p>
                </div>
              </div>
              {scoreExplanation && (
                <ScoreMath explanation={scoreExplanation} score={result.score} />
              )}
            </div>
          )}

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
            <div className="flex items-center gap-2 text-blue-900">
              <ShieldCheck className="h-5 w-5" />
              <h2 className="text-base font-semibold">Keep this result</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-blue-900/80">
              Create a free account to save this report, see it in your dashboard and ask us about
              the next step. Your current result will be linked automatically.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-blue-900/80">
              {!subnet && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Save this PDF to your account
                </li>
              )}
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Request a service with one form
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Keep a record for management
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/client/signup"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/client/login"
                className="inline-flex items-center gap-2 rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>

        {!subnet && result.meta?.website && (
          <HeaderChecks website={result.meta.website} />
        )}

        {!subnet && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-slate-900">What we found</h2>
            <p className="mt-1 text-sm text-slate-500">
              {findings.length === 0
                ? 'No findings were returned for this check.'
                : 'Start at the top. Each item explains what it means and the first fix to consider.'}
            </p>
            <div className="mt-4 space-y-3">
              {findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  showPenalty={
                    result.serviceKey === 'website_check' ||
                    result.serviceKey === 'email_check' ||
                    result.serviceKey === 'email_phishing_check'
                  }
                />
              ))}
            </div>
          </div>
        )}

        {recommended.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-slate-900">Helpful next steps</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {recommended.map((service) => (
                <div key={service.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    {service.category}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{service.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{service.tagline}</p>
                  <Link
                    to={`/client/signup?service=${service.key}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Ask about this <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500">
          <strong className="text-slate-700">Important:</strong> this is a passive risk indicator,
          not a penetration test, compliance certification or guarantee. It reflects a point in time
          and only the checks described for this service. Only test systems you own or are
          authorised to test.
        </div>
      </div>
    </div>
  );
}

function SubnetBreakdown({ subnet, summary }: { subnet: SubnetMeta; summary: string }) {
  const rows: [string, string][] = [
    ['Network', subnet.network],
    ['Broadcast', subnet.broadcast],
    ['Netmask', subnet.netmask],
    ['Wildcard', subnet.wildcard],
    ['Usable range', `${subnet.firstUsable} - ${subnet.lastUsable}`],
    ['Usable hosts', subnet.usableHosts],
    ['Total addresses', subnet.totalAddresses],
    ['Prefix', `/${subnet.prefix}`],
    ['Class', subnet.addressClass],
    ['Scope', subnet.scope],
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
        Subnet breakdown
      </p>
      <p className="mt-1 break-all text-lg font-semibold text-slate-900">{subnet.cidr}</p>
      <dl className="mt-4 divide-y divide-slate-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 py-1.5">
            <dt className="text-slate-500">{label}</dt>
            <dd className="break-all text-right font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        {summary}
      </p>
      <p className="mt-3 break-all font-mono text-[10px] leading-4 text-slate-400">
        {subnet.binary.network}
        <br />
        {subnet.binary.netmask}
      </p>
    </div>
  );
}

function ScoreMath({
  explanation,
  score,
}: {
  explanation: ScoreExplanation;
  score: number;
}) {
  const totalDeducted = explanation.deductions.reduce((sum, row) => sum + row.points, 0);
  return (
    <div className="mt-5 border-t border-slate-100 pt-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          How this score is built
        </p>
        <span className="text-xs font-semibold text-blue-700">{score}% final</span>
      </div>
      <p className="mt-2 text-xs font-medium text-slate-700">{explanation.method}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{explanation.formula}</p>
      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
        {explanation.deductions.length === 0 ? (
          <p className="text-xs text-slate-600">No score deductions were applied.</p>
        ) : (
          <ul className="space-y-2">
            {explanation.deductions.map((deduction) => (
              <li key={deduction.id} className="flex items-start justify-between gap-3 text-xs">
                <span>
                  <span className="block font-medium text-slate-700">{deduction.label}</span>
                  <span className="block text-slate-500">{deduction.detail}</span>
                </span>
                <span className="shrink-0 font-semibold text-red-700">
                  −{deduction.points} pts
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-xs font-semibold text-slate-700">
          <span>Total deducted</span>
          <span>{Math.round(totalDeducted * 10) / 10} pts</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">{explanation.note}</p>
    </div>
  );
}

function HeaderChecks({ website }: { website: WebsiteMeta }) {
  const details = SCORE_HEADERS.map((name) => ({
    name,
    label: HEADER_LABELS[name],
    meta: website.headers.find((item) => item.name === name),
  })).filter((item) => item.meta);
  if (details.length === 0) return null;

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Browser protections
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Security header scorecard
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          Header grade {website.headerGrade}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {details.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
          >
            <span className="text-xs font-medium text-slate-700">{item.label}</span>
            <span
              className={`text-[11px] font-semibold ${item.meta?.present ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {item.meta?.present ? 'Present' : 'Missing'}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        These are the six browser headers checked in this pass. The main score also includes HTTPS,
        TLS, cookies, redirects, mixed content and public technology clues.
      </p>
    </div>
  );
}

function FindingCard({
  finding,
  showPenalty = false,
}: {
  finding: FreeFinding;
  showPenalty?: boolean;
}) {
  return (
    <article className={`rounded-lg border p-4 ${SEVERITY_STYLE[finding.severity]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[finding.severity]}`}
          />
          <div>
            <h3 className="text-sm font-semibold">{finding.title}</h3>
            {finding.detail && <p className="mt-1 text-xs opacity-80">{finding.detail}</p>}
          </div>
        </div>
        <span className="flex items-center gap-1.5">
          {showPenalty && (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {findingPenalty(finding.severity) > 0
                ? `−${findingPenalty(finding.severity)} pts`
                : 'No score change'}
            </span>
          )}
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {severityLabel(finding.severity)}
          </span>
        </span>
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            What it means
          </p>
          <p className="mt-1 leading-6">{finding.meaning}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            Why it matters
          </p>
          <p className="mt-1 leading-6">{finding.consequence}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">First fix</p>
          <p className="mt-1 leading-6">{finding.recommendation}</p>
        </div>
      </div>
    </article>
  );
}
