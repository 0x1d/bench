import { useCallback, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFlowView } from '@/contexts/flow-view-context';
import { FlowStepPanelContent } from '@/components/flow-step-panel-content';
import { useQuery } from '@tanstack/react-query';
import { fetchStatus, fetchRestList } from '@/services/api';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'bench-flow-step-panel-width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 500;

function getInitialWidth(): number {
  if (typeof window === 'undefined') return 360;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  }
  return 360;
}

export function FlowStepPanel() {
  const { selectedStep, setSelectedStep, onStepSave, onDeleteStep } = useFlowView();
  const [width, setWidth] = useState(getInitialWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const isExpanded = selectedStep != null;

  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: () => fetchStatus(),
  });
  const { data: restData } = useQuery({
    queryKey: ['rest', 'list'],
    queryFn: () => fetchRestList(),
  });

  const databases =
    statusData?.database?.databases?.map((d) => ({
      id: d.id,
      label: d.label,
    })) ?? [];
  const restResources = restData?.resources ?? [];

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidthRef.current + delta)
      );
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

  const handleClose = () => {
    setSelectedStep(null);
  };

  const panelTitle = selectedStep
    ? `Configure — ${selectedStep.label || selectedStep.id}`
    : 'Step';

  const panelContent = () => (
    <>
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
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <span
          className="truncate text-sm font-medium"
          title={panelTitle}
        >
          {panelTitle}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              if (selectedStep && onDeleteStep) {
                onDeleteStep(selectedStep.id);
                setSelectedStep(null);
              }
            }}
            disabled={!onDeleteStep}
            aria-label="Delete step"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClose}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {selectedStep && (
          <FlowStepPanelContent
            step={selectedStep}
            databases={databases}
            restResources={restResources}
            onSave={(updatedStep) => {
              onStepSave?.(updatedStep);
              setSelectedStep(null);
            }}
            onClose={handleClose}
          />
        )}
      </div>
    </>
  );

  return (
    <>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden border-l lg:hidden',
          isExpanded ? 'translate-x-0' : 'hidden'
        )}
      >
        {panelContent()}
      </div>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground relative hidden min-h-0 flex-col overflow-hidden border-l lg:flex',
          isExpanded ? 'shrink-0' : 'w-0 min-w-0 shrink-0'
        )}
        style={
          isExpanded
            ? ({ width: `${width}px`, minWidth: `${width}px` } as React.CSSProperties)
            : undefined
        }
      >
        {panelContent()}
      </div>
    </>
  );
}
