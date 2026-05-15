import { Pencil, Play, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TriggerState, TriggerType } from '@/services/api';
import { cn } from '@/lib/utils';

interface TriggerListProps {
  triggers: TriggerState[];
  onEdit: (trigger: TriggerState) => void;
  onDelete: (trigger: TriggerState) => void;
  onTest?: (trigger: TriggerState) => void;
  onWebhook?: (trigger: TriggerState) => void;
  filters?: {
    type?: TriggerType | 'all';
    workspace?: string | 'all';
  };
  onFilterChange?: (filters: { type?: TriggerType | 'all'; workspace?: string | 'all' }) => void;
  loading?: boolean;
}

const TRIGGER_TYPE_COLORS: Record<TriggerType, string> = {
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

export function TriggerList({
  triggers,
  onEdit,
  onDelete,
  onTest,
  onWebhook,
  filters,
  onFilterChange,
  loading = false,
}: TriggerListProps) {
  // Get unique workspaces for filter dropdown
  const workspaces = Array.from(new Set(triggers.map((t) => t.workspace).filter(Boolean)));
  const triggerTypes: TriggerType[] = ['schedule', 'alert', 'http', 'notification'];

  const filteredTriggers = triggers.filter((t) => {
    if (filters?.type && filters.type !== 'all' && t.type !== filters.type) return false;
    if (filters?.workspace && filters.workspace !== 'all' && t.workspace !== filters.workspace)
      return false;
    return true;
  });

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading triggers...</p>;
  }

  if (triggers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No triggers configured.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add a trigger to get started with automated flow execution.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      {onFilterChange && filters && (
        <div className="flex gap-2">
          <Select
            value={filters.type || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                ...filters,
                type: value as TriggerType | 'all',
              })
            }
          >
            <SelectTrigger className="w-45">
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

          {workspaces.length > 0 && (
            <Select
              value={filters.workspace || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  ...filters,
                  workspace: value,
                })
              }
            >
              <SelectTrigger className="w-45">
                              <SelectValue placeholder="Filter by workspace" />
                            </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workspaces</SelectItem>
                {workspaces.map((w) => (
                  <SelectItem key={w} value={w!}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Table */}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">Label</th>
              <th className="px-4 py-3 text-left font-medium">Module</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Workspace</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="w-32 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredTriggers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No triggers match the selected filters.
                </td>
              </tr>
            ) : (
              filteredTriggers.map((trigger) => (
                <tr
                  key={trigger.id}
                  className="border-b border-border/50 last:border-b-0 hover:bg-accent/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{trigger.id}</td>
                  <td className="px-4 py-2">{trigger.label || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{trigger.module}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        TRIGGER_TYPE_COLORS[trigger.type]
                      )}
                    >
                      {trigger.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">{trigger.workspace || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_COLORS[trigger.status || 'ready'] || STATUS_COLORS.ready
                      )}
                    >
                      {trigger.status || 'ready'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {onWebhook && trigger.type === 'http' && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onWebhook(trigger)}
                          aria-label={`Copy webhook URL for ${trigger.id}`}
                          title="Copy webhook URL"
                        >
                          <Copy className="size-3" />
                        </Button>
                      )}
                      {onTest && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onTest(trigger)}
                          aria-label={`Test trigger ${trigger.id}`}
                          title="Test trigger"
                        >
                          <Play className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onEdit(trigger)}
                        aria-label={`Edit trigger ${trigger.id}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onDelete(trigger)}
                        aria-label={`Delete trigger ${trigger.id}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredTriggers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredTriggers.length} of {triggers.length} trigger
          {triggers.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
