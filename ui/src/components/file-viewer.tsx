import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/code-editor';
import { useFileView } from '@/contexts/file-view-context';
import { useResourceList, useResourceMutations } from '@/hooks/use-resources';
import { downloadFile } from '@/services/api';
import { useSaveFile } from '@/hooks/use-resources';
import { prettyPrint } from '@/lib/text-format';
import {
  detectFormat,
  tryParseStructured,
  serializeStructured,
  type StructuredFormat,
} from '@/lib/parse-structured';
import { supportsFormMode, isImage, getViewableType } from '@/lib/viewable-types';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StructuredForm } from '@/components/structured-form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';

const STORAGE_KEY = 'bench-file-viewer-width';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMtime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function MediaMetadata({
  name,
  path,
  size,
  mtime,
}: {
  name: string;
  path: string;
  size?: number;
  mtime?: number;
}) {
  return (
    <dl className="space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
      <div className="flex gap-2">
        <dt className="shrink-0 font-medium text-foreground">Name</dt>
        <dd className="min-w-0 truncate font-mono">{name}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 font-medium text-foreground">Path</dt>
        <dd className="min-w-0 truncate font-mono">{path}</dd>
      </div>
      {size != null && (
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-foreground">Size</dt>
          <dd>{formatSize(size)}</dd>
        </div>
      )}
      {mtime != null && (
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-foreground">Modified</dt>
          <dd>{formatMtime(mtime)}</dd>
        </div>
      )}
    </dl>
  );
}

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

function getEmptyStructuredDefault(text: string, supportsStructuredForm: boolean): unknown | null {
  if (!supportsStructuredForm) return null;
  if (text.trim() !== '') return null;
  // Default to an array so users can immediately add YAML/JSON items from Data mode.
  return [];
}

