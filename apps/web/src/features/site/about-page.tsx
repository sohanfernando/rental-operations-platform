import { Aperture, ArrowRight, CalendarDays, PackageCheck } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../shared/components/page-heading';

export function AboutPage() {
  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Rental Operations" title="About us" description="A single rental desk for cameras, lighting, and production equipment." icon={Aperture} />
      <div className="info-grid" data-enter>
        <section className="panel">
          <div className="heading-icon"><CalendarDays size={22} aria-hidden="true" /></div>
          <h2>Reserve for your shoot</h2>
          <p className="muted">Browse the catalog, check your dates, and place a temporary hold on the equipment you want. Confirm before the hold expires to reserve your units.</p>
          <Link className="button" to="/catalog">Browse equipment <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
        <section className="panel">
          <div className="heading-icon"><PackageCheck size={22} aria-hidden="true" /></div>
          <h2>Collect and return</h2>
          <p className="muted">Staff record which units leave the rental desk and when they come back. Your account keeps your booking dates and status together.</p>
          <Link className="button secondary" to="/contact">Contact the rental desk <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>
    </main>
  );
}
