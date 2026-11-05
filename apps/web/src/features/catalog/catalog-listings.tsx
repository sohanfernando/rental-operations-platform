import { ArrowUpRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { useEntrance } from '../../shared/motion/use-entrance';
import { useCatalog } from './catalog-query';
import { EquipmentArt } from './equipment-art';

export function CatalogListings({ limit }: { limit?: number }) {
  const catalog = useCatalog();
  const grid = useRef<HTMLUListElement>(null);
  const ItemHeading = limit === undefined ? 'h2' : 'h3';
  useEntrance(grid, '.catalog-card', catalog.data?.length);

  if (catalog.isPending) return <p className="panel muted" role="status">Loading equipment…</p>;
  if (catalog.isError) {
    return (
      <div className="panel">
        <p className="error" role="alert">{catalog.error.message}</p>
        <button type="button" onClick={() => void catalog.refetch()}>Try again</button>
      </div>
    );
  }
  if (!catalog.data.length) return <p className="panel muted">There is no equipment in the catalog yet.</p>;

  return (
    <ul className="catalog-grid equipment-grid" ref={grid}>
      {catalog.data.slice(0, limit ?? catalog.data.length).map((item) => (
        <li className="panel catalog-card" key={item.id}>
          <EquipmentArt equipment={item} />
          <div className="catalog-card-body">
            <ItemHeading>{item.name}</ItemHeading>
            <p>{item.description}</p>
            <Link className="catalog-action" to={`/equipment/${item.id}`} aria-label={`Check availability for ${item.name}`}>
              Check availability <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
