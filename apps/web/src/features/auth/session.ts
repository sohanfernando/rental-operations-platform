import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../shared/api';

export interface User {
  id: number;
  email: string;
  role: 'CUSTOMER' | 'STAFF';
}

export const sessionKey = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return await api<User>('/auth/me', { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}
