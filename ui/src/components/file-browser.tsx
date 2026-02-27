import { useRef, useState } from 'react';
import { Folder, File, Download, Upload, FolderPlus, Pencil, Trash2, HardDrive } from 'lucide-react';
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
  triggerDownload,
} from '@/hooks/use-resources';
import { useFileView } from '@/contexts/file-view-context';
import { getViewableType } from '@/lib/viewable-types';
import { cn } from '@/lib/utils';

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
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data, error, isLoading } = useResourceList(root, path);
  const mutations = useResourceMutations(root, path);
  const { setViewedFile } = useFileView();

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

  const entries = data.entries;
  const pathParts = path === '.' || path === '' ? [] : path.split('/').filter(Boolean);

  return (
    <div className="space-y-4">
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

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
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
            {entries.map((entry) => (
              <tr
                key={entry.path}
                className={cn(
                  'border-b border-border/50 last:border-0 hover:bg-accent/30',
                  (entry.isDir || getViewableType(entry.name)) && 'cursor-pointer'
                )}
                onClick={() => {
                  if (entry.isDir) {
                    onNavigate(entry.path);
                  } else {
                    handleFileClick(entry);
                  }
                }}
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
            ))}
          </tbody>
        </table>
        {entries.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">
            This folder is empty.
          </div>
        )}
      </div>

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
    </div>
  );
}
