import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRoots } from '@/hooks/use-resources';
import { useFileBrowserHistory } from '@/hooks/use-file-browser-history';
import { FileBrowser } from '@/components/file-browser';

const RESOURCES_STATE_KEY = 'bench-resources-page';

/** Path per root and last selected root. */
interface PersistedState {
  paths: Record<string, string>;
  lastRoot: string | null;
}

function loadPersistedState(): PersistedState {
  try {
    const s = sessionStorage.getItem(RESOURCES_STATE_KEY);
    if (s) {
      const v = JSON.parse(s) as {
        paths?: Record<string, string>;
        path?: string;
        root?: string;
        lastRoot?: string;
      };
      const paths: Record<string, string> =
        v?.paths && typeof v.paths === 'object'
          ? (v.paths as Record<string, string>)
          : typeof v?.path === 'string' && typeof v?.root === 'string'
            ? { [v.root]: v.path }
            : {};
      const lastRoot =
        typeof v?.lastRoot === 'string' ? v.lastRoot : typeof v?.root === 'string' ? v.root : null;
      return { paths, lastRoot };
    }
  } catch {
    /* ignore */
  }
  return { paths: {}, lastRoot: null };
}

function savePersistedState(paths: Record<string, string>, lastRoot: string | null) {
  try {
    sessionStorage.setItem(RESOURCES_STATE_KEY, JSON.stringify({ paths, lastRoot }));
  } catch {
    /* ignore */
  }
}

export function ResourcesPage() {
  const { data: rootsData, error: rootsError, isLoading: rootsLoading } = useRoots();
  const initialPersisted = useMemo(() => loadPersistedState(), []);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(initialPersisted.lastRoot);
  const [path, setPath] = useState(initialPersisted.lastRoot ? (initialPersisted.paths[initialPersisted.lastRoot] ?? '.') : '.');

  const roots = rootsData?.roots ?? [];
  const displayRoot =
    roots.length > 0
      ? roots.some((r) => r.id === selectedRoot)
        ? selectedRoot!
        : roots[0].id
      : null;

  const { handleNavigate, handleRootChange: baseHandleRootChange } = useFileBrowserHistory(
    path,
    setPath,
    displayRoot,
    setSelectedRoot,
    !!displayRoot
  );

  const handleRootChange = useCallback(
    (newRoot: string) => {
      const { paths } = loadPersistedState();
      const pathForRoot = paths[newRoot] ?? '.';
      baseHandleRootChange(newRoot, pathForRoot);
    },
    [baseHandleRootChange]
  );

  useEffect(() => {
    if (displayRoot) {
      const { paths } = loadPersistedState();
      paths[displayRoot] = path;
      savePersistedState(paths, displayRoot);
    }
  }, [path, displayRoot]);

  if (rootsLoading) {
    return (
      <div className="w-full">
        <p className="text-muted-foreground">Loading roots...</p>
      </div>
    );
  }

  if (rootsError) {
    return (
      <div className="w-full">
        <p className="text-destructive">
          {rootsError instanceof Error ? rootsError.message : 'Failed to load roots'}
        </p>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div className="w-full max-w-xl p-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium tracking-tight">Resources</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No resource roots configured. Add filesystem entries to <code className="rounded bg-muted px-1">config.yaml</code> to enable file browsing.
          </p>
        </div>
      </div>
    );
  }

  const currentRootLabel = roots.find((r) => r.id === displayRoot)?.label ?? displayRoot ?? '';

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      {displayRoot && (
        <FileBrowser
          root={displayRoot}
          path={path}
          onNavigate={handleNavigate}
          rootLabel={currentRootLabel}
          roots={roots}
          onRootChange={handleRootChange}
        />
      )}
    </div>
  );
}
