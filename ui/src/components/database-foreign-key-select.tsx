import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useTableSchema } from '@/hooks/use-database';

export interface ForeignKeyRef {
  table: string;
  column: string;
  multiple?: boolean;
}

export function ForeignKeySelect({
  dbId,
  tables,
  currentTable,
  value,
  onChange,
}: {
  dbId: string | null;
  tables: { name: string }[];
  currentTable: string;
  value: ForeignKeyRef | null;
  onChange: (ref: ForeignKeyRef | null) => void;
}) {
  const refTables = tables.filter((t) => t.name !== currentTable);
  const { data: refSchema } = useTableSchema(value?.table ?? null, dbId, !!value?.table);
  const refColumns = refSchema?.columns ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted-foreground">FK:</span>
      <Select
        value={value?.table ?? '__none__'}
        onValueChange={(v) => {
          if (v === '__none__') onChange(null);
          else onChange({ table: v, column: refColumns[0]?.name ?? 'id', multiple: value?.multiple });
        }}
      >
        <SelectTrigger className="w-[100px] h-8">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None</SelectItem>
          {refTables.map((t) => (
            <SelectItem key={t.name} value={t.name}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value?.table && (
        <Select
          value={value.column}
          onValueChange={(col) => onChange({ ...value, column: col })}
        >
          <SelectTrigger className="w-[90px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {refColumns.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {value?.table && (
        <label className="flex items-center gap-1.5 text-sm cursor-pointer shrink-0">
          <Checkbox
            checked={value?.multiple ?? false}
            onCheckedChange={(v) => onChange(value ? { ...value, multiple: v === true } : null)}
          />
          Many
        </label>
      )}
    </div>
  );
}
