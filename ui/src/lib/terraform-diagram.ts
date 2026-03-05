import type { Node, Edge } from '@xyflow/react';
import { Position } from '@xyflow/react';
import dagre from 'dagre';
import type {
  ParsedTerraform,
  TerraformResource,
  TerraformData,
} from './terraform-parse';
import { resolveDependsOnToIds } from './terraform-parse';
import { BLOCK_FILE_MAP } from './terraform-parse';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 52;
const GROUP_NODE_WIDTH = 180;
const GROUP_NODE_HEIGHT = 56;

/** Shared width for Module and Resources containers (equal width). */
const CONTAINER_WIDTH = 1108; // fits 4 cols: 2*24 + 4*220 + 3*60
const MODULE_CONTAINER_HEIGHT = 148;
/** Equal padding on all sides (top, bottom, left, right) around the blocks. */
const MODULE_PADDING = 24;
const MODULE_CHILD_GAP = 28;

/** Extra spacing for dagre to prevent overlap; added to node dimensions in layout. */
const LAYOUT_PADDING = 24;

/** Group node IDs for file-based editing. */
export const GROUP_IDS = {
  module: 'group-module',
  resources: 'group-resources',
  providers: 'group-providers',
  variables: 'group-variables',
  outputs: 'group-outputs',
} as const;

export function parsedToNodesEdges(parsed: ParsedTerraform): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const xGap = 60;

  // Module container: Providers, Variables, Outputs grouped together
  const hasProviders = parsed.providers.length > 0;
  const hasVariables = parsed.variables.length > 0;
  const hasOutputs = parsed.outputs.length > 0;
  const hasModuleGroup = hasProviders || hasVariables || hasOutputs;

  if (hasModuleGroup) {
    // Parent container
    nodes.push({
      id: GROUP_IDS.module,
      type: 'infraModuleContainer',
      position: { x: 0, y: 0 },
      data: { label: 'Module' },
      style: { width: CONTAINER_WIDTH, height: MODULE_CONTAINER_HEIGHT },
      connectable: false,
      deletable: false,
    });

    // Children: Providers, Variables, Outputs - equal padding on all sides
    const headerHeight = 40;
    const contentWidth = CONTAINER_WIDTH - 2 * MODULE_PADDING;
    const childCount = [hasProviders, hasVariables, hasOutputs].filter(Boolean).length;
    const totalBlocksWidth = childCount * GROUP_NODE_WIDTH;
    const totalGaps = Math.max(0, childCount - 1) * MODULE_CHILD_GAP;
    const remainingSpace = contentWidth - totalBlocksWidth - totalGaps;
    const sidePadding = childCount > 0 ? remainingSpace / 2 : 0;
    const childXStart = MODULE_PADDING + sidePadding;
    const childY = headerHeight + MODULE_PADDING;
    let childIndex = 0;
    if (hasProviders) {
      const childX = childXStart + childIndex * (GROUP_NODE_WIDTH + MODULE_CHILD_GAP);
      childIndex += 1;
      const sourceFile = parsed.providers[0]?.sourceFile ?? BLOCK_FILE_MAP.provider;
      nodes.push({
        id: GROUP_IDS.providers,
        type: 'infraGroup',
        parentId: GROUP_IDS.module,
        extent: 'parent' as const,
        position: { x: childX, y: childY },
        data: {
          label: 'Providers',
          sourceFile,
          childCount: parsed.providers.length,
          items: parsed.providers.map((p) => ({ id: p.id, name: p.name })),
        },
        connectable: false,
        deletable: false,
      });
    }
    if (hasVariables) {
      const childX = childXStart + childIndex * (GROUP_NODE_WIDTH + MODULE_CHILD_GAP);
      childIndex += 1;
      const sourceFile = parsed.variables[0]?.sourceFile ?? BLOCK_FILE_MAP.variable;
      nodes.push({
        id: GROUP_IDS.variables,
        type: 'infraGroup',
        parentId: GROUP_IDS.module,
        extent: 'parent' as const,
        position: { x: childX, y: childY },
        data: {
          label: 'Variables',
          sourceFile,
          childCount: parsed.variables.length,
          items: parsed.variables.map((v) => ({ id: v.id, name: v.name })),
        },
        connectable: false,
        deletable: false,
      });
    }
    if (hasOutputs) {
      const childX = childXStart + childIndex * (GROUP_NODE_WIDTH + MODULE_CHILD_GAP);
      const outputsSourceFile = parsed.outputs[0]?.sourceFile ?? BLOCK_FILE_MAP.output;
      nodes.push({
        id: GROUP_IDS.outputs,
        type: 'infraGroup',
        parentId: GROUP_IDS.module,
        extent: 'parent' as const,
        position: { x: childX, y: childY },
        data: {
          label: 'Outputs',
          sourceFile: outputsSourceFile,
          childCount: parsed.outputs.length,
          items: parsed.outputs.map((o) => ({ id: o.id, name: o.name })),
        },
        connectable: false,
        deletable: false,
      });
    }
  }

  // Resources container: layout resources hierarchically by depends_on (dagre TB)
  const resourceNodes = [...parsed.resources, ...parsed.data];
  const hasResources = resourceNodes.length > 0;
  const headerHeight = 40;

  if (hasResources) {
    // Build depends_on edges for resources (source -> target means "target depends on source")
    const resourceDepEdges: { source: string; target: string }[] = [];
    for (const r of parsed.resources) {
      if (r.dependsOn?.length) {
        const targets = resolveDependsOnToIds(r.dependsOn);
        for (const srcId of targets) {
          if (resourceNodes.some((n) => n.id === srcId)) {
            resourceDepEdges.push({ source: srcId, target: r.id });
          }
        }
      }
    }
    for (const d of parsed.data) {
      if (d.dependsOn?.length) {
        const targets = resolveDependsOnToIds(d.dependsOn);
        for (const srcId of targets) {
          if (resourceNodes.some((n) => n.id === srcId)) {
            resourceDepEdges.push({ source: srcId, target: d.id });
          }
        }
      }
    }

    // Layout resources with dagre (top-to-bottom by dependency)
    const resourceGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    resourceGraph.setGraph({
      rankdir: 'TB',
      ranksep: 60,
      nodesep: 50,
      edgesep: 30,
    });
    resourceNodes.forEach((r) => {
      resourceGraph.setNode(r.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });
    resourceDepEdges.forEach((e) => resourceGraph.setEdge(e.source, e.target));
    dagre.layout(resourceGraph);

    // Bounding box of laid-out resources (dagre returns center x,y)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    resourceNodes.forEach((r) => {
      const g = resourceGraph.node(r.id);
      const left = g.x - NODE_WIDTH / 2;
      const top = g.y - NODE_HEIGHT / 2;
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + NODE_WIDTH);
      maxY = Math.max(maxY, top + NODE_HEIGHT);
    });
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const resourcesContainerHeight =
      headerHeight + 2 * MODULE_PADDING + contentHeight;

    nodes.push({
      id: GROUP_IDS.resources,
      type: 'infraModuleContainer',
      position: { x: 0, y: 0 },
      data: { label: 'Resources' },
      style: { width: CONTAINER_WIDTH, height: resourcesContainerHeight },
      connectable: false,
      deletable: false,
    });

    const sidePadding = Math.max(0, (CONTAINER_WIDTH - 2 * MODULE_PADDING - contentWidth) / 2);

    resourceNodes.forEach((r) => {
      const isData = 'body' in r && r.id.startsWith('data-');
      const type = isData ? 'infraData' : 'infraResource';
      const base = isData ? (r as TerraformData) : (r as TerraformResource);
      const g = resourceGraph.node(r.id);
      const relX = (g.x - NODE_WIDTH / 2) - minX + MODULE_PADDING + sidePadding;
      const relY = (g.y - NODE_HEIGHT / 2) - minY + headerHeight + MODULE_PADDING;
      nodes.push({
        id: r.id,
        type,
        parentId: GROUP_IDS.resources,
        extent: 'parent' as const,
        position: { x: relX, y: relY },
        data: {
          id: base.id,
          type: base.type,
          name: base.name,
          body: base.body,
          ...(base.sourceFile != null && { sourceFile: base.sourceFile }),
        },
      });
    });
  }

  // Terraform modules - individual nodes (different from Module container)
  parsed.modules.forEach((m, i) => {
    nodes.push({
      id: m.id,
      type: 'infraModule',
      position: { x: i * (180 + xGap), y: 0 },
      data: { ...m, label: m.name },
    });
  });

  // Edges from depends_on (resources and data only)
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

  // Flow edges for dagre layout: Module (top) -> Resources (bottom) -> terraform modules
  if (hasModuleGroup && hasResources) {
    edges.push({
      id: `${GROUP_IDS.module}-${GROUP_IDS.resources}`,
      source: GROUP_IDS.module,
      target: GROUP_IDS.resources,
    });
  }
  if (hasModuleGroup && !hasResources && parsed.modules.length > 0) {
    edges.push({
      id: `${GROUP_IDS.module}-${parsed.modules[0].id}`,
      source: GROUP_IDS.module,
      target: parsed.modules[0].id,
    });
  }
  if (hasResources && parsed.modules.length > 0) {
    edges.push({
      id: `${GROUP_IDS.resources}-${parsed.modules[0].id}`,
      source: GROUP_IDS.resources,
      target: parsed.modules[0].id,
    });
  }
  for (let i = 0; i < parsed.modules.length - 1; i++) {
    edges.push({
      id: `${parsed.modules[i].id}-${parsed.modules[i + 1].id}`,
      source: parsed.modules[i].id,
      target: parsed.modules[i + 1].id,
    });
  }

  return { nodes, edges };
}

