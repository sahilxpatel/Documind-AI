import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { IN_PROGRESS_STATUSES } from '../types';
import type { DocumentSummary } from '../types';
import { apiErrorMessage } from '../lib/format';

/** How often to re-check while at least one document is still processing. */
const POLL_INTERVAL_MS = 4000;
/** Stop polling after this long so an abandoned tab does not poll forever. */
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

interface State {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the document list and keeps it fresh while anything is processing.
 *
 * Uploads are asynchronous: the API returns 202 and a background worker does the
 * parsing, summarising and indexing. Without polling the card sits at UPLOADED
 * until the user reloads by hand, which reads as the app being broken.
 */
export function useDocuments() {
  const [state, setState] = useState<State>({
    documents: [],
    loading: true,
    error: null,
  });

  // Refs so the polling effect never needs to re-subscribe when data changes.
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    // Skip if a request is already outstanding, otherwise a slow response and a
    // fast interval stack up.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!options.quiet) {
      setState((prev) => ({ ...prev, loading: true }));
    }

    try {
      const res = await apiClient.get('/api/documents', { params: { limit: 100 } });
      if (!mountedRef.current) return;
      setState({
        documents: (res.data.documents ?? []) as DocumentSummary[],
        loading: false,
        error: null,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        // A failed background refresh should not wipe the list already on screen.
        error: options.quiet ? prev.error : apiErrorMessage(error, 'Could not load your documents.'),
      }));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const hasPending = state.documents.some((doc) => IN_PROGRESS_STATUSES.includes(doc.status));

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!hasPending) return;
    if (Date.now() - startedAtRef.current > MAX_POLL_DURATION_MS) return;

    timerRef.current = window.setInterval(() => {
      // Pause while the tab is hidden: a background tab does not need updates,
      // and each poll costs a database query.
      if (document.visibilityState === 'visible') {
        void load({ quiet: true });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [hasPending, load]);

  // Refresh immediately when the user returns to the tab, so they do not stare
  // at stale state for up to a full interval.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasPending) {
        void load({ quiet: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hasPending, load]);

  const refresh = useCallback(() => {
    startedAtRef.current = Date.now();
    return load({ quiet: true });
  }, [load]);

  return { ...state, hasPending, refresh };
}
