import type { DocumentStatus } from '../types';

/**
 * How each pipeline status is presented. Kept out of the component file so the
 * config can be imported without pulling in React, and so the component module
 * exports only components (which is what Fast Refresh expects).
 */
export const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; className: string; spin: boolean; description: string }
> = {
  UPLOADED: {
    label: 'Queued',
    className: 'bg-amber-50 text-amber-700 border-amber-200/70',
    spin: false,
    description: 'Waiting for a worker to pick it up.',
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-brand-50 text-brand-700 border-brand-200/70',
    spin: true,
    description: 'Extracting text, summarising and indexing.',
  },
  COMPLETED: {
    label: 'Ready',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    spin: false,
    description: 'Summarised and searchable.',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200/70',
    spin: false,
    description: 'Processing did not complete.',
  },
};

export function statusDescription(status: DocumentStatus): string {
  return STATUS_CONFIG[status]?.description ?? '';
}
