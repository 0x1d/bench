import { useState } from 'react';
import { Plus, Play, Trash2, Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFlowList,
  createFlow,
  deleteFlow,
  runFlow,
  type Flow,
} from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
    mutationFn: () =>
      createFlow({ name: 'New flow', steps: [], edges: [] }),
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
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <Plus className="size-4 mr-2" />
          New flow
        </Button>
      </div>

      {runResult && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 shadow-sm',
            runResult.startsWith('Error')
              ? 'border-destructive bg-destructive/10 text-destructive'
              : 'border-border bg-card'
          )}
        >
          <pre className="whitespace-pre-wrap text-sm">{runResult}</pre>
        </div>
      )}

      {flows.length === 0 ? (
        <p className="text-muted-foreground">No flows yet. Create one to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-medium truncate">{flow.name || flow.id}</h3>
                {flow.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {flow.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRun(flow)}
                  title="Run flow"
                >
                  <Play className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.hash = `#flows/${flow.id}`)}
                  title="Edit flow"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteTarget(flow)}
                  title="Delete flow"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete flow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name || deleteTarget?.id}&quot;?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
