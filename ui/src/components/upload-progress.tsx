import { useEffect, useState } from 'react';
import { Upload, Check, AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useUpload } from '@/contexts/upload-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadProgress() {
  const { uploads, clearCompleted } = useUpload();
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  const active = uploads.filter((u) => u.status === 'uploading');
  const done = uploads.filter((u) => u.status === 'done');
  const failed = uploads.filter((u) => u.status === 'error');
  const hasItems = uploads.length > 0;

  useEffect(() => {
    if (active.length > 0) {
      setVisible(true);
      setCollapsed(false);
    }
  }, [active.length]);

  // Auto-hide after all uploads complete
  useEffect(() => {
    if (hasItems && active.length === 0) {
      const t = setTimeout(() => {
        setVisible(false);
        clearCompleted();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [hasItems, active.length, clearCompleted]);

  if (!visible || !hasItems) return null;

  const totalLoaded = uploads.reduce((s, u) => s + u.loaded, 0);
  const totalSize = uploads.reduce((s, u) => s + u.total, 0);
  const overallPct = totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;

  return (
    <div className="fixed right-4 top-16 z-50 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      {/* Header */}
      <div
        className="flex items-center gap-2 bg-muted/50 px-3 py-2 cursor-pointer"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Upload className="size-4 text-primary" />
        <span className="flex-1 text-sm font-medium">
          {active.length > 0
            ? `Uploading ${active.length} ${active.length === 1 ? 'file' : 'files'}...`
            : failed.length > 0
              ? `${failed.length} failed, ${done.length} done`
              : `${done.length} uploaded`}
        </span>
        {active.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{overallPct}%</span>
        )}
        {collapsed ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="size-4 text-muted-foreground" />
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            clearCompleted();
          }}
          aria-label="Dismiss"
        >
          <X className="size-3" />
        </Button>
      </div>

      {/* Overall progress bar */}
      {active.length > 0 && (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      )}

      {/* File list */}
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-2 border-t border-border/50 px-3 py-1.5"
            >
              {u.status === 'uploading' && (
                <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
              {u.status === 'done' && (
                <Check className="size-4 shrink-0 text-green-500" />
              )}
              {u.status === 'error' && (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{u.filename}</p>
                {u.status === 'uploading' && (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <div className="h-1 flex-1 rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full bg-primary transition-all duration-200'
                        )}
                        style={{
                          width: `${u.total > 0 ? Math.round((u.loaded / u.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {formatBytes(u.loaded)}/{formatBytes(u.total)}
                    </span>
                  </div>
                )}
                {u.status === 'error' && (
                  <p className="truncate text-[10px] text-destructive">{u.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
