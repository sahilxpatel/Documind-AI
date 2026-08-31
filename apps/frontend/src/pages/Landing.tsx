import { Link } from 'react-router-dom';
import { ArrowRight, Bot, FileText, Search, Sparkles, Upload, Zap } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

const REPO_URL = 'https://github.com/sahilxpatel/Documind-AI';

const FEATURES = [
  {
    Icon: Bot,
    title: 'Grounded chat',
    tint: 'bg-brand-50 text-brand-600',
    body: 'Ask questions and get answers drawn from your document, with the source passages attached so you can check them.',
  },
  {
    Icon: Search,
    title: 'Semantic search',
    tint: 'bg-purple-50 text-purple-600',
    body: 'Search by meaning, not just keywords. Hybrid retrieval combines vector similarity with classic keyword scoring.',
  },
  {
    Icon: Sparkles,
    title: 'Automatic summaries',
    tint: 'bg-pink-50 text-pink-600',
    body: 'Every upload is summarised in the background, so you know what a document contains before opening it.',
  },
];

const STEPS = [
  { Icon: Upload, title: 'Upload a PDF', body: 'Drag it in. Up to 10 MB.' },
  {
    Icon: Zap,
    title: 'We process it',
    body: 'Text extraction, summary and indexing run in the background. No waiting on a loading bar.',
  },
  { Icon: Bot, title: 'Ask anything', body: 'Search across everything, or chat with one document.' },
];

const Landing = () => {
  const { isAuthenticated } = useAuth();
  usePageTitle();

  // Sending a signed-out visitor to /dashboard just bounces them to /login.
  const primaryHref = isAuthenticated ? '/dashboard' : '/register';
  const primaryLabel = isAuthenticated ? 'Go to your documents' : 'Get started free';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="bg-orbs pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="DocuMind AI home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-purple-500 shadow-lg shadow-brand-500/20">
            <FileText className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold">DocuMind AI</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Account">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn-primary px-5 py-2.5 text-sm">
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link to="/register" className="btn-primary px-5 py-2.5 text-sm">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex max-w-4xl flex-col items-center px-5 pb-20 pt-16 text-center sm:pt-24">
          <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/60 px-4 py-2 text-sm font-medium text-brand-700 backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
            Running on Azure OpenAI and AI Search
          </p>

          <h1 className="mb-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            Stop scrolling through
            <br className="hidden sm:block" /> PDFs to find{' '}
            <span className="bg-gradient-to-r from-brand-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              one answer.
            </span>
          </h1>

          <p className="mb-10 max-w-2xl text-lg leading-relaxed text-slate-500">
            Upload a document and DocuMind summarises it, makes it searchable by meaning, and answers
            questions about it, citing the passages it used.
          </p>

          <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link to={primaryHref} className="btn-primary w-full px-7 py-4 sm:w-auto">
              {primaryLabel}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            {/* Was a dead button; now points at something that exists. */}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="w-full rounded-2xl border border-slate-200 bg-white/60 px-7 py-4 text-center font-medium text-slate-700 backdrop-blur-sm transition-all hover:bg-white sm:w-auto"
            >
              View the source
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-10 text-center text-2xl font-bold tracking-tight">
            How it works
          </h2>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map(({ Icon, title, body }, i) => (
              <li key={title} className="card flex flex-col p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                </div>
                <h3 className="mb-1.5 font-bold text-slate-900">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24" aria-labelledby="features">
          <h2 id="features" className="sr-only">
            Features
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {FEATURES.map(({ Icon, title, body, tint }) => (
              <article key={title} className="card-interactive group p-7">
                <span
                  className={`mb-5 flex h-13 w-13 items-center justify-center rounded-2xl p-3 transition-transform group-hover:scale-110 ${tint}`}
                  aria-hidden="true"
                >
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mb-2.5 text-lg font-bold text-slate-900">{title}</h3>
                <p className="leading-relaxed text-slate-500">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
          <div className="card rounded-4xl px-6 py-12">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">Try it with one document</h2>
            <p className="mx-auto mb-7 max-w-md text-slate-500">
              No setup. Upload a PDF and see the summary come back.
            </p>
            <Link to={primaryHref} className="btn-primary px-7 py-4">
              {primaryLabel}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-sm text-slate-400 sm:flex-row">
          <p>DocuMind AI</p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-slate-600"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
