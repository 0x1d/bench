import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ContextPanelLayout = 'mobile' | 'desktop';

export interface ContextPanelRenderContext {
  layout: ContextPanelLayout;
  /** Current panel width (persisted per `storageKey`). */
  width: number;
}

const DEFAULT_MIN = 240;
const DEFAULT_MAX = 800;

function getInitialWidth(
  storageKey: string,
  min: number,
  max: number,
  defaultWidth?: number
): number {
  if (typeof window === 'undefined') return defaultWidth ?? 320;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  }
  if (defaultWidth != null) return Math.min(max, Math.max(min, defaultWidth));
  const quarterWidth = Math.round(window.innerWidth / 4);
  return Math.min(max, Math.max(min, quarterWidth));
}

export interface ContextPanelProps {
  /** When false, desktop column collapses to 0 width; mobile overlay is hidden. */
  expanded: boolean;
  /** Persists width in localStorage. */
  storageKey: string;
  minWidth?: number;
  maxWidth?: number;
  /** Used when nothing is stored yet (defaults to quarter-viewport if omitted). */
  defaultWidth?: number;
  /**
   * `fullscreen` — `fixed inset-0` (database, file viewer, flows).
   * `below-header` — leaves space under the app header (configuration, schema preview).
   */
  mobileVariant?: 'fullscreen' | 'below-header';
  className?: string;
  children: ReactNode | ((ctx: ContextPanelRenderContext) => ReactNode);
}

/**
 * Shared right-hand **context panel** shell: resizable column on large screens,
 * overlay on small screens. Matches {@link FileViewer} / {@link DatabasePanel}
 * layout and chrome (sidebar colors, resize handle, collapse behavior).
 */
export function ContextPanel({
  expanded,
  storageKey,
  minWidth = DEFAULT_MIN,
  maxWidth = DEFAULT_MAX,
  defaultWidth,
  mobileVariant = 'fullscreen',
  className,
  children,
}: ContextPanelProps) {
  const [width, setWidth] = useState(() =>
    getInitialWidth(storageKey, minWidth, maxWidth, defaultWidth)
  );
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      const onMove = (moveEvent: MouseEvent) => {
        const delta = startXRef.current - moveEvent.clientX;
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, startWidthRef.current + delta)
        );
        setWidth(next);
        localStorage.setItem(storageKey, String(next));
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
    },
    [width, maxWidth, minWidth, storageKey]
  );

  const renderInner = (layout: ContextPanelLayout) =>
    typeof children === 'function'
      ? children({ layout, width })
      : children;

  const mobileShellClass =
    mobileVariant === 'fullscreen'
      ? 'fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden border-l lg:hidden'
      : 'fixed inset-x-0 bottom-0 top-[var(--header-height)] z-30 flex min-h-0 flex-col overflow-hidden border-l lg:hidden';

  return (
    <>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground',
          mobileShellClass,
          expanded ? 'translate-x-0' : 'hidden',
          className
        )}
      >
        {renderInner('mobile')}
      </div>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground relative hidden h-full min-h-0 flex-col overflow-hidden border-l lg:flex',
          expanded ? 'shrink-0' : 'w-0 min-w-0 shrink-0',
          className
        )}
        style={
          expanded
            ? ({ width: `${width}px`, minWidth: `${width}px` } as React.CSSProperties)
            : undefined
        }
      >
        {expanded && (
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
        {renderInner('desktop')}
      </div>
    </>
  );
}
