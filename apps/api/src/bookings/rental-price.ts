import { maximumQuantity, maximumRentalDays } from './booking-rules';

// 100 minor units equal one Sri Lankan rupee. The largest supported total fits a MySQL INT.
export const maximumDailyRateMinor = 5_000_000;
export const maximumTotalMinor = maximumDailyRateMinor * maximumRentalDays * maximumQuantity;

export function rentalPrice(dailyRateMinor: number | null, days: number, quantity: number) {
  return { dailyRateMinor, totalMinor: dailyRateMinor === null ? null : dailyRateMinor * days * quantity };
}
