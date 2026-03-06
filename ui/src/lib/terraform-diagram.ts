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

/** Parsed Terraform graph (DOT) from `terraform graph`. */
export interface TerraformGraphParsed {
  nodeIds: string[];
  edges: { source: string; target: string }[];
}

/**
 * Parse Terraform graph DOT output into node IDs and edges.
 * Handles the default simplified format: resources and data blocks only.
 */
export function parseTerraformGraphDot(dot: string): TerraformGraphParsed {
  const seenNodes = new Set<string>();
  const edges: { source: string; target: string }[] = [];

  // Match node declarations: "id" [label="..."] or "id" [attr=...]
  const nodeRe = /"([^"]+)"\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(dot)) !== null) {
    const id = m[1].trim();
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
    }
  }

  // Match edges: "source" -> "target"
  const edgeRe = /"([^"]+)"\s*->\s*"([^"]+)"/g;
  while ((m = edgeRe.exec(dot)) !== null) {
    const source = m[1].trim();
    const target = m[2].trim();
    seenNodes.add(source);
    seenNodes.add(target);
    edges.push({ source, target });
  }

  return { nodeIds: [...seenNodes], edges };
}

/**
 * Convert Terraform address to our internal node ID.
 * e.g. "supabase_project.db" -> "resource-supabase_project-db"
 *      "data.vercel_project_directory.app" -> "data-vercel_project_directory-app"
 */
function terraformAddressToNodeId(addr: string): string {
  if (addr.startsWith('data.')) {
    const rest = addr.slice(5); // after "data."
    const dotIdx = rest.lastIndexOf('.');
    if (dotIdx >= 0) {
      const type = rest.slice(0, dotIdx);
      const name = rest.slice(dotIdx + 1);
      return `data-${type}-${name}`;
    }
    return `data-${rest}`;
  }
  const dotIdx = addr.lastIndexOf('.');
  if (dotIdx >= 0) {
    const type = addr.slice(0, dotIdx);
    const name = addr.slice(dotIdx + 1);
    return `resource-${type}-${name}`;
  }
  return `resource-${addr}`;
}

/** Build a map from terraform address to our node ID. */
function buildAddressToNodeIdMap(nodeIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const addr of nodeIds) {
    map.set(addr, terraformAddressToNodeId(addr));
  }
  return map;
}

/** Look up parsed resource or data by our internal node ID. */
function findParsedBlock(
  parsed: ParsedTerraform,
  nodeId: string
): TerraformResource | TerraformData | undefined {
  const r = parsed.resources.find((x) => x.id === nodeId);
  if (r) return r;
  return parsed.data.find((x) => x.id === nodeId);
}

/**
 * Convert Terraform graph DOT output to React Flow nodes and edges.
 * Uses dagre for layout. Enriches nodes with metadata from parsed files (body, sourceFile).
 */
