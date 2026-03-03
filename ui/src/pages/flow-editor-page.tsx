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
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, LayoutGrid, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFlow,
  fetchStatus,
  fetchRestList,
  updateFlow,
  type Flow,
  type FlowStep,
  type FlowEdge,
} from '@/services/api';
import { Button } from '@/components/ui/button';
import { FlowStepNode } from '@/components/flow-step-node';
import { FlowStepConfigSheet } from '@/components/flow-step-config-sheet';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: (isHorizontal ? 'left' : 'top') as const,
      sourcePosition: (isHorizontal ? 'right' : 'bottom') as const,
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
      type: ConnectionLineType.SmoothStep,
    })) ??
    flow.steps.flatMap((step) =>
      (step.dependsOn ?? []).map((depId) => ({
        id: `${depId}-${step.id}`,
        source: depId,
        target: step.id,
        type: ConnectionLineType.SmoothStep,
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { data: flow, isLoading, error } = useQuery({
    queryKey: ['flow', flowId ?? ''],
    queryFn: () => fetchFlow(flowId!),
    enabled: !!flowId,
  });

  const initial = useMemo(() => {
    if (!flow) return { nodes: [], edges: [] };
    const { nodes, edges } = flowToNodesEdges(flow);
    const hasPositions = nodes.every(
      (n) => n.position.x !== 0 || n.position.y !== 0
    );
    if (!hasPositions && nodes.length > 0) {
      return getLayoutedElements(nodes, edges);
    }
    return { nodes, edges };
  }, [flow?.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    if (flow && initial.nodes.length > 0) {
      setNodes(initial.nodes);
      setEdges(initial.edges);
    }
  }, [flow?.id]);

  const updateMutation = useMutation({
    mutationFn: (f: Flow) => updateFlow(f.id, f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow', flowId ?? ''] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...params, type: ConnectionLineType.SmoothStep },
          eds
        )
      ),
    [setEdges]
  );

  const onLayout = useCallback(
    (direction: 'TB' | 'LR' = 'TB') => {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodes,
        edges,
        direction
      );
      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
    },
    [nodes, edges, setNodes, setEdges]
  );

  const handleSave = useCallback(() => {
    if (!flowId || !flow) return;
    const updated = nodesEdgesToFlow(
      flowId,
      flow.name,
      flow.description ?? '',
      nodes,
      edges
    );
    updateMutation.mutate(updated);
  }, [flowId, flow, nodes, edges, updateMutation]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: () => fetchStatus(),
  });
  const { data: restData } = useQuery({
    queryKey: ['rest', 'list'],
    queryFn: () => fetchRestList(),
  });

  const databases =
    statusData?.database?.databases?.map((d) => ({
      id: d.id,
      label: d.label,
    })) ?? [];
  const restResources = restData?.resources ?? [];

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
    <div className="flex w-full h-[calc(100vh-8rem)] flex-col gap-2">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (window.location.hash = '#flows')}
        >
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onLayout('TB')}>
            <LayoutGrid className="size-4 mr-2" />
            Auto layout
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
        >
          <Background />
          <Controls />
          <Panel position="top-left">
            <AddStepButtons
              onAdd={(step) => {
                const newNode: Node = {
                  id: step.id,
                  type: 'flowStep',
                  position: { x: 100, y: 100 + nodes.length * 80 },
                  data: {
                    stepType: step.type,
                    label: step.label || step.id,
                    step,
                  },
                };
                setNodes((nds) => [...nds, newNode]);
              }}
            />
          </Panel>
        </ReactFlow>
      </div>

      <FlowStepConfigSheet
        node={selectedNode}
        open={!!selectedNode}
        onOpenChange={(open) => !open && setSelectedNodeId(null)}
        databases={databases}
        restResources={restResources}
        onSave={(updatedStep) => {
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
          setSelectedNodeId(null);
        }}
      />
    </div>
  );
}

function AddStepButtons({ onAdd }: { onAdd: (step: FlowStep) => void }) {
  const addStep = (type: 'http' | 'query') => {
    const id = `step_${type}_${Date.now()}`;
    onAdd({
      id,
      type,
      label: type === 'http' ? 'HTTP request' : 'Query',
      config: type === 'http' ? { restId: '', method: 'GET', path: '/' } : { databaseId: '', sql: '' },
    });
  };

  return (
    <div className="flex gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
      <Button variant="outline" size="sm" onClick={() => addStep('http')}>
        <Plus className="size-4 mr-1" />
        HTTP
      </Button>
      <Button variant="outline" size="sm" onClick={() => addStep('query')}>
        <Plus className="size-4 mr-1" />
        Query
      </Button>
    </div>
  );
}
