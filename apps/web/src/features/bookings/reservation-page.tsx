import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarDays, CircleCheck, Clock3, Search } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError, api, request } from '../../shared/api';
import { formatLkr } from '../../shared/money';
import { businessDay, readRentalDates, type RentalDates } from '../../shared/rental-dates';
import { useSession } from '../auth/session';
import { catalogKey, equipmentCategories, useCatalog } from '../catalog/catalog-query';
import { EquipmentGallery } from '../catalog/equipment-art';
import { type Booking, bookingKeys } from './bookings';

interface HoldInput extends RentalDates {
  equipmentTypeId: number;
  quantity: number;
}

interface Availability {
  availableUnits: number;
  rentalDays: number;
  dailyRateMinor: number | null;
  totalMinor: number | null;
}

interface PendingHold {
  key: string;
  expectedTotalMinor?: number | null;
}

function holdStorageKey(userId: number | undefined, input: HoldInput) {
  return `rental:hold:${JSON.stringify({ userId, ...input })}`;
}

function readPendingHold(name: string): PendingHold | null {
  try {
    const stored = sessionStorage.getItem(name);
    if (!stored) return null;
    // Holds started before pricing saved only the key. Retry their original payload.
    return stored.startsWith('{') ? JSON.parse(stored) as PendingHold : { key: stored };
  } catch {
    return null;
  }
}

function writePendingHold(name: string, pending: PendingHold | null) {
  try {
    if (pending) sessionStorage.setItem(name, JSON.stringify(pending));
    else sessionStorage.removeItem(name);
  } catch {
    // The current form can still retry if browser storage is unavailable.
  }
}

