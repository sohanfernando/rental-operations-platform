import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Aperture, ArrowUpRight, LogOut } from 'lucide-react';
import { useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { sessionKey, useSession } from '../features/auth/session';
import { api, request } from '../shared/api';
import { useEntrance } from '../shared/motion/use-entrance';

export function Layout() {
  const session = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const content = useRef<HTMLDivElement>(null);
  useEntrance(content, '[data-enter]', pathname);
  const logout = useMutation({
    mutationFn: () => api<void>('/auth/logout', request('POST')),
    onSuccess: async () => {
      await cache.cancelQueries({ queryKey: sessionKey });
      cache.setQueryData(sessionKey, null);
      cache.removeQueries({ queryKey: ['staff'] });
      cache.removeQueries({ queryKey: ['bookings'] });
      navigate('/');
    },
  });

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="header-content">
          <div className="brand-group">
            <Link className="brand" to="/">
              <span className="brand-symbol"><Aperture size={21} aria-hidden="true" /></span>
              <span>Rental Operations<small>Equipment rental</small></span>
            </Link>
            {session.data && (
              <span className="account-role">{session.data.role === 'STAFF' ? 'Staff' : 'Customer'}</span>
            )}
          </div>
          <nav aria-label="Main navigation">
            {session.data?.role !== 'STAFF' && <NavLink to="/" end>Home</NavLink>}
            <NavLink to="/catalog">Catalog</NavLink>
            {session.data?.role !== 'STAFF' && <NavLink to="/about">About</NavLink>}
            {session.data?.role !== 'STAFF' && <NavLink to="/contact">Contact</NavLink>}
            {session.data?.role === 'CUSTOMER' && <NavLink to="/bookings">My bookings</NavLink>}
            {session.data?.role === 'CUSTOMER' && <NavLink to="/notifications">Notifications</NavLink>}
            {session.data?.role === 'STAFF' && <NavLink to="/staff/bookings">Staff bookings</NavLink>}
            {session.data?.role === 'STAFF' && <NavLink to="/staff/inventory">Inventory</NavLink>}
            {session.data?.role === 'STAFF' && <NavLink to="/staff/contact">Inbox</NavLink>}
          </nav>
          {session.data ? (
            <button className="secondary session-action" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
              {logout.isPending ? 'Signing out…' : 'Sign out'} <LogOut size={16} aria-hidden="true" />
            </button>
          ) : (
            <NavLink className="button session-action" to="/login">Sign in <ArrowUpRight size={16} aria-hidden="true" /></NavLink>
          )}
        </div>
        {logout.isError && <p className="header-message error" role="alert">{logout.error.message}</p>}
        {session.isError && <p className="header-message error" role="alert">Could not check your session.</p>}
      </header>
      <div id="main-content" ref={content} tabIndex={-1}><Outlet /></div>
      <footer className="site-footer">
        <div className="footer-brand">
          <Link className="brand" to="/">
            <span className="brand-symbol"><Aperture size={21} aria-hidden="true" /></span>
            <span>Rental Operations<small>Equipment rental</small></span>
          </Link>
          <p>Cameras, lighting, and support equipment for photo and video production.</p>
        </div>
        <nav aria-label="Footer navigation" className="footer-links">
          <div><strong>Explore</strong><Link to="/">Home</Link><Link to="/catalog">Catalog</Link></div>
          <div><strong>Rental desk</strong><Link to="/about">About us</Link><Link to="/contact">Contact us</Link></div>
        </nav>
      </footer>
      <ScrollRestoration />
    </>
  );
}
