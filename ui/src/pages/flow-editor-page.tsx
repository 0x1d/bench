import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type Position,
  type OnConnectEnd,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Pencil, Plus, LayoutGrid, Rows, Play } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchFlow, updateFlow, runFlow, type Flow, type FlowStep, type FlowEdge } from '@/services/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFlowView } from '@/contexts/flow-view-context';
import { Button } from '@/components/ui/button';
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
import { FlowStepNode } from '@/components/flow-step-node';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

interface InputParam {
  name: string;
  type?: string;
  description?: string;
  default?: string;
}

function getUniqueLabel(nodes: Node[], baseLabel: string): string {
  const existingLabels = new Set(
    nodes.map((n) => (n.data as { step?: FlowStep })?.step?.label ?? (n.data as { label?: string })?.label ?? '')
  );
  if (!existingLabels.has(baseLabel)) return baseLabel;
  let i = 2;
  while (existingLabels.has(`${baseLabel} ${i}`)) i++;
  return `${baseLabel} ${i}`;
}

function sortNodesInputFirst(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    const aStep = (a.data as { step?: FlowStep })?.step;
    const bStep = (b.data as { step?: FlowStep })?.step;
    if (aStep?.type === 'input') return -1;
    if (bStep?.type === 'input') return 1;
    return 0;
  });
}

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const isHorizontal = direction === 'LR';
  const sortedNodes = sortNodesInputFirst(nodes);
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranksep: 60,
    nodesep: 40,
  });

  sortedNodes.forEach((node) => {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutedNodes: Node[] = sortedNodes.map((node) => {
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      targetPosition: (isHorizontal ? 'left' : 'top') as Position,
      sourcePosition: (isHorizontal ? 'right' : 'bottom') as Position,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function flowToNodesEdges(flow: Flow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = flow.steps.map((step) => ({
    id: step.id,
    type: 'flowStep',
    position: step.position
      ? { x: step.position.x, y: step.position.y }
      : { x: 0, y: 0 },
    data: {
      stepType: step.type,
      label: step.label || step.id,
      step,
    },
  }));

  const edges: Edge[] =
    flow.edges?.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'default', // Using Bezier
    })) ??
    flow.steps.flatMap((step) =>
      (step.dependsOn ?? []).map((depId) => ({
        id: `${depId}-${step.id}`,
        source: depId,
        target: step.id,
        type: 'default', // Using Bezier
      }))
    );

  return { nodes, edges };
}

function nodesEdgesToFlow(
  flowId: string,
  flowName: string,
  flowDescription: string,
  nodes: Node[],
  edges: Edge[]
): Flow {
  const steps: FlowStep[] = nodes.map((node) => {
    const data = node.data as { step: FlowStep };
    const step = data?.step ?? {
      id: node.id,
      type: 'http',
      label: node.id,
      config: {},
    };
    return {
      ...step,
      id: node.id,
      position: { x: node.position.x, y: node.position.y },
      dependsOn: edges
        .filter((e) => e.target === node.id)
        .map((e) => e.source),
    };
  });

  const flowEdges: FlowEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  return {
    id: flowId,
    name: flowName,
    description: flowDescription,
    steps,
    edges: flowEdges,
  };
}

const nodeTypes: NodeTypes = {
  flowStep: FlowStepNode,
};

export default function FlowEditorPage() {
  const queryClient = useQueryClient();
  const flowId = window.location.hash.split('/').pop() || '';
  const [renamedFlow, setRenamedFlow] = useState<{ id: string; name: string } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const {
    setSelectedStep,
    setOnStepSave,
    setOnDeleteStep,
    setExecutionId,
    flowWorkspace,
    flowModule,
  } = useFlowView();
  const [connectFromSource, setConnectFromSource] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [runParamsOpen, setRunParamsOpen] = useState(false);
  const [runParamValues, setRunParamValues] = useState<Record<string, string>>({});


  const {
    data: flow,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['flow', flowId, flowWorkspace, flowModule],
    queryFn: () =>
      fetchFlow(flowId!, flowModule ?? undefined),
    enabled: !!flowId,
  });
  const displayFlowName = flow
    ? renamedFlow && renamedFlow.id === flow.id
      ? renamedFlow.name
      : (flow.name || flow.id)
    : '';

  const initial = useMemo(() => {
    if (!flow) return { nodes: [], edges: [] };
    const { nodes: untypedNodes, edges } = flowToNodesEdges(flow);
    const nodes = untypedNodes.map(n => ({
      ...n, data: {
        ...n.data, onAddNextStep: (nodeId: string, e: React.MouseEvent) => {
          setConnectFromSource({ sourceId: nodeId, x: e.clientX, y: e.clientY });
        }
      }
    }));
    if (nodes.length > 0) {
      return getLayoutedElements(nodes, edges, layoutDirection);
    }
    return { nodes, edges };
  }, [flow, layoutDirection]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    if (!flow) return;
    if (initial.nodes.length > 0) {
      const layouted = getLayoutedElements(initial.nodes, initial.edges, layoutDirection);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [flow, initial.nodes, initial.edges, layoutDirection, setNodes, setEdges]);

  const updateMutation = useMutation({
    mutationFn: (f: Flow) =>
      updateFlow(flowId!, f, flowModule ?? undefined),
    onSuccess: (updatedFlow) => {
      queryClient.invalidateQueries({
        queryKey: ['flow', flowId ?? '', flowWorkspace, flowModule],
      });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['flows', 'entries'] });
      if (updatedFlow?.id && updatedFlow.id !== flowId) {
        window.location.hash = `#flows/${updatedFlow.id}`;
      }
      toast.success('Flow saved successfully');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save flow');
    }
  });

  const runMutation = useMutation({
    mutationFn: ({ id, args }: { id: string; args?: Record<string, unknown> }) =>
      runFlow(id, args, {
        workspace: flowWorkspace ?? undefined,
        module: flowModule ?? undefined,
      }),
    onSuccess: (res) => {
      toast.success('Flow started successfully');
      const execId = (res as { flowpipe?: { execution_id?: string } })?.flowpipe?.execution_id;
      if (execId) {
        setExecutionId(execId);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to run flow');
    }
  });

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(
          { ...params, type: 'default' },
          eds
        );
        const layouted = getLayoutedElements(nodes, newEdges, layoutDirection);
        setNodes(layouted.nodes);
        return layouted.edges;
      });
    },
    [nodes, setEdges, setNodes, layoutDirection]
  );

  const addStepFromConnection = useCallback(
    (sourceId: string, stepType: 'http' | 'query' | 'input' | 'message') => {
      const id = `step_${stepType}_${Date.now()}`;
      const configs: Record<string, Record<string, unknown>> = {
        http: { restId: '', method: 'GET', path: '/' },
        query: { databaseId: '', sql: '' },
        input: { params: [] },
        message: { notifier: 'default', text: 'Hello from bench!' },
      };
      const labels: Record<string, string> = {
        http: 'HTTP request',
        query: 'Query',
        input: 'Input',
        message: 'Message',
      };
      const label = getUniqueLabel(nodes, labels[stepType]);
      const step: FlowStep = {
        id,
        type: stepType,
        label,
        config: configs[stepType],
      };
      const newNode: Node = {
        id,
        type: 'flowStep',
        position: { x: 0, y: 0 },
        data: {
          stepType: step.type,
          label: step.label || step.id,
          step,
          onAddNextStep: (nodeId: string, e: React.MouseEvent) => {
            setConnectFromSource({ sourceId: nodeId, x: e.clientX, y: e.clientY });
          }
        },
      };
      const newEdge: Edge = {
        id: `${sourceId}-${id}`,
        source: sourceId,
        target: id,
        type: 'default',
      };
      const nextNodes = [...nodes, newNode];
      const nextEdges = [...edges, newEdge];
      const layouted = getLayoutedElements(nextNodes, nextEdges, layoutDirection);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setConnectFromSource(null);
    },
    [nodes, edges, setNodes, setEdges, layoutDirection]
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (
        connectionState.isValid !== false ||
        !connectionState.fromNode ||
        !event
      )
        return;
      const { clientX, clientY } =
        'changedTouches' in event
          ? (event as TouchEvent).changedTouches[0]
          : (event as MouseEvent);
      setConnectFromSource({
        sourceId: connectionState.fromNode.id,
        x: clientX,
        y: clientY,
      });
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!flowId || !flow) return;
    const updated = nodesEdgesToFlow(
      flowId,
      displayFlowName.trim() || flow.id,
      flow.description ?? '',
      nodes,
      edges
    );
    updateMutation.mutate(updated);
  }, [flowId, flow, displayFlowName, nodes, edges, updateMutation]);

  // Collect input params from input steps
  const inputParams = useMemo(() => {
    if (!flow) return [];
    const inputStep = flow.steps.find((s) => s.type === 'input');
    if (!inputStep) return [];
    const params = (inputStep.config?.params as unknown[]) || [];
    return params.filter(
      (p): p is InputParam =>
        typeof p === 'object' && p !== null && 'name' in p && typeof (p as InputParam).name === 'string'
    );
  }, [flow]);

  const handleRun = useCallback(() => {
    if (!flowId) return;
    if (inputParams.length > 0) {
      const defaults: Record<string, string> = {};
      for (const p of inputParams) {
        defaults[p.name] = p.default ?? '';
      }
      setRunParamValues(defaults);
      setRunParamsOpen(true);
    } else {
      runMutation.mutate({ id: flowId });
    }
  }, [flowId, inputParams, runMutation]);

  const handleRunWithParams = useCallback(() => {
    if (!flowId) return;
    setRunParamsOpen(false);
    runMutation.mutate({ id: flowId, args: runParamValues });
  }, [flowId, runParamValues, runMutation]);

  useEffect(() => {
    const callback = (updatedStep: FlowStep) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === updatedStep.id
            ? {
              ...n,
              data: {
                ...n.data,
                step: updatedStep,
                label: updatedStep.label || updatedStep.id,
              },
            }
            : n
        )
      );
    };
    setOnStepSave(() => callback);
    return () => setOnStepSave(null);
  }, [setNodes, setOnStepSave]);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      const nextNodes = nodes.filter((n) => !deletedIds.has(n.id));
      const nextEdges = edges.filter(
        (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
      );
      const layouted = getLayoutedElements(nextNodes, nextEdges, layoutDirection);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    },
    [nodes, edges, setNodes, setEdges, layoutDirection]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const deletedIds = new Set(deleted.map((e) => e.id));
      const nextEdges = edges.filter((e) => !deletedIds.has(e.id));
      const layouted = getLayoutedElements(nodes, nextEdges, layoutDirection);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    },
    [nodes, edges, setNodes, setEdges, layoutDirection]
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      const nextNodes = nodes.filter((n) => n.id !== stepId);
      const nextEdges = edges.filter(
        (e) => e.source !== stepId && e.target !== stepId
      );
      const layouted = getLayoutedElements(nextNodes, nextEdges, layoutDirection);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setSelectedStep(null);
    },
    [nodes, edges, setNodes, setEdges, setSelectedStep, layoutDirection]
  );

  useEffect(() => {
    setOnDeleteStep(() => handleDeleteStep);
    return () => setOnDeleteStep(null);
  }, [setOnDeleteStep, handleDeleteStep]);

  if (!flowId) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (window.location.hash = '#flows')}
        >
          <ArrowLeft className="size-4 mr-2" />
          Back to flows
        </Button>
        <p className="text-muted-foreground">No flow selected.</p>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading flow...</p>;
  }

  if (error || !flow) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (window.location.hash = '#flows')}
        >
          <ArrowLeft className="size-4 mr-2" />
          Back to flows
        </Button>
        <p className="text-destructive">
          {error instanceof Error ? error.message : 'Failed to load flow'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => (window.location.hash = '#flows')}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Flows
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="rounded px-2 py-1 font-mono truncate max-w-[200px]">
          {displayFlowName || flow.id}
        </span>
      </nav>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate max-w-[200px]">
            {displayFlowName || flow.id}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setRenameValue(displayFlowName || flow.id);
              setRenameOpen(true);
            }}
            aria-label="Rename flow"
          >
            <Pencil className="size-3" />
          </Button>
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          {updateMutation.isError && (
            <span className="text-sm text-destructive">
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : 'Save failed'}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="gap-1.5"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={runMutation.isPending}
            className="gap-1.5"
          >
            <Play className={cn("size-3", runMutation.isPending && "animate-pulse")} />
            {runMutation.isPending ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="h-full min-h-[300px] rounded-lg border border-border overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onNodeClick={(_e, node) => {
              const step = (node.data?.step as FlowStep) ?? {
                id: node.id,
                type: (node.data?.stepType as string) ?? 'http',
                label: (node.data?.label as string) ?? node.id,
                config: {},
              };
              setSelectedStep(step);
            }}
            onPaneClick={() => setSelectedStep(null)}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            fitView
          >
            <Background />
            <Controls className="bg-card border-border border shadow-sm [&_button]:border-border [&_button]:bg-card [&_button_svg]:fill-foreground hover:[&_button]:bg-accent" />
            <Panel position="top-left">
              <AddStepButtons
                hasInputStep={nodes.some(
                  (n) => ((n.data as { step?: FlowStep })?.step?.type ?? '') === 'input'
                )}
                onAdd={(step) => {
                  const label = getUniqueLabel(nodes, step.label || step.id);
                  const stepWithLabel = { ...step, label };
                  const newNode: Node = {
                    id: step.id,
                    type: 'flowStep',
                    position: { x: 0, y: 0 },
                    data: {
                      stepType: step.type,
                      label: stepWithLabel.label || step.id,
                      step: stepWithLabel,
                      onAddNextStep: (nodeId: string, e: React.MouseEvent) => {
                        setConnectFromSource({ sourceId: nodeId, x: e.clientX, y: e.clientY });
                      }
                    },
                  };
                  const nextNodes = [...nodes, newNode];
                  const layouted = getLayoutedElements(nextNodes, edges, layoutDirection);
                  setNodes(layouted.nodes);
                  setEdges(layouted.edges);
                }}
              />
            </Panel>
            <Panel position="top-right">
              <div className="flex bg-card border border-border rounded-lg shadow-sm">
                <Button
                  variant={layoutDirection === 'TB' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setLayoutDirection('TB')}
                  title="Vertical Layout"
                  className="rounded-r-none"
                >
                  <Rows className="size-4" />
                </Button>
                <Button
                  variant={layoutDirection === 'LR' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setLayoutDirection('LR')}
                  title="Horizontal Layout"
                  className="rounded-l-none"
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {connectFromSource && (
        <Popover
          open={!!connectFromSource}
          onOpenChange={(open) => !open && setConnectFromSource(null)}
        >
          <PopoverAnchor asChild>
            <div
              className="fixed w-px h-px"
              style={{ left: connectFromSource.x, top: connectFromSource.y }}
            />
          </PopoverAnchor>
          <PopoverContent
            className="w-auto p-2"
            align="start"
            side="bottom"
            sideOffset={8}
          >
            <p className="text-xs text-muted-foreground mb-2 px-1">Add step</p>
            <div className="flex gap-1">
              {!nodes.some(
                (n) => ((n.data as { step?: FlowStep })?.step?.type ?? '') === 'input'
              ) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      connectFromSource &&
                      addStepFromConnection(connectFromSource.sourceId, 'input')
                    }
                    className="gap-1.5"
                  >
                    <Plus className="size-4" />
                    Input
                  </Button>
                )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  connectFromSource &&
                  addStepFromConnection(connectFromSource.sourceId, 'http')
                }
                className="gap-1.5"
              >
                <Plus className="size-4" />
                HTTP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  connectFromSource &&
                  addStepFromConnection(connectFromSource.sourceId, 'query')
                }
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Query
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  connectFromSource &&
                  addStepFromConnection(connectFromSource.sourceId, 'message')
                }
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Message
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename flow</DialogTitle>
            <DialogDescription>
              Enter a new name for this flow.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="rename-flow" className="sr-only">
              Flow name
            </Label>
            <Input
              id="rename-flow"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setRenamedFlow({ id: flow.id, name: renameValue.trim() || flow.id });
                  setRenameOpen(false);
                }
              }}
              placeholder="Flow name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setRenamedFlow({ id: flow.id, name: renameValue.trim() || flow.id });
                setRenameOpen(false);
              }}
              disabled={!renameValue.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Parameters Dialog */}
      <Dialog open={runParamsOpen} onOpenChange={setRunParamsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Parameters</DialogTitle>
            <DialogDescription>
              Provide values for the pipeline input parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {inputParams.map((p) => (
              <div key={p.name} className="space-y-1.5">
                <Label htmlFor={`param-${p.name}`} className="text-xs font-medium flex items-center gap-2">
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
            <Button variant="outline" onClick={() => setRunParamsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRunWithParams} disabled={runMutation.isPending}>
              <Play className="size-4 mr-1.5" />
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddStepButtons({
  hasInputStep,
  onAdd,
}: {
  hasInputStep: boolean;
  onAdd: (step: FlowStep) => void;
}) {
  const addStep = (type: 'http' | 'query' | 'input' | 'message') => {
    const id = `step_${type}_${Date.now()}`;
    const configs: Record<string, Record<string, unknown>> = {
      http: { restId: '', method: 'GET', path: '/' },
      query: { databaseId: '', sql: '' },
      input: { params: [] },
      message: { notifier: 'default', text: 'Hello from bench!' },
    };
    const labels: Record<string, string> = {
      http: 'HTTP request',
      query: 'Query',
      input: 'Input',
      message: 'Message',
    };
    onAdd({
      id,
      type,
      label: labels[type],
      config: configs[type],
    });
  };

  return (
    <div className="flex gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      {!hasInputStep && (
        <Button variant="outline" size="sm" onClick={() => addStep('input')} className="gap-1.5">
          <Plus className="size-4" />
          Input
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => addStep('http')} className="gap-1.5">
        <Plus className="size-4" />
        HTTP
      </Button>
      <Button variant="outline" size="sm" onClick={() => addStep('query')} className="gap-1.5">
        <Plus className="size-4" />
        Query
      </Button>
      <Button variant="outline" size="sm" onClick={() => addStep('message')} className="gap-1.5">
        <Plus className="size-4" />
        Message
      </Button>
    </div>
  );
}
