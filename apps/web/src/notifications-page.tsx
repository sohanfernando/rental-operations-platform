import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell } from 'lucide-react';
import { Link } from 'react-router';
import { api } from './api';
import { bookingKeys } from './bookings';
import { CustomerArea } from './customer-area';
import { PageHeading } from './page-heading';

interface Notification {
  eventId: number;
  bookingId: number;
  message: string;
  occurredAt: string;
}

const messageTime = new Intl.DateTimeFormat(undefined, {
  timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short',
});

function Messages({ userId }: { userId: number }) {
  const messages = useQuery({
    queryKey: [...bookingKeys.list(userId), 'notifications'],
    queryFn: ({ signal }) => api<Notification[]>('/notifications', { signal }),
    retry: false,
    refetchInterval: 15_000,
  });

  if (messages.isPending) return <p role="status">Loading notifications…</p>;
  if (messages.isError) {
    return (
      <div className="panel">
        <p className="error" role="alert">{messages.error.message}</p>
        <button type="button" onClick={() => void messages.refetch()}>Try again</button>
      </div>
    );
  }
  if (!messages.data.length) return <p className="panel">You have no notifications yet.</p>;

  return (
    <ul className="panel activity-list">
      {messages.data.map((message) => (
        <li key={message.eventId}>
          <Link className="card-heading-link" to={`/bookings/${message.bookingId}`}>{message.message} <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <time dateTime={message.occurredAt}>{messageTime.format(new Date(message.occurredAt))} (Asia/Colombo)</time>
        </li>
      ))}
    </ul>
  );
}

export function NotificationsPage() {
  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Customer account" title="Notifications" description="Confirmation and expiry updates for your rentals." icon={Bell} />
      <CustomerArea>{(userId) => <Messages userId={userId} />}</CustomerArea>
    </main>
  );
}
