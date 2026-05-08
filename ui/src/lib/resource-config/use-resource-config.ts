import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchConfig, fetchConfigExample, saveConfig } from '@/services/api';
import { useStatus } from '@/hooks/use-status';
import { parseConfigToState, stateToConfig } from './parse-serialize';
import type { ResourceFormState } from './types';

/** TanStack Query key for raw config.yaml string (read-modify-write reads this cache). */
export const RESOURCE_CONFIG_QUERY_KEY = ['config', 'raw'] as const;

async function loadConfigRaw(): Promise<string> {
  const [currentResult, exampleResult] = await Promise.allSettled([
    fetchConfig(),
    fetchConfigExample(),
  ]);
  return currentResult.status === 'fulfilled'
    ? currentResult.value
    : exampleResult.status === 'fulfilled'
      ? exampleResult.value
      : '';
}

/**
 * Shared resource config: fetch full YAML, parse to {@link ResourceFormState}, save full document.
 *
 * **Read-modify-write:** `mergeAndPersist` reads the latest cached YAML (or empty), parses to
 * state, applies your updater, then serializes and saves — so callers can update one slice without
 * manually merging with unrelated sections. `persistState` replaces the entire logical state; use
 * when you already hold the full {@link ResourceFormState}.
 */
export function useResourceConfig() {
  const queryClient = useQueryClient();
  const { refetch: refetchStatus } = useStatus();

  const query = useQuery({
    queryKey: RESOURCE_CONFIG_QUERY_KEY,
    queryFn: loadConfigRaw,
  });

  /**
   * Writes full config. Invalidates config query, status, flows workspaces, and infrastructure.
   */
  const persistState = useCallback(
    async (newState: ResourceFormState) => {
      const yaml = stateToConfig(newState);
      await saveConfig(yaml);
      await refetchStatus();
      await queryClient.invalidateQueries({ queryKey: RESOURCE_CONFIG_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['resources', 'roots'] });
      queryClient.invalidateQueries({ queryKey: ['rest'] });
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
      queryClient.invalidateQueries({ queryKey: ['flows', 'workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
    },
    [queryClient, refetchStatus],
  );

  /**
   * RMW: latest cached raw config → parse → `updater` → persist. Use for slice updates from
   * feature pages when local state does not already hold the full merged form state.
   */
  const mergeAndPersist = useCallback(
    async (updater: (prev: ResourceFormState) => ResourceFormState) => {
      const raw = queryClient.getQueryData<string>(RESOURCE_CONFIG_QUERY_KEY);
      const prev = parseConfigToState(typeof raw === 'string' ? raw : '');
      const next = updater(prev);
      await persistState(next);
    },
    [queryClient, persistState],
  );

  return {
    /** Raw YAML from server (undefined until first successful fetch). */
    data: query.data,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    persistState,
    mergeAndPersist,
  };
}
