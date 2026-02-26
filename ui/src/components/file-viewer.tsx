import { useCallback, useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileView } from '@/contexts/file-view-context';
import { downloadFile } from '@/services/api';
import { getSyntaxLanguage } from '@/lib/syntax-language';
import { prettyPrint } from '@/lib/text-format';
import { cn } from '@/lib/utils';

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

export function FileViewer() {
  const { viewedFile, setViewedFile } = useFileView();
  const [content, setContent] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(getInitialWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const isExpanded = viewedFile != null;

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
      setError(null);
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [viewedFile]);

  const handleClose = () => {
    setViewedFile(null);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
  };

  return (
    <div
      className={cn(
        'bg-sidebar text-sidebar-foreground relative hidden flex-col border-l overflow-hidden lg:flex min-h-0',
        isExpanded ? 'shrink-0' : 'w-0 min-w-0 shrink-0'
      )}
      style={
        isExpanded
          ? ({ width: `${width}px`, minWidth: `${width}px` } as React.CSSProperties)
          : undefined
      }
    >
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
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <span className="truncate text-sm font-medium" title={viewedFile?.name ?? ''}>
          {viewedFile?.name ?? 'Preview'}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClose}
          aria-label="Close viewer"
        >
          <X className="size-4" />
        </Button>
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
              <SyntaxHighlighter
                language={getSyntaxLanguage(viewedFile.name)}
                style={oneDark}
                showLineNumbers
                wrapLongLines
                customStyle={{
                  margin: 0,
                  padding: '0.75rem',
                  fontSize: '0.75rem',
                  background: 'transparent',
                }}
                codeTagProps={{ style: { fontFamily: 'ui-monospace, monospace' } }}
              >
                {content}
              </SyntaxHighlighter>
            )}
            {viewedFile.type === 'image' && objectUrl && (
              <img
                src={objectUrl}
                alt={viewedFile.name}
                className="max-h-full max-w-full object-contain"
              />
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
    </div>
  );
}