export function FileViewer() {
  const { viewedFile, setViewedFile } = useFileView();
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string | null>(null);
  const [formData, setFormData] = useState<unknown>(null);
  const [formParseError, setFormParseError] = useState<string | null>(null);
  const [textMode, setTextMode] = useState<TextMode>('content');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(getInitialWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const saveMutation = useSaveFile(viewedFile?.root ?? null);
  const parentPath =
    viewedFile?.path != null
      ? viewedFile.path.includes('/')
        ? viewedFile.path.split('/').slice(0, -1).join('/')
        : '.'
      : '.';
  const deleteMutations = useResourceMutations(viewedFile?.root ?? null, parentPath);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const isExpanded = viewedFile != null;
  const [isLgScreen, setIsLgScreen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsLgScreen(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Media (image/video/audio): folder path, sibling images, and metadata
  const isMedia = viewedFile?.type === 'image' || viewedFile?.type === 'video' || viewedFile?.type === 'audio';
  const mediaDirPath =
    isMedia && viewedFile
      ? viewedFile.path.includes('/')
        ? viewedFile.path.split('/').slice(0, -1).join('/')
        : '.'
      : '.';
  const { data: mediaDirData } = useResourceList(
    isMedia && viewedFile ? viewedFile.root : null,
    mediaDirPath
  );
  const currentFileEntry = useMemo(
    () => mediaDirData?.entries?.find((e) => e.path === viewedFile?.path),
    [mediaDirData?.entries, viewedFile?.path]
  );
  const imageDirData = mediaDirData;
  const imageFiles = useMemo(
    () =>
      imageDirData?.entries
        ?.filter((e) => !e.isDir && isImage(e.name))
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [imageDirData?.entries]
  );
  const viewableMediaFiles = useMemo(
    () =>
      imageDirData?.entries
        ?.filter((e) => {
          if (e.isDir) return false;
          const t = getViewableType(e.name);
          return t === 'image' || t === 'video' || t === 'audio';
        })
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [imageDirData?.entries]
  );
  const imageIndex =
    viewedFile?.type === 'image'
      ? imageFiles.findIndex((e) => e.path === viewedFile.path)
      : -1;
  const mediaIndex = viewedFile?.type
    ? viewableMediaFiles.findIndex((e) => e.path === viewedFile.path)
    : -1;
  const canGoPrev = imageIndex > 0;
  const canGoNext = imageIndex >= 0 && imageIndex < imageFiles.length - 1;

  const touchStartX = useRef(0);
  const goToPrev = useCallback(() => {
    if (!canGoPrev || !viewedFile) return;
    const prev = imageFiles[imageIndex - 1];
    setViewedFile({
      root: viewedFile.root,
      path: prev.path,
      name: prev.name,
      type: 'image',
    });
  }, [canGoPrev, viewedFile, imageFiles, imageIndex, setViewedFile]);

  const goToNext = useCallback(() => {
    if (!canGoNext || !viewedFile) return;
    const next = imageFiles[imageIndex + 1];
    setViewedFile({
      root: viewedFile.root,
      path: next.path,
      name: next.name,
      type: 'image',
    });
  }, [canGoNext, viewedFile, imageFiles, imageIndex, setViewedFile]);

  useEffect(() => {
    if (viewedFile?.type !== 'image' || imageFiles.length <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewedFile?.type, imageFiles.length, goToPrev, goToNext]);

  const handleImageTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleImageTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const threshold = 50;
      if (deltaX > threshold) goToPrev();
      else if (deltaX < -threshold) goToNext();
    },
    [goToPrev, goToNext]
  );
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

    if (viewedFile.type !== 'image') {
      queueMicrotask(() => setImageLightboxOpen(false));
    }

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
              const emptyDefault = getEmptyStructuredDefault(formatted, true);
              if (emptyDefault != null) {
                setFormData(emptyDefault);
                setFormParseError(null);
                setTextMode('data');
                return;
              }
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
        setImageLoaded(false);
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
      setError(null);
      if (viewedFile.type === 'video' || viewedFile.type === 'audio') {
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }
      // For images, keep objectUrl alive for a smooth transition to the next file
    };
  }, [viewedFile]);

  const handleClose = useCallback(() => {
    setViewedFile(null);
    setImageLightboxOpen(false);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
  }, [objectUrl, setViewedFile]);

  const handleDelete = () => {
    if (!viewedFile) return;
    const nextMedia =
      mediaIndex >= 0 && mediaIndex < viewableMediaFiles.length - 1
        ? viewableMediaFiles[mediaIndex + 1]
        : mediaIndex > 0
          ? viewableMediaFiles[mediaIndex - 1]
          : null;
    const nextType = nextMedia ? getViewableType(nextMedia.name) : null;
    deleteMutations.delete.mutate(viewedFile.path, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        if (nextMedia && nextType) {
          setViewedFile({
            root: viewedFile.root,
            path: nextMedia.path,
            name: nextMedia.name,
            type: nextType,
          });
        } else {
          handleClose();
        }
      },
    });
  };

  const contentToSave =
    textMode === 'data' && formData != null
      ? serializeStructured(formData, format)
      : editContent;

  const handleFormChange = useCallback(
    (next: unknown) => {
      setFormData(next);
      // Keep content tab in sync with unsaved Data edits.
      setEditContent(serializeStructured(next, format));
      setFormParseError(null);
    },
    [format]
  );

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

  useEffect(() => {
    if (!viewedFile || showDeleteConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const target = document.activeElement;
      const isEditing =
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (isEditing) return;
      e.preventDefault();
      setShowDeleteConfirm(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewedFile, showDeleteConfirm]);

  useEffect(() => {
    if (!viewedFile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        e.preventDefault();
        return;
      }
      if (imageLightboxOpen) {
        setImageLightboxOpen(false);
        e.preventDefault();
        return;
      }
      handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewedFile, showDeleteConfirm, imageLightboxOpen, handleClose]);

  const viewerPanel = (showResizeHandle: boolean, renderMedia: boolean) => (
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
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          viewedFile?.type === 'text' ? 'overflow-hidden p-0' : 'overflow-auto p-4'
        )}
      >
        {loading && !objectUrl && (
          <p className="text-muted-foreground text-sm">Loading...</p>
        )}
        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}
        {((!loading && !error && viewedFile) ||
          (viewedFile?.type === 'image' && objectUrl)) && viewedFile && (
          <>
            {viewedFile.type === 'text' && content != null && (
              showFormTab ? (
                <Tabs
                  value={textMode}
                  onValueChange={(v) => {
                    const mode = v as TextMode;
                    if (mode === 'data' && editContent != null) {
                      const emptyDefault = getEmptyStructuredDefault(editContent, showFormTab);
                      if (emptyDefault != null) {
                        setFormData(emptyDefault);
                        setFormParseError(null);
                        setTextMode('data');
                        return;
                      }
                      const result = tryParseStructured(editContent, format);
                      if (result.success) {
                        setFormData(result.data);
                        setFormParseError(null);
                        setTextMode('data');
                      } else {
                        setFormParseError(result.error);
                      }
                    } else {
                      if (mode === 'content' && textMode === 'data' && formData != null) {
                        // Reflect current form state in raw YAML/JSON before switching tabs.
                        setEditContent(serializeStructured(formData, format));
                      }
                      setTextMode(mode);
                    }
                  }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <TabsList
                    variant="line"
                    className="flex w-full shrink-0 rounded-none border-b border-border p-0"
                  >
                    <TabsTrigger
                      value="data"
                      className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
                    >
                      Data
                    </TabsTrigger>
                    <TabsTrigger
                      value="content"
                      className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
                    >
                      Content
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="data" className="mt-0 min-h-0 flex-1 overflow-auto p-4">
                    {formData != null ? (
                      <StructuredForm
                        data={formData}
                        onChange={handleFormChange}
                        initialExpandAll={
                          content != null && new TextEncoder().encode(content).length < 2048
                        }
                        resetKey={
                          viewedFile ? `${viewedFile.root}:${viewedFile.path}` : '__no_file__'
                        }
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm">Loading form...</p>
                    )}
                  </TabsContent>
                  <TabsContent value="content" className="mt-0 min-h-0 flex-1 overflow-auto">
                    <CodeEditor
                      value={editContent ?? ''}
                      onChange={setEditContent}
                      filename={viewedFile.name}
                      className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-editor]:rounded-none [&_.cm-editor]:border-0 [&_.cm-scroller]:h-full [&_.cm-scroller]:min-h-0"
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <CodeEditor
                    value={editContent ?? ''}
                    onChange={setEditContent}
                    filename={viewedFile.name}
                    className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-editor]:rounded-none [&_.cm-editor]:border-0 [&_.cm-scroller]:h-full [&_.cm-scroller]:min-h-0"
                  />
                </div>
              )
            )}
            {viewedFile.type === 'image' && objectUrl && (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                {!imageLightboxOpen && (
                  <div
                    className="flex min-h-0 min-w-0 flex-1 items-center justify-center touch-pan-y"
                    onTouchStart={handleImageTouchStart}
                    onTouchEnd={handleImageTouchEnd}
                  >
                    <img
                      src={objectUrl}
                      alt={viewedFile.name}
                      className="max-h-full max-w-full cursor-pointer object-contain transition-opacity duration-300"
                      onClick={() => setImageLightboxOpen(true)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setImageLightboxOpen(true)}
                      aria-label="Click to view full size"
                    />
                  </div>
                )}
                <MediaMetadata
                  name={viewedFile.name}
                  path={viewedFile.path}
                  size={currentFileEntry?.size}
                  mtime={currentFileEntry?.mtime}
                />
              </div>
            )}
            {viewedFile.type === 'video' && objectUrl && renderMedia && (
              <div className="flex flex-col gap-4">
                <video
                  key={objectUrl}
                  src={objectUrl}
                  controls
                  autoPlay
                  className="max-h-full max-w-full"
                />
                <MediaMetadata
                  name={viewedFile.name}
                  path={viewedFile.path}
                  size={currentFileEntry?.size}
                  mtime={currentFileEntry?.mtime}
                />
              </div>
            )}
            {viewedFile.type === 'audio' && objectUrl && renderMedia && (
              <div className="flex flex-col gap-4">
                <audio
                  src={objectUrl}
                  controls
                  className="w-full"
                />
                <MediaMetadata
                  name={viewedFile.name}
                  path={viewedFile.path}
                  size={currentFileEntry?.size}
                  mtime={currentFileEntry?.mtime}
                />
              </div>
            )}
          </>
        )}
      </div>
      {viewedFile && (
        <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete file"
              className="gap-2"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            {isTextFile && (
              <Button
                variant={hasUnsavedChanges ? 'default' : 'outline'}
                size="sm"
                onClick={handleSave}
                disabled={!hasUnsavedChanges || saveMutation.isPending}
                aria-label="Save file"
                className="gap-2"
              >
                <Save className="size-4" />
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      )}
      {/* Image overlay: rendered separately so it stays mounted during image transitions */}
      {imageLightboxOpen && viewedFile?.type === 'image' && objectUrl && (
        <Dialog
          open
          onOpenChange={(open) => !open && setImageLightboxOpen(false)}
        >
          <DialogContent
            className="!max-w-[95vw] !max-h-[95vh] !w-fit p-2 overflow-auto flex items-center justify-center bg-black/60 backdrop-blur-md touch-pan-y"
            overlayClassName="bg-black/40 backdrop-blur-md"
            showCloseButton
          >
            <DialogTitle className="sr-only">{viewedFile.name}</DialogTitle>
            <div
              className="flex items-center justify-center"
              onTouchStart={handleImageTouchStart}
              onTouchEnd={handleImageTouchEnd}
            >
              <img
                src={objectUrl}
                alt={viewedFile.name}
                className={cn(
                  'max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain transition-opacity duration-500 ease-in-out',
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                )}
                onLoad={() => setImageLoaded(true)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
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
        {viewerPanel(false, !isLgScreen)}
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
        {viewerPanel(true, isLgScreen)}
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
      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
        title="Delete"
        description={`Are you sure you want to delete "${viewedFile?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deleteMutations.delete.isPending}
        confirmButtonRef={deleteButtonRef}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          deleteButtonRef.current?.focus();
        }}
      />
    </>
  );
}
