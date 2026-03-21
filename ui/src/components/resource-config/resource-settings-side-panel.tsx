import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextPanel } from '@/components/context-panel';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';

const STORAGE_KEY = 'bench-resource-settings-panel-width';

export interface ResourceSettingsSidePanelProps {
  /** When false, the panel is not rendered. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Optional class for the panel surface (width constraints, etc.). */
  className?: string;
}

/**
 * Right column for add/edit forms on resource settings views. Uses {@link ContextPanel}.
 */
export function ResourceSettingsSidePanel({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  className,
}: ResourceSettingsSidePanelProps) {
  useEffect(() => {
    const onBenchClose = () => onOpenChange(false);
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
  }, [onOpenChange]);

  if (!open) return null;

  return (
    <ContextPanel
      expanded
      storageKey={STORAGE_KEY}
      minWidth={240}
      maxWidth={800}
      className={className}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <div className="min-w-0">
            <h2 className="text-left text-base font-medium leading-tight">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onOpenChange(false)}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden p-4">{children}</div>
          <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-4">{footer}</div>
        </div>
      </div>
    </ContextPanel>
  );
}
