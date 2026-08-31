import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, FileText, MessageSquare, Sparkles } from 'lucide-react';

import apiClient from '../api/client';
import { usePageTitle } from '../hooks/usePageTitle';
import { apiErrorMessage, formatAbsoluteTime, formatRelativeTime } from '../lib/format';
import { IN_PROGRESS_STATUSES } from '../types';
import type { DocumentDetail as Doc } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { statusDescription } from '../lib/status';
import { EmptyState, FullPageSpinner, Spinner } from '../components/ui';

const POLL_INTERVAL_MS = 4000;

const DocumentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  usePageTitle(doc?.title);

  const load = useCallback(
    async (quiet = false) => {
      if (!id || inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        // Uses the dedicated endpoint. This page used to fetch the whole list and
        // search it client-side, so any document past the first page of results
        // reported "not found".
        const res = await apiClient.get(`/api/documents/${id}`);
        if (!mountedRef.current) return;
        setDoc(res.data.document as Doc);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        if (!quiet) setError(apiErrorMessage(err, 'Could not load this document.'));
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current && !quiet) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Keep the page live while the worker is still on this document, so the
  // "Processing..." panel actually resolves instead of sitting there forever.
  const isPending = doc ? IN_PROGRESS_STATUSES.includes(doc.status) : false;

  useEffect(() => {
    if (!isPending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPending, load]);

  if (loading) return <FullPageSpinner label="Loading document" />;

  if (error || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <EmptyState
            tone="error"
            icon={<AlertCircle className="h-8 w-8" />}
            title="Document not available"
            description={error ?? 'This document does not exist, or it is not yours.'}
            action={
              <Link to="/dashboard" className="btn-primary">
                Back to documents
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const isReady = doc.status === 'COMPLETED';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 p-5 md:p-12">
      <div className="bg-orbs pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-4xl">
        <Link
          to="/dashboard"
          className="group mb-8 inline-flex items-center gap-3 text-sm font-semibold text-slate-500 transition-colors hover:text-brand-600"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white shadow-sm transition-transform group-hover:-translate-x-1">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </span>
          Back to documents
        </Link>

        <article className="glass-panel overflow-hidden rounded-4xl">
          <header className="flex flex-col items-start justify-between gap-6 border-b border-slate-200/60 bg-white/40 p-6 md:flex-row md:p-10">
            <div className="flex min-w-0 items-start gap-5">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-100 bg-gradient-to-tr from-brand-50 to-purple-50 text-brand-600"
                aria-hidden="true"
              >
                <FileText className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <h1 className="mb-3 break-words text-2xl font-bold tracking-tight md:text-3xl">
                  {doc.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={doc.status} size="md" />
                  <time
                    className="text-sm font-medium text-slate-500"
                    dateTime={doc.createdAt}
                    title={formatAbsoluteTime(doc.createdAt)}
                  >
                    Uploaded {formatRelativeTime(doc.createdAt)}
                  </time>
                  {typeof doc.chunkCount === 'number' && doc.chunkCount > 0 && (
                    <span className="text-sm font-medium text-slate-400">
                      {doc.chunkCount} indexed sections
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isReady ? (
              <Link to={`/documents/${doc.id}/chat`} className="btn-primary w-full md:w-auto">
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
                Start chat
              </Link>
            ) : (
              <span
                className="w-full cursor-not-allowed rounded-2xl bg-slate-100 px-5 py-3.5 text-center font-semibold text-slate-400 md:w-auto"
                title={statusDescription(doc.status)}
              >
                Chat unavailable
              </span>
            )}
          </header>

          <div className="bg-white/60 p-6 md:p-10">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold">
              <span className="rounded-lg bg-purple-100 p-2 text-purple-600" aria-hidden="true">
                <Sparkles className="h-5 w-5" />
              </span>
              AI summary
            </h2>

            {isReady ? (
              <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                {doc.summary || 'No summary was generated for this document.'}
              </p>
            ) : doc.status === 'FAILED' ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-6">
                <div className="mb-2 flex items-center gap-2 font-semibold text-red-800">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                  Processing failed
                </div>
                {/* The worker records why; showing it saves a support round-trip. */}
                <p className="text-sm leading-relaxed text-red-700">
                  {doc.errorMessage ||
                    'No further detail was recorded. Try uploading the document again.'}
                </p>
                <p className="mt-4 text-sm text-red-600/80">
                  Scanned PDFs with no text layer cannot be processed, because text extraction does
                  not perform OCR.
                </p>
              </div>
            ) : (
              <div
                className="rounded-3xl border border-slate-200/60 bg-white/60 p-8 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="mb-4 flex justify-center">
                  <Spinner className="h-8 w-8" />
                </div>
                <p className="font-semibold text-slate-700">
                  {doc.status === 'UPLOADED' ? 'Queued for processing' : 'Processing document'}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {statusDescription(doc.status)} This page updates on its own.
                </p>
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
};

export default DocumentDetailPage;
