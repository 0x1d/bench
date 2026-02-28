import { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTableSchema, useAlterTable, useDatabaseTables } from '@/hooks/use-database';
import { ForeignKeySelect, type ForeignKeyRef } from '@/components/database-foreign-key-select';

const DATA_TYPES = [
  'text',
  'varchar(255)',
  'integer',
  'bigint',
  'boolean',
  'timestamp',
  'timestamptz',
  'date',
  'numeric',
  'uuid',
  'jsonb',
] as const;

const AUTO_INCREMENT_TYPES = ['integer', 'bigint'];

function mapDataTypeFromDb(dt: string): string {
  const d = dt.toLowerCase();
  if (d === 'character varying') return 'varchar(255)';
  if (d === 'timestamp with time zone') return 'timestamptz';
  if (d === 'timestamp without time zone') return 'timestamp';
  if (d === 'smallint') return 'integer';
  if (DATA_TYPES.includes(d as (typeof DATA_TYPES)[number])) return d;
  if (d.startsWith('varchar(')) return d;
  if (d === 'integer[]' || d === 'bigint[]' || d === 'uuid[]' || d === 'smallint[]') return d;
  return 'text';
}

interface ColumnDef {
  name: string;
  dataType: string;
  required: boolean;
  autoIncrement: boolean;
  primaryKey: boolean;
  references: ForeignKeyRef | null;
}

export interface DatabaseAlterTablePanelContentProps {
  tableName: string;
  onSuccess?: () => void;
}

export function DatabaseAlterTablePanelContent({
  tableName,
  onSuccess,
}: DatabaseAlterTablePanelContentProps) {
  const { data: schema, isLoading, error, refetch, isRefetching } = useTableSchema(tableName, true);
  const alterMutation = useAlterTable(tableName);
  const { data: tablesData } = useDatabaseTables(true);
  const tables = tablesData?.tables ?? [];

  const schemaColumns = useMemo(
    () =>
      schema?.columns?.map((c) => ({
        name: c.name,
        dataType: mapDataTypeFromDb(c.dataType),
        required: c.required ?? false,
        autoIncrement: c.autoIncrement ?? false,
        primaryKey: c.primaryKey ?? false,
        references: c.references ?? null,
      })) ?? [],
    [schema]
  );

  const [columns, setColumns] = useState<ColumnDef[] | null>(null);
  const effectiveColumns = columns ?? schemaColumns;

  const addColumn = () => {
    setColumns((prev) => [
      ...(prev ?? schemaColumns),
      { name: '', dataType: 'text', required: false, autoIncrement: false, primaryKey: false, references: null },
    ]);
  };

  const removeColumn = (index: number) => {
    setColumns((prev) => (prev ?? schemaColumns).filter((_, i) => i !== index));
  };

  const updateColumn = (
    index: number,
    field: keyof ColumnDef,
    value: string | boolean | ForeignKeyRef | null
  ) => {
    setColumns((prev) =>
      (prev ?? schemaColumns).map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const handleAlterTable = () => {
    const validColumns = effectiveColumns.filter((c) => c.name.trim() !== '');
    if (validColumns.length === 0) return;
        alterMutation.mutate(
      {
        columns: validColumns.map((c) => {
          const ref = c.references;
          return {
            name: c.name.trim(),
            dataType: c.dataType || 'text',
            required: c.required,
            autoIncrement: c.autoIncrement,
            primaryKey: c.primaryKey,
            references: ref
              ? { table: ref.table, column: ref.column, multiple: ref.multiple ?? false }
              : undefined,
          };
        }),
      },
      {
        onSuccess: () => onSuccess?.(),
      }
    );
  };

  if (isLoading || (!schema && !error)) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">
          {isRefetching ? 'Refreshing...' : 'Loading schema...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="space-y-2">
        <Label>Table</Label>
        <Input value={tableName} readOnly className="font-mono bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Columns</Label>
          <Button variant="ghost" size="sm" onClick={addColumn} className="gap-1">
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {effectiveColumns.map((col, i) => (
            <div key={i} className="space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  value={col.name}
                  onChange={(e) => updateColumn(i, 'name', e.target.value)}
                  placeholder="column_name"
                  className="font-mono min-w-[100px] flex-1"
                />
                <Select
                  value={col.dataType}
                  onValueChange={(v) => updateColumn(i, 'dataType', v)}
                >
                  <SelectTrigger className="min-w-[120px] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {dt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeColumn(i)}
                  disabled={effectiveColumns.length <= 1}
                  aria-label="Remove column"
                  className="shrink-0"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={col.required}
                    onCheckedChange={(v) => updateColumn(i, 'required', v === true)}
                  />
                  Required
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={col.primaryKey}
                    onCheckedChange={(v) => updateColumn(i, 'primaryKey', v === true)}
                  />
                  PK
                </label>
                {AUTO_INCREMENT_TYPES.includes(col.dataType) && (
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={col.autoIncrement}
                      onCheckedChange={(v) => updateColumn(i, 'autoIncrement', v === true)}
                    />
                    Auto
                  </label>
                )}
                {tables.length > 0 && (
                  <ForeignKeySelect
                    tables={tables}
                    currentTable={tableName}
                    value={col.references}
                    onChange={(ref) => updateColumn(i, 'references', ref)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {alterMutation.isError && (
        <p className="text-sm text-destructive">{alterMutation.error?.message}</p>
      )}
      <Button
        onClick={handleAlterTable}
        disabled={
          effectiveColumns.every((c) => !c.name.trim()) || alterMutation.isPending
        }
      >
        {alterMutation.isPending ? 'Altering...' : 'Alter table'}
      </Button>
    </div>
  );
}