function getNodeDimensions(node: Node): { width: number; height: number } {
  if (node.type === 'infraModuleContainer') {
    const style = node.style as { width?: number; height?: number } | undefined;
    return {
      width: (style?.width as number) ?? CONTAINER_WIDTH,
      height: (style?.height as number) ?? MODULE_CONTAINER_HEIGHT,
    };
  }
  if (node.type === 'infraGroup') {
    return { width: GROUP_NODE_WIDTH, height: GROUP_NODE_HEIGHT };
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

export function getLayoutedInfraElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranksep: 50,
    nodesep: 70,
    edgesep: 40,
    ranker: 'network-simplex',
  });

  // Only layout top-level nodes (no parentId); children stay relative to parent
  // Use padded dimensions so dagre places nodes further apart
  const topLevelNodes = nodes.filter((n) => !('parentId' in n) || !n.parentId);
  topLevelNodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    graph.setNode(node.id, {
      width: width + LAYOUT_PADDING,
      height: height + LAYOUT_PADDING,
    });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const isHorizontal = direction === 'LR';
  const layoutedNodes = nodes.map((node) => {
    const { width, height } = getNodeDimensions(node);
    const hasParent = 'parentId' in node && node.parentId;
    if (hasParent) {
      return {
        ...node,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      };
    }
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
