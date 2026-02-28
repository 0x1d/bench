import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

/** Fuzzy match: query chars appear in str in order, case insensitive. */
function fuzzyMatch(query: string, str: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const s = String(str).toLowerCase();
  let j = 0;
  for (let i = 0; i < s.length && j < q.length; i++) {
    if (s[i] === q[j]) j++;
  }
  return j === q.length;
}

function findMatchingPaths(data: unknown, query: string, prefix: string): string[] {
  if (!query.trim()) return [];
  const paths: string[] = [];
  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      const childPath = `${prefix}[${i}]`;
      const label = `[${i}]`;
      if (fuzzyMatch(query, label)) paths.push(childPath);
      const childMatches = findMatchingPaths(item, query, childPath);
      paths.push(...childMatches);
    });
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      const childPath = prefix ? `${prefix}.${key}` : `.${key}`;
      if (fuzzyMatch(query, key)) paths.push(childPath);
      if (typeof val === 'string' && fuzzyMatch(query, val)) paths.push(childPath);
      if (typeof val === 'number' && fuzzyMatch(query, String(val))) paths.push(childPath);
      if (typeof val === 'boolean' && fuzzyMatch(query, String(val))) paths.push(childPath);
      const childMatches = findMatchingPaths(val, query, childPath);
      paths.push(...childMatches);
    }
  }
  return paths;
}

function parentPath(path: string): string {
  if (!path) return '';
  return path.replace(/\.?[^.[\]]+$|\[\d+\]$/, '') || '';
}

function getAncestorsAndSelf(paths: string[]): Set<string> {
  const result = new Set<string>();
  for (const p of paths) {
    result.add(p);
    let curr = p;
    while (curr) {
      curr = parentPath(curr);
      if (curr !== p) result.add(curr);
    }
  }
  return result;
}

function getPathsToExpand(matchingPaths: string[]): Set<string> {
  const result = new Set<string>();
  for (const p of matchingPaths) {
    let curr = parentPath(p);
    while (curr) {
      result.add(curr);
      curr = parentPath(curr);
    }
  }
  return result;
}

function collectCollapsiblePaths(data: unknown, prefix: string): string[] {
  const paths: string[] = [];
  if (Array.isArray(data)) {
    if (prefix) paths.push(prefix);
    data.forEach((item, i) => {
      paths.push(...collectCollapsiblePaths(item, `${prefix}[${i}]`));
    });
  } else if (typeof data === 'object' && data !== null) {
    if (prefix) paths.push(prefix);
    const obj = data as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      const childPath = prefix ? `${prefix}.${key}` : `.${key}`;
      paths.push(...collectCollapsiblePaths(val, childPath));
    }
  }
  return paths;
}

type ExpandContextValue = {
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  searchQuery: string;
  visiblePaths: Set<string>;
  expandPathsWhenFiltered: Set<string>;
};

const ExpandContext = createContext<ExpandContextValue | null>(null);

interface StructuredFormProps {
  data: unknown;
  onChange: (data: unknown) => void;
  className?: string;
  initialExpandAll?: boolean;
  resetKey?: string;
}

type NewValueKind = 'text' | 'number' | 'boolean' | 'object' | 'array' | 'null';

function cloneStructure(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return [cloneStructure(value[value.length - 1])];
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      next[key] = cloneStructure(val);
    }
    return next;
  }
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (value === null || value === undefined) return null;
  return '';
}

function defaultValueForKind(kind: NewValueKind): unknown {
  switch (kind) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    case 'array':
      return [];
    case 'null':
      return null;
    default:
      return '';
  }
}

function AddObjectField({
  existingKeys,
  onAdd,
  compact = false,
}: {
  existingKeys: string[];
  onAdd: (key: string, value: unknown) => void;
  compact?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [kind, setKind] = useState<NewValueKind>('text');
  const normalizedKey = newKey.trim();
  const keyExists = normalizedKey !== '' && existingKeys.includes(normalizedKey);
  const resetAddingState = () => {
    setIsAdding(false);
    setNewKey('');
    setKind('text');
  };
  const addField = () => {
    if (!normalizedKey || keyExists) return;
    onAdd(normalizedKey, defaultValueForKind(kind));
    resetAddingState();
  };

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={(e) => {
          e.stopPropagation();
          setIsAdding(true);
        }}
        aria-label={compact ? 'Add field' : 'Add field to object'}
        className="border border-border/70 bg-background/80 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="size-3" />
      </Button>
    );
  }

  if (compact) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <div className="bg-popover absolute top-full right-0 z-20 mt-3 w-[320px] space-y-2 rounded-md border p-2 shadow-md">
          <div className="space-y-2">
            <div className="w-full space-y-1">
              <Label className="text-muted-foreground">Field name</Label>
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="new_field"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addField();
                  if (e.key === 'Escape') resetAddingState();
                }}
              />
            </div>
            <div className="w-full space-y-1">
              <Label className="text-muted-foreground">Type</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as NewValueKind)}
                aria-label="Field type"
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
                <option value="null">null</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetAddingState}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={addField}
              disabled={!normalizedKey || keyExists}
              aria-label="Add field"
            >
              Add
            </Button>
          </div>
          {keyExists && (
            <p className="text-xs text-destructive">
              A field with this name already exists.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-[220px] space-y-1">
          <Label className="text-muted-foreground">Field name</Label>
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="new_field"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') addField();
              if (e.key === 'Escape') resetAddingState();
            }}
          />
        </div>
        <div className="basis-[150px] space-y-1">
          <Label className="text-muted-foreground">Type</Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as NewValueKind)}
            aria-label="Field type"
          >
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="object">object</option>
            <option value="array">array</option>
            <option value="null">null</option>
          </select>
        </div>
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={addField}
            disabled={!normalizedKey || keyExists}
            aria-label="Add field"
          >
            Add
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetAddingState}
          >
            Cancel
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Press Enter to quickly add the field.</p>
      {keyExists && (
        <p className="text-xs text-destructive">
          A field with this name already exists.
        </p>
      )}
    </div>
  );
}

