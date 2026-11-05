import { Boxes } from 'lucide-react';
import { PageHeading } from '../../shared/components/page-heading';
import { CatalogListings } from './catalog-listings';

export function CatalogPage() {
  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Rental equipment" title="Browse equipment" description="Pick a product to see photos and check availability for your rental dates." icon={Boxes} />
      <CatalogListings />
    </main>
  );
}
