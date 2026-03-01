import { useEffect, useState } from 'react';
import yaml from 'js-yaml';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { fetchConfig, fetchConfigExample, saveConfig } from '@/services/api';
import { useStatus } from '@/hooks/use-status';

interface FilesystemResource {
  id: string;
  label: string;
  path: string;
}

interface DatabaseResource {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  default: boolean;
}

interface ResourceFormState {
  filesystem: FilesystemResource[];
  databases: DatabaseResource[];
}

type PanelMode =
  | 'add-filesystem'
  | 'edit-filesystem'
  | 'add-database'
  | 'edit-database';

type DeleteTarget =
  | { type: 'filesystem'; index: number }
  | { type: 'database'; index: number }
  | null;

function emptyState(): ResourceFormState {
  return { filesystem: [], databases: [] };
}

function parseConfigToState(rawConfig: string): ResourceFormState {
  const parsed = (yaml.load(rawConfig) as {
    resources?: {
      filesystem?: Array<{ id?: string; label?: string; path?: string }>;
      databases?: Array<{
        id?: string;
        label?: string;
        url?: string;
        enabled?: boolean;
        default?: boolean;
      }>;
    };
  }) ?? { resources: {} };

  const filesystem = (parsed.resources?.filesystem ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    path: entry.path ?? '',
  }));

  const databases = (parsed.resources?.databases ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    url: entry.url ?? '',
    enabled: entry.enabled ?? true,
    default: entry.default ?? false,
  }));

  return { filesystem, databases };
}

function stateToConfig(state: ResourceFormState): string {
  const resources = {
    filesystem: state.filesystem
      .filter((entry) => entry.id.trim() !== '' || entry.path.trim() !== '')
      .map((entry) => ({
        id: entry.id.trim(),
        label: entry.label.trim() || undefined,
        path: entry.path.trim(),
      })),
    databases: state.databases
      .filter((entry) => entry.id.trim() !== '' || entry.url.trim() !== '')
      .map((entry) => ({
        id: entry.id.trim(),
        label: entry.label.trim() || undefined,
        url: entry.url.trim(),
        enabled: entry.enabled,
        default: entry.default || undefined,
      })),
  };

  return yaml.dump({ resources }, { noRefs: true, lineWidth: 120 });
}

