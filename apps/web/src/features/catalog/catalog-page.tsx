import { Boxes } from 'lucide-react';
import { type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeading } from '../../shared/components/page-heading';
import { Select } from '../../shared/components/select';
import { businessDay, readRentalDates } from '../../shared/rental-dates';
import { CatalogListings } from './catalog-listings';
import { equipmentCategories } from './catalog-query';

export function CatalogPage() {
  const [filters, setFilters] = useSearchParams();
  const { startDate, endDate } = readRentalDates(filters);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [name, value] of fields) {
      if (typeof value === 'string' && value.trim()) next.set(name, value.trim());
    }
    setFilters(next);
  }

  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Rental equipment" title="Browse equipment" description="Choose your rental dates to find gear that is available for your shoot." icon={Boxes} />
      <form className="panel form catalog-filters" key={filters.toString()} onSubmit={search} aria-label="Filter equipment">
        <div className="catalog-filter-fields">
          <label>Start date<input type="date" name="startDate" defaultValue={startDate} min={businessDay()} /></label>
          <label>End date<input type="date" name="endDate" defaultValue={endDate} min={businessDay()} /></label>
          <label>Search equipment<input type="search" name="q" defaultValue={filters.get('q') ?? ''} placeholder="Camera, tripod, light…" maxLength={120} /></label>
          <label>
            Category
            <Select name="category" defaultValue={filters.get('category') ?? ''}>
              <option value="">All categories</option>
              {Object.entries(equipmentCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </label>
          <label>Max daily rate (LKR)<input type="number" name="maxRate" min="0.01" max="50000" step="0.01" defaultValue={filters.get('maxRate') ?? ''} /></label>
          <label>
            Availability
            <Select name="show" defaultValue={filters.get('show') ?? ''}>
              <option value="">Available for my dates</option>
              <option value="all">Include unavailable gear</option>
            </Select>
          </label>
        </div>
        <div className="catalog-filter-footer">
          <p className="muted">Dates use Asia/Colombo. The end date is excluded. Leave both dates blank to browse all gear.</p>
          <div className="actions">
            <button>Apply filters</button>
            <button type="reset" className="secondary" onClick={() => setFilters({})}>Clear filters</button>
          </div>
        </div>
      </form>
      <CatalogListings filters={filters} />
    </main>
  );
}
