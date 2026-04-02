import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../common.ts';

export function useQuizQuestions() {
  return useQuery({
    queryKey: ['quiz-questions'],
    queryFn: () => api('/api/quiz/questions'),
    staleTime: 10 * 60_000,
  });
}

export function useSubmitQuiz() {
  return useMutation({
    mutationFn: (answers: Record<string, string>) =>
      api('/api/quiz/submit', { method: 'POST', body: JSON.stringify({ answers }) }),
  });
}
