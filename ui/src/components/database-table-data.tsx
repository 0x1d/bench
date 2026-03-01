import { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
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
import { useDatabaseView } from '@/contexts/database-view-context';
import { useDeleteRow } from '@/hooks/use-database';
import { cn } from '@/lib/utils';

function rowToObject(columns: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

export interface DatabaseTableDataProps {
  tableName: string;
  columns: string[];
  rows: unknown[][];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  error?: Error | null;
}

const PAGE_SIZE = 20;

export function DatabaseTableData({
  tableName,
  columns,
  rows,
  total,
  page,
  onPageChange,
  isLoading,
  error,
}: DatabaseTableDataProps) {
  const { setEditRowData, setPanelMode, selectedDatabaseId } = useDatabaseView();
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const deleteMutation = useDeleteRow(tableName, selectedDatabaseId);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget, {
        onSettled: () => setDeleteTarget(null),
      });
    }
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

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
        <p className="text-sm text-muted-foreground">Loading data...</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-medium">
                      {col}
                    </th>
                  ))}
                  <th className="w-28 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rowObj = rowToObject(columns, row);
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-border/50 last:border-b-0 cursor-pointer',
                        'hover:bg-accent/30'
                      )}
                      onClick={() => {
                        setEditRowData({ tableName, row: rowObj });
                        setPanelMode('edit-row');
                      }}
                    >
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-2">
                          {cell == null ? (
                            <span className="text-muted-foreground">NULL</span>
                          ) : typeof cell === 'object' ? (
                            JSON.stringify(cell)
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setEditRowData({ tableName, row: rowObj });
                              setPanelMode('edit-row');
                            }}
                            aria-label="Edit row"
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setDeleteTarget(rowObj)}
                            aria-label="Delete row"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="px-4 py-8 text-center text-muted-foreground">
                No rows
              </div>
            )}
          </div>

          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete row</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this row? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete row'}
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {total > 0 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {from}–{to} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
