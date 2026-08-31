import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Loader2, Search as SearchIcon, Sparkles } from 'lucide-react';

import apiClient from '../api/client';
import { apiErrorMessage } from '../lib/format';
import type { SearchResult } from '../types';
import { EmptyState } from './ui';

const DEBOUNCE_MS = 400;

const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lets an in-flight request be discarded when the query changes again, so a
  // slow earlier search cannot overwrite the newer results.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await apiClient.get('/api/search', { params: { q: trimmed } });
        if (requestId !== requestIdRef.current) return;
        setResults((res.data.results ?? []) as SearchResult[]);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setError(apiErrorMessage(err, 'Search failed. Please try again.'));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl">
      <header className="mb-8 text-center">
        <span
          className="mb-4 inline-flex items-center justify-center rounded-2xl bg-purple-100 p-3 text-purple-600"
          aria-hidden="true"
        >
          <Sparkles className="h-7 w-7" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight">Global search</h1>
        <p className="mt-2 text-slate-500">
          Semantic search across every document you have processed.
        </p>
      </header>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative mb-10">
        <label htmlFor="global-search" className="sr-only">
          Search your documents
        </label>
        <SearchIcon
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by meaning, not just keywords..."
          autoComplete="off"
          className="w-full rounded-full border border-slate-200/80 bg-white/85 py-4 pl-14 pr-14 text-base font-medium text-slate-800 shadow-glass backdrop-blur-xl transition-all placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
        {loading && (
          <span className="absolute right-5 top-1/2 -translate-y-1/2" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden="true" />
            <span className="sr-only">Searching</span>
          </span>
        )}
      </form>

      {/* Announces result counts to screen readers as the user types. */}
      <p aria-live="polite" className="sr-only">
        {loading
          ? 'Searching'
          : searched
            ? `${results.length} results for ${query}`
            : ''}
      </p>

      {error ? (
        <EmptyState
          tone="error"
          icon={<SearchIcon className="h-8 w-8" />}
          title="Search unavailable"
          description={error}
        />
      ) : searched && results.length === 0 && !loading ? (
        <EmptyState
          icon={<SearchIcon className="h-8 w-8" />}
          title={`No matches for "${query}"`}
          description="Try different wording. Only documents that finished processing are searchable."
        />
      ) : (
        <ul className="space-y-4">
          {results.map((result) => (
            <li key={result.id}>
              <article className="card-interactive p-5 sm:p-6">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600"
                      aria-hidden="true"
                    >
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      {/* The document name, which the old UI never showed. */}
                      <h2 className="truncate font-bold text-slate-900" title={result.documentTitle}>
                        {result.documentTitle}
                      </h2>
                      {typeof result.chunkIndex === 'number' && (
                        <p className="text-xs font-medium text-slate-400">
                          Section {result.chunkIndex + 1}
                        </p>
                      )}
                    </div>
                  </div>

                  <RelevanceMeter score={result.score} />
                </div>

                <p className="mb-4 rounded-2xl border border-slate-100 bg-white/70 p-4 text-sm italic leading-relaxed text-slate-600">
                  {result.content.trim()}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/documents/${result.documentId}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    View document
                  </Link>
                  <Link
                    to={`/documents/${result.documentId}/chat`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-100"
                  >
                    Ask about it
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Hybrid search scores are unbounded, so a raw percentage would be misleading.
 * This shows relative confidence without implying a precise figure.
 */
function RelevanceMeter({ score }: { score: number }) {
  const normalised = Math.max(0, Math.min(1, score / 0.05));
  const label = normalised > 0.66 ? 'Strong match' : normalised > 0.33 ? 'Good match' : 'Weak match';

  return (
    <div className="flex shrink-0 items-center gap-2" title={`Relevance score ${score.toFixed(4)}`}>
      <span className="hidden text-xs font-semibold text-slate-400 sm:inline">{label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0.33, 0.66, 1].map((threshold) => (
          <span
            key={threshold}
            className={`h-4 w-1.5 rounded-full ${
              normalised >= threshold - 0.33 ? 'bg-brand-500' : 'bg-slate-200'
            }`}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default GlobalSearch;