function ReservationForm({ equipmentTypeId, initialDates }: { equipmentTypeId: number; initialDates: RentalDates }) {
  const session = useSession();
  const customer = session.data?.role === 'CUSTOMER' ? session.data : null;
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [checkedDates, setCheckedDates] = useState(
    initialDates.startDate && initialDates.endDate ? initialDates : null,
  );
  const [quantity, setQuantity] = useState(1);
  const pendingHolds = useRef(new Map<string, PendingHold>());
  const { search } = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();

  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 10;
  const canPreview = validQuantity && checkedDates?.startDate === startDate && checkedDates.endDate === endDate;
  const previewKey = ['rental-preview', equipmentTypeId] as const;
  const preview = useQuery({
    queryKey: [...previewKey, checkedDates, quantity],
    enabled: canPreview,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ equipmentTypeId: String(equipmentTypeId), startDate, endDate, quantity: String(quantity) });
      return api<Availability>(`/catalog/availability?${params}`, { signal });
    },
  });
  const hold = useMutation({
    mutationFn: async ({ input: body, expectedTotalMinor }: { input: HoldInput; expectedTotalMinor: number | null }) => {
      const name = holdStorageKey(customer?.id, body);
      const pending = pendingHolds.current.get(name) ?? readPendingHold(name) ?? { key: crypto.randomUUID(), expectedTotalMinor };
      pendingHolds.current.set(name, pending);
      writePendingHold(name, pending);
      try {
        const booking = await api<Booking>('/bookings/holds', {
          ...request('POST', { ...body, expectedTotalMinor: pending.expectedTotalMinor }),
          headers: { 'Idempotency-Key': pending.key },
        });
        pendingHolds.current.delete(name);
        writePendingHold(name, null);
        return booking;
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          pendingHolds.current.delete(name);
          writePendingHold(name, null);
        }
        throw error;
      }
    },
    onSuccess: (booking) => {
      if (customer) void cache.invalidateQueries({ queryKey: bookingKeys.list(customer.id) });
      void cache.invalidateQueries({ queryKey: catalogKey });
      void cache.invalidateQueries({ queryKey: previewKey });
      navigate(`/bookings/${booking.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setCheckedDates(null);
        void cache.invalidateQueries({ queryKey: previewKey, refetchType: 'none' });
        void cache.invalidateQueries({ queryKey: catalogKey });
      }
    },
  });

  const quote = canPreview ? preview.data : undefined;
  const available = quote?.availableUnits;
  const input = { equipmentTypeId, startDate, endDate, quantity };
  const pendingName = holdStorageKey(customer?.id, input);
  const canRetry = customer && quote && readPendingHold(pendingName) !== null;
  const signInParams = new URLSearchParams(search);
  for (const field of ['startDate', 'endDate'] as const) {
    if (input[field]) signInParams.set(field, input[field]);
    else signInParams.delete(field);
  }
  const signInSearch = signInParams.toString();

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    hold.reset();
    if (canPreview) void preview.refetch();
    else setCheckedDates({ startDate, endDate });
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
        <button className="full-button" disabled={preview.isFetching || hold.isPending}>
          <Search size={17} aria-hidden="true" />
          {preview.isFetching ? 'Checking…' : 'Check availability'}
        </button>
      </form>
      {canPreview && preview.isError && <p className="notice error" role="alert">{preview.error.message}</p>}
      {available !== undefined && (
        <p className={`notice ${available > 0 ? 'success' : 'neutral'}`} role="status">
          {available > 0 && <CircleCheck size={17} aria-hidden="true" />}
          {available === 0 ? 'No units are available for these dates.' : `${available} ${available === 1 ? 'unit' : 'units'} available for these dates.`}
          {available > 0 && quantity > available && ' Choose fewer units or different dates.'}
        </p>
      )}
      {quote && !preview.isError && (
        <div className="rental-quote">
          <span>{quote.rentalDays} {quote.rentalDays === 1 ? 'day' : 'days'} × {quantity} {quantity === 1 ? 'unit' : 'units'}</span>
          <strong>{quote.totalMinor === null ? 'Rate not set' : `Estimated total ${formatLkr(quote.totalMinor)}`}</strong>
        </div>
      )}
      {hold.isError && <p className="notice error" role="alert">{hold.error.message}</p>}
      {hold.isError && !(hold.error instanceof ApiError) && (
        <p>Retry the hold or check <Link to="/bookings">My bookings</Link> if the request timed out.</p>
      )}
      {customer && quote && !preview.isError && (
        <button
          className="full-button button-lime"
          type="button"
          disabled={hold.isPending || preview.isFetching || (!canRetry && quantity > quote.availableUnits)}
          onClick={() => hold.mutate({ input, expectedTotalMinor: quote.totalMinor })}
        >
          {hold.isPending ? 'Placing hold…' : canRetry ? 'Retry hold' : 'Place hold'}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      )}
      {session.data === null && (
        <p><Link to="/login" state={{ returnTo: `/equipment/${equipmentTypeId}${signInSearch ? `?${signInSearch}` : ''}` }}>Sign in</Link> to place a hold.</p>
      )}
      {session.data?.role === 'STAFF' && <p>A customer account can place holds.</p>}
      <p className="reservation-note"><Clock3 size={16} aria-hidden="true" /> Dates use Asia/Colombo. The end date is excluded.</p>
    </section>
  );
}

export function ReservationPage() {
  const { id } = useParams();
  const [filters] = useSearchParams();
  const initialDates = readRentalDates(filters);
  const catalog = useCatalog();
  const equipment = catalog.data?.find((item) => String(item.id) === id);

  return (
    <main>
      <Link className="back-link" to={{ pathname: '/catalog', search: filters.toString() }}><ArrowLeft size={17} aria-hidden="true" /> Back to catalog</Link>
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
              <p className="eyebrow">{equipmentCategories[equipment.category]}</p>
              <h1>{equipment.name}</h1>
              <p>{equipment.dailyRateMinor === null ? 'Rate not set' : `${formatLkr(equipment.dailyRateMinor)} per unit / day`}</p>
              <p className="muted">{equipment.description}</p>
            </div>
          </section>
          <ReservationForm key={`${equipment.id}:${initialDates.startDate}:${initialDates.endDate}`}
            equipmentTypeId={equipment.id} initialDates={initialDates} />
        </div>
      )}
    </main>
  );
}
