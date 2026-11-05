import { bookingLabels, type BookingStatus } from './bookings';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <strong className={`status-badge status-${status.toLowerCase()}`}>{bookingLabels[status]}</strong>;
}