function FieldBlock({
  label,
  actions,
  children,
}: {
  label?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {(label || actions) && (
        <div className="flex items-center gap-2">
          {label ? <Label className="min-w-0 flex-1 truncate text-muted-foreground">{label}</Label> : <span className="flex-1" />}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function StructuredForm({
  data,
  onChange,
  className,
  initialExpandAll = false,
  resetKey = '__default__',
}: StructuredFormProps) {
  const allPaths = useMemo(() => collectCollapsiblePaths(data, ''), [data]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => (initialExpandAll ? new Set(allPaths) : new Set())
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const paths = collectCollapsiblePaths(data, '');
    setExpandedPaths(initialExpandAll ? new Set(paths) : new Set());
    setSearchQuery('');
    // reset only when switching source document/expansion mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, initialExpandAll]);

  const { visiblePaths, expandPathsWhenFiltered, matchCount } = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) {
      return {
        visiblePaths: new Set<string>(),
        expandPathsWhenFiltered: new Set<string>(),
        matchCount: 0,
      };
    }
    const matching = findMatchingPaths(data, q, '');
    const visible = getAncestorsAndSelf(matching);
    const toExpand = getPathsToExpand(matching);
    return {
      visiblePaths: visible,
      expandPathsWhenFiltered: toExpand,
      matchCount: matching.length,
    };
  }, [data, searchQuery]);

  const effectiveExpandedPaths = useMemo(() => {
    if (!searchQuery.trim()) return expandedPaths;
    const next = new Set(expandedPaths);
    for (const p of expandPathsWhenFiltered) next.add(p);
    return next;
  }, [expandedPaths, searchQuery, expandPathsWhenFiltered]);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (searchQuery.trim()) {
      setExpandedPaths(new Set(expandPathsWhenFiltered));
    } else {
      setExpandedPaths(new Set(allPaths));
    }
  }, [allPaths, searchQuery, expandPathsWhenFiltered]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const isFiltered = searchQuery.trim().length > 0;
  const pathsToConsider = isFiltered
    ? expandPathsWhenFiltered
    : new Set(allPaths);
  const allExpanded =
    pathsToConsider.size > 0 &&
    [...pathsToConsider].every((p) => effectiveExpandedPaths.has(p));

  const value = useMemo<ExpandContextValue>(
    () => ({
      expandedPaths: effectiveExpandedPaths,
      togglePath,
      expandAll,
      collapseAll,
      searchQuery,
      visiblePaths,
      expandPathsWhenFiltered,
    }),
    [
      effectiveExpandedPaths,
      togglePath,
      expandAll,
      collapseAll,
      searchQuery,
      visiblePaths,
      expandPathsWhenFiltered,
    ]
  );

  return (
    <ExpandContext.Provider value={value}>
      <div className={cn('space-y-4', className)}>
        {allPaths.length > 0 && (
          <div
            role="toolbar"
            className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
          >
            <div className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pr-8 pl-8"
                aria-label="Filter form data"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {isFiltered && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {matchCount} match{matchCount === 1 ? '' : 'es'}
              </span>
            )}
            <Toggle
              variant="outline"
              size="sm"
              pressed={allExpanded}
              onPressedChange={(pressed) => (pressed ? expandAll() : collapseAll())}
              aria-label={allExpanded ? 'Collapse' : 'Expand'}
            >
              {allExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Toggle>
          </div>
        )}
        {isFiltered && visiblePaths.size === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No matches for &quot;{searchQuery.trim()}&quot;
          </p>
        ) : (
          <FormField value={data} onChange={onChange} path="" />
        )}
      </div>
    </ExpandContext.Provider>
  );
}

