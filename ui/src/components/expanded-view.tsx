import { useState } from 'react';
import { Folder, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { GalleryGridItem } from './gallery-grid-item';
import { useResourceList } from '@/hooks/use-resources';
import { cn } from '@/lib/utils';
import type { ResourceEntry } from '@/services/api';

interface ExpandedViewProps {
  entries: ResourceEntry[];
  root: string;
  hasCache: boolean;
  onNavigate: (path: string) => void;
  onFileClick: (entry: { path: string; name: string }) => void;
  onRename: (entry: { path: string; name: string }) => void;
  onDelete: (entry: { path: string; name: string }) => void;
  onDownload: (path: string) => void;
}

export function ExpandedView({
  entries,
  root,
  hasCache,
  onNavigate,
  onFileClick,
  onRename,
  onDelete,
  onDownload,
}: ExpandedViewProps) {
  const visible = entries.filter((e) => !(e.name === '.cache' && e.isDir));
  const files = visible.filter((e) => !e.isDir);
  const folders = visible.filter((e) => e.isDir);

  if (files.length === 0 && folders.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
    );
  }

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))] gap-3">
          {files.map((file) => (
            <div key={file.path} className="min-w-0">
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
            </div>
          ))}
        </div>
      )}

      {folders.map((folder) => (
        <LazyFolderSection
          key={folder.path}
          folder={folder}
          root={root}
          onNavigate={onNavigate}
          onFileClick={onFileClick}
          onRename={onRename}
          onDelete={onDelete}
          onDownload={onDownload}
          depth={0}
        />
      ))}
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
  depth,
}: LazyFolderSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useResourceList(
    expanded ? root : null,
    folder.path
  );

  const entries = data?.entries ?? [];
  const hasCache = entries.some((e) => e.name === '.cache' && e.isDir);
  const visible = entries.filter((e) => !(e.name === '.cache' && e.isDir));
  const files = visible.filter((e) => !e.isDir);
  const folders = visible.filter((e) => e.isDir);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        depth === 0 ? 'border-border' : 'border-border/50'
      )}
    >
      <div className="flex items-center gap-1 bg-muted/40 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <Folder className="size-4 text-primary" />
        <button
          type="button"
          onClick={() => onNavigate(folder.path)}
          className="text-sm font-medium hover:underline"
        >
          {folder.name}
        </button>
        {expanded && data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {files.length} {files.length === 1 ? 'file' : 'files'}
            {folders.length > 0 &&
              `, ${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`}
          </span>
        )}
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
              {files.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))] gap-3">
                  {files.map((file) => (
                    <div key={file.path} className="min-w-0">
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
                    </div>
                  ))}
                </div>
              )}

              {folders.map((sub) => (
                <LazyFolderSection
                  key={sub.path}
                  folder={sub}
                  root={root}
                  onNavigate={onNavigate}
                  onFileClick={onFileClick}
                  onRename={onRename}
                  onDelete={onDelete}
                  onDownload={onDownload}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
