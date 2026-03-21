import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';
import { Trash2, X, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/code-editor';
import { ContextPanel } from '@/components/context-panel';
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
const MIN_WIDTH = 200;
const MAX_WIDTH = 2000;

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
        className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-editor]:rounded-none [&_.cm-editor]:border-0 [&_.cm-scroller]:h-full [&_.cm-scroller]:min-h-0"
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const handleClose = useCallback(() => {
    setSelectedNode(null);
    setSelectedFile(null);
    setFileContent('');
    setOutput('');
    setOutputCommand(null);
  }, [setSelectedNode, setSelectedFile, setFileContent, setOutput, setOutputCommand]);

  useEffect(() => {
    const onBenchClose = () => handleClose();
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
  }, [handleClose]);

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

      <div className={cn('flex min-h-0 flex-1 flex-col', (selectedNode || selectedFile) ? 'overflow-hidden p-0' : 'overflow-auto p-4')}>
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
      <ContextPanel
        expanded={isExpanded}
        storageKey={STORAGE_KEY}
        minWidth={MIN_WIDTH}
        maxWidth={MAX_WIDTH}
        defaultWidth={360}
      >
        {panelContent()}
      </ContextPanel>
    </>
  );
}
