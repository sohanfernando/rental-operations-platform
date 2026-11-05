import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from './session';

export function CustomerArea({ children }: { children: (userId: number) => ReactNode }) {
  const session = useSession();
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.isError) {
    return <button type="button" onClick={() => void session.refetch()}>Retry session check</button>;
  }
  if (!session.data) return <p><Link to="/login">Sign in</Link> to access your customer account.</p>;
  if (session.data.role !== 'CUSTOMER') return <p role="alert">This page requires a customer account.</p>;
  return children(session.data.id);
}
