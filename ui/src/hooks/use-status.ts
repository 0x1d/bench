import { useCallback, useEffect, useState } from 'react';
import { fetchStatus, type StatusResponse } from '../services/api';

interface UseStatusResult {
  data: StatusResponse | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useStatus(): UseStatusResult {
  const [state, setState] = useState<{
    data: StatusResponse | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchStatus()
      .then((result) => {
        if (!cancelled) {
          setState({ data: result, error: null, loading: false });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            error: err instanceof Error ? err.message : 'Unknown error',
            loading: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refetch = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setTick((t) => t + 1);
  }, []);

  return { ...state, refetch };
}
