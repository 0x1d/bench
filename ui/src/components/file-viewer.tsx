import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CodeEditor } from '@/components/code-editor';
import { useFileView } from '@/contexts/file-view-context';
import { downloadFile } from '@/services/api';
import { useSaveFile } from '@/hooks/use-resources';
import { prettyPrint } from '@/lib/text-format';
import {
  detectFormat,
  tryParseStructured,
  serializeStructured,
  type StructuredFormat,
} from '@/lib/parse-structured';
import { supportsFormMode } from '@/lib/viewable-types';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StructuredForm } from '@/components/structured-form';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STORAGE_KEY = 'bench-file-viewer-width';
const MIN_WIDTH = 240;
const MAX_WIDTH = 800;

function getInitialWidth(): number {
  if (typeof window === 'undefined') return 320;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  }
  const quarterWidth = Math.round(window.innerWidth / 4);
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, quarterWidth));
}

type TextMode = 'content' | 'data';

export function FileViewer() {
  const { viewedFile, setViewedFile } = useFileView();
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string | null>(null);
  const [formData, setFormData] = useState<unknown>(null);
  const [formParseError, setFormParseError] = useState<string | null>(null);
  const [textMode, setTextMode] = useState<TextMode>('content');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(getInitialWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const saveMutation = useSaveFile(viewedFile?.root ?? null);
  const isExpanded = viewedFile != null;
  const isTextFile = viewedFile?.type === 'text';
  const showFormTab = isTextFile && viewedFile && supportsFormMode(viewedFile.name);
  const format: StructuredFormat =
    viewedFile && supportsFormMode(viewedFile.name) ? detectFormat(viewedFile.name) : 'json';
  const hasUnsavedChanges =
    isTextFile &&
    content != null &&
    (textMode === 'content'
      ? editContent != null && content !== editContent
      : textMode === 'data' &&
        formData != null &&
        content !== serializeStructured(formData, format));

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

  useEffect(() => {
    if (!viewedFile) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch effect: sync reset for loading state
    setLoading(true);
    setError(null);

    downloadFile(viewedFile.root, viewedFile.path)
      .then((blob) => {
        if (cancelled) return;
        if (viewedFile.type === 'text') {
          return blob.text().then((text) => {
            if (cancelled) return;
            const formatted = prettyPrint(text, viewedFile.name);
            setContent(formatted);
            setEditContent(formatted);
            const fmt = detectFormat(viewedFile.name);
            if (supportsFormMode(viewedFile.name)) {
              const result = tryParseStructured(formatted, fmt);
              if (result.success) {
                setFormData(result.data);
                setFormParseError(null);
                setTextMode('data');
              } else {
                setTextMode('content');
              }
            } else {
              setTextMode('content');
            }
            setObjectUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
          });
        }
        /* video and audio: use object URL for playback */
        const url = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setContent(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load file');
        setContent(null);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      setContent(null);
      setEditContent(null);
      setFormData(null);
      setFormParseError(null);
      setImageLightboxOpen(false);
      setError(null);
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [viewedFile]);

  const handleClose = () => {
    setViewedFile(null);
    setImageLightboxOpen(false);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
  };

  const contentToSave =
    textMode === 'data' && formData != null
      ? serializeStructured(formData, format)
      : editContent;

  const handleSave = () => {
    if (!viewedFile || !contentToSave || viewedFile.type !== 'text') return;
    saveMutation.mutate(
      { path: viewedFile.path, content: contentToSave },
      {
        onSuccess: () => {
          setContent(contentToSave);
          setEditContent(contentToSave);
        },
      }
    );
  };

  useEffect(() => {
    if (!isTextFile || !hasUnsavedChanges) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!viewedFile || viewedFile.type !== 'text') return;
        const nextContent =
          textMode === 'data' && formData != null
            ? serializeStructured(formData, format)
            : editContent;
        if (!nextContent) return;
        saveMutation.mutate(
          { path: viewedFile.path, content: nextContent },
          {
            onSuccess: () => {
              setContent(nextContent);
              setEditContent(nextContent);
            },
          }
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isTextFile, hasUnsavedChanges, viewedFile, textMode, formData, format, editContent, saveMutation]);

  const viewerPanel = (showResizeHandle: boolean) => (
    <>
      {showResizeHandle && isExpanded && (
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
        <span className="truncate text-sm font-medium" title={viewedFile?.name ?? ''}>
          {viewedFile?.name ?? 'Preview'}
          {hasUnsavedChanges && (
            <span className="ml-1 text-muted-foreground" aria-hidden>
              (unsaved)
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {isTextFile && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={hasUnsavedChanges ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || saveMutation.isPending}
                    aria-label="Save file"
                  >
                    <Save className="size-4" />
                    Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save file (Ctrl+S)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClose}
            aria-label="Close viewer"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {loading && (
          <p className="text-muted-foreground text-sm">Loading...</p>
        )}
        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}
        {!loading && !error && viewedFile && (
          <>
            {viewedFile.type === 'text' && content != null && (
              <Tabs
                value={textMode}
                onValueChange={(v) => {
                  const mode = v as TextMode;
                  if (mode === 'data' && editContent != null) {
                    const result = tryParseStructured(editContent, format);
                    if (result.success) {
                      setFormData(result.data);
                      setFormParseError(null);
                      setTextMode('data');
                    } else {
                      setFormParseError(result.error);
                    }
                  } else {
                    setTextMode(mode);
                  }
                }}
                className="flex h-full flex-col"
              >
                <TabsList variant="line" className="mb-2 shrink-0">
                  {showFormTab && <TabsTrigger value="data">Data</TabsTrigger>}
                  <TabsTrigger value="content">Content</TabsTrigger>
                </TabsList>
                {showFormTab && (
                  <TabsContent value="data" className="mt-0 flex-1 overflow-auto">
                    {formData != null ? (
                      <StructuredForm
                        data={formData}
                        onChange={setFormData}
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm">Loading form...</p>
                    )}
                  </TabsContent>
                )}
                <TabsContent value="content" className="mt-0 flex-1 overflow-auto">
                  <CodeEditor
                    value={editContent ?? ''}
                    onChange={setEditContent}
                    filename={viewedFile.name}
                  />
                </TabsContent>
              </Tabs>
            )}
            {viewedFile.type === 'image' && objectUrl && (
              <>
                <img
                  src={objectUrl}
                  alt={viewedFile.name}
                  className="max-h-full max-w-full cursor-pointer object-contain"
                  onClick={() => setImageLightboxOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setImageLightboxOpen(true)}
                  aria-label="Click to view full size"
                />
                <Dialog open={imageLightboxOpen} onOpenChange={setImageLightboxOpen}>
                  <DialogContent
                    className="!max-w-[95vw] !max-h-[95vh] !w-fit p-2 overflow-auto flex items-center justify-center bg-black/90"
                    showCloseButton
                  >
                    <DialogTitle className="sr-only">{viewedFile.name}</DialogTitle>
                    <img
                      src={objectUrl}
                      alt={viewedFile.name}
                      className="max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain"
                    />
                  </DialogContent>
                </Dialog>
              </>
            )}
            {viewedFile.type === 'video' && objectUrl && (
              <video
                src={objectUrl}
                controls
                className="max-h-full max-w-full"
              />
            )}
            {viewedFile.type === 'audio' && objectUrl && (
              <audio
                src={objectUrl}
                controls
                className="w-full"
              />
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden border-l lg:hidden',
          isExpanded ? 'translate-x-0' : 'hidden'
        )}
      >
        {viewerPanel(false)}
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
        {viewerPanel(true)}
      </div>
      <AlertDialog open={!!formParseError} onOpenChange={(open) => !open && setFormParseError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parse error</AlertDialogTitle>
            <AlertDialogDescription>
              Cannot parse file as {format.toUpperCase()}. {formParseError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">OK</Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
