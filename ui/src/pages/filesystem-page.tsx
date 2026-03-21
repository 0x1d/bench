import { useState, useEffect, useMemo, useCallback } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilesystemResourceFields, ResourceSettingsSidePanel } from '@/components/resource-config';
import { FileBrowser } from '@/components/file-browser';
import { useRoots } from '@/hooks/use-resources';
import { useFileBrowserHistory } from '@/hooks/use-file-browser-history';
import {
  parseConfigToState,
  useResourceConfig,
  type FilesystemResource,
} from '@/lib/resource-config';

const FILESYSTEM_STATE_KEY = 'bench-filesystem-page';

interface PersistedState {
  paths: Record<string, string>;
  lastRoot: string | null;
}

function loadPersistedState(): PersistedState {
  try {
    const s = sessionStorage.getItem(FILESYSTEM_STATE_KEY);
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
    sessionStorage.setItem(FILESYSTEM_STATE_KEY, JSON.stringify({ paths, lastRoot }));
  } catch {
    /* ignore */
  }
}

export function FilesystemPage() {
  const { data: rawConfig, mergeAndPersist, isPending: configPending, error: configError } =
    useResourceConfig();
  const filesystemList = useMemo(
    () => parseConfigToState(rawConfig ?? '').filesystem,
    [rawConfig]
  );

  const [pageTab, setPageTab] = useState<'browse' | 'settings'>('browse');
  const [editingFs, setEditingFs] = useState<'add' | number | null>(null);
  const [filesystemDraft, setFilesystemDraft] = useState<FilesystemResource>({
    id: '',
    label: '',
    path: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [savePending, setSavePending] = useState(false);

  const { data: rootsData, error: rootsError, isLoading: rootsLoading } = useRoots();
  const initialPersisted = useMemo(() => loadPersistedState(), []);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(initialPersisted.lastRoot);
  const [path, setPath] = useState(
    initialPersisted.lastRoot ? (initialPersisted.paths[initialPersisted.lastRoot] ?? '.') : '.'
  );

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

  const openAddFilesystem = () => {
    setFilesystemDraft({ id: '', label: '', path: '' });
    setFormError(null);
    setEditingFs('add');
  };

  const openEditFilesystem = (index: number) => {
    setFilesystemDraft(filesystemList[index]);
    setFormError(null);
    setEditingFs(index);
  };

  const applyFilesystemDraft = async () => {
    const id = filesystemDraft.id.trim();
    const pathVal = filesystemDraft.path.trim();
    if (id === '' || pathVal === '') {
      setFormError('Filesystem ID and path are required.');
      return;
    }

    const duplicate = filesystemList.some(
      (entry, idx) => idx !== (editingFs === 'add' ? -1 : editingFs) && entry.id.trim() === id
    );
    if (duplicate) {
      setFormError(`Filesystem ID "${id}" already exists.`);
      return;
    }

    const nextEntry: FilesystemResource = {
      id,
      label: filesystemDraft.label.trim(),
      path: pathVal,
    };

    setFormError(null);
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => {
        if (editingFs === 'add') {
          return { ...prev, filesystem: [...prev.filesystem, nextEntry] };
        }
        if (typeof editingFs === 'number') {
          return {
            ...prev,
            filesystem: prev.filesystem.map((e, idx) => (idx === editingFs ? nextEntry : e)),
          };
        }
        return prev;
      });
      setEditingFs(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavePending(false);
    }
  };

  const confirmDeleteFilesystem = async () => {
    if (deleteIndex == null) return;
    const idx = deleteIndex;
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => ({
        ...prev,
        filesystem: prev.filesystem.filter((_, i) => i !== idx),
      }));
      setDeleteIndex(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSavePending(false);
    }
  };

  const currentRootLabel = roots.find((r) => r.id === displayRoot)?.label ?? displayRoot ?? '';

  const configErr =
    configError instanceof Error ? configError.message : configError ? String(configError) : null;

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      <Tabs
        value={pageTab}
        onValueChange={(v) => setPageTab(v as 'browse' | 'settings')}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList variant="line" className="w-fit max-w-full shrink-0 justify-start gap-x-1">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-3 flex min-h-0 flex-1 flex-col gap-4">
          {rootsLoading && (
            <p className="text-muted-foreground">Loading roots...</p>
          )}
          {!rootsLoading && rootsError && (
            <p className="text-destructive">
              {rootsError instanceof Error ? rootsError.message : 'Failed to load roots'}
            </p>
          )}
          {!rootsLoading && !rootsError && roots.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <h2 className="text-lg font-medium">No filesystem resources configured</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add at least one root folder in Settings to browse files here.
              </p>
              <Button type="button" className="mt-4" onClick={() => setPageTab('settings')}>
                Open Settings
              </Button>
            </div>
          )}
          {!rootsLoading && !rootsError && roots.length > 0 && displayRoot && (
            <FileBrowser
              root={displayRoot}
              path={path}
              onNavigate={handleNavigate}
              rootLabel={currentRootLabel}
              roots={roots}
              onRootChange={handleRootChange}
            />
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          {configPending && (
            <p className="text-muted-foreground">Loading configuration...</p>
          )}
          {configErr && <p className="text-sm text-destructive">{configErr}</p>}
          {!configPending && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-medium">Filesystem resources</h3>
                <Button variant="outline" size="sm" onClick={openAddFilesystem}>
                  <Plus className="size-4" />
                  Add filesystem
                </Button>
              </div>
              {filesystemList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No filesystem resources configured.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 text-left font-medium">ID</th>
                        <th className="px-4 py-3 text-left font-medium">Label</th>
                        <th className="px-4 py-3 text-left font-medium">Path</th>
                        <th className="w-28 px-2 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filesystemList.map((entry, index) => (
                        <tr
                          key={`fs-${index}`}
                          className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30"
                          onClick={() => openEditFilesystem(index)}
                        >
                          <td className="px-4 py-2 font-mono">{entry.id}</td>
                          <td className="px-4 py-2">{entry.label || '—'}</td>
                          <td className="px-4 py-2 font-mono">{entry.path}</td>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => openEditFilesystem(index)}
                                aria-label={`Edit filesystem ${entry.id}`}
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setDeleteIndex(index)}
                                aria-label={`Remove filesystem ${entry.id}`}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </TabsContent>
      </Tabs>

      <ResourceSettingsSidePanel
        open={editingFs !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingFs(null);
            setFormError(null);
          }
        }}
        title={editingFs === 'add' ? 'Add filesystem' : 'Edit filesystem'}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingFs(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={applyFilesystemDraft} disabled={savePending}>
              {editingFs === 'add' ? 'Add' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <FilesystemResourceFields draft={filesystemDraft} onChange={setFilesystemDraft} />
        {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
      </ResourceSettingsSidePanel>

      <ConfirmDeleteDialog
        open={deleteIndex != null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
        title="Remove filesystem resource?"
        description={
          deleteIndex != null && filesystemList[deleteIndex]
            ? `Remove "${filesystemList[deleteIndex].id}" from configuration?`
            : 'Remove this resource?'
        }
        onConfirm={confirmDeleteFilesystem}
        isLoading={savePending}
      />
    </div>
  );
}
