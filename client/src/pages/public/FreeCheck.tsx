import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Fish,
  Globe,
  Loader2,
  Mail,
  Network,
  ShieldCheck,
} from 'lucide-react';
import {
  FREE_SERVICE_COPY,
  FREE_SERVICE_KEYS,
  HYGIENE_QUESTIONS,
  PHISHING_SCENARIOS,
  type FreeServiceKey,
} from '../../../../shared/free-services';
import { formatPublicError, publicApi, PublicApiError } from '../../lib/public-api';
import { Input } from '../../components/ui';

const ICONS: Record<FreeServiceKey, typeof Globe> = {
  website_check: Globe,
  email_check: Mail,
  hygiene_assessment: ClipboardCheck,
  phishing_quiz: Fish,
  subnet_calculator: Network,
};

const ANSWER_LABELS = [
  { value: 'yes', label: 'Yes' },
  { value: 'partly', label: 'Partly' },
  { value: 'no', label: 'No' },
];

async function fingerprint(): Promise<string | undefined> {
  try {
    const raw = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

export default function FreeCheck() {
  const { serviceKey } = useParams();
  const navigate = useNavigate();
  const valid = FREE_SERVICE_KEYS.includes(serviceKey as FreeServiceKey);
  const key = serviceKey as FreeServiceKey;
  const copy = valid ? FREE_SERVICE_COPY[key] : null;
  const Icon = valid ? ICONS[key] : Globe;

  const [target, setTarget] = useState('');
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentScenario, setCurrentScenario] = useState(0);
  const [fingerprintHash, setFingerprintHash] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedService, setUsedService] = useState<string | null>(null);

  useEffect(() => {
    void fingerprint().then(setFingerprintHash);
  }, []);

  const answeredCount = useMemo(
    () =>
      key === 'hygiene_assessment'
        ? HYGIENE_QUESTIONS.filter((q) => answers[q.id]).length
        : key === 'phishing_quiz'
          ? PHISHING_SCENARIOS.filter((s) => answers[s.id] !== undefined).length
          : 0,
    [answers, key],
  );
  const totalQuestions =
    key === 'hygiene_assessment'
      ? HYGIENE_QUESTIONS.length
      : key === 'phishing_quiz'
        ? PHISHING_SCENARIOS.length
        : 0;

  if (!valid || !copy) return <Navigate to="/services" replace />;

  const needsTarget =
    key === 'website_check' || key === 'email_check' || key === 'subnet_calculator';
  const needsConsent = key === 'website_check' || key === 'email_check';
  const quizDone = key !== 'phishing_quiz' || answeredCount === PHISHING_SCENARIOS.length;
  const hygieneDone = key !== 'hygiene_assessment' || answeredCount === HYGIENE_QUESTIONS.length;
  const canSubmit = needsTarget
    ? target.trim().length > 2 && (!needsConsent || consent)
    : quizDone && hygieneDone;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setUsedService(null);
    try {
      const response = await publicApi<{ run: { id: string } }>('/free-runs', {
        method: 'POST',
        body: {
          serviceKey: key,
          target: needsTarget ? target.trim() : undefined,
          consentConfirmed: needsConsent ? consent : false,
          fingerprintHash,
          answers: key === 'hygiene_assessment' || key === 'phishing_quiz' ? answers : undefined,
        },
      });
      navigate(`/results/${response.run.id}`);
    } catch (err) {
      if (err instanceof PublicApiError && err.status === 409) {
        const details = err.details as { usedService?: string } | undefined;
        setUsedService(details?.usedService ?? null);
      }
      setError(formatPublicError(err));
    } finally {
      setLoading(false);
    }
  };

  const scenario = PHISHING_SCENARIOS[currentScenario];
  const scenarioAnswer = scenario ? answers[scenario.id] : undefined;

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-navy-950 px-6 py-6 text-white">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                  Free check
                </p>
                <h1 className="mt-1 text-2xl font-semibold">{copy.name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{copy.short}</p>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="px-6 py-6">
            {needsTarget && (
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="target"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    {copy.targetLabel}
                  </label>
                  <Input
                    id="target"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder={
                      key === 'website_check'
                        ? 'https://yourbusiness.co.zm'
                        : key === 'subnet_calculator'
                          ? '192.168.10.42/24'
                          : 'yourbusiness.co.zm'
                    }
                    autoComplete={key === 'subnet_calculator' ? 'off' : 'url'}
                    inputMode={key === 'subnet_calculator' ? 'text' : 'url'}
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    {key === 'website_check'
                      ? 'We make one passive request to the public homepage. We do not attempt to break in.'
                      : key === 'subnet_calculator'
                        ? 'We calculate the network breakdown. No packets are sent and the address is not scanned.'
                        : 'We read public DNS records. No email is sent and no mailbox is accessed.'}
                  </p>
                </div>
                {needsConsent && copy.consent && (
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="font-medium">{copy.consent}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Only check systems you own or have written permission to test.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {key === 'hygiene_assessment' && (
              <div>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Answer {answeredCount} of {HYGIENE_QUESTIONS.length}
                  </p>
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${(answeredCount / HYGIENE_QUESTIONS.length) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-5">
                  {HYGIENE_QUESTIONS.map((question) => (
                    <fieldset key={question.id} className="rounded-lg border border-slate-200 p-4">
                      <legend className="px-1 text-sm font-medium text-slate-800">
                        {question.prompt}
                      </legend>
                      <p className="mt-1 text-xs text-slate-500">{question.help}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ANSWER_LABELS.map((option) => (
                          <label
                            key={option.value}
                            className={`cursor-pointer rounded-md border px-4 py-2 text-sm transition ${
                              answers[question.id] === option.value
                                ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={option.value}
                              checked={answers[question.id] === option.value}
                              onChange={() =>
                                setAnswers((prev) => ({ ...prev, [question.id]: option.value }))
                              }
                              className="sr-only"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
            )}

            {key === 'phishing_quiz' && scenario && (
              <div>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Scenario {currentScenario + 1} of {PHISHING_SCENARIOS.length}
                  </p>
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${(answeredCount / PHISHING_SCENARIOS.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{scenario.channel}</span> ·{' '}
                    {scenario.sender}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-slate-900">{scenario.subject}</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                      {scenario.body}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {scenario.options.map((option, index) => {
                    const selected = scenarioAnswer === String(index);
                    const answered = scenarioAnswer !== undefined;
                    const isCorrect = option.correct;
                    const style = !answered
                      ? 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      : selected
                        ? isCorrect
                          ? 'border-emerald-400 bg-emerald-50'
                          : 'border-red-300 bg-red-50'
                        : isCorrect
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-slate-200 bg-white opacity-70';
                    return (
                      <button
                        key={option.label}
                        type="button"
                        disabled={answered}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [scenario.id]: String(index) }))
                        }
                        className={`flex w-full items-start gap-2 rounded-lg border px-4 py-3 text-left text-sm transition ${style}`}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-semibold">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {scenarioAnswer !== undefined && (
                  <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                    <p className="font-medium">
                      {scenario.options[Number(scenarioAnswer)]?.correct
                        ? 'Correct.'
                        : 'Not quite.'}{' '}
                      {scenario.options[Number(scenarioAnswer)]?.explanation}
                    </p>
                    <p className="mt-1 text-xs text-sky-800">{scenario.lesson}</p>
                    {currentScenario < PHISHING_SCENARIOS.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setCurrentScenario((value) => value + 1)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
                      >
                        Next scenario <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">{error}</p>
                {usedService && (
                  <p className="mt-1 text-xs">
                    Your free check was used for {usedService.replace(/_/g, ' ')}. A free account
                    lets you keep the result and ask for a deeper review.
                  </p>
                )}
                {usedService && (
                  <Link
                    to="/client/signup"
                    className="mt-2 inline-flex items-center gap-1 font-medium underline"
                  >
                    Create a free account <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                Passive checks only. Results are risk indicators.
              </p>
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running check
                  </>
                ) : (
                  <>
                    See my result <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
            {totalQuestions > 0 && !canSubmit && (
              <p className="mt-3 text-right text-xs text-slate-500">
                {key === 'phishing_quiz'
                  ? 'Answer every scenario to see your result.'
                  : 'Answer every question to see your result.'}
              </p>
            )}
            {needsTarget && !canSubmit && (
              <p className="mt-3 text-right text-xs text-slate-500">
                {needsConsent
                  ? 'Enter a target and confirm authorisation to continue.'
                  : 'Enter a network or IP address to continue.'}
              </p>
            )}
          </form>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Free while we test the service. No account required to see the result.
        </p>
      </div>
    </div>
  );
}
