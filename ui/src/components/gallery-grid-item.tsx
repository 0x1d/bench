import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Folder, File, Download, Pencil, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useFilePreview } from '@/hooks/use-file-preview';
import { useResourceList } from '@/hooks/use-resources';
import { useFileView } from '@/contexts/file-view-context';
import { downloadFile, fetchResourceList } from '@/services/api';
import { getViewableType } from '@/lib/viewable-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

function stableIndex(path: string, length: number): number {
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = (h * 31 + path.charCodeAt(i)) | 0;
  }
  return ((h % length) + length) % length;
}

interface ResourceEntry {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
}

interface GalleryGridItemProps {
  entry: ResourceEntry;
  root: string;
  onNavigate: (path: string) => void;
  onFileClick: (entry: { path: string; name: string }) => void;
  onRename: (entry: { path: string; name: string }) => void;
  onDelete: (entry: { path: string; name: string }) => void;
  onDownload: (path: string) => void;
  hasCache: boolean;
  compact?: boolean;
  onFolderDrop?: (folderPath: string, files: FileList) => void;
}

export function GalleryGridItem({
  entry,
  root,
  onNavigate,
  onFileClick,
  onRename,
  onDelete,
  onDownload,
  hasCache,
  compact = false,
  onFolderDrop,
}: GalleryGridItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const queryClient = useQueryClient();
  const { viewedFile } = useFileView();
  const isActive =
    viewedFile != null && viewedFile.root === root && viewedFile.path === entry.path;
  const type = getViewableType(entry.name);
  const previewType = type && (type === 'image' || type === 'video' || type === 'text') ? type : null;
  const hasCachedPreview =
    root != null &&
    entry.path != null &&
    previewType != null &&
    queryClient.getQueryData(['resources', 'preview', root, entry.path, hasCache]) != null;
  const { data, isLoading } = useFilePreview(
    root,
    entry.path,
    previewType,
    (isInView || hasCachedPreview) && !entry.isDir,
    hasCache
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data || data.type === 'text') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(data.data as Blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data]);

  // Folder thumbnail: fetch folder contents and pick an image to use as cover
  const { data: folderData } = useResourceList(
    entry.isDir && isInView ? root : null,
    entry.path
  );
  const folderThumbPick = useMemo(() => {
    if (!entry.isDir || !folderData?.entries) return null;
    const images = folderData.entries.filter(
      (e) => !e.isDir && getViewableType(e.name) === 'image'
    );
    if (images.length === 0) return null;
    const folderHasCache = folderData.entries.some(
      (e) => e.name === '.cache' && e.isDir
    );
    return { file: images[stableIndex(entry.path, images.length)], folderHasCache };
  }, [entry.isDir, entry.path, folderData?.entries]);

  const folderThumbType = folderThumbPick ? 'image' as const : null;
  const { data: folderThumbData } = useFilePreview(
    root,
    folderThumbPick?.file.path ?? null,
    folderThumbType,
    folderThumbPick != null,
    folderThumbPick?.folderHasCache ?? false
  );

  const [folderThumbUrl, setFolderThumbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!folderThumbData || folderThumbData.type === 'text') {
      setFolderThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(folderThumbData.data as Blob);
    setFolderThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [folderThumbData]);

  const [videoThumbUrls, setVideoThumbUrls] = useState<string[]>([]);
  const [videoCycleIndex, setVideoCycleIndex] = useState(0);
  const videoCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVideo = previewType === 'video';
  const videoIsFullFile =
    isVideo && data && 'fromCache' in data && data.fromCache === false;

  const allVideoThumbs =
    isVideo && previewUrl ? [previewUrl, ...videoThumbUrls] : [];

  const displayVideoUrl = allVideoThumbs[videoCycleIndex % Math.max(1, allVideoThumbs.length)] ?? previewUrl;
  const showVideoAsFirstFrame = videoIsFullFile && videoCycleIndex === 0;

  const thumbsLoaded = useRef(false);
  const loadExtraVideoThumbs = useCallback(async () => {
    if (!root || !entry.path || !hasCache || thumbsLoaded.current) return;
    thumbsLoaded.current = true;
    try {
      const parts = entry.path.split('/').filter(Boolean);
      const name = parts.pop() ?? entry.path;
      const dir = parts.length > 0 ? parts.join('/') : '.';
      const base = name.replace(/\.[^.]+$/, '');
      const thumbDir = `${dir}/.cache/thumbnails`;
      const prefix = `${base}_thumb_`;

      const listing = await fetchResourceList(root, thumbDir);
      const thumbFiles = listing.entries
        .filter((e) => !e.isDir && e.name.startsWith(prefix) && parseInt(e.name.slice(prefix.length), 10) >= 2)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const urls: string[] = [];
      for (const file of thumbFiles) {
        const blob = await downloadFile(root, file.path);
        urls.push(URL.createObjectURL(blob));
      }
      setVideoThumbUrls((prev) => (prev.length === 0 ? urls : prev));
    } catch {
      // .cache/thumbnails dir may not exist
    }
  }, [root, entry.path, hasCache]);

  useEffect(() => {
    return () => videoThumbUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [videoThumbUrls]);

  const handleVideoHoverStart = useCallback(() => {
    loadExtraVideoThumbs();
    videoCycleRef.current = setInterval(() => {
      setVideoCycleIndex((i) => i + 1);
    }, 800);
  }, [loadExtraVideoThumbs]);

  const handleVideoHoverEnd = useCallback(() => {
    if (videoCycleRef.current) {
      clearInterval(videoCycleRef.current);
      videoCycleRef.current = null;
    }
    setVideoCycleIndex(0);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setIsInView(e.isIntersecting),
      { rootMargin: '100px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [isFolderDragOver, setIsFolderDragOver] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-gallery-actions]')) return;
    if (entry.isDir) {
      onNavigate(entry.path);
    } else {
      onFileClick(entry);
    }
  };

  const showFallback = !entry.isDir && (previewType == null || !data);

  return (
    <div
      ref={containerRef}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md',
        isActive
          ? 'border-primary ring-2 ring-primary/50'
          : isFolderDragOver
            ? 'border-primary ring-2 ring-primary/50 bg-primary/5'
            : 'border-border',
        (entry.isDir || type) && 'cursor-pointer'
      )}
      onClick={handleClick}
      {...(entry.isDir && onFolderDrop
        ? {
            onDragEnter: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setIsFolderDragOver(true);
            },
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'copy';
            },
            onDragLeave: (e: React.DragEvent) => {
              e.preventDefault();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsFolderDragOver(false);
              }
            },
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setIsFolderDragOver(false);
              const files = e.dataTransfer.files;
              if (files.length > 0) onFolderDrop(entry.path, files);
            },
          }
        : {})}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden bg-muted/30',
          compact ? 'aspect-[5/4]' : 'aspect-square'
        )}
      >
        {entry.isDir && (
          folderThumbUrl ? (
            <div className="relative size-full">
              <img
                src={folderThumbUrl}
                alt={entry.name}
                className="size-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-5">
                <Folder className="size-3.5 shrink-0 text-white/90" />
                <span className={cn(
                  'line-clamp-1 font-medium text-white',
                  compact ? 'text-xs' : 'text-sm'
                )}>
                  {entry.name}
                </span>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'flex h-full flex-col items-center justify-center',
                compact ? 'gap-1.5 p-3' : 'gap-2 p-4'
              )}
            >
              <Folder className={compact ? 'size-10 text-primary' : 'size-12 text-primary'} />
              <span
                className={cn(
                  'line-clamp-2 text-center font-medium',
                  compact ? 'text-xs' : 'text-sm'
                )}
              >
                {entry.name}
              </span>
            </div>
          )
        )}

        {!entry.isDir && previewType === 'image' && (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {previewUrl && (
              <img
                src={previewUrl}
                alt={entry.name}
                className="size-full object-cover"
                loading="lazy"
              />
            )}
          </>
        )}

        {!entry.isDir && previewType === 'video' && (
          <div
            className="size-full"
            onMouseEnter={handleVideoHoverStart}
            onMouseLeave={handleVideoHoverEnd}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {displayVideoUrl &&
              (showVideoAsFirstFrame ? (
                <video
                  src={displayVideoUrl}
                  className="size-full object-cover"
                  muted
                  playsInline
                  preload="auto"
                />
              ) : (
                <img
                  src={displayVideoUrl}
                  alt={entry.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
              ))}
          </div>
        )}

        {!entry.isDir && previewType === 'text' && (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {data && data.type === 'text' && (
              <pre className="h-full overflow-auto p-3 text-xs leading-relaxed text-foreground break-words">
                {data.data}
              </pre>
            )}
          </>
        )}

        {showFallback && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <File className="size-12 text-muted-foreground" />
            <span className="line-clamp-2 text-center text-sm font-medium">{entry.name}</span>
          </div>
        )}
      </div>

      <div
        className={cn(
          'border-t border-border text-muted-foreground',
          compact ? 'px-2 py-1.5 text-xs' : 'px-2 py-1.5 text-xs'
        )}
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{entry.name}</span>
            {(entry.size != null || entry.mtime != null) && (
              <span className="ml-1.5">
                {!entry.isDir && entry.size != null && formatSize(entry.size)}
                {!entry.isDir && entry.size != null && entry.mtime != null && ' · '}
                {entry.mtime != null && formatMtime(entry.mtime)}
              </span>
            )}
          </div>
          <div
            data-gallery-actions
            className="flex shrink-0 items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRename(entry)}
              aria-label={`Rename ${entry.name}`}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDelete(entry)}
              aria-label={`Delete ${entry.name}`}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
            {!entry.isDir && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDownload(entry.path)}
                aria-label={`Download ${entry.name}`}
              >
                <Download className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
