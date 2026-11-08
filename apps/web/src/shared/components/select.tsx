import { ChevronDown } from 'lucide-react';
import { type ComponentProps } from 'react';

export function Select(props: ComponentProps<'select'>) {
  return (
    <span className="select-field">
      <select {...props} />
      <ChevronDown className="select-field-chevron" size={16} aria-hidden="true" />
    </span>
  );
}
