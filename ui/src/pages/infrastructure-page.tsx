import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Play,
  Trash2,
  FolderTree,
  FileDown,
  LayoutGrid,
  Rows,
  File,
  Folder,
  FolderPlus,
  FilePlus2,
} from 'lucide-react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NotConfiguredCard } from '@/components/not-configured-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  InfraProviderNode,
  InfraVariableNode,
  InfraResourceNode,
  InfraDataNode,
  InfraModuleNode,
  InfraOutputNode,
  InfraGroupNode,
  InfraModuleContainerNode,
} from '@/components/infra-node';
import {
  fetchInfrastructureStatus,
  runTerraformCommand,
  fetchResourceList,
  fetchResourceTree,
  downloadFile,
  saveInfrastructureFile,
  createFolder,
  deleteResource,
} from '@/services/api';
import {
  parseTerraformFiles,
  BLOCK_FILE_MAP,
  createBlockTemplate,
  blockToNodeId,
  injectDependsOn,
  ensureTerraformBlockForProvider,
  appendBlockToFileContent,
  replaceBlockInContent,
  removeBlockFromContent,
  removeProviderBlockFromContent,
} from '@/lib/terraform-parse';
import {
  parsedToNodesEdges,
  getLayoutedInfraElements,
} from '@/lib/terraform-diagram';
import { useInfrastructureView } from '@/contexts/infrastructure-view-context';

/** Fits the diagram view when a Terraform command finishes (isRunning goes false). */
function FitViewOnTerraformRun() {
  const { fitView } = useReactFlow();
  const { isRunning } = useInfrastructureView();
  const wasRunningRef = useRef(false);

  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      wasRunningRef.current = false;
      requestAnimationFrame(() => fitView({ duration: 200 }));
    } else if (isRunning) {
      wasRunningRef.current = true;
    }
  }, [isRunning, fitView]);

  return null;
}
import { InfraPalette, type PaletteBlockKind } from '@/components/infra-palette';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type TerraformCommand = 'init' | 'plan' | 'apply' | 'destroy';

const INFRA_LAYOUT_KEY = 'bench-infra-layout';

