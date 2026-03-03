import { useState } from 'react';
import { Plus, Play, Trash2, Pencil, Workflow } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFlowList,
  createFlow,
  deleteFlow,
  runFlow,
  type Flow,
} from '@/services/api';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';

export function FlowsPage() {
  const [deleteTarget, setDeleteTarget] = useState<Flow | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['flows'],
    queryFn: () => fetchFlowList(),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const inputId = `step_input_${Date.now()}`;
      return createFlow({
        name: 'New flow',
        steps: [
          {
            id: inputId,
            type: 'input',
            label: 'Input',
            config: { params: [] },
          },
        ],
        edges: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFlow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      setDeleteTarget(null);
    },
  });

  const flows = data?.flows ?? [];

  async function handleRun(flow: Flow) {
    setRunResult(null);
    try {
      const resp = await runFlow(flow.id);
      const text = await resp.text();
      if (resp.ok) {
        setRunResult(text || 'Flow completed successfully.');
      } else {
        setRunResult(`Error: ${text || resp.statusText}`);
      }
    } catch (e) {
      setRunResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading flows...</p>;
  }

  if (error) {
    return (
      <p className="text-destructive">
        {error instanceof Error ? error.message : 'Failed to load flows'}
      </p>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <span className="rounded px-2 py-1 font-medium">Flows</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            New flow
          </Button>
        </div>
      </div>

      {runResult && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3',
            runResult.startsWith('Error')
              ? 'border-destructive/50 bg-destructive/10 text-destructive'
              : 'border-border bg-card'
          )}
        >
          <pre className="whitespace-pre-wrap text-sm">{runResult}</pre>
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-auto">
        {flows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Workflow className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No flows yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a flow to get started
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              <Plus className="size-4 mr-2" />
              New flow
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-left font-medium">Steps</th>
                  <th className="w-28 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {flows.map((flow) => (
                  <tr
                    key={flow.id}
                    onClick={() => (window.location.hash = `#flows/${flow.id}`)}
                    className="border-b border-border/50 last:border-b-0 cursor-pointer transition-colors hover:bg-accent/30"
                  >
                    <td className="px-4 py-2 font-medium">{flow.name || flow.id}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">
                      {flow.description || '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRun(flow);
                          }}
                          aria-label="Run flow"
                        >
                          <Play className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.hash = `#flows/${flow.id}`;
                          }}
                          aria-label="Edit flow"
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(flow);
                          }}
                          aria-label="Delete flow"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete flow"
        description={`Are you sure you want to delete "${deleteTarget?.name || deleteTarget?.id}"? This cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
