import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarDays, CircleCheck, Clock3, Search } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, api, request } from '../../shared/api';
import { useSession } from '../auth/session';
import { useCatalog } from '../catalog/catalog-query';
import { EquipmentGallery } from '../catalog/equipment-art';
import { type Booking, bookingKeys } from './bookings';

interface HoldInput {
  equipmentTypeId: number;
  startDate: string;
  endDate: string;
  quantity: number;
}

function businessDay() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Colombo' }).format(new Date());
}

function readPendingKey(name: string) {
  try {
    return sessionStorage.getItem(name);
  } catch {
    return null;
  }
}

function writePendingKey(name: string, key: string | null) {
  try {
    if (key) sessionStorage.setItem(name, key);
    else sessionStorage.removeItem(name);
  } catch {
    // The current form can still retry if browser storage is unavailable.
  }
}

function ReservationForm({ equipmentTypeId }: { equipmentTypeId: number }) {
  const session = useSession();
  const customer = session.data?.role === 'CUSTOMER' ? session.data : null;
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quantity, setQuantity] = useState(1);
  const pendingKeys = useRef(new Map<string, string>());
  const navigate = useNavigate();
  const cache = useQueryClient();

  const preview = useMutation({
    mutationFn: ({ startDate, endDate }: Pick<HoldInput, 'startDate' | 'endDate'>) => {
      const params = new URLSearchParams({ equipmentTypeId: String(equipmentTypeId), startDate, endDate });
      return api<{ availableUnits: number }>(`/catalog/availability?${params}`);
    },
  });
  const hold = useMutation({
    mutationFn: async (body: HoldInput) => {
      const name = `rental:hold:${JSON.stringify({ userId: customer?.id, ...body })}`;
      const key = pendingKeys.current.get(name) ?? readPendingKey(name) ?? crypto.randomUUID();
      pendingKeys.current.set(name, key);
      writePendingKey(name, key);
      try {
        const booking = await api<Booking>('/bookings/holds', {
          ...request('POST', body),
          headers: { 'Idempotency-Key': key },
        });
        pendingKeys.current.delete(name);
        writePendingKey(name, null);
        return booking;
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          pendingKeys.current.delete(name);
          writePendingKey(name, null);
        }
        throw error;
      }
    },
    onSuccess: (booking) => {
      if (customer) void cache.invalidateQueries({ queryKey: bookingKeys.list(customer.id) });
      navigate(`/bookings/${booking.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) preview.reset();
    },
  });

  const previewMatches = preview.variables?.startDate === startDate && preview.variables?.endDate === endDate;
  const available = previewMatches ? preview.data?.availableUnits : undefined;

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    hold.reset();
    preview.mutate({ startDate, endDate });
  }

  return (
    <section className="panel reservation-form" aria-labelledby="reservation-heading" data-enter>
      <div className="heading-icon"><CalendarDays size={22} aria-hidden="true" /></div>
      <h2 id="reservation-heading">Check availability</h2>
      <p className="muted">Choose your rental dates and how many units you need.</p>
      <form className="form" onSubmit={check}>
        <div className="unit-fields">
          <label>
            Start date
            <input type="date" min={businessDay()} value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </label>
          <label>
            End date
            <input type="date" min={startDate || businessDay()} value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </label>
          <label>
            Quantity
            <input type="number" min={1} max={10} value={Number.isNaN(quantity) ? '' : quantity}
              onChange={(event) => setQuantity(event.target.valueAsNumber)} required />
          </label>
        </div>
        <button className="full-button" disabled={preview.isPending || hold.isPending}>
          <Search size={17} aria-hidden="true" />
          {preview.isPending ? 'Checking…' : 'Check availability'}
        </button>
      </form>
      {previewMatches && preview.isError && <p className="notice error" role="alert">{preview.error.message}</p>}
      {available !== undefined && (
        <p className={`notice ${available > 0 ? 'success' : 'neutral'}`} role="status">
          {available > 0 && <CircleCheck size={17} aria-hidden="true" />}
          {available === 0 ? 'No units are available for these dates.' : `${available} ${available === 1 ? 'unit' : 'units'} available for these dates.`}
          {available > 0 && quantity > available && ' Choose fewer units or different dates.'}
        </p>
      )}
      {hold.isError && <p className="notice error" role="alert">{hold.error.message}</p>}
      {hold.isError && !(hold.error instanceof ApiError) && (
        <p>Retry the hold or check <Link to="/bookings">My bookings</Link> if the request timed out.</p>
      )}
      {customer && available !== undefined && (
        <button
          className="full-button button-lime"
          type="button"
          disabled={hold.isPending || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || quantity > available}
          onClick={() => hold.mutate({ equipmentTypeId, startDate, endDate, quantity })}
        >
          {hold.isPending ? 'Placing hold…' : 'Place hold'}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      )}
      {session.data === null && (
        <p><Link to="/login" state={{ returnTo: `/equipment/${equipmentTypeId}` }}>Sign in</Link> to place a hold.</p>
      )}
      {session.data?.role === 'STAFF' && <p>A customer account can place holds.</p>}
      <p className="reservation-note"><Clock3 size={16} aria-hidden="true" /> Dates use Asia/Colombo. The end date is excluded.</p>
    </section>
  );
}

export function ReservationPage() {
  const { id } = useParams();
  const catalog = useCatalog();
  const equipment = catalog.data?.find((item) => String(item.id) === id);

  return (
    <main>
      <Link className="back-link" to="/catalog"><ArrowLeft size={17} aria-hidden="true" /> Back to catalog</Link>
      {catalog.isPending && <p role="status">Loading equipment…</p>}
      {catalog.isError && (
        <div className="panel">
          <p className="error" role="alert">{catalog.error.message}</p>
          <button type="button" onClick={() => void catalog.refetch()}>Try again</button>
        </div>
      )}
      {catalog.isSuccess && !equipment && <h1>Equipment not found</h1>}
      {equipment && (
        <div className="reservation-layout">
          <section className="panel equipment-feature" data-enter>
            <EquipmentGallery key={equipment.id} equipment={equipment} />
            <div>
              <p className="eyebrow">Rental equipment</p>
              <h1>{equipment.name}</h1>
              <p className="muted">{equipment.description}</p>
            </div>
          </section>
          <ReservationForm key={equipment.id} equipmentTypeId={equipment.id} />
        </div>
      )}
    </main>
  );
}
