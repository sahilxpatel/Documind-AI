import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  FileText,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Search as SearchIcon,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import { usePageTitle } from '../hooks/usePageTitle';
import { apiErrorMessage, formatAbsoluteTime, formatRelativeTime } from '../lib/format';
import type { DocumentSummary } from '../types';
import GlobalSearch from '../components/GlobalSearch';
import { StatusBadge } from '../components/StatusBadge';
import { UploadDropzone } from '../components/UploadDropzone';
import { DocumentSkeleton, EmptyState } from '../components/ui';

type Tab = 'documents' | 'search' | 'settings';

const TABS: { id: Tab; label: string; Icon: typeof FileText }[] = [
  { id: 'documents', label: 'My Documents', Icon: FileText },
  { id: 'search', label: 'Global Search', Icon: SearchIcon },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>('documents');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { documents, loading, error, hasPending, refresh } = useDocuments();

  usePageTitle(TABS.find((t) => t.id === activeTab)?.label);

  // Close the mobile drawer on Escape, which is what every other drawer does.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      await apiClient.post('/api/documents/upload', (() => {
        const form = new FormData();
        form.append('file', file);
        return form;
      })(), { headers: { 'Content-Type': 'multipart/form-data' } });

      // Deliberately not "uploaded successfully": the work happens afterwards in
      // a background worker, and promising success here is why users used to
      // wonder where their summary was.
      toast.success('Uploaded. Processing starts in a moment.', { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Upload failed. Please try again.'), { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="bg-orbs pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" />

      {/* Lets keyboard users jump past the navigation. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Mobile top bar */}
      <div className="absolute left-0 top-0 z-30 flex w-full items-center justify-between border-b border-slate-200/60 bg-white/85 p-4 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-500 to-purple-500">
            <FileText className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold">DocuMind</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="rounded-lg p-2 text-slate-600"
          aria-expanded={mobileNavOpen}
          aria-controls="app-nav"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileNavOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/*
        Always rendered, shown/hidden with CSS.
        The old version gated on `window.innerWidth >= 768` during render, which
        is not reactive: resizing the window left the sidebar in the wrong state.
      */}
      <aside
        id="app-nav"
        className={`glass-panel fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-y-0 border-l-0 transition-transform duration-300 md:relative md:translate-x-0
          ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="hidden items-center gap-3 border-b border-slate-200/50 p-6 md:flex">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-purple-500 shadow-lg shadow-brand-500/20">
            <FileText className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <span className="text-xl font-bold">DocuMind AI</span>
        </div>

        <nav className="mt-16 flex-1 space-y-1.5 p-4 md:mt-0" aria-label="Main">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveTab(id);
                  setMobileNavOpen(false);
                }}
                // Tells assistive tech which view is showing, not just colour.
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'border border-slate-200/60 bg-white font-semibold text-brand-600 shadow-sm'
                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200/50 p-4">
          {user && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700"
                aria-hidden="true"
              >
                {(user.name || user.email).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {user.name || 'Signed in'}
                </span>
                <span className="block truncate text-xs text-slate-500">{user.email}</span>
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-slate-500 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm md:hidden"
          aria-label="Close menu"
        />
      )}

      <main id="main-content" className="relative z-10 flex-1 overflow-y-auto pt-16 md:pt-0">
        <div className="mx-auto max-w-6xl p-4 sm:p-8 lg:p-12">
          {activeTab === 'search' && <GlobalSearch />}

          {activeTab === 'settings' && <SettingsPanel documentCount={documents.length} />}

          {activeTab === 'documents' && (
            <div className="animate-fade-in-up">
              <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">My Documents</h1>
                  <p className="mt-2 text-slate-500">
                    Upload a PDF, then search it or ask questions about it.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="btn-ghost border border-slate-200/70 bg-white/60"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Refresh
                </button>
              </header>

              <UploadDropzone
                uploading={uploading}
                onFile={handleUpload}
                onReject={(reason) => toast.error(reason)}
              />

              {/*
                Announces background status changes. Without this, a screen reader
                user has no idea a document finished processing.
              */}
              <p aria-live="polite" className="sr-only">
                {hasPending
                  ? 'Some documents are still processing. This list updates automatically.'
                  : `${documents.length} documents ready.`}
              </p>

              {hasPending && (
                <div className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-brand-50/70 px-4 py-3 text-sm text-brand-800">
                  <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
                  </span>
                  Processing in the background. This list refreshes on its own.
                </div>
              )}

              {error && (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => void refresh()} className="font-semibold underline">
                    Retry
                  </button>
                </div>
              )}

              {loading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <DocumentSkeleton key={i} />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-8 w-8" />}
                  title="No documents yet"
                  description="Upload your first PDF above. DocuMind will summarise it and make it searchable."
                />
              ) : (
                <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {documents.map((doc) => (
                    <li key={doc.id}>
                      <DocumentCard doc={doc} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

function DocumentCard({ doc }: { doc: DocumentSummary }) {
  const isReady = doc.status === 'COMPLETED';

  return (
    <article className="card-interactive group relative flex h-full flex-col overflow-hidden p-6">
      <span
        className="absolute left-0 top-0 h-1 w-full origin-left scale-x-0 bg-gradient-to-r from-brand-500 via-purple-500 to-pink-500 transition-transform duration-500 group-hover:scale-x-100"
        aria-hidden="true"
      />

      <div className="mb-4 flex items-start justify-between gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
          aria-hidden="true"
        >
          <FileText className="h-5 w-5" />
        </span>
        <StatusBadge status={doc.status} />
      </div>

      <h3 className="mb-2 truncate text-lg font-bold text-slate-900" title={doc.title}>
        {doc.title}
      </h3>

      {doc.status === 'FAILED' ? (
        // Surfaces the worker's actual reason instead of a generic apology.
        <p className="mb-5 line-clamp-3 flex-1 text-sm leading-relaxed text-red-600">
          {doc.errorMessage || 'Processing failed. Try uploading the file again.'}
        </p>
      ) : (
        <p className="mb-5 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500">
          {doc.summary ||
            (isReady ? 'No summary was generated.' : 'The summary appears here once processing finishes.')}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-slate-200/60 pt-4">
        <time
          className="text-xs font-medium text-slate-400"
          dateTime={doc.createdAt}
          title={formatAbsoluteTime(doc.createdAt)}
        >
          {formatRelativeTime(doc.createdAt)}
        </time>

        <div className="flex items-center gap-2">
          <Link
            to={`/documents/${doc.id}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            View
          </Link>

          {/*
            Chat is only meaningful once the document is indexed. Rendering a
            disabled control with a reason beats a link that 409s.
          */}
          {isReady ? (
            <Link
              to={`/documents/${doc.id}/chat`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-100"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Chat
            </Link>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-400"
              title={
                doc.status === 'FAILED'
                  ? 'Chat is unavailable because processing failed.'
                  : 'Chat becomes available once processing finishes.'
              }
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Chat
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The Settings tab previously rendered the documents view, because the page only
 * branched on 'search'. It now shows something real.
 */
function SettingsPanel({ documentCount }: { documentCount: number }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in-up mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-slate-500">Your account and workspace.</p>
      </header>

      <section className="card mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">Account</h2>
        <dl className="divide-y divide-slate-200/70 text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-800">{user?.name || 'Not set'}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-500">Email</dt>
            <dd className="truncate font-medium text-slate-800">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-500">Documents</dt>
            <dd className="font-medium text-slate-800">{documentCount}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-6">
        <h2 className="mb-2 text-lg font-semibold">Session</h2>
        <p className="mb-4 text-sm text-slate-500">
          Signing out clears your access token from this browser.
        </p>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-100"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </section>
    </div>
  );
}

export default Dashboard;
