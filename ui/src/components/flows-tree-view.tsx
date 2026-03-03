import { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Workflow,
  Play,
  Pencil,
  Plus,
  Trash2,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FlowWorkspaceTreeEntry } from '@/services/api';

const DRAG_MIME = 'application/x-bench-flow-move';

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

interface FlowsTreeViewProps {
  entries: FlowWorkspaceTreeEntry[];
  parentModule: string;
  displayWorkspace: string | null;
  onRun: (entry: FlowWorkspaceTreeEntry, modulePath: string) => void;
  onEdit: (entry: FlowWorkspaceTreeEntry, modulePath: string) => void;
  onDelete: (entry: FlowWorkspaceTreeEntry, modulePath: string) => void;
  onMove: (flowId: string, fromModule: string, toModule: string) => void;
  onEditModule?: (modulePath: string) => void;
  onCreateFlow?: (modulePath: string) => void;
  setFlowContext: (workspace: string | null, module: string | null) => void;
}

export function FlowsTreeView({
  entries,
  parentModule,
  displayWorkspace,
  onRun,
  onEdit,
  onDelete,
  onMove,
  onEditModule,
  onCreateFlow,
  setFlowContext,
}: FlowsTreeViewProps) {
  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <TreeNode
          key={`${entry.type}-${parentModule}-${entry.path}`}
          entry={entry}
          modulePath={entry.type === 'module' ? entry.path : parentModule}
          parentModule={parentModule}
          displayWorkspace={displayWorkspace}
          onRun={onRun}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
          onEditModule={onEditModule}
          onCreateFlow={onCreateFlow}
          setFlowContext={setFlowContext}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  entry: FlowWorkspaceTreeEntry;
  modulePath: string;
  parentModule: string;
  displayWorkspace: string | null;
  onRun: (entry: FlowWorkspaceTreeEntry, modulePath: string) => void;
  onEdit: (entry: FlowWorkspaceTreeEntry, modulePath: string) => void;
  onDelete: (entry: FlowWorkspaceTreeEntry, modulePath: string) => void;
  onMove: (flowId: string, fromModule: string, toModule: string) => void;
  onEditModule?: (modulePath: string) => void;
  onCreateFlow?: (modulePath: string) => void;
  setFlowContext: (workspace: string | null, module: string | null) => void;
}

function TreeNode({
  entry,
  modulePath,
  parentModule,
  displayWorkspace,
  onRun,
  onEdit,
  onDelete,
  onMove,
  onEditModule,
  onCreateFlow,
  setFlowContext,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [dropOver, setDropOver] = useState(false);

  const isModule = entry.type === 'module';
  const hasChildren = isModule && (entry.children?.length ?? 0) > 0;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(DRAG_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (isModule) setDropOver(true);
      }
    },
    [isModule]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropOver(false);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      setDropOver(false);
      const { flowId, fromModule } = JSON.parse(raw) as { flowId: string; fromModule: string };
      const toModule = isModule ? entry.path : parentModule;
      if (fromModule !== toModule) {
        onMove(flowId, fromModule, toModule);
      }
    },
    [isModule, entry.path, parentModule, onMove]
  );

  const row = (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        'hover:bg-accent/50 cursor-pointer',
        dropOver && 'bg-primary/20 ring-1 ring-primary/50'
      )}
      onClick={() => {
        if (isModule) {
          setExpanded((e) => !e);
        } else {
          setFlowContext(displayWorkspace, modulePath === '.' ? null : modulePath);
          window.location.hash = `#flows/${entry.path}`;
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-5 shrink-0 flex items-center justify-center">
        {isModule ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((e2) => !e2);
            }}
            className="p-0.5 hover:bg-accent/50 rounded"
          >
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isModule ? (
          <Folder className="size-4 text-primary shrink-0" />
        ) : (
          <Workflow className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="min-w-0 truncate font-medium">{entry.name}</span>
      </div>
      <div className="hidden w-20 shrink-0 text-muted-foreground sm:block">
        {entry.type === 'flow' ? `${entry.steps ?? 0} step(s)` : '—'}
      </div>
      <div className="hidden w-28 shrink-0 text-muted-foreground md:block">
        {entry.mtime ? formatMtime(entry.mtime) : '—'}
      </div>
      <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {entry.type === 'module' && (
          <>
            {onCreateFlow && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFlow(entry.path);
                }}
                aria-label="New flow in module"
              >
                <Plus className="size-3" />
              </Button>
            )}
            {onEditModule && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditModule(entry.path);
                }}
                aria-label="Edit module"
              >
                <Settings className="size-3" />
              </Button>
            )}
          </>
        )}
        {entry.type === 'flow' && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRun(entry, modulePath);
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
                onEdit(entry, modulePath);
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
                onDelete(entry, modulePath);
              }}
              aria-label="Delete flow"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const draggableWrapper = entry.type === 'flow' ? (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(
          DRAG_MIME,
          JSON.stringify({ flowId: entry.path, fromModule: modulePath })
        );
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="min-w-0"
    >
      {row}
    </div>
  ) : (
    row
  );

  return (
    <div className="min-w-0">
      {draggableWrapper}
      {isModule && expanded && hasChildren && (
        <div className="ml-6 mt-0.5 border-l border-border pl-2">
          <FlowsTreeView
            entries={entry.children!}
            parentModule={entry.path}
            displayWorkspace={displayWorkspace}
            onRun={onRun}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
            onEditModule={onEditModule}
            onCreateFlow={onCreateFlow}
            setFlowContext={setFlowContext}
          />
        </div>
      )}
    </div>
  );
}
