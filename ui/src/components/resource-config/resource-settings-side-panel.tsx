import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface ResourceSettingsSidePanelProps {
  /** When false, the sheet is closed and not interactive. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Optional class for the sheet surface (width, etc.). */
  className?: string;
}

/**
 * Right-side sheet for add/edit forms on resource Settings tabs. Matches Bench side-panel
 * patterns (header title, close, scroll body, footer actions).
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          'flex h-full w-full flex-col gap-0 overflow-hidden border-l p-0 sm:max-w-[min(640px,92vw)]',
          className
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <div className="min-w-0">
            <SheetTitle className="text-left text-base font-medium leading-tight">{title}</SheetTitle>
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
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">{children}</div>
        <div className="shrink-0 border-t border-border bg-background p-4">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}
