import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { apiErrorMessage } from '../lib/format';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';

/** Mirrors the API's registerSchema so the rule is visible before submitting. */
const MIN_PASSWORD_LENGTH = 8;

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  usePageTitle('Create account');

  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim() !== '' && passwordLongEnough && !loading;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);

    try {
      const response = await apiClient.post('/api/auth/register', {
        name: name.trim() || undefined,
        email,
        password,
      });
      login(response.data.token, response.data.user);
      toast.success('Account created');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create your account.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-500">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">
            Full name <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            autoFocus
            className="input-field"
            placeholder="Ada Lovelace"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="input-field"
            placeholder="you@example.com"
          />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
        />

        {/* Live requirement feedback, rather than a rejection after submitting. */}
        <p
          className={`flex items-center gap-2 text-xs transition-colors ${
            password.length === 0
              ? 'text-slate-400'
              : passwordLongEnough
                ? 'text-emerald-600'
                : 'text-amber-600'
          }`}
          aria-live="polite"
        >
          <Check
            className={`h-3.5 w-3.5 ${passwordLongEnough ? 'opacity-100' : 'opacity-30'}`}
            aria-hidden="true"
          />
          At least {MIN_PASSWORD_LENGTH} characters
        </p>

        <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Creating account...
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default Register;
