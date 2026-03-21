import { useState, useCallback } from 'react';
import {
  Plus,
  Play,
  Workflow,
  FolderPlus,
  Search,
  Eye,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFlowWorkspaces,
  fetchFlowTree,
  fetchFlowProcesses,
  createFlowModule,
  fetchFlow,
  createFlow,
  deleteFlow,
  runFlow,
  moveFlow,
  type Flow,
  type FlowWorkspaceEntry,
  type FlowWorkspaceTreeEntry,
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
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { FlowsTreeView } from '@/components/flows-tree-view';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFlowView } from '@/contexts/flow-view-context';
import { cn } from '@/lib/utils';

function filterTreeByFlowName(
  entries: FlowWorkspaceTreeEntry[],
  query: string
): FlowWorkspaceTreeEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries
    .map((entry) => {
      if (entry.type === 'flow') {
        return entry.name.toLowerCase().includes(q) ? entry : null;
      }
      const filteredChildren = entry.children
        ? filterTreeByFlowName(entry.children, query)
        : [];
      return filteredChildren.length > 0 ? { ...entry, children: filteredChildren } : null;
    })
    .filter((e): e is FlowWorkspaceTreeEntry => e !== null);
}

export function FlowsPage() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [deleteTarget, setDeleteTarget] = useState<Flow | FlowWorkspaceEntry | null>(null);
  const [deleteTargetModule, setDeleteTargetModule] = useState<string | null>(null);
  const [createFlowDialogOpen, setCreateFlowDialogOpen] = useState(false);
  const [createFlowInModule, setCreateFlowInModule] = useState<string | null>(null);
  const [createModuleDialogOpen, setCreateModuleDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('New flow');
  const [newModuleName, setNewModuleName] = useState('');
  const [runParamsOpen, setRunParamsOpen] = useState(false);
  const [runParamValues, setRunParamValues] = useState<Record<string, string>>({});
  const [runTargetFlow, setRunTargetFlow] = useState<Flow | null>(null);
  const [runTargetModule, setRunTargetModule] = useState<string | null>(null);
  const [flowFilter, setFlowFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'modules' | 'executions'>('modules');
  const { setExecutionId, setSelectedStep, setFlowContext, setModuleEditPath } = useFlowView();

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

  const { data: treeData, isLoading: entriesLoading } = useQuery({
    queryKey: ['flows', 'tree'],
    queryFn: () => fetchFlowTree('.'),
    enabled: workspaces.length > 0,
  });

  const treeEntries = treeData?.entries ?? [];
  const filteredTreeEntries = filterTreeByFlowName(treeEntries, flowFilter);

  const { data: processesData, isLoading: processesLoading, error: processesError } = useQuery({
    queryKey: ['flows', 'processes', displayWorkspace ?? 'default'],
    queryFn: () => fetchFlowProcesses(displayWorkspace ?? undefined),
    enabled: workspaces.length > 0 && activeTab === 'executions',
  });

  const processItems: Record<string, unknown>[] = (() => {
    const raw = processesData;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && 'items' in raw && Array.isArray((raw as { items: unknown[] }).items)) {
      return (raw as { items: Record<string, unknown>[] }).items;
    }
    return [];
  })();

  const flowFilterLower = flowFilter.trim().toLowerCase();
  const filteredProcesses = flowFilterLower
    ? processItems.filter((p) => {
        const name = String(
          (p as Record<string, unknown>).pipeline ??
            (p as Record<string, unknown>).pipeline_name ??
            (p as Record<string, unknown>).name ??
            (p as Record<string, unknown>).id ??
            (p as Record<string, unknown>).execution_id ??
            ''
        ).toLowerCase();
        return name.includes(flowFilterLower);
      })
    : processItems;

  const createModuleMutation = useMutation({
    mutationFn: (name: string) => createFlowModule(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', 'tree'] });
      setCreateModuleDialogOpen(false);
      setNewModuleName('');
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: ({ name, module: mod }: { name: string; module: string | null }) => {
      return createFlow(
        {
          name: name || 'New flow',
          steps: [],
          edges: [],
        },
        mod === '.' || mod === null ? undefined : mod
      );
    },
    onSuccess: (newFlow, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flows', 'tree'] });
      setCreateFlowDialogOpen(false);
      const mod = variables.module;
      setFlowContext(displayWorkspace ?? null, mod === '.' || mod === null ? null : mod);
      setCreateFlowInModule(null);
      const path = mod && mod !== '.' ? `${mod}/${newFlow.id}` : newFlow.id;
      window.location.hash = `#flows/${path}`;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: Flow) => {
      return deleteFlow(target.id, deleteTargetModule ?? undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', 'tree'] });
      setDeleteTarget(null);
      setDeleteTargetModule(null);
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ flowId, fromModule, toModule }: { flowId: string; fromModule: string; toModule: string }) =>
      moveFlow(flowId, fromModule, toModule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', 'tree'] });
      toast.success('Flow moved');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to move flow');
    },
  });

  const handleWorkspaceChange = useCallback((id: string) => {
    setSelectedWorkspace(id);
    setCurrentPath('.');
  }, []);


  const handleCreateFlow = useCallback((modulePath?: string) => {
    setNewFlowName('New flow');
    setCreateFlowInModule(modulePath ?? '.');
    setCreateFlowDialogOpen(true);
  }, []);

  const handleCreateModule = useCallback(() => {
    if (currentPath === '.') {
      setNewModuleName('');
      setCreateModuleDialogOpen(true);
    }
  }, [currentPath]);

  interface InputParam {
    name: string;
    type?: string;
    description?: string;
    default?: string;
  }

  const getInputParams = useCallback((flow: Flow): InputParam[] => {
    const inputStep = flow.steps?.find((s) => s.type === 'input');
    if (!inputStep) return [];
    const params = (inputStep.config?.params as unknown[]) || [];
    return params.filter((p): p is InputParam => !!p && typeof p === 'object' && 'name' in p && !!p.name);
  }, []);

  const executeRun = useCallback(async (
    flow: Flow,
    args?: Record<string, unknown>,
    modulePath?: string
  ) => {
    const mod = modulePath ?? runTargetModule ?? currentPath;
    try {
      const result = await runFlow(flow.id, args, {
        workspace: displayWorkspace ?? undefined,
        module: mod === '.' ? undefined : mod,
      });
      const execId = (result as { flowpipe?: { execution_id?: string } })?.flowpipe?.execution_id;
      if (execId) {
        toast.success('Flow started successfully');
        setSelectedStep(null);
        setExecutionId(execId);
      } else {
        toast.success('Flow completed successfully');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to run flow');
    }
  }, [currentPath, displayWorkspace, runTargetModule, setExecutionId, setSelectedStep]);

  async function handleRunWithParams() {
    if (!runTargetFlow) return;
    setRunParamsOpen(false);
    await executeRun(runTargetFlow, runParamValues, runTargetModule ?? undefined);
    setRunTargetFlow(null);
    setRunTargetModule(null);
  }

  const handleDelete = useCallback(
    (entry: FlowWorkspaceTreeEntry, modulePath: string) => {
      if (entry.type === 'flow') {
        setDeleteTarget({
          id: entry.path,
          name: entry.name,
          steps: [],
          edges: [],
        } as Flow);
        setDeleteTargetModule(modulePath === '.' ? null : modulePath);
      }
    },
    []
  );

  const handleRun = useCallback(
    async (entry: FlowWorkspaceTreeEntry, modulePath: string) => {
      if (entry.type !== 'flow') return;
      const flow = await fetchFlow(
        entry.path,
        modulePath === '.' ? undefined : modulePath
      );
      const params = getInputParams(flow);
      if (params.length > 0) {
        const defaults: Record<string, string> = {};
        for (const p of params) {
          defaults[p.name] = p.default ?? '';
        }
        setRunParamValues(defaults);
        setRunTargetFlow(flow);
        setRunTargetModule(modulePath);
        setRunParamsOpen(true);
        return;
      }
      await executeRun(flow, undefined, modulePath);
    },
    [executeRun, getInputParams]
  );

  const handleEdit = useCallback(
    (entry: FlowWorkspaceTreeEntry, modulePath: string) => {
      if (entry.type !== 'flow') return;
      setFlowContext(displayWorkspace ?? null, modulePath === '.' ? null : modulePath);
      const flowPath = modulePath === '.' ? entry.path : `${modulePath}/${entry.path}`;
      window.location.hash = `#flows/${flowPath}`;
    },
    [displayWorkspace, setFlowContext]
  );

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
            Add workspaces on the Configuration page to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <span className="rounded px-2 py-1 font-medium">Flows</span>
      </nav>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
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
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Filter by flow name..."
            value={flowFilter}
            onChange={(e) => setFlowFilter(e.target.value)}
            className="pl-9"
            aria-label="Filter by flow name"
          />
        </div>
        <div className="flex flex-1" />
        <div className="flex flex-shrink-0 items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreateFlow('.')}
            disabled={createFlowMutation.isPending}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            New flow
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'modules' | 'executions')}
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
      >
        <TabsList variant="line" className="w-fit">
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
        </TabsList>
        <TabsContent value="modules" className="flex-1 min-w-0 overflow-auto mt-3">
          {entriesLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filteredTreeEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Workflow className="mx-auto size-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {flowFilter.trim() ? 'No matching flows' : 'No modules or flows yet'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {flowFilter.trim()
                  ? 'Try a different filter'
                  : 'Create a module or add flows at root to get started'}
              </p>
              {!flowFilter.trim() && (
                <p className="mt-4 flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateModule}
                    disabled={createModuleMutation.isPending}
                  >
                    <FolderPlus className="size-4 mr-2" />
                    New module
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCreateFlow('.')}
                    disabled={createFlowMutation.isPending}
                  >
                    <Plus className="size-4 mr-2" />
                    New flow
                  </Button>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_5rem_7rem_auto] gap-2 border-b border-border bg-muted/30 px-4 py-3 text-sm font-medium">
                <span>Name</span>
                <span className="hidden sm:block"></span>
                <span className="hidden sm:block">Steps</span>
                <span className="hidden md:block">Modified</span>
                <span className="w-20"></span>
              </div>
              <div className="px-4 py-3">
                <FlowsTreeView
                  entries={filteredTreeEntries}
                  parentModule="."
                  displayWorkspace={displayWorkspace}
                  onRun={handleRun}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMove={(flowId, fromModule, toModule) =>
                    moveMutation.mutate({ flowId, fromModule, toModule })
                  }
                  onEditModule={setModuleEditPath}
                  onCreateFlow={(modulePath) => handleCreateFlow(modulePath)}
                  setFlowContext={setFlowContext}
                />
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="executions" className="flex-1 min-w-0 overflow-auto mt-3">
          {processesLoading ? (
            <p className="text-muted-foreground">Loading executions...</p>
          ) : processesError ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                {processesError instanceof Error ? processesError.message : 'Failed to load executions'}
              </p>
            </div>
          ) : filteredProcesses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Workflow className="mx-auto size-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {flowFilter.trim() ? 'No matching executions' : 'No executions yet'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {flowFilter.trim() ? 'Try a different filter' : 'Run a flow to see executions here'}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_6rem_auto] gap-2 border-b border-border bg-muted/30 px-4 py-3 text-sm font-medium">
                <span>Flow</span>
                <span>Status</span>
                <span className="hidden sm:block">Started</span>
                <span className="w-16"></span>
              </div>
              {filteredProcesses.map((proc) => {
                const p = proc as Record<string, unknown>;
                const id = String(p.execution_id ?? p.id ?? '');
                const flowName = String(
                  p.pipeline ?? p.pipeline_name ?? p.name ?? p.id ?? p.execution_id ?? '—'
                );
                const status = String(p.status ?? '');
                const createdAt = p.created_at ?? p.started_at ?? p.start_time;
                const startStr = typeof createdAt === 'string' ? createdAt : undefined;
                const handleView = () => {
                  setFlowContext(displayWorkspace ?? null, null);
                  setSelectedStep(null);
                  setExecutionId(id);
                };
                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    onClick={handleView}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleView();
                      }
                    }}
                    className="grid grid-cols-[1fr_auto_6rem_auto] gap-2 items-center px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer"
                  >
                    <span className="font-medium truncate">{flowName}</span>
                    <span
                      className={cn(
                        'text-sm',
                        status === 'finished' && 'text-green-600 dark:text-green-400',
                        status === 'failed' && 'text-red-600 dark:text-red-400',
                        (status === 'started' || status === 'queued') &&
                          'text-yellow-600 dark:text-yellow-400'
                      )}
                    >
                      {status || '—'}
                    </span>
                    <span className="hidden sm:block text-sm text-muted-foreground truncate">
                      {startStr ? new Date(startStr).toLocaleTimeString() : '—'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView();
                      }}
                    >
                      <Eye className="size-3.5" />
                      View
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                    createFlowMutation.mutate({ name: newFlowName, module: createFlowInModule });
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
              onClick={() => createFlowMutation.mutate({ name: newFlowName, module: createFlowInModule })}
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
          if (!open) {
            setRunTargetFlow(null);
            setRunTargetModule(null);
          }
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
                setRunTargetModule(null);
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
