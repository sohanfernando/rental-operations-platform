import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api';

export interface Equipment {
  id: number;
  name: string;
  description: string;
  images: { id: number }[];
}

export const catalogKey = ['catalog', 'equipment-types'] as const;

export function useCatalog() {
  return useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => api<Equipment[]>('/catalog/equipment-types', { signal }),
    retry: false,
  });
}
