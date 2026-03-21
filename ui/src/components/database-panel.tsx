import { useCallback, useEffect } from 'react';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextPanel } from '@/components/context-panel';
import { useDatabaseView } from '@/contexts/database-view-context';
import { DatabaseCreateTablePanelContent } from '@/components/database-create-table-panel';
import { DatabaseAlterTablePanelContent } from '@/components/database-alter-table-panel';
import { DatabaseEditRowPanelContent } from '@/components/database-edit-row-panel';
import { DatabaseQueryPanelContent } from '@/components/database-query-panel';
import { DatabaseAddRowPanelContent } from '@/components/database-add-row-panel';

const STORAGE_KEY = 'bench-database-panel-width';

function getPanelTitle(
  mode: string | null,
  selectedTable: string | null,
  editTableName?: string | null
): string {
  switch (mode) {
    case 'create':
      return 'Create table';
    case 'alter':
      return selectedTable ? `Alter table — ${selectedTable}` : 'Alter table';
    case 'edit-row':
      return editTableName ? `Edit row — ${editTableName}` : 'Edit row';
    case 'query':
      return 'Query';
    case 'add-row':
      return selectedTable ? `Add row — ${selectedTable}` : 'Add row';
    default:
      return 'Database';
  }
}

export function DatabasePanel() {
  const {
    panelMode,
    setPanelMode,
    selectedTable,
    alterTableName,
    setAlterTableName,
    editRowData,
    setEditRowData,
  } = useDatabaseView();
  const alterTarget = alterTableName ?? selectedTable;

  const isExpanded = panelMode != null;

  const handleClose = useCallback(() => {
    setPanelMode(null);
    setAlterTableName(null);
    setEditRowData(null);
  }, [setPanelMode, setAlterTableName, setEditRowData]);

  useEffect(() => {
    const onBenchClose = () => handleClose();
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, onBenchClose);
  }, [handleClose]);

  return (
    <ContextPanel expanded={isExpanded} storageKey={STORAGE_KEY}>
      <>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <span
            className="truncate text-sm font-medium"
            title={getPanelTitle(panelMode, alterTarget, editRowData?.tableName)}
          >
            {getPanelTitle(panelMode, alterTarget, editRowData?.tableName)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClose}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          {panelMode === 'create' && (
            <DatabaseCreateTablePanelContent onSuccess={handleClose} />
          )}
          {panelMode === 'alter' && alterTarget && (
            <DatabaseAlterTablePanelContent
              key={alterTarget}
              tableName={alterTarget}
              onSuccess={handleClose}
            />
          )}
          {panelMode === 'edit-row' && editRowData && (
            <DatabaseEditRowPanelContent
              tableName={editRowData.tableName}
              row={editRowData.row}
              onSuccess={handleClose}
            />
          )}
          {panelMode === 'query' && (
            <DatabaseQueryPanelContent
              key={selectedTable ?? 'none'}
              initialSql={
                selectedTable ? `SELECT * FROM ${selectedTable} LIMIT 20` : 'SELECT 1'
              }
            />
          )}
          {panelMode === 'add-row' && selectedTable && (
            <DatabaseAddRowPanelContent
              tableName={selectedTable}
              onSuccess={handleClose}
            />
          )}
        </div>
      </>
    </ContextPanel>
  );
}
