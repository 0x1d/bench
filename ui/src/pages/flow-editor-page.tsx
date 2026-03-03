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
  ConnectionLineType,
  type NodeTypes,
  type Position,
  type OnConnectEnd,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchFlow, updateFlow, type Flow, type FlowStep, type FlowEdge } from '@/services/api';
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

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

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
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 60,
    nodesep: 40,
  });

  sortedNodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: Node[] = sortedNodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
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
      type: ConnectionLineType.Straight,
    })) ??
    flow.steps.flatMap((step) =>
      (step.dependsOn ?? []).map((depId) => ({
        id: `${depId}-${step.id}`,
        source: depId,
        target: step.id,
        type: ConnectionLineType.Straight,
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

function getFlowIdFromHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('flows/')) {
    return hash.slice(6) || null;
  }
  return null;
}

const nodeTypes: NodeTypes = {
  flowStep: FlowStepNode,
};

export function FlowEditorPage() {
  const flowId = getFlowIdFromHash();
  const queryClient = useQueryClient();
  const { setSelectedStep, setOnStepSave, setOnDeleteStep } = useFlowView();
  const [flowName, setFlowName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [connectFromSource, setConnectFromSource] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);


  const { data: flow, isLoading, error } = useQuery({
    queryKey: ['flow', flowId ?? ''],
    queryFn: () => fetchFlow(flowId!),
    enabled: !!flowId,
  });

  const initial = useMemo(() => {
    if (!flow) return { nodes: [], edges: [] };
    const { nodes, edges } = flowToNodesEdges(flow);
    if (nodes.length > 0) {
      return getLayoutedElements(nodes, edges);
    }
    return { nodes, edges };
  }, [flow?.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    if (flow && initial.nodes.length > 0) {
      const layouted = getLayoutedElements(initial.nodes, initial.edges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    }
  }, [flow?.id]);

  useEffect(() => {
    if (flow) {
      setFlowName(flow.name || flow.id);
    }
  }, [flow]);

  const updateMutation = useMutation({
    mutationFn: (f: Flow) => updateFlow(f.id, f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow', flowId ?? ''] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(
          { ...params, type: ConnectionLineType.Straight },
          eds
        );
        const layouted = getLayoutedElements(nodes, newEdges);
        setNodes(layouted.nodes);
        return layouted.edges;
      });
    },
    [nodes, setEdges, setNodes]
  );

  const addStepFromConnection = useCallback(
    (sourceId: string, stepType: 'http' | 'query' | 'input') => {
      const id = `step_${stepType}_${Date.now()}`;
      const configs: Record<string, Record<string, unknown>> = {
        http: { restId: '', method: 'GET', path: '/' },
        query: { databaseId: '', sql: '' },
        input: { params: [] },
      };
      const labels: Record<string, string> = {
        http: 'HTTP request',
        query: 'Query',
        input: 'Input',
      };
      const step: FlowStep = {
        id,
        type: stepType,
        label: labels[stepType],
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
        },
      };
      const newEdge = {
        id: `${sourceId}-${id}`,
        source: sourceId,
        target: id,
        type: ConnectionLineType.Straight,
      };
      const nextNodes = [...nodes, newNode];
      const nextEdges = [...edges, newEdge];
      const layouted = getLayoutedElements(nextNodes, nextEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setConnectFromSource(null);
    },
    [nodes, edges, setNodes, setEdges]
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
      flowName.trim() || flow.id,
      flow.description ?? '',
      nodes,
      edges
    );
    updateMutation.mutate(updated);
  }, [flowId, flow, flowName, nodes, edges, updateMutation]);

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

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      const nextNodes = nodes.filter((n) => n.id !== stepId);
      const nextEdges = edges.filter(
        (e) => e.source !== stepId && e.target !== stepId
      );
      const layouted = getLayoutedElements(nextNodes, nextEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setSelectedStep(null);
    },
    [nodes, edges, setNodes, setEdges, setSelectedStep]
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
          {flowName || flow.id}
        </span>
      </nav>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate max-w-[200px]">
            {flowName || flow.id}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setRenameValue(flowName || flow.id);
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
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="h-full min-h-[300px] rounded-lg border border-border overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
          connectionLineType={ConnectionLineType.Straight}
          nodesDraggable={false}
          fitView
        >
          <Background />
          <Controls />
          <Panel position="top-left">
            <AddStepButtons
              hasInputStep={nodes.some(
                (n) => ((n.data as { step?: FlowStep })?.step?.type ?? '') === 'input'
              )}
              onAdd={(step) => {
                const newNode: Node = {
                  id: step.id,
                  type: 'flowStep',
                  position: { x: 0, y: 0 },
                  data: {
                    stepType: step.type,
                    label: step.label || step.id,
                    step,
                  },
                };
                const inputNode = nodes.find(
                  (n) => ((n.data as { step?: FlowStep })?.step?.type ?? '') === 'input'
                );
                let nextEdges = edges;
                if (
                  step.type !== 'input' &&
                  inputNode &&
                  !edges.some((e) => e.source === inputNode.id && e.target === step.id)
                ) {
                  nextEdges = [
                    ...edges,
                    {
                      id: `${inputNode.id}-${step.id}`,
                      source: inputNode.id,
                      target: step.id,
                      type: ConnectionLineType.Straight,
                    },
                  ];
                }
                const nextNodes = [...nodes, newNode];
                const layouted = getLayoutedElements(nextNodes, nextEdges);
                setNodes(layouted.nodes);
                setEdges(layouted.edges);
              }}
            />
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
                  setFlowName(renameValue.trim() || flow.id);
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
                setFlowName(renameValue.trim() || flow.id);
                setRenameOpen(false);
              }}
              disabled={!renameValue.trim()}
            >
              Rename
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
  const addStep = (type: 'http' | 'query' | 'input') => {
    const id = `step_${type}_${Date.now()}`;
    const configs: Record<string, Record<string, unknown>> = {
      http: { restId: '', method: 'GET', path: '/' },
      query: { databaseId: '', sql: '' },
      input: { params: [] },
    };
    const labels: Record<string, string> = {
      http: 'HTTP request',
      query: 'Query',
      input: 'Input',
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
    </div>
  );
}
