import { useState } from 'react';
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
import { useCreateTable, useDatabaseTables } from '@/hooks/use-database';
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

interface ColumnDef {
  name: string;
  dataType: string;
  required: boolean;
  autoIncrement: boolean;
  primaryKey: boolean;
  references: ForeignKeyRef | null;
}

export interface DatabaseCreateTablePanelContentProps {
  onSuccess?: () => void;
}

export function DatabaseCreateTablePanelContent({
  onSuccess,
}: DatabaseCreateTablePanelContentProps) {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: 'id', dataType: 'bigint', required: false, autoIncrement: true, primaryKey: true, references: null },
  ]);

  const createMutation = useCreateTable();
  const { data: tablesData } = useDatabaseTables(true);
  const tables = tablesData?.tables ?? [];

  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { name: '', dataType: 'text', required: false, autoIncrement: false, primaryKey: false, references: null },
    ]);
  };

  const removeColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const updateColumn = (
    index: number,
    field: keyof ColumnDef,
    value: string | boolean | ForeignKeyRef | null
  ) => {
    setColumns((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const handleCreateTable = () => {
    const validColumns = columns.filter((c) => c.name.trim() !== '');
    if (!tableName.trim() || validColumns.length === 0) return;
    createMutation.mutate(
      {
        name: tableName.trim(),
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
        onSuccess: () => {
          setTableName('');
          setColumns([
            { name: 'id', dataType: 'bigint', required: false, autoIncrement: true, primaryKey: true, references: null },
          ]);
          onSuccess?.();
        },
      }
    );
  };

  return (
    <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="table-name">Table name</Label>
            <Input
              id="table-name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="users"
              className="font-mono"
            />
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
              {columns.map((col, i) => (
                <div key={i} className="flex flex-wrap gap-x-2 gap-y-2 items-center">
                  <Input
                    value={col.name}
                    onChange={(e) => updateColumn(i, 'name', e.target.value)}
                    placeholder="column_name"
                    className="font-mono w-[140px] shrink-0"
                  />
                  <Select
                    value={col.dataType}
                    onValueChange={(v) => updateColumn(i, 'dataType', v)}
                  >
                    <SelectTrigger className="w-[130px] shrink-0">
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
                        currentTable={tableName.trim()}
                        value={col.references}
                        onChange={(ref) => updateColumn(i, 'references', ref)}
                      />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeColumn(i)}
                    disabled={columns.length <= 1}
                    aria-label="Remove column"
                    className="shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-destructive">{createMutation.error?.message}</p>
          )}
          <Button
            onClick={handleCreateTable}
            disabled={
              !tableName.trim() ||
              columns.every((c) => !c.name.trim()) ||
              createMutation.isPending
            }
          >
            {createMutation.isPending ? 'Creating...' : 'Create table'}
          </Button>
        </div>
  );
}
