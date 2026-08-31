import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  /** Shown under the field so the rule is known before submitting, not after. */
  hint?: string;
  minLength?: number;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  minLength,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          // Toggling type is the accessible way to do "show password": it keeps
          // the field a real password input for autofill and password managers.
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="input-field pr-12"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:text-slate-600"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}
