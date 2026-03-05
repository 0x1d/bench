import { useState } from 'react';
import { Database, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { useDropTable } from '@/hooks/use-database';
import { useDatabaseView } from '@/contexts/database-view-context';
import { cn } from '@/lib/utils';

export interface DatabaseTableListProps {
  tables: { name: string; rows?: number }[];
  selectedTable: string | null;
  onSelectTable: (name: string | null) => void;
  onNewTable: () => void;
  onEditTable?: (name: string) => void;
  onTableDropped?: (name: string) => void;
  isLoading?: boolean;
  error?: Error | null;
}

export function DatabaseTableList({
  tables,
  selectedTable,
  onSelectTable,
  onNewTable,
  onEditTable,
  onTableDropped,
  isLoading,
  error,
}: DatabaseTableListProps) {
  const { selectedDatabaseId } = useDatabaseView();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropCascade, setDropCascade] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dropMutation = useDropTable(selectedDatabaseId);

  const handleDropTargetChange = (tableName: string) => {
    if (dropMutation.isPending) return;
    setDropTarget(tableName);
    setDropCascade(false);
    setDropError(null);
    dropMutation.reset();
  };

  const handleConfirmDrop = () => {
    if (dropTarget) {
      setDropError(null);
      dropMutation.mutate(
        { tableName: dropTarget, cascade: dropCascade },
        {
          onSuccess: () => {
            onTableDropped?.(dropTarget);
            setDropTarget(null);
            setDropCascade(false);
            setDropError(null);
          },
          onError: (error) => {
            setDropError(error.message);
          },
        }
      );
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tables...</p>
      ) : tables.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Database className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No tables yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a table or run a query to get started
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onNewTable}>
            Create table
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Rows</th>
                <th className="w-28 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr
                  key={t.name}
                  className={cn(
                    'border-b border-border/50 last:border-b-0 cursor-pointer transition-colors',
                    'hover:bg-accent/30',
                    selectedTable === t.name && 'bg-muted/50'
                  )}
                  onClick={() => onSelectTable(t.name)}
                >
                  <td className="px-4 py-2 font-mono">{t.name}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {t.rows ?? '—'}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      {onEditTable && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTable(t.name);
                          }}
                          aria-label={`Edit ${t.name}`}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDropTargetChange(t.name);
                        }}
                        aria-label={`Drop ${t.name}`}
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

      <ConfirmDeleteDialog
        open={!!dropTarget}
        onOpenChange={(open) => {
          if (!open && !dropMutation.isPending) {
            setDropTarget(null);
            setDropCascade(false);
            setDropError(null);
          }
        }}
        title="Drop table"
        description={`Are you sure you want to drop the table "${dropTarget}"? All data will be permanently deleted. This action cannot be undone.`}
        onConfirm={handleConfirmDrop}
        confirmLabel="Drop table"
        loadingLabel="Dropping..."
        cancelLabel="Cancel"
        isLoading={dropMutation.isPending}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="drop-table-cascade"
              checked={dropCascade}
              onCheckedChange={(checked) => setDropCascade(checked === true)}
              disabled={dropMutation.isPending}
            />
            <Label htmlFor="drop-table-cascade" className="cursor-pointer text-sm">
              Drop table with cascade
            </Label>
          </div>
          {dropError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {dropError}
            </p>
          )}
        </div>
      </ConfirmDeleteDialog>
    </div>
  );
}
