import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowUpRight, CalendarCheck, CalendarDays, ClipboardList, PackageOpen } from 'lucide-react';
import { useId } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError, api, request } from './api';
import { BookingStatusBadge } from './booking-status';
import { type BookingStatus, bookingLabels } from './bookings';
import { PageHeading } from './page-heading';
import { useSession } from './session';

interface StaffBooking {
  id: number;
  equipmentName: string;
  customerEmail: string;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  assetTags: string[];
  overdue: boolean;
  pickupWindowOpen: boolean;
  conflicts: { assetTag: string; openBookingId: number }[];
}

interface Dashboard {
  businessDate: string;
  pickups: StaffBooking[];
  openRentals: StaffBooking[];
  recentBookings: StaffBooking[];
  nextBeforeId: number | null;
}

interface Detail extends StaffBooking {
  events: {
    id: number;
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    actorEmail: string | null;
    occurredAt: string;
  }[];
}

const base = '/staff/bookings';
const staffBookingKey = ['staff', 'bookings'] as const;
const eventTime = new Intl.DateTimeFormat(undefined, {
  timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short',
});

function StaffBookingSummary({ booking }: { booking: StaffBooking }) {
  return (
    <>
      <div className="booking-meta">
        <BookingStatusBadge status={booking.status} />
        {booking.overdue && <span className="status-badge status-expired">Overdue</span>}
      </div>
      <p className="muted">{booking.customerEmail}</p>
      <p className="info-line"><CalendarDays size={16} aria-hidden="true" /> {booking.startDate} to {booking.endDate} (due date)</p>
      <p className="info-line"><PackageOpen size={16} aria-hidden="true" /> Units {booking.assetTags.join(', ')}</p>
      {booking.conflicts.length > 0 && (
        <div className="handover-warning">
          <strong>Handover blocked</strong>
          <ul>
            {booking.conflicts.map((conflict) => (
              <li key={conflict.assetTag}>
                {conflict.assetTag} is still out on <Link to={`${base}/${conflict.openBookingId}`}>booking #{conflict.openBookingId}</Link>.
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function StaffActions({ booking }: { booking: StaffBooking }) {
  const cache = useQueryClient();
  const update = useMutation({
    mutationFn: (action: 'pickup' | 'return') => api<void>(`${base}/${booking.id}/${action}`, request('POST')),
    onSuccess: () => cache.invalidateQueries({ queryKey: staffBookingKey }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void cache.invalidateQueries({ queryKey: staffBookingKey });
      }
    },
  });
  const canPickUp = booking.status === 'CONFIRMED' && booking.pickupWindowOpen && !booking.conflicts.length;
  const canReturn = booking.status === 'PICKED_UP';

  return (
    <>
      {booking.status === 'CONFIRMED' && !booking.pickupWindowOpen && <p>Pickup is outside the rental dates.</p>}
      {update.isError && <p className="error" role="alert">{update.error.message}</p>}
      {update.isSuccess && <p role="status">{update.variables === 'pickup' ? 'Pickup recorded.' : 'Return recorded.'}</p>}
      {canPickUp && (
        <button type="button" disabled={update.isPending} onClick={() => update.mutate('pickup')}>
          {update.isPending ? 'Recording…' : 'Record pickup'}
        </button>
      )}
      {canReturn && (
        <button type="button" disabled={update.isPending} onClick={() => update.mutate('return')}>
          {update.isPending ? 'Recording…' : 'Record return'}
        </button>
      )}
    </>
  );
}

function BookingSection({ heading, bookings, empty }: { heading: string; bookings: StaffBooking[]; empty: string }) {
  const headingId = useId();
  return (
    <section className="staff-section" aria-labelledby={headingId}>
      <header className="section-heading">
        <h2 id={headingId}>{heading}</h2>
        <span className="count-pill">{bookings.length}</span>
      </header>
      {bookings.length === 0 && <p className="panel empty-state">{empty}</p>}
      <ul className="catalog-grid staff-booking-grid">
        {bookings.map((booking) => (
          <li className="panel" key={booking.id}>
            <h3><Link className="card-heading-link" to={`${base}/${booking.id}`}>{booking.equipmentName} #{booking.id}<ArrowUpRight size={16} aria-hidden="true" /></Link></h3>
            <StaffBookingSummary booking={booking} />
            <StaffActions booking={booking} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StaffDashboardView() {
  const [params] = useSearchParams();
  const beforeId = params.get('beforeId');
  const url = beforeId ? `${base}?${new URLSearchParams({ beforeId })}` : base;
  const dashboard = useQuery({
    queryKey: [...staffBookingKey, 'dashboard', beforeId],
    queryFn: ({ signal }) => api<Dashboard>(url, { signal }),
    retry: false,
    refetchInterval: 15_000,
  });

  if (dashboard.isPending) return <p role="status">Loading staff bookings…</p>;
  if (dashboard.isError) {
    return (
      <div className="panel">
        <p className="error" role="alert">{dashboard.error.message}</p>
        <button type="button" onClick={() => void dashboard.refetch()}>Try again</button>
      </div>
    );
  }
  const { businessDate, pickups, openRentals, recentBookings, nextBeforeId } = dashboard.data;
  const overdue = openRentals.filter((booking) => booking.overdue);
  return (
    <>
      <div className="workspace-date"><CalendarDays size={16} aria-hidden="true" /> {businessDate} · Asia/Colombo</div>
      <dl className="workspace-stats" aria-label="Booking summary">
        <div className="panel"><dt><CalendarCheck size={19} aria-hidden="true" /> Confirmed</dt><dd>{pickups.length}</dd></div>
        <div className="panel"><dt><PackageOpen size={19} aria-hidden="true" /> Out with customers</dt><dd>{openRentals.length}</dd></div>
        <div className="panel"><dt><AlertCircle size={19} aria-hidden="true" /> Overdue</dt><dd>{overdue.length}</dd></div>
      </dl>
      <BookingSection heading="Overdue rentals" bookings={overdue} empty="No overdue rentals." />
      <BookingSection heading="Confirmed pickups" bookings={pickups} empty="No confirmed pickups." />
      <BookingSection heading="Other open rentals" bookings={openRentals.filter(({ overdue }) => !overdue)} empty="No other open rentals." />
      <section className="staff-section" aria-labelledby="staff-history-heading">
        <h2 id="staff-history-heading">Booking history</h2>
        {recentBookings.length === 0 && <p>No bookings on this page.</p>}
        {recentBookings.length > 0 && (
          <ul className="panel activity-list">
            {recentBookings.map((booking) => (
              <li key={booking.id}>
                <Link to={`${base}/${booking.id}`}>#{booking.id} {booking.equipmentName}</Link>
                <span>{bookingLabels[booking.status]} · {booking.startDate} to {booking.endDate}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="actions">
          {beforeId && <Link to={base}>Latest bookings</Link>}
          {nextBeforeId && <Link to={`${base}?beforeId=${nextBeforeId}`}>Older bookings</Link>}
        </div>
      </section>
    </>
  );
}

function StaffBookingDetail({ id }: { id: string }) {
  const booking = useQuery({
    queryKey: [...staffBookingKey, 'detail', id],
    queryFn: ({ signal }) => api<Detail>(`${base}/${id}`, { signal }),
    retry: false,
    refetchInterval: 15_000,
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

  return (
    <>
      <section className="panel" aria-labelledby="staff-booking-heading">
        <h2 id="staff-booking-heading">{booking.data.equipmentName}</h2>
        <StaffBookingSummary booking={booking.data} />
        <StaffActions booking={booking.data} />
      </section>
      <section className="staff-section" aria-labelledby="staff-events-heading">
        <h2 id="staff-events-heading">Booking events</h2>
        <p>Times shown in Asia/Colombo.</p>
        {booking.data.events.length === 0 && <p>No events recorded.</p>}
        {booking.data.events.length > 0 && (
          <ol className="panel activity-list">
            {booking.data.events.map((event) => (
              <li key={event.id}>
                <strong>{event.fromStatus ? `${bookingLabels[event.fromStatus]} → ` : ''}{bookingLabels[event.toStatus]}</strong>
                <span>{event.actorEmail ?? 'System'} · <time dateTime={event.occurredAt}>{eventTime.format(new Date(event.occurredAt))}</time></span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

export function StaffBookingsPage() {
  const { id } = useParams();
  const session = useSession();
  return (
    <main className="workspace-page">
      {id && <Link className="back-link" to={base}><ArrowLeft size={17} aria-hidden="true" /> Back to staff bookings</Link>}
      <PageHeading
        eyebrow="Staff workspace"
        title={id ? `Booking #${id}` : 'Staff bookings'}
        description={id ? 'Review allocated units, handover status, and booking events.' : 'Review pickups, record returns, and resolve handover conflicts.'}
        icon={ClipboardList}
      />
      {session.isPending && <p role="status">Checking your session…</p>}
      {session.isError && <button type="button" onClick={() => void session.refetch()}>Retry session check</button>}
      {session.data === null && <p><Link to="/login">Sign in</Link> to access staff bookings.</p>}
      {session.data?.role === 'CUSTOMER' && <p role="alert">This page requires a staff account.</p>}
      {session.data?.role === 'STAFF' && (id ? <StaffBookingDetail key={id} id={id} /> : <StaffDashboardView />)}
    </main>
  );
}
