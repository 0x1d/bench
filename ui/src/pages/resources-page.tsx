import { useState } from 'react';
import { useRoots } from '@/hooks/use-resources';
import { useFileBrowserHistory } from '@/hooks/use-file-browser-history';
import { FileBrowser } from '@/components/file-browser';

export function ResourcesPage() {
  const { data: rootsData, error: rootsError, isLoading: rootsLoading } = useRoots();
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [path, setPath] = useState('.');

  const roots = rootsData?.roots ?? [];
  const displayRoot =
    roots.length > 0
      ? roots.some((r) => r.id === selectedRoot)
        ? selectedRoot!
        : roots[0].id
      : null;

  const { handleNavigate, handleRootChange } = useFileBrowserHistory(
    path,
    setPath,
    displayRoot,
    setSelectedRoot,
    !!displayRoot
  );

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
