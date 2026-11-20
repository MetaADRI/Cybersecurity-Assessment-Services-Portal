import type { Severity } from '../../../shared/constants';
import { DEFAULT_TIMEZONE } from '../../../shared/constants';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: DEFAULT_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  timeZone: DEFAULT_TIMEZONE,
  dateStyle: 'medium',
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return DATE_TIME.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return DATE_ONLY.format(d);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(targetDate: string | null | undefined): boolean {
  if (!targetDate) return false;
  return targetDate < todayIso();
}

export const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-sky-100 text-sky-800 border-sky-200',
  informational: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const STATUS_STYLES: Record<string, string> = {
  open: 'bg-red-100 text-red-800 border-red-200',
  in_progress: 'bg-sky-100 text-sky-800 border-sky-200',
  pending_verification: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  accepted_risk: 'bg-amber-100 text-amber-800 border-amber-200',
  false_positive: 'bg-slate-200 text-slate-600 border-slate-300',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  archived: 'bg-slate-200 text-slate-600 border-slate-300',
  effective: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  partially_effective: 'bg-amber-100 text-amber-800 border-amber-200',
  ineffective: 'bg-red-100 text-red-800 border-red-200',
  not_assessed: 'bg-slate-100 text-slate-600 border-slate-200',
  not_applicable: 'bg-slate-200 text-slate-600 border-slate-300',
  new: 'bg-sky-100 text-sky-800 border-sky-200',
  contacted: 'bg-sky-100 text-sky-800 border-sky-200',
  closed: 'bg-slate-200 text-slate-600 border-slate-300',
};

export function label(value: string | null | undefined): string {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function scoreColor(score: number | null): string {
  if (score === null) return 'var(--chart-secondary)';
  if (score >= 90) return '#0372e5';
  if (score >= 75) return 'var(--chart-primary)';
  if (score >= 55) return '#b45309';
  return '#b91c1c';
}
