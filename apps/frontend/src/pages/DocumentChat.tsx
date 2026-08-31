import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Bot, FileText, Send, User } from 'lucide-react';

import apiClient from '../api/client';
import { usePageTitle } from '../hooks/usePageTitle';
import { apiErrorMessage } from '../lib/format';
import type { ChatMessage, DocumentDetail } from '../types';
import { EmptyState, FullPageSpinner } from '../components/ui';

const SUGGESTIONS = [
  'Summarise this in three bullet points.',
  'What are the key dates or numbers?',
  'What action items does this contain?',
];

const DocumentChat = () => {
  const { id } = useParams<{ id: string }>();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  usePageTitle(doc ? `Chat: ${doc.title}` : 'Chat');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      // Fetch the document and the history together: the document tells us
      // whether chat is even possible yet.
      const [docResult, historyResult] = await Promise.allSettled([
        apiClient.get(`/api/documents/${id}`),
        apiClient.get(`/api/chat/${id}`),
      ]);

      if (cancelled) return;

      if (docResult.status === 'fulfilled') {
        setDoc(docResult.value.data.document as DocumentDetail);
      } else {
        setLoadError(apiErrorMessage(docResult.reason, 'Could not load this document.'));
      }

      if (historyResult.status === 'fulfilled') {
        const history = (historyResult.value.data.messages ?? []).map(
          (m: { id: string; role: string; content: string; createdAt: string }) => ({
            id: m.id,
            role: m.role === 'USER' ? ('user' as const) : ('ai' as const),
            content: m.content,
            createdAt: m.createdAt,
          }),
        );
        setMessages(history);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Only auto-scroll for new messages, not on every keystroke.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending) return;

      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const res = await apiClient.post(`/api/chat/${id}`, { message: question });
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: res.data.answer || 'No answer was returned.',
            // The API returns the passages it grounded the answer in.
            sources: res.data.sources ?? [],
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'ai',
            content: apiErrorMessage(err, 'Something went wrong answering that. Please try again.'),
            failed: true,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [id, sending],
  );

  if (loading) return <FullPageSpinner label="Loading conversation" />;

  // Chat depends on the search index, which only exists once the worker finishes.
  // Blocking here beats letting the user type a question and receive a 409.
  if (loadError || !doc || doc.status !== 'COMPLETED') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <EmptyState
            tone={doc?.status === 'FAILED' || loadError ? 'error' : 'neutral'}
            icon={doc?.status === 'FAILED' || loadError ? <AlertCircle className="h-8 w-8" /> : <FileText className="h-8 w-8" />}
            title={
              loadError
                ? 'Document not available'
                : doc?.status === 'FAILED'
                  ? 'This document failed to process'
                  : 'Still processing'
            }
            description={
              loadError ??
              (doc?.status === 'FAILED'
                ? doc.errorMessage || 'Chat needs a processed document. Try uploading it again.'
                : 'Chat becomes available once the document has been summarised and indexed.')
            }
            action={
              <Link to={id ? `/documents/${id}` : '/dashboard'} className="btn-primary">
                {id ? 'View document' : 'Back to documents'}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-50">
      <div className="bg-orbs pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" />

      <header className="glass-panel z-20 flex items-center gap-4 border-x-0 border-t-0 px-4 py-3.5 sm:px-6">
        <Link
          to={`/documents/${id}`}
          className="rounded-full border border-slate-200/50 bg-white/50 p-2.5 text-slate-500 transition-colors hover:bg-white"
          aria-label="Back to document"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          {/* Shows which document you are talking to, which the old header did not. */}
          <h1 className="truncate text-lg font-bold tracking-tight" title={doc.title}>
            {doc.title}
          </h1>
          <p className="text-sm text-slate-500">Answers come only from this document.</p>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6 pb-40">
          {messages.length === 0 ? (
            <div className="py-12 text-center sm:py-20">
              <span
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-4xl border border-brand-100/50 bg-gradient-to-tr from-brand-100 to-purple-100"
                aria-hidden="true"
              >
                <Bot className="h-8 w-8 text-brand-500" />
              </span>
              <h2 className="mb-2 text-xl font-bold text-slate-800">Ask about this document</h2>
              <p className="mb-8 text-sm text-slate-500">
                Try one of these, or write your own question.
              </p>

              {/* Removes the blank-page problem: gives people a way in. */}
              <ul className="mx-auto flex max-w-lg flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void send(s)}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-all hover:border-brand-300 hover:bg-white hover:text-brand-700"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="space-y-6" aria-live="polite">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-brand-600 text-white'
                        : msg.failed
                          ? 'bg-red-100 text-red-600'
                          : 'border border-brand-100/50 bg-gradient-to-tr from-purple-100 to-brand-50 text-brand-600'
                    }`}
                    aria-hidden="true"
                  >
                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </span>

                  <div className="max-w-[85%] space-y-2 sm:max-w-[78%]">
                    <div
                      className={`rounded-3xl px-4 py-3 text-sm leading-relaxed sm:px-5 sm:text-base ${
                        msg.role === 'user'
                          ? 'rounded-tr-md bg-brand-600 text-white'
                          : msg.failed
                            ? 'rounded-tl-md border border-red-200 bg-red-50 text-red-700'
                            : 'rounded-tl-md border border-slate-200/60 bg-white/85 text-slate-800'
                      }`}
                    >
                      <span className="sr-only">{msg.role === 'user' ? 'You said: ' : 'Assistant said: '}</span>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {/* Citations. Lets the reader check the answer against the source. */}
                    {msg.sources && msg.sources.length > 0 && (
                      <details className="group rounded-2xl border border-slate-200/60 bg-white/60 px-4 py-2.5">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-500 transition-colors hover:text-brand-600">
                          {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} from this
                          document
                        </summary>
                        <ul className="mt-3 space-y-2.5">
                          {msg.sources.map((source, i) => (
                            <li
                              key={i}
                              className="border-l-2 border-brand-200 pl-3 text-xs leading-relaxed text-slate-600"
                            >
                              {typeof source.chunkIndex === 'number' && (
                                <span className="mb-1 block font-semibold text-slate-400">
                                  Section {source.chunkIndex + 1}
                                </span>
                              )}
                              <q className="italic">{source.excerpt}</q>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {sending && (
            <div className="flex gap-3" role="status">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-brand-100/50 bg-gradient-to-tr from-purple-100 to-brand-50 text-brand-600"
                aria-hidden="true"
              >
                <Bot className="h-4 w-4" />
              </span>
              <div className="flex items-center gap-1.5 rounded-3xl rounded-tl-md border border-slate-200/60 bg-white/85 px-5 py-4">
                <span className="sr-only">Thinking</span>
                {[0, 0.2, 0.4].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 animate-bounce rounded-full bg-brand-400"
                    style={{ animationDelay: `${delay}s` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={endRef} className="h-1" />
        </div>
      </main>

      <footer className="pointer-events-none absolute bottom-0 z-20 w-full bg-gradient-to-t from-slate-50 via-slate-50 to-transparent p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="pointer-events-auto mx-auto max-w-3xl"
        >
          <label htmlFor="chat-input" className="sr-only">
            Ask a question about this document
          </label>
          <div className="relative flex items-end">
            {/*
              A textarea rather than an input, so long questions are visible while
              being typed. Enter sends; Shift+Enter makes a new line.
            */}
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask a question..."
              disabled={sending}
              className="max-h-40 w-full resize-none rounded-3xl border border-slate-200/80 bg-white/95 py-4 pl-5 pr-16 font-medium text-slate-800 shadow-glass backdrop-blur-xl transition-all placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send question"
              className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white transition-all hover:bg-brand-700 active:scale-95 disabled:bg-slate-300 disabled:active:scale-100"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">
            Enter to send, Shift+Enter for a new line.
          </p>
        </form>
      </footer>
    </div>
  );
};

export default DocumentChat;
