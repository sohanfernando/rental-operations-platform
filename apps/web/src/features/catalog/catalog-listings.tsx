import { ArrowUpRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { formatLkr, parseLkr } from '../../shared/money';
import { useEntrance } from '../../shared/motion/use-entrance';
import { readRentalDates } from '../../shared/rental-dates';
import { equipmentCategories, useCatalog } from './catalog-query';
import { EquipmentArt } from './equipment-art';

export function CatalogListings({ limit, filters }: { limit?: number; filters?: URLSearchParams }) {
  const dates = filters && readRentalDates(filters);
  const catalog = useCatalog(dates);
  const search = (filters?.get('q') ?? '').trim().toLowerCase();
  const category = filters?.get('category');
  const maxRate = parseLkr(filters?.get('maxRate') ?? '');
  const availableOnly = dates?.startDate && dates.endDate && filters?.get('show') !== 'all';
  const matches = catalog.data?.filter((item) =>
    (!search || `${item.name} ${item.description}`.toLowerCase().includes(search)) &&
    (!category || item.category === category) &&
    (maxRate === null || (item.dailyRateMinor !== null && item.dailyRateMinor <= maxRate)) &&
    (!availableOnly || (item.availableUnits ?? 0) > 0));
  const grid = useRef<HTMLUListElement>(null);
  const ItemHeading = limit === undefined ? 'h2' : 'h3';
  useEntrance(grid, '.catalog-card', `${filters ?? ''}:${matches?.length ?? 0}`);

  if (catalog.isPending) return <p className="panel muted" role="status">Loading equipment…</p>;
  if (catalog.isError) {
    return (
      <div className="panel">
        <p className="error" role="alert">{catalog.error.message}</p>
        <button type="button" onClick={() => void catalog.refetch()}>Try again</button>
      </div>
    );
  }
  if (!matches?.length) {
    return <p className="panel muted" role="status">
      {catalog.data.length ? 'No equipment matches these filters. Try different dates or clear the filters.' : 'There is no equipment in the catalog yet.'}
    </p>;
  }

  return (
    <ul className="catalog-grid equipment-grid" ref={grid}>
      {matches.slice(0, limit).map((item) => (
        <li className="panel catalog-card" key={item.id}>
          <EquipmentArt equipment={item} />
          <div className="catalog-card-body">
            <ItemHeading>{item.name}</ItemHeading>
            <p className="catalog-rate">
              {equipmentCategories[item.category]} · {item.dailyRateMinor === null ? 'Rate not set' : `${formatLkr(item.dailyRateMinor)} / day`}
            </p>
            <p>{item.description}</p>
            {item.availableUnits !== null && (
              <p className="catalog-rate">{item.availableUnits ? `${item.availableUnits} available for your dates` : 'Unavailable for your dates'}</p>
            )}
            <Link className="catalog-action" to={{ pathname: `/equipment/${item.id}`, search: filters?.toString() }} aria-label={`Check availability for ${item.name}`}>
              Check availability <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
