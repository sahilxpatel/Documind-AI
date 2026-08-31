import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';

interface Props {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}

/** Shared chrome for sign in and sign up, which were near-identical copies. */
export function AuthLayout({ title, subtitle, children }: Props) {
  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-slate-50 px-4 py-12 sm:px-6">
      <div className="bg-orbs pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <Link to="/" className="group mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-purple-500 shadow-lg shadow-brand-500/20 transition-transform group-hover:scale-105">
            <FileText className="h-6 w-6 text-white" aria-hidden="true" />
          </span>
          <span className="text-2xl font-bold">DocuMind AI</span>
        </Link>

        <div className="glass-panel rounded-4xl px-6 py-9 sm:px-10">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
