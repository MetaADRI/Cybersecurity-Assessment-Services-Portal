import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Timestamps are stored as UTC ISO-8601 strings and displayed in Africa/Lusaka. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  return nowIso().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isOverdue(targetDate: string | null | undefined, now = new Date()): boolean {
  if (!targetDate) return false;
  return targetDate < now.toISOString().slice(0, 10);
}

const LUSAKA_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lusaka',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatInLusaka(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return LUSAKA_FORMATTER.format(d);
}
