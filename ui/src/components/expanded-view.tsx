import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Folder,
  File,
  ChevronDown,
  ChevronRight,
  Loader2,
  FolderPlus,
  FilePlus2,
  X,
  Download,
  Pencil,
  Trash2,
} from 'lucide-react';
import { GalleryGridItem } from './gallery-grid-item';
import { useResourceList } from '@/hooks/use-resources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ResourceEntry } from '@/services/api';
import { getViewableType } from '@/lib/viewable-types';

const DRAG_MIME = 'application/x-bench-move';

function isInternalDrag(dt: DataTransfer): boolean {
  return dt.types.includes(DRAG_MIME);
}

function isExternalFileDrag(dt: DataTransfer): boolean {
  return !dt.types.includes(DRAG_MIME) && dt.types.includes('Files');
}

function isPreviewableInExpanded(entry: ResourceEntry): boolean {
  if (entry.isDir) return false;
  const t = getViewableType(entry.name);
  return t === 'image' || t === 'video';
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

interface ExpandedViewProps {
  entries: ResourceEntry[];
  root: string;
  currentPath: string;
  hasCache: boolean;
  onNavigate: (path: string) => void;
  onFileClick: (entry: { path: string; name: string }) => void;
  onRename: (entry: { path: string; name: string }) => void;
  onDelete: (entry: { path: string; name: string }) => void;
  onDownload: (path: string) => void;
  onMove: (sourcePath: string, destinationDir: string) => void;
  onFileDrop: (targetPath: string, files: FileList) => void;
  onCreateFolder: (dirPath: string, name: string) => void;
  onCreateFile: (dirPath: string, name: string) => void;
}

export function ExpandedView({
  entries,
  root,
  currentPath,
  hasCache,
  onNavigate,
  onFileClick,
  onRename,
  onDelete,
  onDownload,
  onMove,
  onFileDrop,
  onCreateFolder,
  onCreateFile,
}: ExpandedViewProps) {
  const [dropOver, setDropOver] = useState(false);
  const visible = entries.filter((e) => !(e.name === '.cache' && e.isDir));
  const files = visible.filter((e) => !e.isDir);
  const folders = visible.filter((e) => e.isDir);
  const previewFiles = files.filter(isPreviewableInExpanded);
  const otherFiles = files.filter((e) => !isPreviewableInExpanded(e));

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isInternalDrag(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      setDropOver(false);
      const { path: srcPath } = JSON.parse(raw) as { path: string };
      const srcDir = parentDir(srcPath);
      if (srcDir !== currentPath) {
        onMove(srcPath, currentPath);
      }
    },
    [currentPath, onMove]
  );

  if (files.length === 0 && folders.length === 0) {
    return (
      <div className="space-y-3">
        <InlineCreateBar
          dirPath={currentPath}
          onCreateFolder={onCreateFolder}
          onCreateFile={onCreateFile}
        />
        <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current-folder drop zone + create actions */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors',
          dropOver ? 'border-primary bg-primary/5' : 'border-border/50'
        )}
        onDragEnter={(e) => {
          if (isInternalDrag(e.dataTransfer)) {
            e.preventDefault();
            setDropOver(true);
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false);
        }}
        onDrop={handleDrop}
      >
        <span className="flex-1">
          {dropOver ? 'Drop here to move to this folder' : 'Drag items between folders to move them'}
        </span>
        <InlineCreateButtons
          dirPath={currentPath}
          onCreateFolder={onCreateFolder}
          onCreateFile={onCreateFile}
        />
      </div>

      {previewFiles.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))] gap-3">
          {previewFiles.map((file) => (
            <DraggableItem key={file.path} entry={file}>
              <GalleryGridItem
                entry={file}
                root={root}
                onNavigate={onNavigate}
                onFileClick={onFileClick}
                onRename={onRename}
                onDelete={onDelete}
                onDownload={onDownload}
                hasCache={hasCache}
                compact
              />
            </DraggableItem>
          ))}
        </div>
      )}
      {otherFiles.length > 0 && (
        <FilesTable
          files={otherFiles}
          onFileClick={onFileClick}
          onRename={onRename}
          onDelete={onDelete}
          onDownload={onDownload}
        />
      )}

      {folders.map((folder) => (
        <DraggableItem key={folder.path} entry={folder}>
          <LazyFolderSection
            folder={folder}
            root={root}
            onNavigate={onNavigate}
            onFileClick={onFileClick}
            onRename={onRename}
            onDelete={onDelete}
            onDownload={onDownload}
            onMove={onMove}
            onFileDrop={onFileDrop}
            onCreateFolder={onCreateFolder}
            onCreateFile={onCreateFile}
            depth={0}
          />
        </DraggableItem>
      ))}
    </div>
  );
}

