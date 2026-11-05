import { type LucideIcon } from 'lucide-react';

interface PageHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
}

export function PageHeading({ eyebrow, title, description, icon: Icon }: PageHeadingProps) {
  return (
    <header className="page-heading" data-enter>
      <div className="heading-icon"><Icon size={23} aria-hidden="true" /></div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
    </header>
  );
}
