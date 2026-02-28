import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useTableSchema, useUpdateRow } from '@/hooks/use-database';
import { ForeignKeyLookup } from '@/components/database-foreign-key-lookup';

export interface DatabaseEditRowPanelContentProps {
  tableName: string;
  row: Record<string, unknown>;
  onSuccess?: () => void;
}

function getInputType(dataType: string): string {
  const t = dataType.toLowerCase();
  if (t.includes('int') || t.includes('numeric') || t === 'serial' || t === 'bigserial') {
    return 'number';
  }
  if (t === 'boolean' || t === 'bool') return 'checkbox';
  if (t.includes('date') || t.includes('timestamp')) return 'datetime-local';
  return 'text';
}

function valueToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function valueToArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => (x != null ? String(x) : ''));
  return [];
}

export function DatabaseEditRowPanelContent({
  tableName,
  row,
  onSuccess,
}: DatabaseEditRowPanelContentProps) {
  const { data: schema, isLoading, error, refetch, isRefetching } = useTableSchema(tableName, true);
  const updateMutation = useUpdateRow(tableName);

  if (isLoading || (!schema && !error)) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {isRefetching ? 'Refreshing...' : 'Loading schema...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          Retry
        </Button>
      </div>
    );
  }

  const editableColumns = schema.columns.filter((c) => !c.autoIncrement);
  const initialValues = Object.fromEntries(
    editableColumns.map((c) => [
      c.name,
      c.references?.multiple ? valueToArray(row[c.name]) : valueToString(row[c.name]),
    ])
  );

  return (
    <EditRowForm
      key={JSON.stringify(row)}
      schema={schema}
      initialRow={row}
      initialValues={initialValues}
      updateMutation={updateMutation}
      onSuccess={onSuccess}
    />
  );
}

interface SchemaColumn {
  name: string;
  dataType: string;
  required?: boolean;
  autoIncrement?: boolean;
  primaryKey?: boolean;
  references?: { table: string; column: string; multiple?: boolean };
}

function EditRowForm({
  schema,
  initialRow,
  initialValues,
  updateMutation,
  onSuccess,
}: {
  schema: { columns: SchemaColumn[] };
  initialRow: Record<string, unknown>;
  initialValues: Record<string, string | string[]>;
  updateMutation: ReturnType<typeof useUpdateRow>;
  onSuccess?: () => void;
}) {
  const editableColumns = schema.columns.filter((c) => !c.autoIncrement);
  const [values, setValues] = useState<Record<string, string | string[]>>(initialValues);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const updateValue = (col: string, value: string | string[]) => {
    setValues((prev) => ({ ...prev, [col]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
  };

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    for (const col of editableColumns) {
      const val = values[col.name];
      if (col.required) {
        if (Array.isArray(val)) {
          if (val.length === 0) errors[col.name] = 'Required';
        } else if ((val ?? '').trim() === '') {
          errors[col.name] = 'Required';
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});

    const set: Record<string, unknown> = {};
    for (const [col, val] of Object.entries(values)) {
      const colDef = schema.columns.find((c) => c.name === col);
      const isArrayRef = colDef?.references?.multiple;
      if (isArrayRef) {
        if (Array.isArray(val) && val.length === 0) {
          set[col] = null;
        } else if (Array.isArray(val)) {
          const dt = colDef?.dataType?.toLowerCase() ?? '';
          set[col] = dt.includes('int') || dt.includes('uuid')
            ? val.map((v) => (dt.includes('uuid') ? v : Number(v)))
            : val;
        } else {
          set[col] = null;
        }
      } else if (val === '' || (Array.isArray(val) && val.length === 0)) {
        set[col] = null;
      } else {
        const valStr = Array.isArray(val) ? val[0] : val;
        const dataType = colDef?.dataType?.toLowerCase() ?? '';
        if (dataType.includes('int') || dataType.includes('numeric')) {
          const n = Number(valStr);
          set[col] = Number.isFinite(n) ? n : valStr;
        } else if (dataType === 'boolean' || dataType === 'bool') {
          set[col] = valStr === 'true' || valStr === '1';
        } else {
          set[col] = valStr;
        }
      }
    }

    // Use only primary key columns for where clause - array columns can cause comparison issues
    const pkCols = schema.columns.filter((c) => c.primaryKey);
    const where =
      pkCols.length > 0
        ? Object.fromEntries(pkCols.map((c) => [c.name, initialRow[c.name]]))
        : initialRow;
    updateMutation.mutate(
      { where, set },
      {
        onSuccess: () => onSuccess?.(),
      }
    );
  };

  return (
    <div className="space-y-4">
      {editableColumns.map((col) => {
        const inputType = getInputType(col.dataType);
        const isCheckbox = inputType === 'checkbox';
        const hasError = validationErrors[col.name];
        return (
          <div key={col.name} className="space-y-2">
            <Label htmlFor={`edit-col-${col.name}`}>
              {col.name}
              {col.required && <span className="text-destructive ml-0.5">*</span>}
              <span className="ml-1 text-muted-foreground font-normal">({col.dataType})</span>
            </Label>
            {isCheckbox ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`edit-col-${col.name}`}
                  checked={(values[col.name] as string) === 'true'}
                  onCheckedChange={(v) => updateValue(col.name, v === true ? 'true' : 'false')}
                />
                <span className="text-sm text-muted-foreground">
                  {(values[col.name] as string) === 'true' ? 'true' : 'false'}
                </span>
              </div>
            ) : col.references ? (
              <ForeignKeyLookup
                refTable={col.references.table}
                refColumn={col.references.column}
                value={col.references.multiple ? (values[col.name] as string[] ?? []) : (values[col.name] as string ?? '')}
                onChange={(v) => updateValue(col.name, v)}
                placeholder={col.required ? 'Select...' : 'None (NULL)'}
                hasError={!!hasError}
                multiple={col.references.multiple}
              />
            ) : (
              <Input
                id={`edit-col-${col.name}`}
                type={inputType}
                value={(values[col.name] as string) ?? ''}
                onChange={(e) => updateValue(col.name, e.target.value)}
                placeholder={col.required ? '' : 'NULL'}
                className={`font-mono ${hasError ? 'border-destructive' : ''}`}
                aria-invalid={!!hasError}
              />
            )}
            {hasError && (
              <p className="text-xs text-destructive">{validationErrors[col.name]}</p>
            )}
          </div>
        );
      })}
      {updateMutation.isError && (
        <p className="text-sm text-destructive">{updateMutation.error?.message}</p>
      )}
      <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
        {updateMutation.isPending ? 'Updating...' : 'Update row'}
      </Button>
    </div>
  );
}
