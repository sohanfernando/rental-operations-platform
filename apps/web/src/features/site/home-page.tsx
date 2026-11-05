import { Aperture, ArrowRight, CalendarDays, PackageCheck, Timer } from 'lucide-react';
import { Link } from 'react-router';
import studioCamera from '../../assets/studio-camera.jpg';
import { CatalogListings } from '../catalog/catalog-listings';

export function HomePage() {
  return (
    <main className="catalog-page">
      <section className="catalog-hero" aria-labelledby="home-heading">
        <div className="hero-copy" data-enter>
          <p className="hero-kicker"><span /> Rental Operations</p>
          <h1 id="home-heading">Production<br /><em>gear rentals.</em></h1>
          <p className="hero-description">Browse cameras, lighting, and support gear. Check your rental dates and reserve the equipment you need.</p>
          <Link className="button button-lime" to="/catalog">Explore the catalog <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className="hero-media" data-enter>
          <img src={studioCamera} width={1448} height={1086} alt="Mirrorless camera and lens in a dark studio" fetchPriority="high" />
          <span className="hero-caption"><Aperture size={16} aria-hidden="true" /> Studio gear</span>
        </div>
      </section>

      <ul className="rental-steps" aria-label="How rentals work" data-enter>
        <li><CalendarDays aria-hidden="true" /><span><strong>Check your dates</strong><small>See availability for your rental window</small></span></li>
        <li><Timer aria-hidden="true" /><span><strong>Hold your gear</strong><small>Set aside the units while you confirm</small></span></li>
        <li><PackageCheck aria-hidden="true" /><span><strong>Pick up and return</strong><small>Staff records your handover and return</small></span></li>
      </ul>

      <section aria-labelledby="featured-heading">
        <header className="section-heading">
          <div><p className="eyebrow">The catalog</p><h2 id="featured-heading">Featured equipment</h2></div>
          <Link className="back-link inline-link" to="/catalog">View full catalog <ArrowRight size={16} aria-hidden="true" /></Link>
        </header>
        <CatalogListings limit={3} />
      </section>
    </main>
  );
}
