import { GalleryGridItem } from './gallery-grid-item';
import { getViewableType } from '@/lib/viewable-types';

interface ResourceEntry {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
}

interface GalleryGridProps {
  entries: ResourceEntry[];
  root: string;
  onNavigate: (path: string) => void;
  onFileClick: (entry: { path: string; name: string }) => void;
  onRename: (entry: { path: string; name: string }) => void;
  onDelete: (entry: { path: string; name: string }) => void;
  onDownload: (path: string) => void;
  hasCache: boolean;
  onFolderDrop?: (folderPath: string, files: FileList) => void;
}

function partitionEntries(entries: ResourceEntry[]) {
  const folders: ResourceEntry[] = [];
  const media: ResourceEntry[] = [];
  const other: ResourceEntry[] = [];
  for (const e of entries) {
    if (e.isDir) folders.push(e);
    else {
      const t = getViewableType(e.name);
      if (t === 'image' || t === 'video') media.push(e);
      else other.push(e);
    }
  }
  return { folders, media, other };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="col-span-full mb-3 mt-5 border-b border-border/60 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      {children}
    </h3>
  );
}

export function GalleryGrid({
  entries,
  root,
  onNavigate,
  onFileClick,
  onRename,
  onDelete,
  onDownload,
  hasCache,
  onFolderDrop,
}: GalleryGridProps) {
  const { folders, media, other } = partitionEntries(entries);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] gap-4">
      {folders.length > 0 && (
        <>
          <SectionHeader>Folders</SectionHeader>
          <div className="col-span-full grid grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))] gap-3">
            {folders.map((entry) => (
              <div key={entry.path} className="min-w-0">
                <GalleryGridItem
                  entry={entry}
                  root={root}
                  onNavigate={onNavigate}
                  onFileClick={onFileClick}
                  onRename={onRename}
                  onDelete={onDelete}
                  onDownload={onDownload}
                  hasCache={hasCache}
                  onFolderDrop={onFolderDrop}
                  compact
                />
            </div>
          ))}
          </div>
        </>
      )}
      {media.length > 0 && (
        <>
          <SectionHeader>Images & videos</SectionHeader>
          {media.map((entry) => (
            <div key={entry.path} className="min-w-0">
              <GalleryGridItem
                entry={entry}
                root={root}
                onNavigate={onNavigate}
                onFileClick={onFileClick}
                onRename={onRename}
                onDelete={onDelete}
                onDownload={onDownload}
                hasCache={hasCache}
              />
            </div>
          ))}
        </>
      )}
      {other.length > 0 && (
        <>
          <SectionHeader>Other files</SectionHeader>
          {other.map((entry) => (
            <div key={entry.path} className="min-w-0">
            <GalleryGridItem
              entry={entry}
              root={root}
              onNavigate={onNavigate}
              onFileClick={onFileClick}
              onRename={onRename}
              onDelete={onDelete}
              onDownload={onDownload}
              hasCache={hasCache}
            />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
