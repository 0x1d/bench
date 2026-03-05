import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Trash2, X, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/code-editor';
import { useInfrastructureView } from '@/contexts/infrastructure-view-context';
import { saveInfrastructureFile, deleteResource } from '@/services/api';
import {
  getProviderEditableBlock,
  replaceProviderBlockInContent,
  replaceBlockInContent,
} from '@/lib/terraform-parse';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ansiToSegments } from '@/lib/ansi-to-html';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'bench-infrastructure-panel-width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 500;

function getInitialWidth(): number {
  if (typeof window === 'undefined') return 360;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  }
  return 360;
}

interface InfraEditFormProps {
  initialContent: string;
  onContentChange?: (content: string) => void;
  onSave: (content?: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
  savePath: string;
  isSaving: boolean;
}

interface InfraEditFormHandle {
  getContent: () => string;
}

const InfraEditForm = forwardRef<InfraEditFormHandle, Omit<InfraEditFormProps, 'onSave' | 'onCancel' | 'onDelete' | 'isSaving'>>(
  function InfraEditForm({ initialContent, onContentChange, savePath }, ref) {
    const [localContent, setLocalContent] = useState(initialContent);
    const isControlled = onContentChange != null;
    const value = isControlled ? initialContent : localContent;
    const onChange = isControlled ? onContentChange : setLocalContent;

    useImperativeHandle(ref, () => ({ getContent: () => value }), [value]);

    return (
      <CodeEditor
        value={value}
        onChange={onChange}
        filename={savePath.endsWith('.tf') ? 'main.tf' : 'file.tf'}
        className="h-full min-h-[240px] [&_.cm-editor]:h-full [&_.cm-scroller]:h-full"
      />
    );
  }
);

export function InfrastructurePanel() {
  const {
    selectedNode,
    setSelectedNode,
    selectedFile,
    setSelectedFile,
    fileContent,
    setFileContent,
    output,
    setOutput,
    outputCommand,
    setOutputCommand,
    tfFilePaths,
    tfContent,
    isRunning,
    onRefresh,
  } = useInfrastructureView();
  const [width, setWidth] = useState(getInitialWidth);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const editFormRef = useRef<InfraEditFormHandle | null>(null);

  const queryClient = useQueryClient();

  const isExpanded =
    selectedNode != null || selectedFile != null || (output.length > 0 || isRunning);

  const selectedNodeData = selectedNode?.data as Record<string, unknown> | undefined;
  const selectedResourceBody = selectedNodeData?.body as string | undefined;
  const selectedNodeType = selectedNode?.type as string | undefined;
  const selectedNodeName = selectedNodeData?.name as string | undefined;
  const selectedSourceFile = selectedNodeData?.sourceFile as string | undefined;

  const saveMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      await saveInfrastructureFile(path, content);
    },
    onSuccess: () => {
      toast.success('File saved');
      queryClient.invalidateQueries({ queryKey: ['resources', 'infra'] });
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
      onRefresh?.();
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      await deleteResource('infra', path);
    },
    onSuccess: () => {
      toast.success('File deleted');
      setSelectedFile(null);
      setFileContent('');
      queryClient.invalidateQueries({ queryKey: ['resources', 'infra'] });
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
      onRefresh?.();
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setWidth(next);
      localStorage.setItem(STORAGE_KEY, String(next));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const handleClose = () => {
    setSelectedNode(null);
    setSelectedFile(null);
    setFileContent('');
    setOutput('');
    setOutputCommand(null);
  };

  const getProviderFileContent = (): string => {
    if (!selectedSourceFile || !selectedNodeName) return tfContent;
    const file = tfFilePaths.find((f) => f.path === selectedSourceFile);
    return file?.content ?? tfContent;
  };

  const initialEditContent = (() => {
    if (!selectedNode) return '';
    if (selectedNodeType === 'infraProvider' && selectedNodeName) {
      const content = getProviderFileContent();
      return getProviderEditableBlock(content, selectedNodeName);
    }
    if ((selectedNodeType === 'infraData' || selectedNodeType === 'infraResource') && selectedResourceBody) {
      return selectedResourceBody;
    }
    return '';
  })();

  const getSavePath = (): string => {
    if (selectedFile) return selectedFile;
    if (selectedSourceFile) return selectedSourceFile;
    return 'main.tf';
  };

  const handleSave = (contentToSave?: string) => {
    const path = getSavePath();
    if (!path) return;

    const toSave = contentToSave ?? (selectedFile ? fileContent : initialEditContent);
    let content: string;
    if (selectedFile) {
      content = toSave;
    } else if (selectedNodeType === 'infraProvider' && selectedNodeName) {
      const fileContentForProvider = getProviderFileContent();
      content = replaceProviderBlockInContent(
        fileContentForProvider,
        selectedNodeName,
        toSave
      );
    } else if (
      (selectedNodeType === 'infraResource' || selectedNodeType === 'infraData') &&
      selectedResourceBody
    ) {
      const fileContentForBlock = selectedSourceFile
        ? (tfFilePaths.find((f) => f.path === selectedSourceFile)?.content ?? tfContent)
        : tfContent;
      content = replaceBlockInContent(fileContentForBlock, selectedResourceBody, toSave);
    } else {
      return;
    }

    saveMutation.mutate({ path, content });
    if (selectedNode) setSelectedNode(null);
    if (selectedFile) setSelectedFile(null);
  };

  const handleCancel = () => {
    setSelectedNode(null);
    setSelectedFile(null);
    setFileContent('');
  };

  const handleDelete = () => {
    if (selectedFile) {
      deleteMutation.mutate(selectedFile);
      setShowDeleteConfirm(false);
    }
  };

  const panelTitle = selectedFile
    ? `Edit — ${selectedFile}`
    : selectedNode
      ? `${String(selectedNodeType?.replace('infra', '') ?? '')} — ${String(selectedNodeName ?? '')}`
      : outputCommand != null
        ? `Terraform ${outputCommand}`
        : 'Infrastructure';

  const editPanelKey = selectedNode?.id ?? selectedFile ?? 'none';
  const initialContent = selectedFile ? fileContent : initialEditContent;

  const panelContent = () => (
    <>
      {isExpanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={width}
          tabIndex={0}
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 z-10 hidden h-full w-2 cursor-col-resize lg:block hover:bg-sidebar-accent/50"
          title="Drag to resize"
        />
      )}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <span className="truncate text-sm font-medium flex items-center gap-2" title={panelTitle}>
          {!selectedNode && !selectedFile && (output.length > 0 || isRunning) && (
            <Terminal className="size-4 text-primary" />
          )}
          {panelTitle}
        </span>
        <div className="flex items-center gap-1">
          {selectedFile && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete file"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={handleClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {(selectedNode || selectedFile) ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <InfraEditForm
              ref={editFormRef}
              key={editPanelKey}
              initialContent={initialContent}
              onContentChange={selectedFile ? setFileContent : undefined}
              savePath={getSavePath()}
            />
          </div>
        ) : (output.length > 0 || isRunning) ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded-md p-3 overflow-auto">
            {isRunning && !output ? (
              'Running...'
            ) : output ? (
              ansiToSegments(output).map((seg, i) => (
                <span key={i} className={seg.className || undefined}>
                  {seg.text}
                </span>
              ))
            ) : (
              ''
            )}
          </pre>
        ) : null}
      </div>
      {(selectedNode || selectedFile) && (
        <div className="flex shrink-0 gap-2 border-t border-sidebar-border px-4 py-3 justify-end">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          {selectedFile && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          )}
          <Button
            size="sm"
            onClick={() =>
              handleSave(
                selectedFile ? fileContent : editFormRef.current?.getContent?.()
              )
            }
            disabled={saveMutation.isPending}
          >
            Save
          </Button>
        </div>
      )}
    </>
  );

  return (
    <>
      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete file"
        description={`Are you sure you want to delete ${selectedFile ?? 'this file'}?`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden border-l lg:hidden',
          isExpanded ? 'translate-x-0' : 'hidden'
        )}
      >
        {panelContent()}
      </div>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground relative hidden min-h-0 flex-col overflow-hidden border-l lg:flex',
          isExpanded ? 'shrink-0' : 'w-0 min-w-0 shrink-0'
        )}
        style={
          isExpanded
            ? ({ width: `${width}px`, minWidth: `${width}px` } as React.CSSProperties)
            : undefined
        }
      >
        {panelContent()}
      </div>
    </>
  );
}
