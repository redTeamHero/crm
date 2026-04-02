import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../common.ts';

export interface TeamMember {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  token?: string;
  teamRole?: string;
  [key: string]: unknown;
}

export interface CreditCompany {
  id?: string;
  name?: string;
  bio?: string;
  logo?: string;
  reviews?: unknown[];
  [key: string]: unknown;
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: () => api<{ members?: TeamMember[] }>('/api/team-members'),
    staleTime: 60_000,
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api(`/api/team-members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-members'] }),
  });
}

export function useCreditCompanies() {
  return useQuery({
    queryKey: ['credit-companies'],
    queryFn: () => api<{ companies?: CreditCompany[] }>('/api/credit-companies'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCreditCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreditCompany>) =>
      api('/api/credit-companies', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-companies'] }),
  });
}

export function useUpdateCreditCompanyBio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bio }: { id: string; bio: string }) =>
      api(`/api/credit-companies/${id}/bio`, { method: 'PUT', body: JSON.stringify({ bio }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-companies'] }),
  });
}

export function useCompanyReviews(companyId: string | null) {
  return useQuery({
    queryKey: ['company-reviews', companyId],
    queryFn: () => api(`/api/credit-companies/${companyId}/reviews`),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}
