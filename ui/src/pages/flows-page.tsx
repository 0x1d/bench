import { useState, useCallback } from 'react';
import {
  Plus,
  Play,
  Trash2,
  Pencil,
  Workflow,
  Folder,
  ChevronRight,
  FolderPlus,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFlowWorkspaces,
  fetchFlowEntries,
  createFlowModule,
  fetchFlow,
  createFlow,
  deleteFlow,
  runFlow,
  type Flow,
  type FlowWorkspaceEntry,
} from '@/services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { useFlowView } from '@/contexts/flow-view-context';
import { cn } from '@/lib/utils';

function formatMtime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function FlowsPage() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [deleteTarget, setDeleteTarget] = useState<Flow | FlowWorkspaceEntry | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [createFlowDialogOpen, setCreateFlowDialogOpen] = useState(false);
  const [createModuleDialogOpen, setCreateModuleDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('New flow');
  const [newModuleName, setNewModuleName] = useState('');
  const [runParamsOpen, setRunParamsOpen] = useState(false);
  const [runParamValues, setRunParamValues] = useState<Record<string, string>>({});
  const [runTargetFlow, setRunTargetFlow] = useState<Flow | null>(null);
  const { setExecutionId, setSelectedStep, setFlowContext } = useFlowView();

  const queryClient = useQueryClient();

  const { data: workspacesData, isLoading: workspacesLoading } = useQuery({
    queryKey: ['flows', 'workspaces'],
    queryFn: fetchFlowWorkspaces,
    refetchOnWindowFocus: true,
  });

  const workspaces = workspacesData?.workspaces ?? [];
  const displayWorkspace =
    selectedWorkspace && workspaces.some((w) => w.id === selectedWorkspace)
      ? selectedWorkspace
      : workspaces[0]?.id ?? null;

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['flows', 'entries', currentPath],
    queryFn: () => fetchFlowEntries(currentPath === '.' ? '.' : currentPath),
    enabled: workspaces.length > 0,
  });

  const entries = entriesData?.entries ?? [];

  const createModuleMutation = useMutation({
    mutationFn: (name: string) => createFlowModule(name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['flows', 'entries', currentPath],
      });
      setCreateModuleDialogOpen(false);
      setNewModuleName('');
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: (name: string) => {
      const inputId = `step_input_${Date.now()}`;
      return createFlow(
        {
          name: name || 'New flow',
          steps: [
            {
              id: inputId,
              type: 'input',
              label: 'Input',
              config: { params: [] },
            },
          ],
          edges: [],
        },
        currentPath === '.' ? undefined : currentPath
      );
    },
    onSuccess: (newFlow) => {
      queryClient.invalidateQueries({
        queryKey: ['flows', 'entries', currentPath],
      });
      setCreateFlowDialogOpen(false);
      setFlowContext(displayWorkspace ?? null, currentPath === '.' ? null : currentPath);
      window.location.hash = `#flows/${newFlow.id}`;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: Flow) => {
      return deleteFlow(
        target.id,
        currentPath === '.' ? undefined : currentPath
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['flows', 'entries', currentPath],
      });
      setDeleteTarget(null);
    },
  });

  const handleWorkspaceChange = useCallback((id: string) => {
    setSelectedWorkspace(id);
    setCurrentPath('.');
  }, []);

  const handleEntryClick = useCallback(
    (entry: FlowWorkspaceEntry) => {
      if (entry.type === 'module') {
        setCurrentPath(entry.path);
      } else {
        setFlowContext(displayWorkspace ?? null, currentPath === '.' ? null : currentPath);
        window.location.hash = `#flows/${entry.path}`;
      }
    },
    [displayWorkspace, currentPath, setFlowContext]
  );

  const handleCreateFlow = useCallback(() => {
    let canCreate = false;
    if (currentPath === '.') {
      canCreate = true;
    } else {
      canCreate = true;
    }
    if (canCreate) {
      setNewFlowName('New flow');
      setCreateFlowDialogOpen(true);
    }
  }, [currentPath]);

  const handleCreateModule = useCallback(() => {
    if (currentPath === '.') {
      setNewModuleName('');
      setCreateModuleDialogOpen(true);
    }
  }, [currentPath]);

  const handleNavigateUp = useCallback(() => {
    setCurrentPath('.');
  }, []);

  interface InputParam {
    name: string;
    type?: string;
    description?: string;
    default?: string;
  }

  function getInputParams(flow: Flow): InputParam[] {
    const inputStep = flow.steps?.find((s) => s.type === 'input');
    if (!inputStep) return [];
    const params = (inputStep.config?.params as unknown[]) || [];
    return params.filter((p): p is InputParam => !!p && typeof p === 'object' && 'name' in p && !!p.name);
  }

  async function handleRun(entry: FlowWorkspaceEntry) {
    if (entry.type !== 'flow') return;
    const flow = await fetchFlow(
      entry.path,
      currentPath === '.' ? undefined : currentPath
    );
    const params = getInputParams(flow);
    if (params.length > 0) {
      const defaults: Record<string, string> = {};
      for (const p of params) {
        defaults[p.name] = p.default ?? '';
      }
      setRunParamValues(defaults);
      setRunTargetFlow(flow);
      setRunParamsOpen(true);
      return;
    }
    await executeRun(flow);
  }

  async function executeRun(flow: Flow, args?: Record<string, unknown>) {
    setRunResult(null);
    try {
      const result = await runFlow(flow.id, args, {
        workspace: displayWorkspace ?? undefined,
        module: currentPath === '.' ? undefined : currentPath,
      });
      const execId = (result as { flowpipe?: { execution_id?: string } })?.flowpipe?.execution_id;
      if (execId) {
        setRunResult(`Started: ${execId}`);
        setSelectedStep(null);
        setExecutionId(execId);
      } else {
        setRunResult('Flow completed successfully.');
      }
    } catch (e) {
      setRunResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  async function handleRunWithParams() {
    if (!runTargetFlow) return;
    setRunParamsOpen(false);
    await executeRun(runTargetFlow, runParamValues);
    setRunTargetFlow(null);
  }

  const handleDelete = useCallback((entry: FlowWorkspaceEntry) => {
    if (entry.type === 'flow') {
      setDeleteTarget({
        id: entry.path,
        name: entry.name,
        steps: [],
        edges: [],
      } as Flow);
    }
  }, []);

  const deleteTargetFlow =
    deleteTarget && typeof deleteTarget === 'object' && 'steps' in deleteTarget
      ? (deleteTarget as Flow)
      : null;

  if (workspacesLoading) {
    return <p className="text-muted-foreground">Loading workspaces...</p>;
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <span className="rounded px-2 py-1 font-medium">Flows</span>
        </nav>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Workflow className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No flow workspaces configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add workspaces in the Resources config page to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <span className="rounded px-2 py-1 font-medium">Flows</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Select
            value={displayWorkspace ?? ''}
            onValueChange={(v) => {
              setSelectedWorkspace(v);
              handleWorkspaceChange(v);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label || w.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentPath !== '.' && (
            <>
              <ChevronRight className="size-4 text-muted-foreground" />
              <Button variant="ghost" size="sm" onClick={handleNavigateUp}>
                Modules
              </Button>
              <ChevronRight className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{currentPath}</span>
            </>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {currentPath === '.' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateModule}
              disabled={createModuleMutation.isPending}
              className="gap-1.5"
            >
              <FolderPlus className="size-4" />
              New module
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateFlow}
            disabled={createFlowMutation.isPending}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            New flow
          </Button>
        </div>
      </div>

      {runResult && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3',
            runResult.startsWith('Error')
              ? 'border-destructive/50 bg-destructive/10 text-destructive'
              : 'border-border bg-card'
          )}
        >
          <pre className="whitespace-pre-wrap text-sm">{runResult}</pre>
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-auto">
        {entriesLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Workflow className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {currentPath === '.' ? 'No modules or flows yet' : 'No flows in this module'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentPath === '.'
                ? 'Create a module or add flows at root'
                : 'Create a flow to get started'}
            </p>
            <p className="mt-4 flex justify-center gap-2">
              {currentPath === '.' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateModule}
                  disabled={createModuleMutation.isPending}
                >
                  <FolderPlus className="size-4 mr-2" />
                  New module
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateFlow}
                disabled={createFlowMutation.isPending}
              >
                <Plus className="size-4 mr-2" />
                New flow
              </Button>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Steps</th>
                  <th className="px-4 py-3 text-left font-medium">Modified</th>
                  <th className="w-28 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={`${entry.type}-${entry.path}`}
                    onClick={() => handleEntryClick(entry)}
                    className="border-b border-border/50 last:border-b-0 cursor-pointer transition-colors hover:bg-accent/30"
                  >
                    <td className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        {entry.type === 'module' ? (
                          <Folder className="size-4 text-primary shrink-0" />
                        ) : (
                          <Workflow className="size-4 text-muted-foreground shrink-0" />
                        )}
                        {entry.name}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {entry.type === 'module' ? 'Module' : 'Flow'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {entry.type === 'flow' ? `${entry.steps ?? 0} step(s)` : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {entry.mtime ? formatMtime(entry.mtime) : '—'}
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      {entry.type === 'flow' && (
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRun(entry);
                            }}
                            aria-label="Run flow"
                          >
                            <Play className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFlowContext(
                                displayWorkspace ?? null,
                                currentPath === '.' ? null : currentPath
                              );
                              window.location.hash = `#flows/${entry.path}`;
                            }}
                            aria-label="Edit flow"
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(entry);
                            }}
                            aria-label="Delete flow"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTargetFlow}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete flow"
        description={`Are you sure you want to delete "${deleteTargetFlow?.name || deleteTargetFlow?.id}"? This cannot be undone.`}
        onConfirm={() => deleteTargetFlow && deleteMutation.mutate(deleteTargetFlow)}
        isLoading={deleteMutation.isPending}
      />

      <Dialog open={createFlowDialogOpen} onOpenChange={setCreateFlowDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new flow</DialogTitle>
            <DialogDescription>
              Give your new flow a name to get started.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    createFlowMutation.mutate(newFlowName);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFlowDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createFlowMutation.mutate(newFlowName)}
              disabled={createFlowMutation.isPending}
            >
              {createFlowMutation.isPending ? 'Creating...' : 'Create Flow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createModuleDialogOpen} onOpenChange={setCreateModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new module</DialogTitle>
            <DialogDescription>
              Create a module folder. Flows in this module will be stored under flows/.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="module-name">Module name</Label>
              <Input
                id="module-name"
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                placeholder="my-module"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    createModuleMutation.mutate(newModuleName.trim());
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Use lowercase, hyphens for multi-word names (e.g. my-module).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createModuleMutation.mutate(newModuleName.trim())}
              disabled={createModuleMutation.isPending || !newModuleName.trim()}
            >
              {createModuleMutation.isPending ? 'Creating...' : 'Create Module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={runParamsOpen}
        onOpenChange={(open) => {
          setRunParamsOpen(open);
          if (!open) setRunTargetFlow(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Parameters</DialogTitle>
            <DialogDescription>
              Provide values for the pipeline input parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {runTargetFlow &&
              getInputParams(runTargetFlow).map((p) => (
                <div key={p.name} className="space-y-1.5">
                  <Label
                    htmlFor={`param-${p.name}`}
                    className="text-xs font-medium flex items-center gap-2"
                  >
                    {p.name}
                    {p.type && (
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                        {p.type}
                      </span>
                    )}
                  </Label>
                  {p.description && (
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  )}
                  <Input
                    id={`param-${p.name}`}
                    value={runParamValues[p.name] ?? ''}
                    onChange={(e) =>
                      setRunParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                    }
                    placeholder={p.default ? `Default: ${p.default}` : `Enter ${p.name}`}
                    className="font-mono text-sm"
                  />
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRunParamsOpen(false);
                setRunTargetFlow(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRunWithParams}>
              <Play className="size-4 mr-1.5" />
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
