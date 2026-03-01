import { useQuery } from '@tanstack/react-query';
import { fetchRestList } from '@/services/api';

export function useRestList() {
  return useQuery({
    queryKey: ['rest', 'list'],
    queryFn: () => fetchRestList(),
  });
}
