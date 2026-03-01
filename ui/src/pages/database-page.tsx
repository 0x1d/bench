import { useState } from 'react';
import { Loader2, Pencil, Plus, Search, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDatabaseTables, useTableData } from '@/hooks/use-database';
import { useStatus } from '@/hooks/use-status';
import { useDatabaseView } from '@/contexts/database-view-context';
import { DatabaseTableList } from '@/components/database-table-list';
import { DatabaseTableData } from '@/components/database-table-data';

export function DatabasePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { selectedTable, setSelectedTable, setPanelMode, setAlterTableName } = useDatabaseView();

  const { data: statusData, loading: statusLoading } = useStatus();
  const dbConfigured = statusData?.database?.configured ?? false;

  const { data: tablesData, error: tablesError, isLoading: tablesLoading } = useDatabaseTables(dbConfigured);
  const allTables = tablesData?.tables ?? [];
  const searchLower = search.trim().toLowerCase();
  const tables = searchLower
    ? allTables.filter((t) => t.name.toLowerCase().includes(searchLower))
    : allTables;

  const { data: tableData, error: tableDataError, isLoading: tableDataLoading } = useTableData(
    selectedTable,
    page,
    search.trim(),
    dbConfigured
  );

  if (statusLoading || !statusData) {
    return (
      <div className="w-full max-w-xl p-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium tracking-tight">Database</h2>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading database status...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!dbConfigured) {
    return (
      <div className="w-full max-w-xl p-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium tracking-tight">Database</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Database is not configured. Set <code className="rounded bg-muted px-1">DATABASE_URL</code> in your
            environment to enable the database editor. For local development, run{' '}
            <code className="rounded bg-muted px-1">docker compose up -d</code> and use{' '}
            <code className="rounded bg-muted px-1">postgresql://bench:bench@localhost:5432/bench</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setSelectedTable(null);
            setPage(1);
          }}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Tables
        </button>
        {selectedTable && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="rounded px-2 py-1 font-mono">{selectedTable}</span>
          </>
        )}
      </nav>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={selectedTable ? 'Search rows...' : 'Filter tables...'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (selectedTable) setPage(1);
            }}
            className="pl-9"
            aria-label={selectedTable ? 'Search rows' : 'Filter tables'}
          />
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          {!selectedTable ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setPanelMode('create')} className="gap-1.5">
                <Plus className="size-4" />
                New table
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPanelMode('query')} className="gap-1.5">
                <Terminal className="size-4" />
                New query
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setPanelMode('alter')} className="gap-1.5">
                <Pencil className="size-4" />
                Edit table
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPanelMode('add-row')} className="gap-1.5">
                <Plus className="size-4" />
                Add row
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selectedTable ? (
          <DatabaseTableList
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            onNewTable={() => setPanelMode('create')}
            onEditTable={(name) => {
              setAlterTableName(name);
              setPanelMode('alter');
            }}
            onTableDropped={(name) => {
              if (selectedTable === name) {
                setSelectedTable(null);
              }
            }}
            isLoading={tablesLoading}
            error={tablesError}
          />
        ) : (
          <DatabaseTableData
            tableName={selectedTable}
            columns={tableData?.columns ?? []}
            rows={tableData?.rows ?? []}
            total={tableData?.total ?? 0}
            page={page}
            onPageChange={setPage}
            isLoading={tableDataLoading}
            error={tableDataError}
          />
        )}
      </div>
    </div>
  );
}
