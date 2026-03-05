import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Play,
  Trash2,
  FolderTree,
  FileDown,
  LayoutGrid,
  Rows,
} from 'lucide-react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
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
} from '@/components/infra-node';
import {
  fetchInfrastructureStatus,
  runTerraformCommand,
  fetchResourceList,
  downloadFile,
  saveFile,
} from '@/services/api';
import { parseTerraformContent } from '@/lib/terraform-parse';
import {
  parsedToNodesEdges,
  getLayoutedInfraElements,
} from '@/lib/terraform-diagram';
import { CodeEditor } from '@/components/code-editor';
import { cn } from '@/lib/utils';

type TerraformCommand = 'init' | 'plan' | 'apply' | 'destroy';

const INFRA_LAYOUT_KEY = 'bench-infra-layout';

const nodeTypes: NodeTypes = {
  infraProvider: InfraProviderNode,
  infraVariable: InfraVariableNode,
  infraResource: InfraResourceNode,
  infraData: InfraDataNode,
  infraModule: InfraModuleNode,
  infraOutput: InfraOutputNode,
};

export function InfrastructurePage() {
  const queryClient = useQueryClient();
  const [output, setOutput] = useState('');
  const [outputCommand, setOutputCommand] = useState<TerraformCommand | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['infrastructure', 'status'],
    queryFn: () => fetchInfrastructureStatus(),
  });

  const { data: fileList } = useQuery({
    queryKey: ['resources', 'infra', '.'],
    queryFn: () => fetchResourceList('infra', '.'),
    enabled: status?.configured ?? false,
  });

  const [runningCommand, setRunningCommand] = useState<TerraformCommand | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>(() => {
    try {
      return (localStorage.getItem(INFRA_LAYOUT_KEY) as 'TB' | 'LR') || 'TB';
    } catch {
      return 'TB';
    }
  });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'diagram'>('files');

  const runCommand = useMutation({
    mutationFn: async (cmd: TerraformCommand) => {
      setOutput('');
      setOutputCommand(cmd);
      setRunningCommand(cmd);
      setIsRunning(true);
      try {
        const full = await runTerraformCommand(cmd, (chunk) => {
          setOutput((prev) => prev + chunk);
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

  const loadFile = async (path: string) => {
    try {
      const blob = await downloadFile('infra', path);
      const text = await blob.text();
      setFileContent(text);
      setSelectedFile(path);
    } catch (e) {
      toast.error(`Failed to load file: ${(e as Error).message}`);
    }
  };

  const saveFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop() ?? path;
      const dirPath = parts.length > 0 ? parts.join('/') : '.';
      await saveFile('infra', dirPath ? `${dirPath}/${name}` : name, content);
    },
    onSuccess: () => {
      toast.success('File saved');
      queryClient.invalidateQueries({ queryKey: ['resources', 'infra'] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });

  // Load all .tf files for diagram parsing
  const tfFiles = (fileList?.entries ?? []).filter(
    (e) => !e.isDir && (e.name.endsWith('.tf') || e.name.endsWith('.hcl'))
  );

  const [tfContent, setTfContent] = useState('');
  const tfFilePaths = useMemo(
    () => tfFiles.map((f) => f.path).join(','),
    [tfFiles]
  );

  useEffect(() => {
    if (tfFiles.length === 0) {
      setTfContent('');
      return;
    }
    let cancelled = false;
    Promise.all(
      tfFiles.map(async (f) => {
        try {
          const blob = await downloadFile('infra', f.path);
          return await blob.text();
        } catch {
          return '';
        }
      })
    ).then((contents) => {
      if (!cancelled) setTfContent(contents.join('\n\n'));
    });
    return () => {
      cancelled = true;
    };
  }, [status?.configured, tfFilePaths, tfFiles]);

  const parsed = useMemo(() => parseTerraformContent(tfContent), [tfContent]);

  const diagramInitial = useMemo(() => {
    const { nodes, edges } = parsedToNodesEdges(parsed);
    if (nodes.length > 0) {
      return getLayoutedInfraElements(nodes, edges, layoutDirection);
    }
    return { nodes, edges };
  }, [parsed, layoutDirection]);

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
    const { nodes: rawNodes, edges: rawEdges } = parsedToNodesEdges(parsed);
    const { nodes: n, edges: e } = getLayoutedInfraElements(rawNodes, rawEdges, next);
    setNodes(n);
    setEdges(e);
  }, [layoutDirection, parsed, setNodes, setEdges]);

  const selectedNodeData = selectedNode?.data as Record<string, unknown> | undefined;
  const selectedResourceBody = selectedNodeData?.body as string | undefined;
  const selectedNodeType = selectedNode?.type as string | undefined;

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
  const hasOutput = output.length > 0 || isRunning;
  const hasEditor = selectedFile != null;

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCommand.mutate('init')}
            disabled={isRunning}
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
            disabled={isRunning}
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
            disabled={isRunning}
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
            disabled={isRunning}
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

      {/* Main content + right panel */}
      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        {/* Left: file list, editor, or diagram */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden">
          {activeTab === 'diagram' ? (
            <div className="flex-1 min-h-[400px] rounded-lg border border-border bg-card overflow-hidden">
              {nodes.length > 0 ? (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={(_, node) => setSelectedNode(node)}
                  nodeTypes={nodeTypes}
                  nodesDraggable={true}
                  fitView
                  className="bg-muted/20"
                >
                  <Background />
                  <Controls />
                  <Panel position="top-left">
                    <span className="text-xs text-muted-foreground">
                      {parsed.providers.length + parsed.variables.length + parsed.resources.length +
                        parsed.data.length + parsed.modules.length + parsed.outputs.length} blocks
                    </span>
                  </Panel>
                </ReactFlow>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No Terraform blocks found. Add .tf files and switch to Files view to edit.
                </div>
              )}
            </div>
          ) : !hasEditor ? (
            <div className="rounded-lg border border-border bg-card p-4 overflow-auto">
              <h3 className="text-sm font-medium mb-2">Terraform files</h3>
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No files yet. Run Init after adding .tf files.</p>
              ) : (
                <ul className="space-y-1">
                  {files.map((e) => (
                    <li key={e.path}>
                      <button
                        type="button"
                        onClick={() => loadFile(e.path)}
                        className={cn(
                          'text-sm font-mono hover:bg-accent rounded px-2 py-1 w-full text-left',
                          selectedFile === e.path && 'bg-accent'
                        )}
                      >
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono">{selectedFile}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedFile) saveFileMutation.mutate({ path: selectedFile, content: fileContent });
                    }}
                    disabled={saveFileMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                    Close
                  </Button>
                </div>
              </div>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="flex-1 min-h-[200px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm resize-none"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Right: output panel or selected node editor */}
        {(selectedNode && activeTab === 'diagram') ? (
          <div className="w-[400px] flex-shrink-0 flex flex-col rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border text-sm font-medium flex items-center justify-between">
              <span>{selectedNodeType?.replace('infra', '')} — {String((selectedNode.data as Record<string, unknown>)?.name ?? '')}</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>Close</Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {(selectedNodeType === 'infraResource' || selectedNodeType === 'infraData') && selectedResourceBody ? (
                <CodeEditor
                  value={selectedResourceBody}
                  onChange={() => {}}
                  filename="main.tf"
                  className="min-h-[300px]"
                />
              ) : (
                <pre className="text-xs font-mono text-muted-foreground">
                  {JSON.stringify(selectedNodeData, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ) : hasOutput || outputCommand ? (
          <div className="w-[400px] flex-shrink-0 flex flex-col rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border text-sm font-medium">
              Terraform {outputCommand ?? 'output'}
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre-wrap break-words bg-muted/30">
              {output || (isRunning ? 'Running...' : '')}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
