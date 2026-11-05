import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, CalendarDays, CalendarRange, Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, api, request } from './api';
import { BookingStatusBadge } from './booking-status';
import { type Booking, bookingKeys } from './bookings';
import { CustomerArea } from './customer-area';
import { PageHeading } from './page-heading';

function BookingSummary({ booking }: { booking: Booking }) {
  return (
    <>
      <p className="info-line"><CalendarDays size={17} aria-hidden="true" /> {booking.startDate} to {booking.endDate} (end date excluded)</p>
      <div className="booking-meta"><span className="count-pill">{booking.quantity} {booking.quantity === 1 ? 'unit' : 'units'}</span><BookingStatusBadge status={booking.status} /></div>
    </>
  );
}

function BookingList({ userId }: { userId: number }) {
  const bookings = useQuery({
    queryKey: bookingKeys.list(userId),
    queryFn: ({ signal }) => api<Booking[]>('/bookings', { signal }),
    retry: false,
    refetchInterval: (query) => query.state.data?.some((booking) => booking.status === 'HELD') ? 15_000 : false,
  });

  return (
    <>
      {bookings.isPending && <p role="status">Loading bookings…</p>}
      {bookings.isError && (
        <div className="panel">
          <p className="error" role="alert">{bookings.error.message}</p>
          <button type="button" onClick={() => void bookings.refetch()}>Try again</button>
        </div>
      )}
      {bookings.data?.length === 0 && <p className="panel">You have no bookings yet. <Link to="/catalog">Browse equipment</Link>.</p>}
      {bookings.data && (
        <ul className="catalog-grid">
          {bookings.data.map((booking) => (
            <li className="panel" key={booking.id}>
              <h2><Link className="card-heading-link" to={`/bookings/${booking.id}`}>{booking.equipmentName} <ArrowUpRight size={17} aria-hidden="true" /></Link></h2>
              <BookingSummary booking={booking} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HoldCountdown({ expiresAt, refresh }: { expiresAt: string; refresh: () => unknown }) {
  const [now, setNow] = useState(Date.now);
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  const elapsed = seconds === 0;

  useEffect(() => {
    if (elapsed) {
      void refresh();
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [elapsed, refresh]);

  if (elapsed) return <p role="status">Countdown ended. Checking the hold with the server.</p>;
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return (
    <div className="hold-clock">
      <Clock3 size={24} aria-hidden="true" />
      <div><p>Hold expires in <strong>{minutes}:{remainder}</strong></p><small>Confirm your reservation before the hold expires.</small></div>
    </div>
  );
}

function BookingDetail({ userId, id }: { userId: number; id: string }) {
  const cache = useQueryClient();
  const booking = useQuery({
    queryKey: bookingKeys.detail(userId, id),
    queryFn: ({ signal }) => api<Booking>(`/bookings/${id}`, { signal }),
    retry: false,
    refetchInterval: (query) => query.state.data?.status === 'HELD' ? 15_000 : false,
  });

  const update = useMutation({
    mutationFn: (action: 'confirm' | 'cancel') => api<Booking>(`/bookings/${id}/${action}`, {
      ...request('POST'),
      headers: action === 'confirm' ? { 'Idempotency-Key': `confirm-${id}` } : undefined,
    }),
    onSuccess: () => cache.invalidateQueries({ queryKey: bookingKeys.list(userId) }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        return cache.invalidateQueries({ queryKey: bookingKeys.list(userId) });
      }
    },
  });

  if (booking.isPending) return <p role="status">Loading booking…</p>;
  if (booking.isError) {
    return (
      <div className="panel">
        <p className="error" role="alert">{booking.error.message}</p>
        <button type="button" onClick={() => void booking.refetch()}>Try again</button>
      </div>
    );
  }

  const current = booking.data;
  const held = current.status === 'HELD';
  return (
    <section className="panel booking-detail" aria-labelledby="booking-heading">
      <h2 id="booking-heading">{current.equipmentName}</h2>
      <BookingSummary booking={current} />
      {held && <HoldCountdown expiresAt={current.holdExpiresAt} refresh={booking.refetch} />}
      {current.status === 'EXPIRED' && (
        <p>This hold expired. <Link to={`/equipment/${current.equipmentTypeId}`}>Check availability again</Link>.</p>
      )}
      {update.isError && <p className="error" role="alert">{update.error.message}</p>}
      {update.isSuccess && <p className="notice success" role="status">Booking updated.</p>}
      {(held || current.status === 'CONFIRMED') && (
        <div className="actions">
          {held && (
            <button type="button" onClick={() => update.mutate('confirm')} disabled={update.isPending}>
              {update.isPending && update.variables === 'confirm' ? 'Confirming…' : 'Confirm reservation'}
            </button>
          )}
          <button className="secondary" type="button" disabled={update.isPending} onClick={() => {
            if (window.confirm('Cancel this booking and release its units?')) update.mutate('cancel');
          }}>
            {update.isPending && update.variables === 'cancel' ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </div>
      )}
    </section>
  );
}

export function BookingsPage() {
  const { id } = useParams();
  return (
    <main className="workspace-page">
      {id && <Link className="back-link" to="/bookings"><ArrowLeft size={17} aria-hidden="true" /> Back to my bookings</Link>}
      <PageHeading
        eyebrow="Customer account"
        title={id ? 'Booking details' : 'My bookings'}
        description={id ? 'Review your rental dates and manage this booking.' : 'Track your holds, reservations, and completed rentals.'}
        icon={CalendarRange}
      />
      <CustomerArea>
        {(userId) => id
          ? <BookingDetail key={`${userId}-${id}`} userId={userId} id={id} />
          : <BookingList userId={userId} />}
      </CustomerArea>
    </main>
  );
}