/** Compact inline create buttons that expand into an input when clicked. */
function InlineCreateButtons({
  dirPath,
  onCreateFolder,
  onCreateFile,
}: {
  dirPath: string;
  onCreateFolder: (dirPath: string, name: string) => void;
  onCreateFile: (dirPath: string, name: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'folder' | 'file'>('idle');
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'idle') inputRef.current?.focus();
  }, [mode]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.includes('/')) return;
    if (mode === 'folder') onCreateFolder(dirPath, trimmed);
    else if (mode === 'file') onCreateFile(dirPath, trimmed);
    setName('');
    setMode('idle');
  };

  const cancel = () => {
    setName('');
    setMode('idle');
  };

  if (mode !== 'idle') {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') cancel();
          }}
          placeholder={mode === 'folder' ? 'Folder name' : 'filename.ext'}
          className="h-6 w-36 text-xs"
        />
        <Button variant="ghost" size="icon-xs" onClick={submit} disabled={!name.trim()}>
          <ChevronRight className="size-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={cancel}>
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setMode('file')}
        aria-label="New file"
        title="New file"
      >
        <FilePlus2 className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setMode('folder')}
        aria-label="New folder"
        title="New folder"
      >
        <FolderPlus className="size-3.5" />
      </Button>
    </div>
  );
}

/** Full-width create bar shown when a folder is empty. */
function InlineCreateBar({
  dirPath,
  onCreateFolder,
  onCreateFile,
}: {
  dirPath: string;
  onCreateFolder: (dirPath: string, name: string) => void;
  onCreateFile: (dirPath: string, name: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
      <span>Create:</span>
      <InlineCreateButtons dirPath={dirPath} onCreateFolder={onCreateFolder} onCreateFile={onCreateFile} />
    </div>
  );
}

function DraggableItem({
  entry,
  children,
}: {
  entry: ResourceEntry;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ path: entry.path }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="min-w-0"
    >
      {children}
    </div>
  );
}

interface LazyFolderSectionProps {
  folder: ResourceEntry;
  root: string;
  onNavigate: (path: string) => void;
  onFileClick: (entry: { path: string; name: string }) => void;
  onRename: (entry: { path: string; name: string }) => void;
  onDelete: (entry: { path: string; name: string }) => void;
  onDownload: (path: string) => void;
  onMove: (sourcePath: string, destinationDir: string) => void;
  onFileDrop: (targetPath: string, files: FileList) => void;
  onCreateFolder: (dirPath: string, name: string) => void;
  onCreateFile: (dirPath: string, name: string) => void;
  depth: number;
}