export function ResourcesConfigPage() {
  const { refetch: refetchStatus } = useStatus();
  const [state, setState] = useState<ResourceFormState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [panelIndex, setPanelIndex] = useState<number | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [filesystemDraft, setFilesystemDraft] = useState<FilesystemResource>({
    id: '',
    label: '',
    path: '',
  });
  const [databaseDraft, setDatabaseDraft] = useState<DatabaseResource>({
    id: '',
    label: '',
    url: '',
    enabled: true,
    default: false,
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const nextConfig = stateToConfig(state);
      await saveConfig(nextConfig);
      await refetchStatus();
      setSaveMessage('Resources saved to config.yaml');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([fetchConfig(), fetchConfigExample()])
      .then(([currentResult, exampleResult]) => {
        if (cancelled) return;
        const base =
          currentResult.status === 'fulfilled'
            ? currentResult.value
            : exampleResult.status === 'fulfilled'
              ? exampleResult.value
              : '';
        setState(parseConfigToState(base));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load config');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openAddFilesystem = () => {
    setFilesystemDraft({ id: '', label: '', path: '' });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-filesystem');
  };

  const openEditFilesystem = (index: number) => {
    setFilesystemDraft(state.filesystem[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-filesystem');
  };

  const openRemoveFilesystem = (index: number) => {
    setDeleteTarget({ type: 'filesystem', index });
  };

  const openAddDatabase = () => {
    const hasDefault = state.databases.some((db) => db.default);
    setDatabaseDraft({
      id: '',
      label: '',
      url: '',
      enabled: true,
      default: !hasDefault,
    });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-database');
  };

  const openEditDatabase = (index: number) => {
    setDatabaseDraft(state.databases[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-database');
  };

  const openRemoveDatabase = (index: number) => {
    setDeleteTarget({ type: 'database', index });
  };

  const closePanel = () => {
    setPanelMode(null);
    setPanelIndex(null);
    setPanelError(null);
  };

  const applyFilesystemDraft = () => {
    const id = filesystemDraft.id.trim();
    const path = filesystemDraft.path.trim();
    if (id === '' || path === '') {
      setPanelError('Filesystem ID and path are required.');
      return;
    }

    const duplicate = state.filesystem.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`Filesystem ID "${id}" already exists.`);
      return;
    }

    const nextEntry: FilesystemResource = {
      id,
      label: filesystemDraft.label.trim(),
      path,
    };

    if (panelMode === 'add-filesystem') {
      setState((prev) => ({ ...prev, filesystem: [...prev.filesystem, nextEntry] }));
    } else if (panelMode === 'edit-filesystem' && panelIndex != null) {
      setState((prev) => ({
        ...prev,
        filesystem: prev.filesystem.map((entry, idx) =>
          idx === panelIndex ? nextEntry : entry
        ),
      }));
    }
    closePanel();
  };

  const applyDatabaseDraft = () => {
    const id = databaseDraft.id.trim();
    const url = databaseDraft.url.trim();
    if (id === '' || url === '') {
      setPanelError('Database ID and URL are required.');
      return;
    }

    const duplicate = state.databases.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`Database ID "${id}" already exists.`);
      return;
    }

    const nextEntry: DatabaseResource = {
      id,
      label: databaseDraft.label.trim(),
      url,
      enabled: databaseDraft.enabled,
      default: databaseDraft.default,
    };

    const applyWithDefaultRule = (entries: DatabaseResource[]) => {
      if (!nextEntry.default) return entries;
      return entries.map((entry, idx) =>
        panelMode === 'edit-database' && panelIndex != null
          ? idx === panelIndex
            ? entry
            : { ...entry, default: false }
          : { ...entry, default: false }
      );
    };

    if (panelMode === 'add-database') {
      setState((prev) => {
        const normalized = applyWithDefaultRule(prev.databases);
        return { ...prev, databases: [...normalized, nextEntry] };
      });
    } else if (panelMode === 'edit-database' && panelIndex != null) {
      setState((prev) => {
        const normalized = applyWithDefaultRule(prev.databases);
        return {
          ...prev,
          databases: normalized.map((entry, idx) =>
            idx === panelIndex ? nextEntry : entry
          ),
        };
      });
    }
    closePanel();
  };

  const confirmRemove = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'filesystem') {
      setState((prev) => ({
        ...prev,
        filesystem: prev.filesystem.filter((_, idx) => idx !== deleteTarget.index),
      }));
    } else {
      setState((prev) => ({
        ...prev,
        databases: prev.databases.filter((_, idx) => idx !== deleteTarget.index),
      }));
    }
    setDeleteTarget(null);
  };

  const panelOpen = panelMode != null;
  const panelTitle =
    panelMode === 'add-filesystem'
      ? 'Add filesystem resource'
      : panelMode === 'edit-filesystem'
        ? 'Edit filesystem resource'
        : panelMode === 'add-database'
            ? 'Add database resource'
            : panelMode === 'edit-database'
              ? 'Edit database resource'
              : 'Resource';
  const panelDescription = panelMode?.includes('filesystem')
    ? 'Configure filesystem resource fields used for file browsing.'
    : panelMode?.includes('database')
      ? 'Configure database resource fields.'
      : '';

  const panelBody = (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <div>
          <p className="text-sm font-medium">{panelTitle}</p>
          {panelDescription && (
            <p className="text-xs text-muted-foreground">{panelDescription}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={closePanel} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

      <div className="p-4">
        {(panelMode === 'add-filesystem' || panelMode === 'edit-filesystem') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={filesystemDraft.id}
                onChange={(e) =>
                  setFilesystemDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="data"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={filesystemDraft.label}
                onChange={(e) =>
                  setFilesystemDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Data"
              />
            </div>
            <div className="space-y-1">
              <Label>Path</Label>
              <Input
                value={filesystemDraft.path}
                onChange={(e) =>
                  setFilesystemDraft((prev) => ({ ...prev, path: e.target.value }))
                }
                placeholder="/mnt/data"
                className="font-mono"
              />
            </div>
          </div>
        )}

        {(panelMode === 'add-database' || panelMode === 'edit-database') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={databaseDraft.id}
                onChange={(e) =>
                  setDatabaseDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="main"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={databaseDraft.label}
                onChange={(e) =>
                  setDatabaseDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Main DB"
              />
            </div>
            <div className="space-y-1">
              <Label>URL</Label>
              <Input
                value={databaseDraft.url}
                onChange={(e) =>
                  setDatabaseDraft((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="${BENCH_DB_MAIN_URL}"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                URL supports env placeholders like{' '}
                <code className="rounded bg-muted px-1">${'{BENCH_DB_MAIN_URL}'}</code>.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={databaseDraft.enabled}
                onCheckedChange={(v) =>
                  setDatabaseDraft((prev) => ({ ...prev, enabled: v === true }))
                }
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={databaseDraft.default}
                onCheckedChange={(v) =>
                  setDatabaseDraft((prev) => ({ ...prev, default: v === true }))
                }
              />
              Default
            </label>
          </div>
        )}

        {panelError && <p className="mt-3 text-sm text-destructive">{panelError}</p>}
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={closePanel}>
            Cancel
          </Button>
          {(panelMode === 'add-filesystem' || panelMode === 'edit-filesystem') && (
            <Button onClick={applyFilesystemDraft}>
              {panelMode === 'add-filesystem' ? 'Add' : 'Save changes'}
            </Button>
          )}
          {(panelMode === 'add-database' || panelMode === 'edit-database') && (
            <Button onClick={applyDatabaseDraft}>
              {panelMode === 'add-database' ? 'Add' : 'Save changes'}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (loading) {
    return <p className="text-muted-foreground">Loading resource configuration...</p>;
  }

  return (
    <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-auto pr-0 lg:pr-2',
          panelOpen && 'lg:pr-[428px]'
        )}
      >
        <div className="flex w-full min-h-0 flex-1 flex-col gap-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-medium tracking-tight">Resources</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure filesystem roots and database resources.
            </p>
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Filesystem resources</h3>
              <Button variant="outline" size="sm" onClick={openAddFilesystem}>
                <Plus className="size-4" />
                Add filesystem
              </Button>
            </div>
            {state.filesystem.length === 0 ? (
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
                    {state.filesystem.map((entry, index) => (
                      <tr key={`fs-${index}`} className="border-b border-border/50 last:border-b-0">
                        <td className="px-4 py-2 font-mono">{entry.id}</td>
                        <td className="px-4 py-2">{entry.label || '—'}</td>
                        <td className="px-4 py-2 font-mono">{entry.path}</td>
                        <td className="px-2 py-2">
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
                              onClick={() => openRemoveFilesystem(index)}
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

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Database resources</h3>
              <Button variant="outline" size="sm" onClick={openAddDatabase}>
                <Plus className="size-4" />
                Add database
              </Button>
            </div>
            {state.databases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No database resources configured.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">URL</th>
                      <th className="px-4 py-3 text-left font-medium">Enabled</th>
                      <th className="px-4 py-3 text-left font-medium">Default</th>
                      <th className="w-28 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.databases.map((entry, index) => (
                      <tr key={`db-${index}`} className="border-b border-border/50 last:border-b-0">
                        <td className="px-4 py-2 font-mono">{entry.id}</td>
                        <td className="px-4 py-2">{entry.label || '—'}</td>
                        <td className="px-4 py-2 font-mono">{entry.url}</td>
                        <td className="px-4 py-2">{entry.enabled ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2">{entry.default ? 'Yes' : 'No'}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openEditDatabase(index)}
                              aria-label={`Edit database ${entry.id}`}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openRemoveDatabase(index)}
                              aria-label={`Remove database ${entry.id}`}
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

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saveMessage && <p className="text-sm text-emerald-600">{saveMessage}</p>}

          <div className="flex">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="size-4" />
              {saving ? 'Saving...' : 'Save resources config'}
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-x-0 bottom-0 top-[var(--header-height)] z-30 min-h-0 flex-col overflow-auto border-l lg:hidden',
          panelOpen ? 'flex' : 'hidden'
        )}
      >
        {panelBody}
      </div>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed right-0 bottom-0 top-[var(--header-height)] z-20 hidden min-h-0 w-[420px] flex-col overflow-auto border-l lg:flex',
          panelOpen ? 'lg:flex' : 'lg:hidden'
        )}
      >
        {panelBody}
      </div>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove resource</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'filesystem'
                ? `Remove filesystem resource "${state.filesystem[deleteTarget.index]?.id}"?`
                : deleteTarget?.type === 'database'
                  ? `Remove database resource "${state.databases[deleteTarget.index]?.id}"?`
                  : 'Remove selected resource?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={confirmRemove}>
                Remove
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