function CollapsibleNode({
  path,
  label,
  typeHint,
  actions,
  children,
}: {
  path: string;
  label: string;
  typeHint: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ctx = useContext(ExpandContext);
  const isExpanded = ctx ? ctx.expandedPaths.has(path) : false;
  const toggle = ctx ? () => ctx.togglePath(path) : () => {};

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-border hover:bg-accent/60 hover:text-accent-foreground"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{typeHint}</span>
        {actions && (
          <div className="ml-1 flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </button>
      {isExpanded && <div className="pl-2">{children}</div>}
    </div>
  );
}

function FormField({
  value,
  onChange,
  path,
  label,
  onRemove,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  label?: string;
  onRemove?: () => void;
}) {
  const ctx = useContext(ExpandContext);
  const removeAction = onRemove ? (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onRemove}
      aria-label={label ? `Remove ${label}` : 'Remove item'}
      className="border border-border/70 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-3" />
    </Button>
  ) : null;

  if (value === null || value === undefined) {
    return (
      <FieldBlock label={label} actions={removeAction}>
        <Input
          value=""
          placeholder="null"
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === 'true' ? true : v === 'false' ? false : v === '' ? null : v);
          }}
          className="font-mono"
        />
      </FieldBlock>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <FieldBlock>
        <div className="flex items-center gap-2">
          <Checkbox
            id={path}
            checked={value}
            onCheckedChange={(v) => onChange(v === true)}
          />
          {label && (
            <Label htmlFor={path} className="cursor-pointer text-sm font-normal">
              {label}
            </Label>
          )}
          {removeAction}
        </div>
      </FieldBlock>
    );
  }

  if (typeof value === 'number') {
    return (
      <FieldBlock label={label} actions={removeAction}>
        <NumberInput
          value={value}
          onChange={onChange}
          className="font-mono"
        />
      </FieldBlock>
    );
  }

  if (typeof value === 'string') {
    return (
      <FieldBlock label={label} actions={removeAction}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
      </FieldBlock>
    );
  }

  if (Array.isArray(value)) {
    const isFiltered = ctx && ctx.searchQuery.trim().length > 0;
    const filteredIndices = isFiltered
      ? value
          .map((_, i) => i)
          .filter((i) => ctx!.visiblePaths.has(`${path}[${i}]`))
      : value.map((_, i) => i);

    const typeHint = `[${value.length} item${value.length !== 1 ? 's' : ''}]`;
    const content = (
      <div className="space-y-3 border-l-2 border-border/70 pl-3">
        {!label && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              const template = value.length > 0 ? cloneStructure(value[value.length - 1]) : {};
              onChange([...value, template]);
            }}
            aria-label="Add item to array"
            className="border border-border/70 bg-background/80 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Plus className="size-3" />
          </Button>
        )}
        {filteredIndices.map((i) => (
          <div key={i} className="group flex items-start gap-2 rounded-md border border-border/60 bg-card/30 p-2">
            <div className="flex-1 min-w-0">
              <FormField
                value={value[i]}
                onChange={(v) => {
                  const next = [...value];
                  next[i] = v;
                  onChange(next);
                }}
                path={`${path}[${i}]`}
                label={`[${i}]`}
                onRemove={() => {
                  const next = value.filter((_, j) => j !== i);
                  onChange(next);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );

    if (label) {
      return (
        <CollapsibleNode
          path={path}
          label={label}
          typeHint={typeHint}
          actions={
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  const template = value.length > 0 ? cloneStructure(value[value.length - 1]) : {};
                  onChange([...value, template]);
                }}
                aria-label={`Add item to ${label}`}
                className="border border-border/70 bg-background/80 text-primary hover:bg-primary/10 hover:text-primary"
              >
                <Plus className="size-3" />
              </Button>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onRemove}
                  aria-label={`Remove ${label}`}
                  className="border border-border/70 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </>
          }
        >
          {content}
        </CollapsibleNode>
      );
    }
    return <div className="space-y-3">{content}</div>;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const allKeys = Object.keys(obj);
    const isFiltered = ctx && ctx.searchQuery.trim().length > 0;
    const keys = isFiltered
      ? allKeys.filter((key) => {
          const childPath = path ? `${path}.${key}` : `.${key}`;
          return ctx!.visiblePaths.has(childPath);
        })
      : allKeys;

    const typeHint = `{${keys.length} key${keys.length !== 1 ? 's' : ''}}`;
    const content = (
      <div className="space-y-3 border-l-2 border-border/70 pl-3">
        {!label && (
          <AddObjectField
            existingKeys={allKeys}
            onAdd={(key, val) => onChange({ ...obj, [key]: val })}
          />
        )}
        {keys.map((key) => (
          <FormField
            key={key}
            value={obj[key]}
            onChange={(v) => onChange({ ...obj, [key]: v })}
            path={`${path}.${key}`}
            label={key}
          />
        ))}
      </div>
    );

    if (label) {
      return (
        <CollapsibleNode
          path={path}
          label={label}
          typeHint={typeHint}
          actions={
            <>
              <AddObjectField
                compact
                existingKeys={allKeys}
                onAdd={(key, val) => onChange({ ...obj, [key]: val })}
              />
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onRemove}
                  aria-label={`Remove ${label}`}
                  className="border border-border/70 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </>
          }
        >
          {content}
        </CollapsibleNode>
      );
    }
    return <div className="space-y-3">{content}</div>;
  }

  return null;
}
