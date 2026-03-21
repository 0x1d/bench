import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Terminal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { DatabaseResourceFields, ResourceSettingsSidePanel } from '@/components/resource-config';
import { useDatabaseTables, useTableData } from '@/hooks/use-database';
import { useStatus } from '@/hooks/use-status';
import { useDatabaseView } from '@/contexts/database-view-context';
import { DatabaseTableList } from '@/components/database-table-list';
import { DatabaseTableData } from '@/components/database-table-data';
import {
  parseConfigToState,
  useResourceConfig,
  type DatabaseResource,
} from '@/lib/resource-config';

export function DatabasePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [pageTab, setPageTab] = useState<'browse' | 'settings'>('browse');
  const {
    selectedTable,
    setSelectedTable,
    panelMode,
    setPanelMode,
    setAlterTableName,
    setEditRowData,
    selectedDatabaseId,
    setSelectedDatabaseId,
  } = useDatabaseView();
  const previousSelectedTableRef = useRef<string | null>(selectedTable);

  const { data: rawConfig, mergeAndPersist, isPending: configPending, error: configError } =
    useResourceConfig();
  const databaseList = useMemo(() => parseConfigToState(rawConfig ?? '').databases, [rawConfig]);

  const [editingDb, setEditingDb] = useState<'add' | number | null>(null);
  const [databaseDraft, setDatabaseDraft] = useState<DatabaseResource>({
    id: '',
    label: '',
    url: '',
    enabled: true,
    default: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [savePending, setSavePending] = useState(false);

  const { data: statusData, loading: statusLoading } = useStatus();
  const dbConfigured = statusData?.database?.configured ?? false;
  const databaseOptions =
    statusData?.database?.databases?.filter((db) => db.enabled && db.connected) ?? [];

  const effectiveDatabaseId =
    selectedDatabaseId ?? statusData?.database?.defaultId ?? databaseOptions[0]?.id ?? null;

  useEffect(() => {
    if (pageTab === 'settings') {
      setPanelMode(null);
      setAlterTableName(null);
      setEditRowData(null);
    }
  }, [pageTab, setPanelMode, setAlterTableName, setEditRowData]);

  useEffect(() => {
    if (effectiveDatabaseId && selectedDatabaseId !== effectiveDatabaseId) {
      setSelectedDatabaseId(effectiveDatabaseId);
    }
  }, [effectiveDatabaseId, selectedDatabaseId, setSelectedDatabaseId]);

  useEffect(() => {
    const previousSelectedTable = previousSelectedTableRef.current;
    const hasNavigatedToDifferentTable = previousSelectedTable !== selectedTable;
    const isTableEditorOpen =
      panelMode === 'alter' || panelMode === 'add-row' || panelMode === 'edit-row';

    if (hasNavigatedToDifferentTable && isTableEditorOpen) {
      setPanelMode(null);
      setAlterTableName(null);
      setEditRowData(null);
    }

    previousSelectedTableRef.current = selectedTable;
  }, [panelMode, selectedTable, setAlterTableName, setEditRowData, setPanelMode]);

  const { data: tablesData, error: tablesError, isLoading: tablesLoading } = useDatabaseTables(
    effectiveDatabaseId,
    dbConfigured && pageTab === 'browse'
  );
  const allTables = tablesData?.tables ?? [];
  const searchLower = search.trim().toLowerCase();
  const tables = searchLower
    ? allTables.filter((t) => t.name.toLowerCase().includes(searchLower))
    : allTables;

  const { data: tableData, error: tableDataError, isLoading: tableDataLoading } = useTableData(
    selectedTable,
    page,
    search.trim(),
    effectiveDatabaseId,
    dbConfigured && pageTab === 'browse' && !!selectedTable
  );

  const openAddDatabase = () => {
    setDatabaseDraft({
      id: '',
      label: '',
      url: '',
      enabled: true,
      default: databaseList.length === 0,
    });
    setFormError(null);
    setEditingDb('add');
  };

  const openEditDatabase = (index: number) => {
    setDatabaseDraft(databaseList[index]);
    setFormError(null);
    setEditingDb(index);
  };

  const applyDatabaseDraft = async () => {
    const id = databaseDraft.id.trim();
    const url = databaseDraft.url.trim();
    if (id === '' || url === '') {
      setFormError('Database ID and URL are required.');
      return;
    }

    const duplicate = databaseList.some(
      (entry, idx) => idx !== (editingDb === 'add' ? -1 : editingDb) && entry.id.trim() === id
    );
    if (duplicate) {
      setFormError(`Database ID "${id}" already exists.`);
      return;
    }

    const nextEntry: DatabaseResource = {
      id,
      label: databaseDraft.label.trim(),
      url,
      enabled: databaseDraft.enabled,
      default: databaseDraft.default,
    };

    const applyWithDefaultRule = (entries: DatabaseResource[], editIndex: number | null) => {
      if (!nextEntry.default) return entries;
      return entries.map((entry, idx) =>
        editIndex !== null
          ? idx === editIndex
            ? entry
            : { ...entry, default: false }
          : { ...entry, default: false }
      );
    };

    setFormError(null);
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => {
        if (editingDb === 'add') {
          const normalized = applyWithDefaultRule(prev.databases, null);
          return { ...prev, databases: [...normalized, nextEntry] };
        }
        if (typeof editingDb === 'number') {
          const mapped = prev.databases.map((e, idx) => (idx === editingDb ? nextEntry : e));
          const normalized = applyWithDefaultRule(mapped, editingDb);
          return { ...prev, databases: normalized };
        }
        return prev;
      });
      setEditingDb(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavePending(false);
    }
  };

  const confirmDeleteDatabase = async () => {
    if (deleteIndex == null) return;
    const idx = deleteIndex;
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => ({
        ...prev,
        databases: prev.databases.filter((_, i) => i !== idx),
      }));
      setDeleteIndex(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSavePending(false);
    }
  };

  const configErr =
    configError instanceof Error ? configError.message : configError ? String(configError) : null;

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

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      <Tabs
        value={pageTab}
        onValueChange={(v) => setPageTab(v as 'browse' | 'settings')}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList variant="line" className="w-fit max-w-full shrink-0 justify-start gap-x-1">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-3 flex min-h-0 flex-1 flex-col gap-4">
          {!dbConfigured && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <h2 className="text-lg font-medium">No database resources configured</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add connection entries in Settings or use the Configuration page.
              </p>
              <Button type="button" className="mt-4" onClick={() => setPageTab('settings')}>
                Open Settings
              </Button>
            </div>
          )}
          {dbConfigured && !effectiveDatabaseId && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <h2 className="text-lg font-medium">No connected databases available</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Configure a database resource in Settings and ensure it connects, or check the
                Configuration page.
              </p>
              <Button type="button" className="mt-4" onClick={() => setPageTab('settings')}>
                Open Settings
              </Button>
            </div>
          )}
          {dbConfigured && effectiveDatabaseId && (
            <>
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

              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
                <Select
                  value={effectiveDatabaseId}
                  onValueChange={(nextId) => {
                    setSelectedDatabaseId(nextId);
                    setSelectedTable(null);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="Select database" />
                  </SelectTrigger>
                  <SelectContent>
                    {databaseOptions.map((db) => (
                      <SelectItem key={db.id} value={db.id}>
                        {db.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPanelMode('create')}
                        className="gap-1.5"
                      >
                        <Plus className="size-4" />
                        New table
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPanelMode('query')}
                        className="gap-1.5"
                      >
                        <Terminal className="size-4" />
                        New query
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPanelMode('alter')}
                        className="gap-1.5"
                      >
                        <Pencil className="size-4" />
                        Edit table
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPanelMode('add-row')}
                        className="gap-1.5"
                      >
                        <Plus className="size-4" />
                        Add row
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1 overflow-auto">
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
            </>
          )}
        </TabsContent>

        <TabsContent
          value="settings"
          className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-auto"
        >
          {configPending && (
            <p className="text-muted-foreground">Loading configuration...</p>
          )}
          {configErr && <p className="text-sm text-destructive">{configErr}</p>}
          {!configPending && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-medium">Database resources</h3>
                <Button variant="outline" size="sm" onClick={openAddDatabase}>
                  <Plus className="size-4" />
                  Add database
                </Button>
              </div>
              {databaseList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No database resources configured.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 text-left font-medium">ID</th>
                        <th className="px-4 py-3 text-left font-medium">Label</th>
                        <th className="px-4 py-3 text-left font-medium">URL</th>
                        <th className="px-4 py-3 text-left font-medium">Enabled</th>
                        <th className="px-4 py-3 text-left font-medium">Default</th>
                        <th className="w-28 px-2 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {databaseList.map((entry, index) => (
                        <tr
                          key={`db-${index}`}
                          className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30"
                          onClick={() => openEditDatabase(index)}
                        >
                          <td className="px-4 py-2 font-mono">{entry.id}</td>
                          <td className="px-4 py-2">{entry.label || '—'}</td>
                          <td className="max-w-[200px] truncate px-4 py-2 font-mono" title={entry.url}>
                            {entry.url}
                          </td>
                          <td className="px-4 py-2">{entry.enabled ? 'Yes' : 'No'}</td>
                          <td className="px-4 py-2">{entry.default ? 'Yes' : 'No'}</td>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => openEditDatabase(index)}
                                aria-label={`Edit database ${entry.id}`}
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setDeleteIndex(index)}
                                aria-label={`Remove database ${entry.id}`}
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

            </section>
          )}
        </TabsContent>
      </Tabs>

      <ResourceSettingsSidePanel
        open={editingDb !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingDb(null);
            setFormError(null);
          }
        }}
        title={editingDb === 'add' ? 'Add database' : 'Edit database'}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingDb(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={applyDatabaseDraft} disabled={savePending}>
              {editingDb === 'add' ? 'Add' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <DatabaseResourceFields draft={databaseDraft} onChange={setDatabaseDraft} />
        {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
      </ResourceSettingsSidePanel>

      <ConfirmDeleteDialog
        open={deleteIndex != null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
        title="Remove database resource?"
        description={
          deleteIndex != null && databaseList[deleteIndex]
            ? `Remove "${databaseList[deleteIndex].id}" from configuration?`
            : 'Remove this resource?'
        }
        onConfirm={confirmDeleteDatabase}
        isLoading={savePending}
      />
    </div>
  );
}
