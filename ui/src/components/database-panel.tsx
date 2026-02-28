import { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseView } from '@/contexts/database-view-context';
import { DatabaseCreateTablePanelContent } from '@/components/database-create-table-panel';
import { DatabaseAlterTablePanelContent } from '@/components/database-alter-table-panel';
import { DatabaseEditRowPanelContent } from '@/components/database-edit-row-panel';
import { DatabaseQueryPanelContent } from '@/components/database-query-panel';
import { DatabaseAddRowPanelContent } from '@/components/database-add-row-panel';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'bench-database-panel-width';
const MIN_WIDTH = 240;
const MAX_WIDTH = 800;

function getInitialWidth(): number {
  if (typeof window === 'undefined') return 320;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  }
  const quarterWidth = Math.round(window.innerWidth / 4);
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, quarterWidth));
}

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
  const [width, setWidth] = useState(getInitialWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const isExpanded = panelMode != null;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
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
    setPanelMode(null);
    setAlterTableName(null);
    setEditRowData(null);
  };

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
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {panelMode === 'create' && (
          <DatabaseCreateTablePanelContent onSuccess={handleClose} />
        )}
        {panelMode === 'alter' && alterTarget && (
          <DatabaseAlterTablePanelContent
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
