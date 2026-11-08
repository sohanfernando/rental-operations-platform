export interface RentalDates {
  startDate: string;
  endDate: string;
}

const colomboDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Colombo' });

export function businessDay() {
  return colomboDate.format(new Date());
}

export function readRentalDates(params: URLSearchParams): RentalDates {
  return { startDate: params.get('startDate') ?? '', endDate: params.get('endDate') ?? '' };
}

export function rentalDateParams({ startDate, endDate }: RentalDates) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return params;
}