function LazyFolderSection({
  folder,
  root,
  onNavigate,
  onFileClick,
  onRename,
  onDelete,
  onDownload,
  onMove,
  onFileDrop,
  onCreateFolder,
  onCreateFile,
  depth,
}: LazyFolderSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [uploadDropOver, setUploadDropOver] = useState(false);

  const { data, isLoading } = useResourceList(expanded ? root : null, folder.path);

  const entries = data?.entries ?? [];
  const hasCache = entries.some((e) => e.name === '.cache' && e.isDir);
  const visible = entries.filter((e) => !(e.name === '.cache' && e.isDir));
  const files = visible.filter((e) => !e.isDir);
  const folders = visible.filter((e) => e.isDir);
  const previewFiles = files.filter(isPreviewableInExpanded);
  const otherFiles = files.filter((e) => !isPreviewableInExpanded(e));

  const handleHeaderDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (isInternalDrag(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        setDropOver(true);
      } else if (isExternalFileDrag(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        setUploadDropOver(true);
      }
    },
    []
  );

  const handleHeaderDragOver = useCallback(
    (e: React.DragEvent) => {
      if (isInternalDrag(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      } else if (isExternalFileDrag(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    []
  );

  const handleHeaderDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropOver(false);
        setUploadDropOver(false);
      }
    },
    []
  );

  const handleHeaderDrop = useCallback(
    (e: React.DragEvent) => {
      // Internal move
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (raw) {
        e.preventDefault();
        e.stopPropagation();
        setDropOver(false);
        const { path: srcPath } = JSON.parse(raw) as { path: string };
        if (srcPath === folder.path || folder.path.startsWith(srcPath + '/')) return;
        const srcDir = parentDir(srcPath);
        if (srcDir !== folder.path) {
          onMove(srcPath, folder.path);
        }
        return;
      }

      // External file upload
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setUploadDropOver(false);
        onFileDrop(folder.path, files);
      }
    },
    [folder.path, onMove, onFileDrop]
  );

  const isHighlighted = dropOver || uploadDropOver;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors',
        isHighlighted
          ? 'border-primary ring-2 ring-primary/30'
          : depth === 0
            ? 'border-border'
            : 'border-border/50'
      )}
    >
      <div
        className={cn(
          'flex cursor-pointer items-center gap-1 px-3 py-2 transition-colors',
          dropOver ? 'bg-primary/10' : uploadDropOver ? 'bg-green-500/10' : 'bg-muted/40 hover:bg-muted/60'
        )}
        onClick={() => setExpanded((v) => !v)}
        onDragEnter={handleHeaderDragEnter}
        onDragOver={handleHeaderDragOver}
        onDragLeave={handleHeaderDragLeave}
        onDrop={handleHeaderDrop}
      >
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <Folder className="size-4 text-primary" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(folder.path);
          }}
          className="text-sm font-medium hover:underline"
        >
          {folder.name}
        </button>
        <span className="ml-auto flex items-center gap-2">
          {uploadDropOver && (
            <span className="text-xs text-green-600">Drop to upload here</span>
          )}
          {dropOver && (
            <span className="text-xs text-primary">Drop to move here</span>
          )}
          {!isHighlighted && expanded && data && (
            <span className="text-xs text-muted-foreground">
              {files.length} {files.length === 1 ? 'file' : 'files'}
              {folders.length > 0 &&
                `, ${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`}
            </span>
          )}
          {expanded && (
            <InlineCreateButtons
              dirPath={folder.path}
              onCreateFolder={onCreateFolder}
              onCreateFile={onCreateFile}
            />
          )}
        </span>
      </div>

      {expanded && (
        <div className="p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="ml-2 text-xs">Loading...</span>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
          ) : (
            <div className="space-y-3">
              {previewFiles.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))] gap-3">
                  {previewFiles.map((file) => (
                    <DraggableItem key={file.path} entry={file}>
                      <GalleryGridItem
                        entry={file}
                        root={root}
                        onNavigate={onNavigate}
                        onFileClick={onFileClick}
                        onRename={onRename}
                        onDelete={onDelete}
                        onDownload={onDownload}
                        hasCache={hasCache}
                        compact
                      />
                    </DraggableItem>
                  ))}
                </div>
              )}
              {otherFiles.length > 0 && (
                <FilesTable
                  files={otherFiles}
                  onFileClick={onFileClick}
                  onRename={onRename}
                  onDelete={onDelete}
                  onDownload={onDownload}
                />
              )}

              {folders.map((sub) => (
                <DraggableItem key={sub.path} entry={sub}>
                  <LazyFolderSection
                    folder={sub}
                    root={root}
                    onNavigate={onNavigate}
                    onFileClick={onFileClick}
                    onRename={onRename}
                    onDelete={onDelete}
                    onDownload={onDownload}
                    onMove={onMove}
                    onFileDrop={onFileDrop}
                    onCreateFolder={onCreateFolder}
                    onCreateFile={onCreateFile}
                    depth={depth + 1}
                  />
                </DraggableItem>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilesTable({
  files,
  onFileClick,
  onRename,
  onDelete,
  onDownload,
}: {
  files: ResourceEntry[];
  onFileClick: (entry: { path: string; name: string }) => void;
  onRename: (entry: { path: string; name: string }) => void;
  onDelete: (entry: { path: string; name: string }) => void;
  onDownload: (path: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-2 text-left font-medium">Name</th>
            <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Type</th>
            <th className="hidden px-4 py-2 text-right font-medium md:table-cell">Size</th>
            <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Modified</th>
            <th className="w-28 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.path}
              className="border-b border-border/50 last:border-b-0 hover:bg-accent/30 cursor-pointer"
              onClick={() => onFileClick(file)}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ path: file.path }));
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <File className="size-4 text-muted-foreground shrink-0" />
                  <span className="min-w-0 truncate">{file.name}</span>
                </div>
              </td>
              <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
                File
              </td>
              <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                {file.size != null ? formatSize(file.size) : '—'}
              </td>
              <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
                {file.mtime != null ? formatMtime(file.mtime) : '—'}
              </td>
              <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRename(file)}
                    aria-label={`Rename ${file.name}`}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDelete(file)}
                    aria-label={`Delete ${file.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDownload(file.path)}
                    aria-label={`Download ${file.name}`}
                  >
                    <Download className="size-3" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parentDir(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.length > 0 ? parts.join('/') : '.';
}
