import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ContextPanel } from '@/components/context-panel';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';
import { TriggerForm } from '@/components/resource-config/trigger-form';
import { TriggerList } from '@/components/resource-config/trigger-list';
import {
  fetchTriggerList,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  testTrigger,
  getTriggerWebhookUrl,
  fetchFlowEntries,
  type TriggerState,
  type TriggerEntry,
  type TriggerType,
} from '@/services/api';

type PanelMode = 'add' | 'edit' | null;

export function TriggersPage() {
  const queryClient = useQueryClient();
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [editingTrigger, setEditingTrigger] = useState<TriggerState | null>(null);
  const [triggerToDelete, setTriggerToDelete] = useState<TriggerState | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    type?: TriggerType | 'all';
    workspace?: string | 'all';
  }>({ type: 'all', workspace: 'all' });

  const [triggerDraft, setTriggerDraft] = useState<TriggerEntry>({
    id: '',
    label: '',
    module: '',
    type: 'http',
    config: {},
  });

  const closePanel = () => {
    setPanelMode(null);
    setEditingTrigger(null);
    setPanelError(null);
  };

  // Fetch triggers
  const {
    data: triggerData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['triggers'],
    queryFn: () => fetchTriggerList(),
  });

  // Fetch modules (root + subdirectories)
  const { data: rootEntries } = useQuery({
    queryKey: ['flows', 'entries', ''],
    queryFn: () => fetchFlowEntries(''),
  });

  const modules = ['.', ...(rootEntries?.entries ?? [])
    .filter((e) => e.type === 'module')
    .map((e) => e.name)];

  // Fetch pipelines from root module for the PipelineRefInput
  const { data: rootFlows } = useQuery({
    queryKey: ['flows', ''],
    queryFn: () => fetchFlowEntries(''),
  });
  const availablePipelines = (rootFlows?.entries ?? [])
    .filter((e) => e.type === 'flow')
    .map((e) => ({ id: `pipeline.${e.path}`, name: e.name !== e.path ? e.name : undefined }));

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (entry: TriggerEntry) => createTrigger(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
      closePanel();
      toast.success('Trigger created successfully');
    },
    onError: (err) => {
      setPanelError(err instanceof Error ? err.message : 'Failed to create trigger');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ entry, moduleId }: { entry: TriggerEntry; moduleId: string }) =>
      updateTrigger(moduleId, entry.id, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
      closePanel();
      toast.success('Trigger updated successfully');
    },
    onError: (err) => {
      setPanelError(err instanceof Error ? err.message : 'Failed to update trigger');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (trigger: TriggerState) => deleteTrigger(trigger.module, trigger.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
      setTriggerToDelete(null);
      toast.success('Trigger deleted successfully');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete trigger');
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: async (trigger: TriggerState) => testTrigger(trigger.module, trigger.id),
    onSuccess: (result) => {
      toast.success(result.message || 'Trigger test completed');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to test trigger');
    },
  });

  // Webhook URL mutation
  const webhookMutation = useMutation({
    mutationFn: async (trigger: TriggerState) =>
      getTriggerWebhookUrl(trigger.module, trigger.id),
    onSuccess: (result) => {
      navigator.clipboard.writeText(result.url).then(() => {
        toast.success('Webhook URL copied to clipboard');
      }).catch(() => {
        toast.success(result.url);
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to get webhook URL');
    },
  });

  const handleCopyWebhook = (trigger: TriggerState) => {
    webhookMutation.mutate(trigger);
  };

  useEffect(() => {
    const handleClosePanel = () => {
      if (panelMode != null) {
        closePanel();
      }
    };
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, handleClosePanel);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, handleClosePanel);
  }, [panelMode]);

  const openAdd = () => {
    setTriggerDraft({
      id: '',
      label: '',
      module: '',
      type: 'http',
      config: {},
    });
    setPanelError(null);
    setPanelMode('add');
  };

  const openEdit = (trigger: TriggerState) => {
    setEditingTrigger(trigger);
    setTriggerDraft({
      id: trigger.id,
      label: trigger.label || '',
      module: trigger.module,
      type: trigger.type,
      workspace: trigger.workspace,
      config: trigger.config || {},
    });
    setPanelError(null);
    setPanelMode('edit');
  };

  const handleDelete = (trigger: TriggerState) => {
    setTriggerToDelete(trigger);
  };

  const handleTest = (trigger: TriggerState) => {
    testMutation.mutate(trigger);
  };

  const handleSave = async () => {
    setPanelError(null);

    // Validation
    if (!triggerDraft.id.trim()) {
      setPanelError('Trigger ID is required.');
      return;
    }
    if (!triggerDraft.module.trim()) {
      setPanelError('Module is required.');
      return;
    }

    if (panelMode === 'add') {
      createMutation.mutate(triggerDraft);
    } else if (panelMode === 'edit' && editingTrigger) {
      updateMutation.mutate({ entry: triggerDraft, moduleId: editingTrigger.module });
    }
  };

  const panelOpen = panelMode != null;
  const panelTitle =
    panelMode === 'add' ? 'Add trigger' : panelMode === 'edit' ? 'Edit trigger' : 'Trigger';

  const panelBody = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <div>
          <p className="text-sm font-medium">{panelTitle}</p>
          <p className="text-xs text-muted-foreground">
            Configure trigger to automate flow execution.
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={closePanel} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <TriggerForm
          draft={triggerDraft}
          onChange={setTriggerDraft}
          modules={modules}
          availablePipelines={availablePipelines}
        />
        {panelError && <p className="mt-3 text-sm text-destructive">{panelError}</p>}
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={closePanel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : panelMode === 'add'
                ? 'Add'
                : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );

  const displayError = queryError instanceof Error ? queryError.message : null;

  return (
    <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 w-full flex-1 overflow-auto p-4 md:p-6">
        <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-medium">Flowpipe Triggers</h1>
              <p className="text-sm text-muted-foreground">
                Manage automated triggers for flow execution.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="size-4" />
              Add trigger
            </Button>
          </div>

          {/* Trigger List */}
          <TriggerList
            triggers={triggerData?.triggers || []}
            onEdit={openEdit}
            onDelete={handleDelete}
            onTest={handleTest}
            onWebhook={handleCopyWebhook}
            filters={filters}
            onFilterChange={setFilters}
            loading={isLoading}
          />

          {displayError && <p className="text-sm text-destructive">{displayError}</p>}
        </div>
      </div>

      {/* Side Panel */}
      <ContextPanel
        expanded={panelOpen}
        storageKey="bench-triggers-panel-width"
        minWidth={360}
        maxWidth={600}
        defaultWidth={420}
        mobileVariant="below-header"
      >
        {panelBody}
      </ContextPanel>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={triggerToDelete != null}
        onOpenChange={(open) => !open && setTriggerToDelete(null)}
        title="Delete trigger"
        description={
          triggerToDelete ? `Delete trigger "${triggerToDelete.id}"?` : 'Delete trigger?'
        }
        onConfirm={() => triggerToDelete && deleteMutation.mutate(triggerToDelete)}
        confirmLabel="Delete"
      />
    </div>
  );
}
