import { useCallback, useEffect, useState } from 'react';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';
import { Trash2, X, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextPanel } from '@/components/context-panel';
import { useFlowView } from '@/contexts/flow-view-context';
import { FlowStepPanelContent } from '@/components/flow-step-panel-content';
import { FlowModulePanelContent } from '@/components/flow-module-panel-content';
import { FlowExecutionLog } from '@/components/flow-execution-log';
import { useQuery } from '@tanstack/react-query';
import { fetchStatus, fetchRestList } from '@/services/api';
import { cn, normalizeStepName } from '@/lib/utils';

const STORAGE_KEY = 'bench-flow-step-panel-width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 500;

type PanelTab = 'config' | 'execution';

export function FlowStepPanel() {
  const {
    selectedStep,
    setSelectedStep,
    onStepSave,
    onDeleteStep,
    executionId,
    setExecutionId,
    flow,
    flowWorkspace,
    flowModule,
    moduleEditPath,
    setModuleEditPath,
  } = useFlowView();
  const [activeTab, setActiveTab] = useState<PanelTab>('config');

  const isExpanded =
    selectedStep != null || executionId != null || moduleEditPath != null;

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

  const handleClose = useCallback(() => {
    setSelectedStep(null);
    setExecutionId(null);
    setModuleEditPath(null);
    setActiveTab('config');
  }, [setSelectedStep, setExecutionId, setModuleEditPath]);

  useEffect(() => {
    const onBenchClose = () => handleClose();
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
  }, [handleClose]);

  const panelTitle = moduleEditPath
    ? `Edit module — ${moduleEditPath}`
    : executionId && !selectedStep
      ? 'Execution Log'
      : activeTab === 'execution'
        ? selectedStep
          ? `Execution — ${selectedStep.label || selectedStep.id}`
          : 'Execution Log'
        : selectedStep
          ? `Configure — ${selectedStep.label || selectedStep.id}`
          : 'Step';

  const showTabs = executionId != null && selectedStep != null && !moduleEditPath;

  const panelContent = () => (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <span
          className="truncate text-sm font-medium flex items-center gap-2"
          title={panelTitle}
        >
          {(activeTab === 'execution' || (executionId && !selectedStep)) && (
            <Terminal className="size-4 text-primary" />
          )}
          {panelTitle}
        </span>
        <div className="flex items-center gap-1">
          {!moduleEditPath && activeTab === 'config' && selectedStep && (
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

      {showTabs && (
        <div className="flex border-b border-border shrink-0">
          <button
            type="button"
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
            type="button"
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
        {moduleEditPath && (
          <FlowModulePanelContent
            modulePath={moduleEditPath}
            onClose={handleClose}
          />
        )}
        {!moduleEditPath && selectedStep && (activeTab === 'config' || !executionId) && (
          <FlowStepPanelContent
            key={selectedStep.id}
            step={selectedStep}
            flow={flow}
            flowModule={flowModule ?? undefined}
            currentFlowId={flow?.id}
            databases={databases}
            restResources={restResources}
            onSave={(updatedStep) => {
              onStepSave?.(updatedStep);
              setSelectedStep(null);
            }}
            onClose={handleClose}
          />
        )}
        {!moduleEditPath && executionId && (activeTab === 'execution' || !selectedStep) && (
          <FlowExecutionLog
            executionId={executionId}
            workspace={flowWorkspace ?? undefined}
            selectedStepId={
              selectedStep
                ? normalizeStepName(selectedStep.label, selectedStep.id)
                : undefined
            }
          />
        )}
        {!moduleEditPath && !executionId && activeTab === 'execution' && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No execution running. Click <strong>Run</strong> to start a flow.
          </div>
        )}
      </div>
    </>
  );

  return (
    <ContextPanel
      expanded={isExpanded}
      storageKey={STORAGE_KEY}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      defaultWidth={360}
    >
      {panelContent()}
    </ContextPanel>
  );
}
