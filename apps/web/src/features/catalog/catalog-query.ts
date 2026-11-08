import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api';
import { type RentalDates, rentalDateParams } from '../../shared/rental-dates';

export const equipmentCategories = {
  CAMERAS: 'Cameras',
  LIGHTING: 'Lighting',
  SUPPORT: 'Tripods & support',
  AUDIO: 'Audio',
  DRONES: 'Drones',
  ACCESSORIES: 'Accessories',
  OTHER: 'Other',
};

export interface Equipment {
  id: number;
  name: string;
  description: string;
  category: keyof typeof equipmentCategories;
  dailyRateMinor: number | null;
  images: { id: number }[];
}

export const catalogKey = ['catalog', 'equipment-types'] as const;

export function useCatalog(dates?: RentalDates) {
  const params = dates && rentalDateParams(dates).toString();
  return useQuery({
    queryKey: params ? [...catalogKey, params] : catalogKey,
    queryFn: ({ signal }) => api<(Equipment & { availableUnits: number | null })[]>(
      `/catalog/equipment-types${params ? `?${params}` : ''}`, { signal },
    ),
    retry: false,
  });
}
