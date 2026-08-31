import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { STATUS_CONFIG } from '../lib/status';
import type { DocumentStatus } from '../types';

const ICONS: Record<DocumentStatus, typeof Clock> = {
  UPLOADED: Clock,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle2,
  FAILED: AlertCircle,
};

interface Props {
  status: DocumentStatus;
  size?: 'sm' | 'md';
}

/**
 * One definition of how a document status looks and reads.
 *
 * Dashboard and DocumentDetail each used to carry their own colour ternary, and
 * they disagreed. Labels are written for people rather than echoing the enum:
 * "Queued" tells a user something, "UPLOADED" does not.
 */
export function StatusBadge({ status, size = 'sm' }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.UPLOADED;
  const Icon = ICONS[status] ?? Clock;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${config.className} ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
      title={config.description}
    >
      <Icon
        className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${config.spin ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
