import type { Node, Edge } from '@xyflow/react';
import { Position } from '@xyflow/react';
import dagre from 'dagre';
import type {
  ParsedTerraform,
  TerraformResource,
  TerraformData,
} from './terraform-parse';
import { resolveDependsOnToIds } from './terraform-parse';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 52;

export function parsedToNodesEdges(parsed: ParsedTerraform): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 0;
  const xGap = 80;
  const yGap = 60;

  // Providers group
  if (parsed.providers.length > 0) {
    const startX = 0;
    parsed.providers.forEach((p, i) => {
      nodes.push({
        id: p.id,
        type: 'infraProvider',
        position: { x: startX + i * (NODE_WIDTH + xGap), y },
        data: {
          ...p,
          label: p.name,
        },
      });
    });
    y += NODE_HEIGHT + yGap;
  }

  // Variables group
  if (parsed.variables.length > 0) {
    const startX = 0;
    parsed.variables.forEach((v, i) => {
      nodes.push({
        id: v.id,
        type: 'infraVariable',
        position: { x: startX + i * (180 + xGap), y },
        data: { ...v, label: v.name },
      });
    });
    y += NODE_HEIGHT + yGap;
  }

  // Resources and Data - main content
  const resourceNodes = [...parsed.resources, ...parsed.data];
  resourceNodes.forEach((r, i) => {
    const isData = 'body' in r && r.id.startsWith('data-');
    const type = isData ? 'infraData' : 'infraResource';
    const data = isData
      ? { id: (r as TerraformData).id, type: (r as TerraformData).type, name: (r as TerraformData).name, body: (r as TerraformData).body }
      : { id: (r as TerraformResource).id, type: (r as TerraformResource).type, name: (r as TerraformResource).name, body: (r as TerraformResource).body };
    nodes.push({
      id: r.id,
      type,
      position: { x: (i % 3) * (NODE_WIDTH + xGap), y: y + Math.floor(i / 3) * (NODE_HEIGHT + yGap) },
      data,
    });
  });
  if (resourceNodes.length > 0) {
    y += Math.ceil(resourceNodes.length / 3) * (NODE_HEIGHT + yGap) + yGap;
  }

  // Modules
  parsed.modules.forEach((m, i) => {
    nodes.push({
      id: m.id,
      type: 'infraModule',
      position: { x: i * (180 + xGap), y },
      data: { ...m, label: m.name },
    });
  });
  if (parsed.modules.length > 0) {
    y += NODE_HEIGHT + yGap;
  }

  // Outputs
  parsed.outputs.forEach((o, i) => {
    nodes.push({
      id: o.id,
      type: 'infraOutput',
      position: { x: i * (180 + xGap), y },
      data: { ...o, label: o.name },
    });
  });

  // Edges from depends_on
  for (const r of parsed.resources) {
    if (r.dependsOn?.length) {
      const targets = resolveDependsOnToIds(r.dependsOn);
      for (const srcId of targets) {
        const sourceExists = nodes.some((n) => n.id === srcId);
        if (sourceExists) {
          edges.push({
            id: `${srcId}-${r.id}`,
            source: srcId,
            target: r.id,
          });
        }
      }
    }
  }
  for (const d of parsed.data) {
    if (d.dependsOn?.length) {
      const targets = resolveDependsOnToIds(d.dependsOn);
      for (const srcId of targets) {
        const sourceExists = nodes.some((n) => n.id === srcId);
        if (sourceExists) {
          edges.push({
            id: `${srcId}-${d.id}`,
            source: srcId,
            target: d.id,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

export function getLayoutedInfraElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, ranksep: 50, nodesep: 40 });

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const isHorizontal = direction === 'LR';
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
