import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <>
      <Loader2 className={`${className} animate-spin text-brand-500`} aria-hidden="true" />
      {/* Announces the wait instead of leaving a screen reader on a silent page. */}
      <span className="sr-only">Loading</span>
    </>
  );
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-brand-500" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'error';
}

export function EmptyState({ icon, title, description, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div
      className={`card flex flex-col items-center rounded-4xl border-dashed px-6 py-16 text-center ${
        tone === 'error' ? 'border-red-200 bg-red-50/50' : 'border-slate-300'
      }`}
    >
      <div
        className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
          tone === 'error' ? 'bg-red-100 text-red-500' : 'bg-brand-50 text-brand-500'
        }`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Card-shaped placeholder used while the document list loads. */
export function DocumentSkeleton() {
  return (
    <div className="card flex h-56 flex-col p-6" aria-hidden="true">
      <div className="mb-5 flex items-start justify-between">
        <div className="skeleton h-12 w-12 rounded-2xl" />
        <div className="skeleton h-6 w-20 rounded-full" />
      </div>
      <div className="skeleton mb-3 h-5 w-3/4 rounded" />
      <div className="skeleton mb-2 h-3.5 w-full rounded" />
      <div className="skeleton h-3.5 w-5/6 rounded" />
      <div className="mt-auto flex justify-between border-t border-slate-200/60 pt-5">
        <div className="skeleton h-5 w-20 rounded" />
        <div className="skeleton h-5 w-24 rounded" />
      </div>
    </div>
  );
}
