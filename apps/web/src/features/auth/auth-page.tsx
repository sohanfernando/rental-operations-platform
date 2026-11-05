import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Aperture, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import studioCamera from '../../assets/studio-camera.jpg';
import { api, request } from '../../shared/api';
import { sessionKey, type User, useSession } from './session';

export function AuthPage({ register = false }: { register?: boolean }) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const session = useSession();
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const returnTo = typeof state?.returnTo === 'string' && /^\/equipment\/\d+$/.test(state.returnTo)
    ? state.returnTo
    : '/';
  const submit = useMutation({
    gcTime: 0,
    mutationFn: (credentials: { email: string; password: string }) =>
      api<User>(register ? '/auth/register' : '/auth/login', request('POST', credentials)),
    onSuccess: async (user) => {
      if (register) {
        navigate('/login?registered=1', { state: { returnTo } });
        return;
      }
      await cache.cancelQueries({ queryKey: sessionKey });
      cache.removeQueries({ queryKey: ['staff'] });
      cache.removeQueries({ queryKey: ['bookings'] });
      cache.setQueryData(sessionKey, user);
      navigate(user.role === 'STAFF' ? '/staff/bookings' : returnTo);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    submit.mutate({ email: String(fields.get('email')), password: String(fields.get('password')) });
  }

  if (session.data) {
    return <Navigate to={session.data.role === 'STAFF' ? '/staff/bookings' : returnTo} replace />;
  }

  return (
    <main className="auth-page">
      <div className="auth-layout panel">
        <aside className="auth-art" data-enter>
          <img src={studioCamera} alt="" />
          <div className="auth-art-copy">
            <span className="hero-caption"><Aperture size={16} aria-hidden="true" /> Rental Operations</span>
            <p>Equipment rentals<br />for photo and video.</p>
          </div>
        </aside>
        <div className="auth-content" data-enter>
          <div className="heading-icon"><KeyRound size={22} aria-hidden="true" /></div>
          <p className="eyebrow">Account access</p>
          <h1>{register ? 'Create an account' : 'Sign in'}</h1>
          <p className="muted">{register ? 'Set up a customer account to reserve equipment.' : 'Customers and staff sign in here.'}</p>
          {!register && searchParams.get('registered') === '1' && <p className="notice success" role="status">Account created. Sign in to continue.</p>}
          <form className="form auth-form" onSubmit={onSubmit}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
            <div className="password-control">
              <label htmlFor="account-password">Password</label>
              <div className="password-field">
                <input
                  id="account-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  required
                />
                <button className="password-toggle" type="button" aria-controls="account-password" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {register && <small className="muted">Use at least 12 characters.</small>}
            {submit.isError && <p className="notice error" role="alert">{submit.error.message}</p>}
            <button disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>
          <p className="auth-switch">
            {register
              ? <Link to="/login" state={{ returnTo }}>Already have an account? Sign in</Link>
              : <Link to="/register" state={{ returnTo }}>Create a customer account</Link>}
          </p>
        </div>
      </div>
    </main>
  );
}
