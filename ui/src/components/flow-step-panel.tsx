import { useCallback, useRef, useState } from 'react';
import { Trash2, X, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFlowView } from '@/contexts/flow-view-context';
import { FlowStepPanelContent } from '@/components/flow-step-panel-content';
import { FlowExecutionLog } from '@/components/flow-execution-log';
import { useQuery } from '@tanstack/react-query';
import { fetchStatus, fetchRestList } from '@/services/api';
import { cn, normalizeStepName } from '@/lib/utils';

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

type PanelTab = 'config' | 'execution';

export function FlowStepPanel() {
  const { selectedStep, setSelectedStep, onStepSave, onDeleteStep, executionId, setExecutionId, flowWorkspace } =
    useFlowView();
  const [width, setWidth] = useState(getInitialWidth);
  const [activeTab, setActiveTab] = useState<PanelTab>('config');
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Show panel when we have a selected step OR an execution to display
  const isExpanded = selectedStep != null || executionId != null;

  // Auto-switch to execution tab when a new execution starts
  const prevExecRef = useRef<string | null>(null);
  if (executionId && executionId !== prevExecRef.current) {
    prevExecRef.current = executionId;
    setActiveTab('execution');
  }

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
    setExecutionId(null);
    setActiveTab('config');
  };

  const panelTitle =
    activeTab === 'execution'
      ? selectedStep
        ? `Execution — ${selectedStep.label || selectedStep.id}`
        : 'Execution Log'
      : selectedStep
        ? `Configure — ${selectedStep.label || selectedStep.id}`
        : 'Step';

  const showTabs = executionId != null;

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
          className="truncate text-sm font-medium flex items-center gap-2"
          title={panelTitle}
        >
          {activeTab === 'execution' && <Terminal className="size-4 text-primary" />}
          {panelTitle}
        </span>
        <div className="flex items-center gap-1">
          {activeTab === 'config' && selectedStep && (
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
          )}
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

      {/* Tabs */}
      {showTabs && (
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveTab('config')}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              activeTab === 'config'
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Configure
          </button>
          <button
            onClick={() => setActiveTab('execution')}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
              activeTab === 'execution'
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Terminal className="size-3" />
            Execution
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {activeTab === 'config' && selectedStep && (
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
        {activeTab === 'execution' && executionId && (
          <FlowExecutionLog executionId={executionId} workspace={flowWorkspace ?? undefined} selectedStepId={selectedStep ? normalizeStepName(selectedStep.label, selectedStep.id) : undefined} />
        )}
        {activeTab === 'execution' && !executionId && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No execution running. Click <strong>Run</strong> to start a flow.
          </div>
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
