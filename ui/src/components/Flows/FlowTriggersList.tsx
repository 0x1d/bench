import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TriggerForm } from '@/components/resource-config/trigger-form';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import {
  fetchTriggerList,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  testTrigger,
  type TriggerState,
  type TriggerEntry,
  type TriggerType,
} from '@/services/api';

interface FlowTriggersListProps {
  flowId: string;
  workspace?: string;
}

const TRIGGER_TYPE_COLORS: Record<TriggerType, string> = {
  webhook: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  schedule: 'bg-green-500/20 text-green-400 border-green-500/30',
  alert: 'bg-red-500/20 text-red-400 border-red-500/30',
  http: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  notification: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  ready: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  paused: 'bg-gray-500/20 text-gray-400',
};

export function FlowTriggersList({ flowId, workspace }: FlowTriggersListProps) {
  const queryClient = useQueryClient();
  const [editingTrigger, setEditingTrigger] = useState<TriggerState | null>(null);
  const [triggerToDelete, setTriggerToDelete] = useState<TriggerState | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [filterType, setFilterType] = useState<TriggerType | 'all'>('all');
  const [formError, setFormError] = useState<string | null>(null);

  const [triggerDraft, setTriggerDraft] = useState<TriggerEntry>({
    id: '',
    label: '',
    flow: flowId,
    type: 'webhook',
    config: {},
  });

  const {
    data: triggerData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['triggers', flowId],
    queryFn: () => fetchTriggerList(workspace, flowId),
  });

  const createMutation = useMutation({
    mutationFn: async (entry: TriggerEntry) => createTrigger(entry.flow, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers', flowId] });
      setAddMode(false);
      setFormError(null);
      resetDraft();
      toast.success('Trigger created');
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Failed to create trigger');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ entry, flowId }: { entry: TriggerEntry; flowId: string }) =>
      updateTrigger(flowId, entry.id, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers', flowId] });
      setEditingTrigger(null);
      setFormError(null);
      toast.success('Trigger updated');
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Failed to update trigger');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (trigger: TriggerState) => deleteTrigger(trigger.flow, trigger.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers', flowId] });
      setTriggerToDelete(null);
      toast.success('Trigger deleted');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete trigger');
    },
  });

  const testMutation = useMutation({
    mutationFn: async (trigger: TriggerState) => testTrigger(trigger.flow, trigger.id),
    onSuccess: (result) => {
      toast.success(result.message || 'Trigger test completed');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to test trigger');
    },
  });

  const resetDraft = () => {
    setTriggerDraft({
      id: '',
      label: '',
      flow: flowId,
      type: 'webhook',
      config: {},
    });
  };

  const openAdd = () => {
    resetDraft();
    setFormError(null);
    setAddMode(true);
  };

  const openEdit = (trigger: TriggerState) => {
    setEditingTrigger(trigger);
    setTriggerDraft({
      id: trigger.id,
      label: trigger.label || '',
      flow: trigger.flow,
      type: trigger.type,
      workspace: trigger.workspace,
      config: trigger.config || {},
    });
    setFormError(null);
  };

  const handleSave = () => {
    setFormError(null);

    if (!triggerDraft.id.trim()) {
      setFormError('Trigger ID is required.');
      return;
    }

    if (addMode) {
      createMutation.mutate(triggerDraft);
    } else if (editingTrigger) {
      updateMutation.mutate({ entry: triggerDraft, flowId: editingTrigger.flow });
    }
  };

  const handleCancel = () => {
    setAddMode(false);
    setEditingTrigger(null);
    setFormError(null);
    resetDraft();
  };

  const handleTest = (trigger: TriggerState) => {
    testMutation.mutate(trigger);
  };

  const triggers = triggerData?.triggers || [];
  const filteredTriggers = triggers.filter((t) =>
    filterType === 'all' ? true : t.type === filterType
  );

  const triggerTypes: TriggerType[] = [
    'webhook',
    'schedule',
    'alert',
    'http',
    'notification',
  ];

  const displayError = queryError instanceof Error ? queryError.message : null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <h3 className="text-sm font-medium">Triggers</h3>
          {triggers.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {triggers.length}
            </span>
          )}
        </div>
        {!addMode && !editingTrigger && (
          <Button variant="ghost" size="icon-xs" onClick={openAdd} title="Add trigger">
            <Plus className="size-3" />
          </Button>
        )}
      </div>

      {/* Inline Add/Edit Form */}
      {(addMode || editingTrigger) && (
        <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
          <p className="text-xs text-muted-foreground">
            {addMode ? 'Add new trigger' : `Edit: ${editingTrigger?.id}`}
          </p>
          <TriggerForm
            draft={triggerDraft}
            onChange={setTriggerDraft}
          />
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : addMode ? 'Add' : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Filter */}
      {triggers.length > 1 && !addMode && !editingTrigger && (
        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as TriggerType | 'all')}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {triggerTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <p className="text-xs text-muted-foreground">Loading triggers...</p>
      )}
      {displayError && (
        <p className="text-xs text-destructive">{displayError}</p>
      )}

      {/* Trigger List */}
      {!isLoading && !addMode && !editingTrigger && (
        <>
          {filteredTriggers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {triggers.length === 0
                  ? 'No triggers configured for this flow.'
                  : 'No triggers match the selected filter.'}
              </p>
              {triggers.length === 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={openAdd}
                >
                  Add your first trigger
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredTriggers.map((trigger) => (
                <div
                  key={trigger.id}
                  className="group rounded-md border border-border/50 bg-card/30 px-3 py-2 transition-colors hover:bg-accent/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-mono font-medium">
                          {trigger.id}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-medium',
                            TRIGGER_TYPE_COLORS[trigger.type]
                          )}
                        >
                          {trigger.type}
                        </span>
                      </div>
                      {trigger.label && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {trigger.label}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span
                          className={cn(
                            'rounded px-1 py-0.5',
                            STATUS_COLORS[trigger.status || 'ready'] || STATUS_COLORS.ready
                          )}
                        >
                          {trigger.status || 'ready'}
                        </span>
                        {trigger.lastRun && (
                          <span>Last run: {new Date(trigger.lastRun).toLocaleDateString()}</span>
                        )}
                        {trigger.nextRun && (
                          <span>Next: {new Date(trigger.nextRun).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleTest(trigger)}
                        disabled={testMutation.isPending}
                        title="Test trigger"
                        className="size-6"
                      >
                        <Play className="size-2.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEdit(trigger)}
                        title="Edit trigger"
                        className="size-6"
                      >
                        <Pencil className="size-2.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setTriggerToDelete(trigger)}
                        title="Delete trigger"
                        className="size-6 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-2.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

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
