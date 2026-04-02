import { useQuery } from '@tanstack/react-query';
import { api } from '../common.ts';

export function useEducationProgress() {
  return useQuery({
    queryKey: ['education-progress'],
    queryFn: () => api('/api/education/progress'),
    staleTime: 60_000,
  });
}

export function useEducationLessons() {
  return useQuery({
    queryKey: ['education-lessons'],
    queryFn: () => api('/api/education/lessons'),
    staleTime: 10 * 60_000,
  });
}
