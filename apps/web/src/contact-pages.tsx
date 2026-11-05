import { useMutation, useQuery } from '@tanstack/react-query';
import { Aperture, ArrowRight, CalendarDays, Inbox, Mail, PackageCheck } from 'lucide-react';
import { type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, request } from './api';
import { PageHeading } from './page-heading';
import { useSession } from './session';

export function AboutPage() {
  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Rental Operations" title="About us" description="A single rental desk for cameras, lighting, and production equipment." icon={Aperture} />
      <div className="info-grid" data-enter>
        <section className="panel">
          <div className="heading-icon"><CalendarDays size={22} aria-hidden="true" /></div>
          <h2>Reserve for your shoot</h2>
          <p className="muted">Browse the catalog, check your dates, and place a temporary hold on the equipment you want. Confirm before the hold expires to reserve your units.</p>
          <Link className="button" to="/catalog">Browse equipment <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
        <section className="panel">
          <div className="heading-icon"><PackageCheck size={22} aria-hidden="true" /></div>
          <h2>Collect and return</h2>
          <p className="muted">Staff record which units leave the rental desk and when they come back. Your account keeps your booking dates and status together.</p>
          <Link className="button secondary" to="/contact">Contact the rental desk <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>
    </main>
  );
}

interface ContactInput {
  name: string;
  email: string;
  message: string;
}

export function ContactPage() {
  const session = useSession();
  const send = useMutation({ mutationFn: (body: ContactInput) => api<void>('/contact', request('POST', body)) });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    send.mutate({
      name: String(fields.get('name')),
      email: String(fields.get('email')),
      message: String(fields.get('message')),
    }, { onSuccess: () => form.reset() });
  }

  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Rental desk" title="Contact us" description="Ask about equipment, an existing booking, pickup, or return." icon={Mail} />
      <div className="contact-layout" data-enter>
        <aside className="panel contact-aside">
          <div className="heading-icon"><Mail size={22} aria-hidden="true" /></div>
          <h2>How can we help?</h2>
          <p>Your message goes to the staff inbox. If you already have a reservation, include your booking number so staff can find it.</p>
          <Link to="/catalog">Browse the catalog <ArrowRight size={15} aria-hidden="true" /></Link>
        </aside>
        <section className="panel" aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading">Send a message</h2>
          <form className="form" onSubmit={submit}>
            <label>Name<input name="name" autoComplete="name" maxLength={100} required /></label>
            <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={session.data?.email} required /></label>
            <label>Message<textarea name="message" rows={6} minLength={10} maxLength={2000} required /></label>
            {send.isError && <p className="notice error" role="alert">{send.error.message}</p>}
            {send.isSuccess && <p className="notice success" role="status">Your message was sent to the rental desk.</p>}
            <button disabled={send.isPending}>{send.isPending ? 'Sending…' : 'Send message'} <ArrowRight size={17} aria-hidden="true" /></button>
          </form>
        </section>
      </div>
    </main>
  );
}

interface ContactMessage extends ContactInput {
  id: number;
  createdAt: string;
}

const messageTime = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });

function InboxMessages() {
  const inbox = useQuery({
    queryKey: ['staff', 'contact'],
    queryFn: ({ signal }) => api<ContactMessage[]>('/staff/contact', { signal }),
    retry: false,
  });

  if (inbox.isPending) return <p className="panel muted" role="status">Loading messages…</p>;
  if (inbox.isError) return (
    <div className="panel">
      <p className="notice error" role="alert">{inbox.error.message}</p>
      <button type="button" onClick={() => void inbox.refetch()}>Try again</button>
    </div>
  );
  if (!inbox.data.length) return <p className="panel muted">No contact messages yet.</p>;
  return (
    <ul className="inbox-list">
      {inbox.data.map(({ id, name, email, message, createdAt }) => (
        <li className="panel" key={id}>
          <header className="section-heading">
            <div><h2>{name}</h2><p className="muted">{email}</p></div>
            <time className="muted" dateTime={createdAt}>{messageTime.format(new Date(createdAt))} (Colombo)</time>
          </header>
          <p className="inbox-message">{message}</p>
        </li>
      ))}
    </ul>
  );
}

export function ContactInboxPage() {
  const session = useSession();

  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Staff workspace" title="Contact inbox" description="The 50 newest messages sent from the Contact page." icon={Inbox} />
      {session.isPending && <p role="status">Checking your session…</p>}
      {session.isError && <button type="button" onClick={() => void session.refetch()}>Retry session check</button>}
      {session.data === null && <p><Link to="/login">Sign in</Link> to access the contact inbox.</p>}
      {session.data?.role === 'CUSTOMER' && <p role="alert">This page requires a staff account.</p>}
      {session.data?.role === 'STAFF' && <InboxMessages />}
    </main>
  );
}