function formatMtime(ts: number): string {
  const d = new Date(ts * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const nodeTypes: NodeTypes = {
  infraProvider: InfraProviderNode,
  infraVariable: InfraVariableNode,
  infraResource: InfraResourceNode,
  infraData: InfraDataNode,
  infraModule: InfraModuleNode,
  infraOutput: InfraOutputNode,
  infraGroup: InfraGroupNode,
  infraModuleContainer: InfraModuleContainerNode,
};

const NODE_TYPE_MAP: Record<PaletteBlockKind, string> = {
  provider: 'infraProvider',
  variable: 'infraVariable',
  resource: 'infraResource',
  data: 'infraData',
  module: 'infraModule',
  output: 'infraOutput',
};

function getUniqueBlockName(
  parsed: { providers: { name: string }[]; variables: { name: string }[]; resources: { name: string }[]; data: { name: string }[]; modules: { name: string }[]; outputs: { name: string }[] },
  kind: PaletteBlockKind,
  base: string
): string {
  const existing = (() => {
    switch (kind) {
      case 'provider':
        return new Set(parsed.providers.map((p) => p.name));
      case 'variable':
        return new Set(parsed.variables.map((v) => v.name));
      case 'resource':
        return new Set(parsed.resources.map((r) => r.name));
      case 'data':
        return new Set(parsed.data.map((d) => d.name));
      case 'module':
        return new Set(parsed.modules.map((m) => m.name));
      case 'output':
        return new Set(parsed.outputs.map((o) => o.name));
      default:
        return new Set<string>();
    }
  })();
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

interface InfraDiagramProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: (changes: import('@xyflow/react').NodeChange[]) => void;
  onEdgesChange: (changes: import('@xyflow/react').EdgeChange[]) => void;
  parsedFromContext: ReturnType<typeof parseTerraformFiles>;
  tfFileEntries: { path: string; content: string }[];
  onRefresh: () => void;
  setSelectedNode: (node: Node | null) => void;
  setSelectedFile: (path: string | null) => void;
  setFileContent: (content: string) => void;
  nodeTypes: NodeTypes;
}

function InfraDiagramInner({
  nodes,
  edges,
  setNodes,
  setEdges,
  onNodesChange,
  onEdgesChange,
  parsedFromContext,
  tfFileEntries,
  onRefresh,
  setSelectedNode,
  setSelectedFile,
  setFileContent,
  nodeTypes,
}: InfraDiagramProps) {
  const { screenToFlowPosition } = useReactFlow();
  const saveMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      await saveInfrastructureFile(path, content);
    },
    onSuccess: () => {
      onRefresh();
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const getFileContent = useCallback(
    (path: string): string => {
      const entry = tfFileEntries.find((f) => f.path === path);
      return entry?.content ?? '';
    },
    [tfFileEntries]
  );

  const addBlock = useCallback(
    (kind: PaletteBlockKind, position: { x: number; y: number }) => {
      const baseNames: Record<PaletteBlockKind, string> = {
        provider: 'docker',
        variable: 'name',
        resource: 'main',
        data: 'source',
        module: 'example',
        output: 'result',
      };
      const name = getUniqueBlockName(parsedFromContext, kind, baseNames[kind]);
      const filePath = BLOCK_FILE_MAP[kind];
      let block = '';
      let newContent: string;
      if (kind === 'provider') {
        const existing = getFileContent(filePath);
        newContent = ensureTerraformBlockForProvider(existing, name);
        block = `provider "${name}" {}`;
      } else {
        block = createBlockTemplate(kind, name);
        const existing = getFileContent(filePath);
        newContent = appendBlockToFileContent(existing, block);
      }
      const resType = kind === 'resource' ? 'null_resource' : kind === 'data' ? 'external' : undefined;
      const nodeId = blockToNodeId(kind, name, resType ? { type: resType } : undefined);
      const nodeType = NODE_TYPE_MAP[kind];
      const data: Record<string, unknown> =
        kind === 'resource'
          ? { type: 'null_resource', name, body: block, sourceFile: filePath }
          : kind === 'data'
            ? { type: 'external', name, body: block, sourceFile: filePath }
            : { label: name, name };
      if (kind === 'module' || kind === 'output') {
        data.body = block;
        data.sourceFile = filePath;
      }
      const newNode: Node = { id: nodeId, type: nodeType, position, data };
      setNodes((nds) => [...nds, newNode]);
      saveMutation.mutate({ path: filePath, content: newContent });
    },
    [parsedFromContext, getFileContent, setNodes, saveMutation]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData('application/terraform-block') as PaletteBlockKind | '';
      const valid: PaletteBlockKind[] = ['provider', 'variable', 'resource', 'data', 'module', 'output'];
      if (!kind || !valid.includes(kind)) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addBlock(kind, position);
    },
    [screenToFlowPosition, addBlock]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      setEdges((eds) => addEdge(conn, eds));
      const targetNode = nodes.find((n) => n.id === conn.target);
      if (!targetNode) return;
      const targetId = targetNode.id;
      const supportsDependsOn = targetId.startsWith('resource-') || targetId.startsWith('data-') || targetId.startsWith('module-');
      if (!supportsDependsOn) return;
      const targetData = targetNode.data as { body?: string; sourceFile?: string };
      const body = targetData?.body;
      const filePath = targetData?.sourceFile ?? 'main.tf';
      if (!body) return;
      const content = getFileContent(filePath);
      const updatedBody = injectDependsOn(body, [conn.source]);
      const newContent = replaceBlockInContent(content, body, updatedBody);
      saveMutation.mutate({ path: filePath, content: newContent });
    },
    [nodes, setEdges, getFileContent, saveMutation]
  );

  const handleAddBlock = useCallback(
    (kind: PaletteBlockKind) => {
      const position = screenToFlowPosition({ x: window.innerWidth / 2 - 100, y: 200 });
      addBlock(kind, position);
    },
    [screenToFlowPosition, addBlock]
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      const nextNodes = nodes.filter((n) => !deletedIds.has(n.id));
      const nextEdges = edges.filter(
        (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
      );
      setNodes(nextNodes);
      setEdges(nextEdges);

      const fileUpdates = new Map<string, string>();
      for (const node of deleted) {
        const data = node.data as { body?: string; sourceFile?: string; name?: string };
        const body = data?.body;
        const sourceFile = data?.sourceFile;
        const nodeId = node.id;

        if (!sourceFile) continue;

        let content = fileUpdates.get(sourceFile) ?? getFileContent(sourceFile);
        if (nodeId.startsWith('provider-')) {
          const name = data?.name ?? nodeId.replace('provider-', '');
          content = removeProviderBlockFromContent(content, name);
        } else if (body) {
          content = removeBlockFromContent(content, body);
        }
        fileUpdates.set(sourceFile, content);
      }

      for (const [path, content] of fileUpdates) {
        saveMutation.mutate({ path, content });
      }
    },
    [nodes, edges, setNodes, setEdges, getFileContent, saveMutation]
  );

  return (
    <div className="flex flex-1 min-h-0 gap-2">
      <InfraPalette onAddBlock={handleAddBlock} className="shrink-0 w-40" />
      <div className="infra-diagram-canvas flex-1 min-h-[400px] rounded-lg border border-border bg-card overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={(_, node) => {
            if (node.type === 'infraGroup') {
              const sourceFile = (node.data?.sourceFile as string) ?? '';
              if (sourceFile) {
                const content = tfFileEntries.find((f) => f.path === sourceFile)?.content ?? '';
                setSelectedFile(sourceFile);
                setFileContent(content);
                setSelectedNode(null);
              }
            } else {
              setSelectedNode(node);
              setSelectedFile(null);
            }
          }}
          onPaneClick={() => setSelectedNode(null)}
          nodeTypes={nodeTypes}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          fitView
          className="bg-muted/20"
        >
          <Background />
          <Controls />
          <FitViewOnTerraformRun />
          <Panel position="top-left">
            <span className="text-xs text-muted-foreground">
              {parsedFromContext.providers.length +
                parsedFromContext.variables.length +
                parsedFromContext.resources.length +
                parsedFromContext.data.length +
                parsedFromContext.modules.length +
                parsedFromContext.outputs.length}{' '}
              blocks
            </span>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export function InfrastructurePage() {
  const queryClient = useQueryClient();
  const {
    setSelectedNode,
    setSelectedFile,
    setFileContent,
    setOutput,
    setOutputCommand,
    setTfFilePaths,
    setTfContent,
    setIsRunning,
    setOnRefresh,
    selectedFile,
  } = useInfrastructureView();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['infrastructure', 'status'],
    queryFn: () => fetchInfrastructureStatus(),
  });

  const [runningCommand, setRunningCommand] = useState<TerraformCommand | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>(() => {
    try {
      return (localStorage.getItem(INFRA_LAYOUT_KEY) as 'TB' | 'LR') || 'TB';
    } catch {
      return 'TB';
    }
  });
  const [activeTab, setActiveTab] = useState<'files' | 'diagram'>('diagram');
  const [currentPath, setCurrentPath] = useState('.');
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string; isDir: boolean } | null>(null);

  const { data: fileList } = useQuery({
    queryKey: ['resources', 'infra', currentPath],
    queryFn: () => fetchResourceList('infra', currentPath),
    enabled: status?.configured ?? false,
  });

  const { data: treeData } = useQuery({
    queryKey: ['resources', 'infra', 'tree'],
    queryFn: () => fetchResourceTree('infra', '.'),
    enabled: status?.configured ?? false,
  });

  const tfFiles = useMemo(() => {
    function flatten(entries: { path: string; name: string; isDir: boolean; size?: number; mtime?: number; children?: unknown[] }[]): { path: string; name: string; size?: number; mtime?: number }[] {
      const result: { path: string; name: string; size?: number; mtime?: number }[] = [];
      for (const e of entries) {
        if (e.isDir && e.children) {
          result.push(...flatten(e.children as typeof entries));
        } else if (!e.isDir && (e.name.endsWith('.tf') || (e.name.endsWith('.hcl') && e.name !== '.terraform.lock.hcl'))) {
          result.push({ path: e.path, name: e.name, size: e.size, mtime: e.mtime });
        }
      }
      return result;
    }
    if (!treeData?.entries) return [];
    return flatten(treeData.entries);
  }, [treeData?.entries]);

  const runCommand = useMutation({
    mutationFn: async (cmd: TerraformCommand) => {
      setSelectedNode(null);
      setSelectedFile(null);
      setFileContent('');
      setOutput('');
      setOutputCommand(cmd);
      setRunningCommand(cmd);
      setIsRunning(true);
      try {
        const full = await runTerraformCommand(cmd, (chunk) => {
          setOutput((prev: string) => prev + chunk);
        });
        return full;
      } finally {
        setIsRunning(false);
        setRunningCommand(null);
      }
    },
    onSuccess: (_, cmd) => {
      toast.success(`Terraform ${cmd} completed`);
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
    },
    onError: (err: Error, cmd) => {
      toast.error(`Terraform ${cmd} failed: ${err.message}`);
    },
  });

  const loadFile = useCallback(
    async (path: string) => {
      try {
        const blob = await downloadFile('infra', path);
        const text = await blob.text();
        setFileContent(text);
        setSelectedFile(path);
      } catch (e) {
        toast.error(`Failed to load file: ${(e as Error).message}`);
      }
    },
    [setFileContent, setSelectedFile]
  );

  const createFileMutation = useMutation({
    mutationFn: async (name: string) => {
      const filePath = currentPath === '.' ? name : `${currentPath}/${name}`;
      await saveInfrastructureFile(filePath, '');
      return filePath;
    },
    onSuccess: (filePath) => {
      toast.success('File created');
      refreshTfFiles();
      setShowNewFile(false);
      setNewFileName('');
      loadFile(filePath);
    },
    onError: (e: Error) => toast.error(`Create failed: ${e.message}`),
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder('infra', currentPath, name),
    onSuccess: () => {
      toast.success('Folder created');
      refreshTfFiles();
      setShowNewFolder(false);
      setNewFolderName('');
    },
    onError: (e: Error) => toast.error(`Create folder failed: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteResource('infra', path),
    onSuccess: () => {
      toast.success('Deleted');
      if (deleteTarget?.path === selectedFile) {
        setSelectedFile(null);
        setFileContent('');
      }
      setDeleteTarget(null);
      refreshTfFiles();
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const handleCreateFile = () => {
    const name = newFileName.trim();
    if (!name || name.includes('/')) return;
    createFileMutation.mutate(name);
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name || name.includes('/')) return;
    createFolderMutation.mutate(name);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.path);
    }
  };

  const refreshTfFiles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['resources', 'infra'] });
  }, [queryClient]);

  useEffect(() => {
    setOnRefresh(refreshTfFiles);
    return () => setOnRefresh(null);
  }, [setOnRefresh, refreshTfFiles]);

  const tfFilePathsKey = useMemo(() => tfFiles.map((f) => f.path).join(','), [tfFiles]);

  useEffect(() => {
    if (tfFiles.length === 0) {
      setTfFilePaths([]);
      setTfContent('');
      return;
    }
    let cancelled = false;
    Promise.all(
      tfFiles.map(async (f) => {
        try {
          const blob = await downloadFile('infra', f.path);
          const content = await blob.text();
          return { path: f.path, content };
        } catch {
          return { path: f.path, content: '' };
        }
      })
    ).then((files) => {
      if (!cancelled) {
        setTfFilePaths(files);
        setTfContent(files.map((f) => f.content).join('\n\n'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status?.configured, tfFilePathsKey, tfFiles, setTfFilePaths, setTfContent]);

  const { tfFilePaths: tfFileEntries } = useInfrastructureView();
  const parsedFromContext = useMemo(
    () => (tfFileEntries.length > 0 ? parseTerraformFiles(tfFileEntries) : { providers: [], variables: [], resources: [], data: [], modules: [], outputs: [], locals: [] }),
    [tfFileEntries]
  );

  const diagramInitial = useMemo(() => {
    const { nodes, edges } = parsedToNodesEdges(parsedFromContext);
    if (nodes.length > 0) {
      return getLayoutedInfraElements(nodes, edges, layoutDirection);
    }
    return { nodes, edges };
  }, [parsedFromContext, layoutDirection]);

  const [nodes, setNodes, onNodesChange] = useNodesState(diagramInitial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(diagramInitial.edges);

  useEffect(() => {
    const { nodes: n, edges: e } = diagramInitial;
    if (n.length > 0) {
      setNodes(n);
      setEdges(e);
    }
  }, [diagramInitial, setNodes, setEdges]);

  const onLayoutDirectionChange = useCallback(() => {
    const next = layoutDirection === 'TB' ? 'LR' : 'TB';
    setLayoutDirection(next);
    try {
      localStorage.setItem(INFRA_LAYOUT_KEY, next);
    } catch {
      /* ignore */
    }
    const { nodes: rawNodes, edges: rawEdges } = parsedToNodesEdges(parsedFromContext);
    const { nodes: n, edges: e } = getLayoutedInfraElements(rawNodes, rawEdges, next);
    setNodes(n);
    setEdges(e);
  }, [layoutDirection, parsedFromContext, setNodes, setEdges]);

  if (statusLoading || !status) {
    return (
      <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium tracking-tight">Infrastructure</h2>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
        <NotConfiguredCard
          title="Infrastructure not configured"
          description="Add infrastructure.path to config.yaml (e.g. ./workspace/infra) in the Resources config page."
        />
      </div>
    );
  }

  if (!status.terraformAvailable) {
    return (
      <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
        <NotConfiguredCard
          title="Terraform CLI not found"
          description="Install Terraform and ensure it is available in your PATH."
        />
      </div>
    );
  }

  const files = fileList?.entries ?? [];
  const sortedEntries = [...files].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
  const pathParts = currentPath === '.' ? [] : currentPath.split('/').filter(Boolean);

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <span className="rounded px-2 py-1 font-medium">Infrastructure</span>
        {selectedFile && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="rounded px-2 py-1 font-mono">{selectedFile}</span>
          </>
        )}
      </nav>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <span className="text-sm text-muted-foreground font-mono">{status.path}</span>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'files' | 'diagram')}>
          <TabsList>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="diagram">Diagram</TabsTrigger>
          </TabsList>
        </Tabs>
        {activeTab === 'diagram' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLayoutDirectionChange}
            className="gap-1.5"
            title={layoutDirection === 'TB' ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
          >
            {layoutDirection === 'TB' ? (
              <LayoutGrid className="size-4" />
            ) : (
              <Rows className="size-4" />
            )}
            Layout
          </Button>
        )}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCommand.mutate('init')}
            disabled={runCommand.isPending}
            className="gap-1.5"
          >
            {runCommand.isPending && runningCommand === 'init' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderTree className="size-4" />
            )}
            Init
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCommand.mutate('plan')}
            disabled={runCommand.isPending}
            className="gap-1.5"
          >
            {runCommand.isPending && runningCommand === 'plan' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            Plan
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => runCommand.mutate('apply')}
            disabled={runCommand.isPending}
            className="gap-1.5"
          >
            {runCommand.isPending && runningCommand === 'apply' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Apply
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => runCommand.mutate('destroy')}
            disabled={runCommand.isPending}
            className="gap-1.5"
          >
            {runCommand.isPending && runningCommand === 'destroy' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Destroy
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {activeTab === 'diagram' ? (
          <ReactFlowProvider>
            <InfraDiagramInner
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              parsedFromContext={parsedFromContext}
              tfFileEntries={tfFileEntries}
              onRefresh={refreshTfFiles}
              setSelectedNode={setSelectedNode}
              setSelectedFile={setSelectedFile}
              setFileContent={setFileContent}
              nodeTypes={nodeTypes}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex-1 min-w-0 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border bg-muted/20">
              <nav className="flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setCurrentPath('.')}
                  className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  infra
                </button>
                {pathParts.map((part, i) => {
                  const pathUpToHere = pathParts.slice(0, i + 1).join('/');
                  return (
                    <span key={pathUpToHere} className="flex items-center gap-1">
                      <span className="text-muted-foreground">/</span>
                      <button
                        type="button"
                        onClick={() => setCurrentPath(pathUpToHere)}
                        className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        {part}
                      </button>
                    </span>
                  );
                })}
              </nav>
              <div className="flex items-center gap-2 ml-auto">
                {showNewFile ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Filename (e.g. main.tf)"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFile();
                        if (e.key === 'Escape') {
                          setShowNewFile(false);
                          setNewFileName('');
                        }
                      }}
                      className="h-8 w-40"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleCreateFile} disabled={!newFileName.trim() || createFileMutation.isPending}>
                      Create
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowNewFile(false); setNewFileName(''); }}>
                      Cancel
                    </Button>
                  </div>
                ) : showNewFolder ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') {
                          setShowNewFolder(false);
                          setNewFolderName('');
                        }
                      }}
                      className="h-8 w-40"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolderMutation.isPending}>
                      Create
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setShowNewFile(true)} disabled={createFileMutation.isPending}>
                      <FilePlus2 className="size-4" />
                      New file
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
                      <FolderPlus className="size-4" />
                      New folder
                    </Button>
                  </>
                )}
              </div>
            </div>
            {sortedEntries.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground flex-1">
                {currentPath === '.' ? 'No files or folders. Create a file or folder to get started.' : 'This folder is empty.'}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Type</th>
                    <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Size</th>
                    <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Modified</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => {
                    const isActive = !entry.isDir && selectedFile === entry.path;
                    return (
                      <tr
                        key={entry.path}
                        className={cn(
                          'border-b border-border/50 last:border-0 hover:bg-accent/30 group',
                          !entry.isDir && 'cursor-pointer',
                          isActive && 'bg-primary/10 ring-2 ring-inset ring-primary/30'
                        )}
                        onClick={() => {
                          if (entry.isDir) {
                            setCurrentPath(entry.path);
                          } else {
                            loadFile(entry.path);
                          }
                        }}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {entry.isDir ? (
                              <Folder className="size-4 text-muted-foreground shrink-0" />
                            ) : (
                              <File className="size-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="min-w-0 truncate">{entry.name}</span>
                          </div>
                        </td>
                        <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
                          {entry.isDir ? 'Folder' : 'File'}
                        </td>
                        <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                          {entry.isDir ? '—' : formatSize(entry.size ?? 0)}
                        </td>
                        <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
                          {entry.mtime != null ? formatMtime(entry.mtime) : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ path: entry.path, name: entry.name, isDir: entry.isDir });
                            }}
                            aria-label={`Delete ${entry.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={deleteTarget?.isDir ? 'Delete folder' : 'Delete file'}
          description={
            deleteTarget
              ? `Are you sure you want to delete ${deleteTarget.isDir ? 'folder' : 'file'} "${deleteTarget.name}"?${deleteTarget.isDir ? ' This will remove all contents.' : ''}`
              : ''
          }
          onConfirm={handleDeleteConfirm}
          isLoading={deleteMutation.isPending}
          loadingLabel="Deleting…"
        />
      </div>
    </div>
  );
}
