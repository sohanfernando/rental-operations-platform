const lkr = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', currencyDisplay: 'code' });

export function formatLkr(minor: number) {
  return lkr.format(minor / 100);
}

export function parseLkr(value: string): number | null {
  return value === '' ? null : Math.round(Number(value) * 100);
}
