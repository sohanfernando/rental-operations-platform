export type BookingStatus = 'HELD' | 'CONFIRMED' | 'PICKED_UP' | 'RETURNED' | 'CANCELLED' | 'EXPIRED';

export interface Booking {
  id: number;
  equipmentTypeId: number;
  equipmentName: string;
  startDate: string;
  endDate: string;
  quantity: number;
  status: BookingStatus;
  holdExpiresAt: string;
}

export const bookingLabels: Record<BookingStatus, string> = {
  HELD: 'On hold',
  CONFIRMED: 'Confirmed',
  PICKED_UP: 'Picked up',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const bookingKeys = {
  list: (userId: number) => ['bookings', userId] as const,
  detail: (userId: number, id: string) => ['bookings', userId, id] as const,
};
