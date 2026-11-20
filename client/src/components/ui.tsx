import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import type { Severity } from '../../../shared/constants';
import { SEVERITY_STYLES, STATUS_STYLES, label } from '../lib/format';
import { Logo } from './Logo';

export function Card({
  children,
  className = '',
  title,
  description,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  className = '',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
    danger: 'bg-red-700 text-white hover:bg-red-800 border-red-700',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  };
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={SEVERITY_STYLES[severity]}>{label(severity)}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700 border-slate-200'}>
      {label(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    P1: 'bg-red-700 text-white border-red-700',
    P2: 'bg-orange-600 text-white border-orange-600',
    P3: 'bg-amber-100 text-amber-900 border-amber-300',
    P4: 'bg-slate-200 text-slate-700 border-slate-300',
  };
  return <Badge className={styles[priority] ?? styles.P4}>{priority}</Badge>;
}

export function Spinner({ label: text = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
      <span className="relative flex h-9 w-9 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-blue-500/30 [animation-duration:2s]" />
        <span className="absolute inset-0 rounded-full bg-blue-500/10" />
        <Logo mark alt="" className="relative h-6 w-6" />
      </span>
      {text}...
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Field({
  label: labelText,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {labelText}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

const controlClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return (
      <p className="text-xs text-slate-500">
        {total} record{total === 1 ? '' : 's'}
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <p className="text-xs text-slate-500">
        Page {page} of {pages} - {total} records
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function StatTile({
  label: labelText,
  value,
  tone = 'default',
  hint,
  to,
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'critical' | 'warning' | 'good';
  hint?: string;
  to?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    critical: 'text-red-700',
    warning: 'text-amber-700',
    good: 'text-emerald-700',
  };
  const body = (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelText}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Horizontal bar used for category score summaries. */
export function ScoreBar({ label: labelText, value }: { label: string; value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color =
    value === null
      ? 'var(--chart-secondary)'
      : pct >= 90
        ? '#0372e5'
        : pct >= 75
          ? 'var(--chart-primary)'
          : pct >= 55
            ? '#b45309'
            : '#b91c1c';
  return (
    <div className="flex items-center gap-3">
      <span className="w-48 shrink-0 truncate text-xs text-slate-600" title={labelText}>
        {labelText}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        {value === null ? (
          <div className="h-full w-full bg-slate-300" style={{ opacity: 0.5 }} />
        ) : (
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        )}
      </div>
      <span className="w-16 text-right text-xs font-semibold text-slate-700">
        {value === null ? 'Unknown' : `${value.toFixed(0)}%`}
      </span>
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return <div className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}
