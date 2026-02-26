import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

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
};

const ExpandContext = createContext<ExpandContextValue | null>(null);

interface StructuredFormProps {
  data: unknown;
  onChange: (data: unknown) => void;
  className?: string;
}

export function StructuredForm({ data, onChange, className }: StructuredFormProps) {
  const allPaths = useMemo(() => collectCollapsiblePaths(data, ''), [data]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedPaths(new Set(allPaths));
  }, [allPaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const value = useMemo<ExpandContextValue>(
    () => ({ expandedPaths, togglePath, expandAll, collapseAll }),
    [expandedPaths, togglePath, expandAll, collapseAll]
  );

  const allExpanded = allPaths.length > 0 && expandedPaths.size === allPaths.length;

  return (
    <ExpandContext.Provider value={value}>
      <div className={cn('space-y-4', className)}>
        {allPaths.length > 0 && (
          <div
            role="toolbar"
            className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
          >
            <Toggle
              variant="outline"
              size="sm"
              pressed={allExpanded}
              onPressedChange={(pressed) => (pressed ? expandAll() : collapseAll())}
              aria-label={allExpanded ? 'Collapse' : 'Expand'}
              className="gap-1.5"
            >
              {allExpanded ? (
                <>
                  <ChevronDown className="size-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronRight className="size-4" />
                  Expand
                </>
              )}
            </Toggle>
          </div>
        )}
        <FormField value={data} onChange={onChange} path="" />
      </div>
    </ExpandContext.Provider>
  );
}

function CollapsibleNode({
  path,
  label,
  typeHint,
  children,
}: {
  path: string;
  label: string;
  typeHint: string;
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
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{typeHint}</span>
      </button>
      {isExpanded && (
        <div className="pl-2">{children}</div>
      )}
    </div>
  );
}

function FormField({
  value,
  onChange,
  path,
  label,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  label?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="space-y-2">
        {label && <Label className="text-muted-foreground">{label}</Label>}
        <Input
          value=""
          placeholder="null"
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === 'true' ? true : v === 'false' ? false : v === '' ? null : v);
          }}
          className="font-mono"
        />
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={path}
          checked={value}
          onCheckedChange={(v) => onChange(v === true)}
        />
        {label && (
          <Label htmlFor={path} className="text-sm font-normal cursor-pointer">
            {label}
          </Label>
        )}
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div className="space-y-2">
        {label && <Label className="text-muted-foreground">{label}</Label>}
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="font-mono"
        />
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div className="space-y-2">
        {label && <Label className="text-muted-foreground">{label}</Label>}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
      </div>
    );
  }

  if (Array.isArray(value)) {
    const typeHint = `[${value.length} item${value.length !== 1 ? 's' : ''}]`;
    const content = (
      <div className="space-y-2 pl-2 border-l-2 border-border">
        {value.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <FormField
                value={item}
                onChange={(v) => {
                  const next = [...value];
                  next[i] = v;
                  onChange(next);
                }}
                path={`${path}[${i}]`}
                label={`[${i}]`}
              />
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                const next = value.filter((_, j) => j !== i);
                onChange(next);
              }}
              aria-label={`Remove item ${i + 1}`}
              className="text-destructive hover:text-destructive shrink-0"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, ''])}
          className="gap-1"
        >
          <Plus className="size-4" />
          Add item
        </Button>
      </div>
    );

    if (label) {
      return (
        <CollapsibleNode path={path} label={label} typeHint={typeHint}>
          {content}
        </CollapsibleNode>
      );
    }
    return <div className="space-y-2">{content}</div>;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const typeHint = `{${keys.length} key${keys.length !== 1 ? 's' : ''}}`;
    const content = (
      <div className="space-y-4 pl-2 border-l-2 border-border">
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
        <CollapsibleNode path={path} label={label} typeHint={typeHint}>
          {content}
        </CollapsibleNode>
      );
    }
    return <div className="space-y-4">{content}</div>;
  }

  return null;
}