export function terraformGraphToNodesEdges(
  dot: string,
  parsed: ParsedTerraform,
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const { nodeIds: graphNodeIds, edges: graphEdges } = parseTerraformGraphDot(dot);
  const addrToNodeId = buildAddressToNodeIdMap(graphNodeIds);

  const nodes: Node[] = [];
  const nodeIdSet = new Set<string>();

  for (const addr of graphNodeIds) {
    const nodeId = terraformAddressToNodeId(addr);
    if (nodeIdSet.has(nodeId)) continue;
    nodeIdSet.add(nodeId);

    const isData = addr.startsWith('data.');
    const type = isData ? 'infraData' : 'infraResource';
    let tfType = '';
    let name = '';
    if (isData) {
      const rest = addr.slice(5);
      const dotIdx = rest.lastIndexOf('.');
      tfType = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
      name = dotIdx >= 0 ? rest.slice(dotIdx + 1) : rest;
    } else {
      const dotIdx = addr.lastIndexOf('.');
      tfType = dotIdx >= 0 ? addr.slice(0, dotIdx) : addr;
      name = dotIdx >= 0 ? addr.slice(dotIdx + 1) : addr;
    }

    const block = findParsedBlock(parsed, nodeId);
    nodes.push({
      id: nodeId,
      type,
      position: { x: 0, y: 0 },
      data: {
        id: nodeId,
        type: tfType,
        name,
        body: block?.body ?? '',
        ...(block?.sourceFile != null && { sourceFile: block.sourceFile }),
      },
    });
  }

  const edges: Edge[] = [];
  for (const { source: srcAddr, target: tgtAddr } of graphEdges) {
    const srcId = addrToNodeId.get(srcAddr);
    const tgtId = addrToNodeId.get(tgtAddr);
    if (srcId && tgtId && nodeIdSet.has(srcId) && nodeIdSet.has(tgtId)) {
      edges.push({ id: `${srcId}-${tgtId}`, source: srcId, target: tgtId });
    }
  }

  return getLayoutedInfraElements(nodes, edges, direction);
}

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

  // Module container: contains Providers, Variables, Outputs and Resources group
  const hasProviders = parsed.providers.length > 0;
  const hasVariables = parsed.variables.length > 0;
  const hasOutputs = parsed.outputs.length > 0;
  const hasConfigBlocks = hasProviders || hasVariables || hasOutputs;
  const resourceNodes = [...parsed.resources, ...parsed.data];
  const hasResources = resourceNodes.length > 0;
  const hasModuleGroup = hasConfigBlocks || hasResources;
  const headerHeight = 40;

  // Resources container: deterministic grid layout by dependency rank (no overlap)
  const RESOURCE_GAP_X = 60;
  const RESOURCE_GAP_Y = 80;
  let resourcesContainerHeight = 0;
  let resourcesContainerWidth = CONTAINER_WIDTH - 2 * MODULE_PADDING;
  let resourcePositions: { r: TerraformResource | TerraformData; relX: number; relY: number }[] = [];
  if (hasResources) {
    // Build dependency graph and assign ranks (topological order)
    const depTargets = new Map<string, string[]>();
    const depSources = new Map<string, string[]>();
    const depEdges: { source: string; target: string }[] = [];
    for (const r of parsed.resources) {
      if (r.dependsOn?.length) {
        const targets = resolveDependsOnToIds(r.dependsOn);
        for (const srcId of targets) {
          if (resourceNodes.some((n) => n.id === srcId)) {
            depEdges.push({ source: srcId, target: r.id });
            depTargets.set(srcId, [...(depTargets.get(srcId) ?? []), r.id]);
            depSources.set(r.id, [...(depSources.get(r.id) ?? []), srcId]);
          }
        }
      }
    }
    for (const d of parsed.data) {
      if (d.dependsOn?.length) {
        const targets = resolveDependsOnToIds(d.dependsOn);
        for (const srcId of targets) {
          if (resourceNodes.some((n) => n.id === srcId)) {
            depEdges.push({ source: srcId, target: d.id });
            depTargets.set(srcId, [...(depTargets.get(srcId) ?? []), d.id]);
            depSources.set(d.id, [...(depSources.get(d.id) ?? []), srcId]);
          }
        }
      }
    }

    // Assign ranks: 0 = no deps, 1 = depends on rank 0, etc.
    const rank = new Map<string, number>();
    const getRank = (id: string): number => {
      if (rank.has(id)) return rank.get(id)!;
      const srcs = depSources.get(id) ?? [];
      const r = srcs.length === 0 ? 0 : 1 + Math.max(...srcs.map(getRank));
      rank.set(id, r);
      return r;
    };
    resourceNodes.forEach((r) => getRank(r.id));

    // Group by rank
    const byRank = new Map<number, (typeof resourceNodes)[0][]>();
    resourceNodes.forEach((r) => {
      const rk = rank.get(r.id)!;
      const list = byRank.get(rk) ?? [];
      list.push(r);
      byRank.set(rk, list);
    });
    const ranks = [...byRank.keys()].sort((a, b) => a - b);

    // Order nodes within each rank to minimize edge crossings (barycentric heuristic)
    const orderedByRank = new Map<number, (typeof resourceNodes)[0][]>();
    for (const rk of ranks) {
      const row = byRank.get(rk)!;
      if (rk === 0) {
        orderedByRank.set(rk, [...row].sort((a, b) => a.id.localeCompare(b.id)));
      } else {
        const prevRow = orderedByRank.get(rk - 1)!;
        const getBarycenter = (id: string) => {
          const srcs = depSources.get(id) ?? [];
          if (srcs.length === 0) return 0;
          const indices = srcs
            .map((s) => prevRow.findIndex((n) => n.id === s))
            .filter((i) => i >= 0);
          return indices.length > 0
            ? indices.reduce((a, b) => a + b, 0) / indices.length
            : 0;
        };
        orderedByRank.set(
          rk,
          [...row].sort((a, b) => getBarycenter(a.id) - getBarycenter(b.id))
        );
      }
    }

    // Place in grid: each rank is a row, nodes in row spaced horizontally
    let maxRowWidth = 0;
    let currentY = headerHeight + MODULE_PADDING;
    const positions = new Map<string, { x: number; y: number }>();
    for (const rk of ranks) {
      const row = orderedByRank.get(rk)!;
      const rowWidth = row.length * NODE_WIDTH + (row.length - 1) * RESOURCE_GAP_X;
      maxRowWidth = Math.max(maxRowWidth, rowWidth);
      let currentX = MODULE_PADDING;
      for (const r of row) {
        positions.set(r.id, { x: currentX, y: currentY });
        currentX += NODE_WIDTH + RESOURCE_GAP_X;
      }
      currentY += NODE_HEIGHT + RESOURCE_GAP_Y;
    }

    const contentWidth = maxRowWidth;
    const contentHeight = currentY - (headerHeight + MODULE_PADDING) - RESOURCE_GAP_Y;
    resourcesContainerHeight =
      headerHeight + 2 * MODULE_PADDING + contentHeight;
    resourcesContainerWidth = Math.max(
      resourcesContainerWidth,
      contentWidth + 2 * MODULE_PADDING
    );

    resourcePositions = resourceNodes.map((r) => {
      const pos = positions.get(r.id)!;
      return { r, relX: pos.x, relY: pos.y };
    });
  }

  // Module container: contains config blocks and Resources group (expands to fit content)
  if (hasModuleGroup) {
    const moduleWidth = Math.max(CONTAINER_WIDTH, hasResources ? resourcesContainerWidth + 2 * MODULE_PADDING : CONTAINER_WIDTH);
    const moduleHeight =
      headerHeight +
      2 * MODULE_PADDING +
      (hasConfigBlocks ? GROUP_NODE_HEIGHT + (hasResources ? MODULE_CHILD_GAP : 0) : 0) +
      (hasResources ? resourcesContainerHeight : 0);

    nodes.unshift({
      id: GROUP_IDS.module,
      type: 'infraModuleContainer',
      position: { x: 0, y: 0 },
      data: { label: 'Module' },
      style: { width: moduleWidth, height: moduleHeight },
      connectable: false,
      deletable: false,
    });

    // Children: Providers, Variables, Outputs
    if (hasConfigBlocks) {
      const contentWidth = moduleWidth - 2 * MODULE_PADDING;
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

    // Resources container as child of Module (expands to fit all nodes)
    if (hasResources) {
      const resourcesY =
        headerHeight +
        MODULE_PADDING +
        (hasConfigBlocks ? GROUP_NODE_HEIGHT + MODULE_CHILD_GAP : 0);
      nodes.push({
        id: GROUP_IDS.resources,
        type: 'infraModuleContainer',
        parentId: GROUP_IDS.module,
        extent: 'parent' as const,
        position: { x: MODULE_PADDING, y: resourcesY },
        data: { label: 'Resources' },
        style: { width: resourcesContainerWidth, height: resourcesContainerHeight },
        connectable: false,
        deletable: false,
      });
      // Resource nodes as children of Resources container (parent must exist first)
      resourcePositions.forEach(({ r, relX, relY }) => {
        const isData = 'body' in r && r.id.startsWith('data-');
        const type = isData ? 'infraData' : 'infraResource';
        const base = isData ? (r as TerraformData) : (r as TerraformResource);
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

  // Flow edges for dagre layout: Module (top) -> terraform modules
  if (hasModuleGroup && parsed.modules.length > 0) {
    edges.push({
      id: `${GROUP_IDS.module}-${parsed.modules[0].id}`,
      source: GROUP_IDS.module,
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
    ranksep: 100,
    nodesep: 80,
    edgesep: 30,
    ranker: 'network-simplex',
    marginx: 30,
    marginy: 30,
  });

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
        targetPosition: (isHorizontal ? Position.Left : Position.Top) as Position,
        sourcePosition: (isHorizontal ? Position.Right : Position.Bottom) as Position,
      };
    }
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      targetPosition: (isHorizontal ? Position.Left : Position.Top) as Position,
      sourcePosition: (isHorizontal ? Position.Right : Position.Bottom) as Position,
      position: {
        x: (nodeWithPosition?.x ?? 0) - width / 2,
        y: (nodeWithPosition?.y ?? 0) - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
