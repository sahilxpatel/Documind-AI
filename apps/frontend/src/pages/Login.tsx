import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { apiErrorMessage } from '../lib/format';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  usePageTitle('Sign in');

  // ProtectedRoute records the page that triggered the redirect.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const response = await apiClient.post('/api/auth/login', { email, password });
      login(response.data.token, response.data.user);
      toast.success('Welcome back');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not sign you in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-500">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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
            // Correct autocomplete tokens let password managers fill the form.
            autoComplete="email"
            autoFocus
            className="input-field"
            placeholder="you@example.com"
          />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Signing in...
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default Login;
