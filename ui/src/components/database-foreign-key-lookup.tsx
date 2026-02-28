import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTableLookup } from '@/hooks/use-database';
import { cn } from '@/lib/utils';

export interface ForeignKeyRef {
  table: string;
  column: string;
}

function formatDisplayValue(row: unknown[], columns: string[], valueColumn: string): string {
  const valueIdx = columns.indexOf(valueColumn);
  const value = valueIdx >= 0 ? row[valueIdx] : row[0];
  if (value == null) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  const parts = [String(value)];
  if (columns.length > 1) {
    const other = columns
      .map((_, i) => (i !== valueIdx ? row[i] : null))
      .filter((v) => v != null && v !== '')
      .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .slice(0, 2);
    if (other.length > 0) parts.push(` (${other.join(', ')})`);
  }
  return parts.join('');
}

export interface ForeignKeyLookupProps {
  refTable: string;
  refColumn: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hasError?: boolean;
  multiple?: boolean;
}

const SEARCH_DEBOUNCE_MS = 200;

export function ForeignKeyLookup({
  refTable,
  refColumn,
  value,
  onChange,
  placeholder = 'Select...',
  disabled,
  className,
  hasError,
  multiple = false,
}: ForeignKeyLookupProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useTableLookup(
    refTable,
    refColumn,
    debouncedSearch,
    open
  );

  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];
  const valueIdx = columns.indexOf(refColumn);

  const getRowValue = useCallback(
    (row: unknown[]) => {
      if (valueIdx >= 0 && valueIdx < row.length) {
        const v = row[valueIdx];
        if (v == null) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }
      return row[0] != null ? String(row[0]) : '';
    },
    [valueIdx]
  );

  const selectedValues = multiple
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : null;
  const singleValue = multiple ? '' : (typeof value === 'string' ? value : '');

  const selectedLabel = (() => {
    if (multiple) {
      if (!selectedValues || selectedValues.length === 0) return placeholder;
      const labels = selectedValues
        .map((v) => {
          const row = rows.find((r) => getRowValue(r) === v);
          return row ? formatDisplayValue(row, columns, refColumn) : v;
        })
        .slice(0, 3);
      const extra = selectedValues.length > 3 ? ` +${selectedValues.length - 3}` : '';
      return labels.join(', ') + extra;
    }
    if (!singleValue) return placeholder;
    const row = rows.find((r) => getRowValue(r) === singleValue);
    if (row) return formatDisplayValue(row, columns, refColumn);
    return singleValue;
  })();

  const toggleMulti = (rowValue: string) => {
    const current = selectedValues ?? [];
    const next = current.includes(rowValue)
      ? current.filter((v) => v !== rowValue)
      : [...current, rowValue];
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-mono',
            (multiple ? !selectedValues?.length : !singleValue) && 'text-muted-foreground',
            hasError && 'border-destructive',
            className
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${refTable}...`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Loading...' : 'No results found.'}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(multiple ? [] : '');
                  if (!multiple) setOpen(false);
                }}
              >
                <span className="text-muted-foreground">Clear (NULL)</span>
              </CommandItem>
              {rows.map((row, i) => {
                const rowValue = getRowValue(row);
                const isSelected = multiple
                  ? selectedValues?.includes(rowValue)
                  : singleValue === rowValue;
                return (
                  <CommandItem
                    key={`${rowValue}-${i}`}
                    value={rowValue}
                    onSelect={() => {
                      if (multiple) {
                        toggleMulti(rowValue);
                      } else {
                        onChange(rowValue);
                        setOpen(false);
                      }
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {formatDisplayValue(row, columns, refColumn)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
