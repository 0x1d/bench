import { useCallback, useRef, useState } from 'react';
import {
  Folder,
  File,
  Download,
  Upload,
  FolderPlus,
  FilePlus2,
  Pencil,
  Trash2,
  HardDrive,
  List,
  LayoutGrid,
  ListTree,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useResourceList,
  useResourceMutations,
  useSaveFile,
  triggerDownload,
} from '@/hooks/use-resources';
import { uploadFile } from '@/services/api';
import { useFileView } from '@/contexts/file-view-context';
import { getViewableType } from '@/lib/viewable-types';
import { cn } from '@/lib/utils';
import { GalleryGrid } from '@/components/gallery-grid';
import { ExpandedView } from '@/components/expanded-view';

const VIEW_MODE_KEY = 'bench-resource-view-mode';
type ViewMode = 'list' | 'gallery' | 'expanded';

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'list' || v === 'gallery' || v === 'expanded') return v;
  } catch {
    /* ignore */
  }
  return 'list';
}

function saveViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

interface RootOption {
  id: string;
  label: string;
}

interface FileBrowserProps {
  root: string;
  path: string;
  onNavigate: (path: string) => void;
  rootLabel?: string;
  roots?: RootOption[];
  onRootChange?: (rootId: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMtime(ts: number): string {
  const d = new Date(ts * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function FileBrowser({
  root,
  path,
  onNavigate,
  rootLabel,
  roots = [],
  onRootChange,
}: FileBrowserProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const queryClient = useQueryClient();
  const { data, error, isLoading } = useResourceList(root, path);
  const mutations = useResourceMutations(root, path);
  const saveMutation = useSaveFile(root);
  const { viewedFile, setViewedFile } = useFileView();

  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const handleFileDrop = useCallback(
    async (targetPath: string, files: FileList) => {
      for (const file of Array.from(files)) {
        await uploadFile(root, targetPath, file);
      }
      queryClient.invalidateQueries({ queryKey: ['resources', 'list', root, targetPath] });
      if (targetPath !== path) {
        queryClient.invalidateQueries({ queryKey: ['resources', 'list', root, path] });
      }
    },
    [root, path, queryClient]
  );

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      mutations.upload.mutate(file);
    }
    e.target.value = '';
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (name) {
      mutations.createFolder.mutate(name);
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const handleRename = () => {
    if (renameTarget && renameValue.trim()) {
      mutations.rename.mutate({ itemPath: renameTarget.path, newName: renameValue.trim() });
      setRenameTarget(null);
      setRenameValue('');
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      mutations.delete.mutate(deleteTarget.path);
      setDeleteTarget(null);
    }
  };

  const handleCreateFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    if (name.includes('/')) return;
    const filePath = path === '.' || path === '' ? name : `${path}/${name}`;
    saveMutation.mutate(
      { path: filePath, content: '' },
      {
        onSuccess: () => {
          setShowNewFile(false);
          setNewFileName('');
          setViewedFile({ root, path: filePath, name, type: 'text' });
        },
      }
    );
  };

  const openRenameDialog = (entry: { path: string; name: string }) => {
    setRenameTarget(entry);
    setRenameValue(entry.name);
  };

  const handleFileClick = (entry: { path: string; name: string }) => {
    const type = getViewableType(entry.name);
    if (type) {
      setViewedFile({ root, path: entry.path, name: entry.name, type });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        {error instanceof Error ? error.message : 'Failed to load directory'}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const hasCache = data.entries.some((e) => e.name === '.cache' && e.isDir);
  const entries = data.entries.filter((e) => !(e.name === '.cache' && e.isDir));
  const pathParts = path === '.' || path === '' ? [] : path.split('/').filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => onNavigate('.')}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {rootLabel ?? root}
        </button>
        {pathParts.map((part, i) => {
          const targetPath = pathParts.slice(0, i + 1).join('/');
          return (
            <span key={targetPath} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                onClick={() => onNavigate(targetPath)}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {part}
              </button>
            </span>
          );
        })}
      </nav>

      {/* Toolbar */}
      <TooltipProvider>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          {roots.length > 0 && onRootChange && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <HardDrive className="size-4" />
                Root
              </div>
              <Separator orientation="vertical" className="hidden h-5 sm:block" />
              <Select value={root} onValueChange={onRootChange}>
                <SelectTrigger size="sm" className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Select resource root" />
                </SelectTrigger>
                <SelectContent>
                  {roots.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Separator orientation="vertical" className="hidden h-5 sm:block" />
            </div>
          )}
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="View mode">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    setViewMode('list');
                    saveViewMode('list');
                  }}
                  aria-pressed={viewMode === 'list'}
                >
                  <List className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    setViewMode('gallery');
                    saveViewMode('gallery');
                  }}
                  aria-pressed={viewMode === 'gallery'}
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gallery view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'expanded' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    setViewMode('expanded');
                    saveViewMode('expanded');
                  }}
                  aria-pressed={viewMode === 'expanded'}
                >
                  <ListTree className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Expanded view</TooltipContent>
            </Tooltip>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            aria-hidden
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={mutations.upload.isPending}
              >
                <Upload className="size-4" />
                Upload
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload a file to this folder</TooltipContent>
          </Tooltip>
          {showNewFolder ? (
            <>
              <Separator orientation="vertical" className="h-6" />
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
                  className="h-8 w-48"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || mutations.createFolder.isPending}
                >
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <Separator orientation="vertical" className="h-6" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewFile(true)}
                    disabled={saveMutation.isPending}
                  >
                    <FilePlus2 className="size-4" />
                    New file
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create and open a new file</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewFolder(true)}
                  >
                    <FolderPlus className="size-4" />
                    New folder
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create a new subfolder</TooltipContent>
              </Tooltip>
            </>
          )}
          </div>
        </div>
      </TooltipProvider>

      {/* Content: List, Gallery, or Expanded */}
      {viewMode === 'expanded' ? (
        <div className="rounded-lg border border-border bg-card p-4">
          {entries.length > 0 ? (
            <ExpandedView
              entries={entries}
              root={root}
              hasCache={hasCache}
              onNavigate={onNavigate}
              onFileClick={handleFileClick}
              onRename={openRenameDialog}
              onDelete={(e) => setDeleteTarget({ path: e.path, name: e.name })}
              onDownload={(p) => triggerDownload(root, p)}
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground">This folder is empty.</div>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div
          className={cn(
            'rounded-lg border bg-card overflow-hidden transition-colors',
            isDragOver && !dragOverFolder
              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
              : 'border-border'
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            dragCounterRef.current++;
            if (dragCounterRef.current === 1) setIsDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragCounterRef.current--;
            if (dragCounterRef.current === 0) {
              setIsDragOver(false);
              setDragOverFolder(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragCounterRef.current = 0;
            setIsDragOver(false);
            setDragOverFolder(null);
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFileDrop(path, files);
          }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Type</th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Size</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Modified</th>
                <th className="w-28 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isActive =
                  viewedFile != null &&
                  viewedFile.root === root &&
                  viewedFile.path === entry.path;
                return (
                <tr
                  key={entry.path}
                  className={cn(
                    'border-b border-border/50 last:border-0 hover:bg-accent/30',
                    isActive && 'bg-primary/10 ring-2 ring-inset ring-primary/30',
                    (entry.isDir || getViewableType(entry.name)) && 'cursor-pointer',
                    entry.isDir && dragOverFolder === entry.path && 'bg-primary/20 ring-2 ring-inset ring-primary/50'
                  )}
                  onClick={() => {
                    if (entry.isDir) {
                      onNavigate(entry.path);
                    } else {
                      handleFileClick(entry);
                    }
                  }}
                  {...(entry.isDir
                    ? {
                        onDragEnter: (e: React.DragEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverFolder(entry.path);
                        },
                        onDragOver: (e: React.DragEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'copy';
                        },
                        onDragLeave: (e: React.DragEvent) => {
                          e.preventDefault();
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setDragOverFolder(null);
                          }
                        },
                        onDrop: (e: React.DragEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dragCounterRef.current = 0;
                          setIsDragOver(false);
                          setDragOverFolder(null);
                          const files = e.dataTransfer.files;
                          if (files.length > 0) handleFileDrop(entry.path, files);
                        },
                      }
                    : {})}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {entry.isDir ? (
                        <Folder className="size-4 text-primary shrink-0" />
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
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openRenameDialog(entry)}
                        aria-label={`Rename ${entry.name}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteTarget({ path: entry.path, name: entry.name })}
                        aria-label={`Delete ${entry.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                      {!entry.isDir && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => triggerDownload(root, entry.path)}
                          aria-label={`Download ${entry.name}`}
                        >
                          <Download className="size-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          {entries.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              {isDragOver ? 'Drop files here to upload' : 'This folder is empty.'}
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'rounded-lg border bg-card p-4 transition-colors',
            isDragOver && !dragOverFolder
              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
              : 'border-border'
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            dragCounterRef.current++;
            if (dragCounterRef.current === 1) setIsDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragCounterRef.current--;
            if (dragCounterRef.current === 0) {
              setIsDragOver(false);
              setDragOverFolder(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragCounterRef.current = 0;
            setIsDragOver(false);
            setDragOverFolder(null);
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFileDrop(path, files);
          }}
        >
          {entries.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {isDragOver ? 'Drop files here to upload' : 'This folder is empty.'}
            </div>
          ) : (
            <GalleryGrid
              entries={entries}
              root={root}
              onNavigate={onNavigate}
              onFileClick={handleFileClick}
              onRename={openRenameDialog}
              onDelete={(e) => setDeleteTarget({ path: e.path, name: e.name })}
              onDownload={(p) => triggerDownload(root, p)}
              hasCache={hasCache}
              onFolderDrop={handleFileDrop}
            />
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for &quot;{renameTarget?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              placeholder="New name"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={handleRename} disabled={!renameValue.trim()}>
                Rename
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New file dialog */}
      <AlertDialog
        open={showNewFile}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewFile(false);
            setNewFileName('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create file</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a file name (for example: <code>settings.yaml</code> or{' '}
              <code>config.json</code>).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
              }}
              placeholder="filename.ext"
              autoFocus
            />
            {newFileName.includes('/') && (
              <p className="text-xs text-destructive">Use a file name without path separators.</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={handleCreateFile}
                disabled={!newFileName.trim() || newFileName.includes('/') || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
