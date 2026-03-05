import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FlowCodeEditor } from '@/components/flow-code-editor';
import { FlowExpressionInput } from '@/components/flow-expression-input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { fetchRestSpec, fetchFlowList } from '@/services/api';
import {
  getRequestBodySchema,
  parseOpenAPIOperationsGrouped,
  resolvePathTemplate,
} from '@/lib/openapi';
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Flow, FlowStep, RestResource } from '@/services/api';
import type { ResolvedSchemaProperty } from '@/lib/openapi';

interface DatabaseOption {
  id: string;
  label: string;
}

interface FlowStepPanelContentProps {
  step: FlowStep;
  flow?: Flow | null;
  flowModule?: string;
  currentFlowId?: string;
  databases: DatabaseOption[];
  restResources: RestResource[];
  onSave: (step: FlowStep) => void;
  onClose: () => void;
}

export function FlowStepPanelContent({
  step,
  flow = null,
  flowModule,
  currentFlowId,
  databases,
  restResources,
  onSave,
  onClose,
}: FlowStepPanelContentProps) {
  const [label, setLabel] = useState(step.label || step.id);
  const [config, setConfig] = useState<Record<string, unknown>>(step.config || {});

  const handleSave = (finalConfig?: Record<string, unknown>) => {
    onSave({ ...step, label, config: finalConfig ?? config });
    onClose();
  };

  if (step.type === 'http') {
    return (
      <HttpStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        currentStepId={step.id}
        restResources={restResources}
        onSaveWithConfig={handleSave}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'query') {
    return (
      <QueryStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        currentStepId={step.id}
        databases={databases}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'input') {
    return (
      <InputStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'message') {
    return (
      <MessageStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        currentStepId={step.id}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'sleep') {
    return (
      <SleepStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'transform') {
    return (
      <TransformStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        currentStepId={step.id}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'container') {
    return (
      <ContainerStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        currentStepId={step.id}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'pipeline') {
    return (
      <PipelineStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        flowModule={flowModule}
        currentFlowId={currentFlowId}
        currentStepId={step.id}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  if (step.type === 'output') {
    return (
      <OutputStepConfig
        label={label}
        setLabel={setLabel}
        config={config}
        setConfig={setConfig}
        flow={flow}
        currentStepId={step.id}
        onSave={() => handleSave()}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Unknown step type: {step.type}</p>
      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RequestBodySchemaForm({
  bodySchema,
  bodyValue,
  onChange,
}: {
  bodySchema: { properties: ResolvedSchemaProperty[]; spec: Record<string, unknown> };
  bodyValue: string;
  onChange: (body: string) => void;
}) {
  const values = useMemo(() => {
    try {
      if (!bodyValue.trim()) return {};
      return JSON.parse(bodyValue) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [bodyValue]);

  const updateField = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    onChange(JSON.stringify(next, null, 2));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      {bodySchema.properties.map((prop) => (
        <SchemaPropertyField
          key={prop.name}
          prop={prop}
          value={values[prop.name]}
          onChange={(v) => updateField(prop.name, v)}
        />
      ))}
    </div>
  );
}

function SchemaPropertyField({
  prop,
  value,
  onChange,
}: {
  prop: ResolvedSchemaProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { name, schema, required } = prop;
  const type = schema.type ?? 'string';
  const enumValues = schema.enum;
  const description = schema.description;

  if (enumValues != null && Array.isArray(enumValues)) {
    return (
      <div>
        <Label htmlFor={`body-${name}`} className="text-xs font-normal text-muted-foreground">
          {name}{required ? ' *' : ''}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => {
            if (type === 'number' || type === 'integer') onChange(Number(v));
            else if (type === 'boolean') onChange(v === 'true');
            else onChange(v);
          }}
        >
          <SelectTrigger id={`body-${name}`} className="mt-1 w-full">
            <SelectValue placeholder={`Select ${name}`} />
          </SelectTrigger>
          <SelectContent>
            {enumValues.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={`body-${name}`}
          checked={value === true || value === 'true'}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={`body-${name}`} className="text-xs font-normal cursor-pointer">
          {name}{required ? ' *' : ''}
        </Label>
        {description && (
          <span className="text-xs text-muted-foreground">— {description}</span>
        )}
      </div>
    );
  }

  if (type === 'integer' || type === 'number') {
    return (
      <div>
        <Label htmlFor={`body-${name}`} className="text-xs font-normal text-muted-foreground">
          {name}{required ? ' *' : ''}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        <Input
          id={`body-${name}`}
          type="number"
          value={value != null ? String(value) : ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : (type === 'integer' ? parseInt(v, 10) : parseFloat(v)));
          }}
          placeholder={schema.format === 'int64' ? 'e.g. 123' : undefined}
          className="mt-1 w-full font-mono"
        />
      </div>
    );
  }

  if (type === 'array' && schema.items) {
    return (
      <div>
        <Label htmlFor={`body-${name}`} className="text-xs font-normal text-muted-foreground">
          {name}{required ? ' *' : ''}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        <Textarea
          id={`body-${name}`}
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={(e) => {
            const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            onChange(parts.length > 0 ? parts : undefined);
          }}
          placeholder="Comma-separated values"
          rows={2}
          className="mt-1 w-full font-mono text-sm"
        />
      </div>
    );
  }

  // string or object (nested) - use text input; for object refs, user can enter JSON
  const isObject = type === 'object' || schema.$ref;
  return (
    <div>
      <Label htmlFor={`body-${name}`} className="text-xs font-normal text-muted-foreground">
        {name}{required ? ' *' : ''}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
      <Textarea
        id={`body-${name}`}
        value={
          isObject && (typeof value === 'object' || typeof value === 'string')
            ? typeof value === 'string'
              ? value
              : JSON.stringify(value ?? {}, null, 2)
            : String(value ?? '')
        }
        onChange={(e) => {
          const v = e.target.value;
          if (isObject && v.trim().startsWith('{')) {
            try {
              onChange(JSON.parse(v));
            } catch {
              onChange(v);
            }
          } else {
            onChange(v || undefined);
          }
        }}
        placeholder={isObject ? '{"key": "value"}' : undefined}
        rows={isObject ? 3 : 1}
        className="mt-1 w-full font-mono text-sm"
      />
    </div>
  );
}

function HttpStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  currentStepId,
  restResources,
  onSaveWithConfig,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
  restResources: RestResource[];
  onSaveWithConfig: (config: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const restId = (config.restId as string) ?? '';
  const operationKey = (config.operationKey as string) ?? '';

  const { data: specData } = useQuery({
    queryKey: ['rest', 'spec', restId],
    queryFn: () => fetchRestSpec(restId),
    enabled: !!restId,
  });

  const { groups } = specData
    ? parseOpenAPIOperationsGrouped(specData)
    : { groups: [] };

  const allOperations = groups.flatMap((g) => g.operations);
  const selectedOp = allOperations.find(
    (o) => `${o.method} ${o.path}` === operationKey
  );

  const pathParams = selectedOp?.parameters?.filter((p) => p.in === 'path') ?? [];
  const queryParams = selectedOp?.parameters?.filter((p) => p.in === 'query') ?? [];
  const hasBody =
    selectedOp?.requestBody?.content?.['application/json'] != null ||
    selectedOp?.bodySchema != null;

  const bodySchema = specData && selectedOp
    ? getRequestBodySchema(specData, selectedOp)
    : null;

  const pathParamValues = (config.pathParams as Record<string, string>) ?? {};
  const queryParamValues = (config.queryParams as Record<string, string>) ?? {};
  const bodyValue = (config.body as string) ?? '';

  const resolvedPath = selectedOp
    ? resolvePathTemplate(selectedOp.path, pathParamValues)
    : '';

  const resolvedQuery = Object.entries(queryParamValues)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const finalPath = resolvedQuery ? `${resolvedPath}?${resolvedQuery}` : resolvedPath;

  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rest-id">
          REST resource
          <span className="ml-1 text-muted-foreground font-normal">(resource)</span>
        </Label>
        <Select
          value={restId}
          onValueChange={(v) => {
            setConfig({
              ...config,
              restId: v,
              operationKey: '',
              pathParams: {},
              queryParams: {},
              body: '',
            });
          }}
        >
          <SelectTrigger id="rest-id" className="w-full">
            <SelectValue placeholder="Select REST resource" />
          </SelectTrigger>
          <SelectContent>
            {restResources.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label || r.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {restId && (
        <div className="space-y-2">
          <Label htmlFor="endpoint">
            Endpoint
            <span className="ml-1 text-muted-foreground font-normal">(openapi)</span>
          </Label>
          <Select
            value={operationKey}
            onValueChange={(v) => {
              setConfig({
                ...config,
                operationKey: v,
                method: v.split(' ')[0],
                path: v.split(' ').slice(1).join(' '),
                pathParams: {},
                queryParams: {},
                body: '',
              });
            }}
          >
            <SelectTrigger id="endpoint" className="w-full">
              <SelectValue placeholder="Select endpoint" />
            </SelectTrigger>
            <SelectContent>
              {groups.map(({ tag, operations }) => (
                <SelectGroup key={tag}>
                  <SelectLabel>{tag}</SelectLabel>
                  {operations.map((op) => (
                    <SelectItem
                      key={`${op.method} ${op.path}`}
                      value={`${op.method} ${op.path}`}
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {op.method}
                      </span>
                      {op.path}
                      {op.summary && (
                        <span className="text-muted-foreground ml-1">
                          — {op.summary}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedOp && (
        <>
          {pathParams.length > 0 && (
            <div className="space-y-2">
              <Label>Path parameters</Label>
              {pathParams.map((p) => (
                <div key={p.name}>
                  <Label htmlFor={`path-${p.name}`} className="text-xs font-normal text-muted-foreground">
                    {p.name}{p.required ? ' *' : ''}
                  </Label>
                  <FlowExpressionInput
                    value={pathParamValues[p.name] ?? ''}
                    onChange={(v) =>
                      setConfig({
                        ...config,
                        pathParams: {
                          ...pathParamValues,
                          [p.name]: v,
                        },
                      })
                    }
                    flow={flow}
                    currentStepId={currentStepId}
                    rows={1}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          )}

          {queryParams.length > 0 && (
            <div className="space-y-2">
              <Label>Query parameters</Label>
              {queryParams.map((p) => (
                <div key={p.name}>
                  <Label htmlFor={`query-${p.name}`} className="text-xs font-normal text-muted-foreground">
                    {p.name}{p.required ? ' *' : ''}
                  </Label>
                  <FlowExpressionInput
                    value={queryParamValues[p.name] ?? ''}
                    onChange={(v) =>
                      setConfig({
                        ...config,
                        queryParams: {
                          ...queryParamValues,
                          [p.name]: v,
                        },
                      })
                    }
                    flow={flow}
                    currentStepId={currentStepId}
                    rows={1}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          )}

          {hasBody && (
            <div className="space-y-2">
              <Label>Request body</Label>
              {bodySchema && bodySchema.properties.length > 0 ? (
                <RequestBodySchemaForm
                  bodySchema={bodySchema}
                  bodyValue={bodyValue}
                  onChange={(body) => setConfig({ ...config, body })}
                />
              ) : (
                <FlowCodeEditor
                  value={bodyValue}
                  onChange={(v) => setConfig({ ...config, body: v })}
                  language="json"
                  flow={flow}
                  currentStepId={currentStepId}
                  minHeight={180}
                  className="w-full"
                />
              )}
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Resolved path: </span>
            <span className="font-mono">{finalPath || '(none)'}</span>
          </div>
        </>
      )}

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const saveConfig = { ...config };
            if (selectedOp) {
              saveConfig.method = selectedOp.method;
              saveConfig.path = finalPath || selectedOp.path;
            }
            onSaveWithConfig(saveConfig);
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function QueryStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  currentStepId,
  databases,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
  databases: DatabaseOption[];
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="database-id">
          Database
          <span className="ml-1 text-muted-foreground font-normal">(postgres)</span>
        </Label>
        <Select
          value={(config.databaseId as string) ?? ''}
          onValueChange={(v) =>
            setConfig({ ...config, databaseId: v })
          }
        >
          <SelectTrigger id="database-id" className="w-full">
            <SelectValue placeholder="Select database" />
          </SelectTrigger>
          <SelectContent>
            {databases.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label || d.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sql">
          SQL
          <span className="ml-1 text-muted-foreground font-normal">(query)</span>
        </Label>
        <FlowCodeEditor
          value={(config.sql as string) ?? ''}
          onChange={(v) => setConfig({ ...config, sql: v })}
          language="sql"
          flow={flow}
          currentStepId={currentStepId}
          minHeight={200}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="args">
          Args
          <span className="ml-1 text-muted-foreground font-normal">(params)</span>
        </Label>
        <FlowCodeEditor
          value={((config.args as string[]) ?? []).join(', ')}
          onChange={(v) => {
            const vals = v
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            setConfig({ ...config, args: vals });
          }}
          flow={flow}
          currentStepId={currentStepId}
          minHeight={60}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Comma-separated param references for $1, $2, etc. (e.g. param.user_id)
        </p>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

interface InputParam {
  name: string;
  type: string;
  default?: string;
  description?: string;
}

function InputStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const params = (config.params as InputParam[]) ?? [];

  const setParams = (next: InputParam[]) => {
    setConfig({ ...config, params: next });
  };

  const addParam = () => {
    setParams([...params, { name: '', type: 'string' }]);
  };

  const updateParam = (i: number, updates: Partial<InputParam>) => {
    const next = [...params];
    next[i] = { ...next[i], ...updates };
    setParams(next);
  };

  const removeParam = (i: number) => {
    setParams(params.filter((_, j) => j !== i));
  };

  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Parameters</Label>
          <Button variant="outline" size="sm" onClick={addParam} className="gap-1">
            <Plus className="size-3" />
            Add param
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Define input variables for the flow. Use <code className="font-mono">param.paramName</code> in other steps to reference them.
        </p>
        <div className="space-y-3">
          {params.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="param_name"
                  value={p.name}
                  onChange={(e) => updateParam(i, { name: e.target.value.replace(/\s/g, '_') })}
                  className="min-w-0 flex-1 font-mono"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => removeParam(i)} aria-label="Remove param">
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`param-type-${i}`} className="text-xs font-normal text-muted-foreground">
                  Type
                </Label>
                <Select
                  value={p.type}
                  onValueChange={(v) => updateParam(i, { type: v })}
                >
                  <SelectTrigger id={`param-type-${i}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="bool">bool</SelectItem>
                    <SelectItem value="any">any</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Description (optional)"
                value={p.description ?? ''}
                onChange={(e) => updateParam(i, { description: e.target.value || undefined })}
                className="w-full text-sm"
              />
              <Input
                placeholder="Default value (optional)"
                value={p.default ?? ''}
                onChange={(e) => updateParam(i, { default: e.target.value || undefined })}
                className="w-full text-sm font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

interface OutputItem {
  name: string;
  value: string;
}

function OutputStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  currentStepId,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const outputs = (config.outputs as OutputItem[]) ?? [];

  const setOutputs = (next: OutputItem[]) => {
    setConfig({ ...config, outputs: next });
  };

  const addOutput = () => {
    setOutputs([...outputs, { name: 'result', value: '' }]);
  };

  const updateOutput = (i: number, updates: Partial<OutputItem>) => {
    const next = [...outputs];
    next[i] = { ...next[i], ...updates };
    setOutputs(next);
  };

  const removeOutput = (i: number) => {
    setOutputs(outputs.filter((_, j) => j !== i));
  };

  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Outputs</Label>
          <Button variant="outline" size="sm" onClick={addOutput} className="gap-1">
            <Plus className="size-3" />
            Add output
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Define pipeline outputs. Each output block maps to a named value in the pipeline result. Use HCL expressions like <code className="font-mono">step.http.foo.response_body</code>.
        </p>
        <div className="space-y-3">
          {outputs.map((o, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="output_name"
                  value={o.name}
                  onChange={(e) => updateOutput(i, { name: e.target.value.replace(/\s/g, '_') })}
                  className="min-w-0 flex-1 font-mono"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => removeOutput(i)} aria-label="Remove output">
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`output-value-${i}`} className="text-xs font-normal text-muted-foreground">
                  Value (HCL expression)
                </Label>
                <FlowCodeEditor
                  value={o.value}
                  onChange={(v) => updateOutput(i, { value: v })}
                  language="hcl"
                  flow={flow}
                  currentStepId={currentStepId ?? ''}
                  minHeight={60}
                  className="w-full"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function MessageStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  currentStepId,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">Name</Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notifier-id">
          Notifier
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="notifier-id"
          value={(config.notifier as string) ?? 'default'}
          onChange={(e) =>
            setConfig({ ...config, notifier: e.target.value })
          }
          placeholder="default or slack"
          className="w-full font-mono text-sm"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Target notifier (auto-prefixed with <code>notifier.</code> if omitted).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message-text">
          Message Text
          <span className="ml-1 text-muted-foreground font-normal">(interpolated)</span>
        </Label>
        <FlowExpressionInput
          value={(config.text as string) ?? ''}
          onChange={(v) => setConfig({ ...config, text: v })}
          flow={flow}
          currentStepId={currentStepId}
          rows={6}
          className="w-full"
        />
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function SleepStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="duration">
          Duration
          <span className="ml-1 text-muted-foreground font-normal">(e.g. 5s, 100ms, 1m)</span>
        </Label>
        <Input
          id="duration"
          value={(config.duration as string) ?? '5s'}
          onChange={(e) => setConfig({ ...config, duration: e.target.value })}
          placeholder="5s"
          className="w-full font-mono"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Go duration string or milliseconds (e.g. 5s, 100ms, 1m).
        </p>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function TransformStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  currentStepId,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transform-value">
          Value
          <span className="ml-1 text-muted-foreground font-normal">(HCL expression)</span>
        </Label>
        <FlowCodeEditor
          value={(config.value as string) ?? ''}
          onChange={(v) => setConfig({ ...config, value: v })}
          language="hcl"
          flow={flow}
          currentStepId={currentStepId}
          minHeight={120}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          HCL expression (e.g. jsonencode(step.http.foo.response_body) or step.query.bar.rows).
        </p>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function ContainerStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  currentStepId,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const image = (config.image as string) ?? '';
  const source = (config.source as string) ?? '';
  const cmdRaw = config.cmd;
  const cmdStr = Array.isArray(cmdRaw)
    ? (cmdRaw as string[]).join(' ')
    : typeof cmdRaw === 'string'
      ? cmdRaw
      : '';
  const envStr =
    typeof config.env === 'object' && config.env !== null
      ? JSON.stringify(config.env, null, 2)
      : '{}';

  const setCmd = (v: string) => {
    const parts = v
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setConfig({ ...config, cmd: parts });
  };

  const setEnv = (v: string) => {
    try {
      const parsed = v.trim() ? JSON.parse(v) : {};
      setConfig({ ...config, env: parsed });
    } catch {
      setConfig({ ...config, env: v });
    }
  };

  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="container-image">
          Image
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="container-image"
          value={image}
          onChange={(e) => setConfig({ ...config, image: e.target.value, source: '' })}
          placeholder="e.g. alpine:latest"
          className="w-full font-mono text-sm"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Docker image to run. Leave empty to use source instead.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="container-source">
          Source
          <span className="ml-1 text-muted-foreground font-normal">(path)</span>
        </Label>
        <Input
          id="container-source"
          value={source}
          onChange={(e) => setConfig({ ...config, source: e.target.value, image: '' })}
          placeholder="Path to Dockerfile folder"
          className="w-full font-mono text-sm"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Path to folder with Dockerfile (alternative to image).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="container-cmd">
          Command
          <span className="ml-1 text-muted-foreground font-normal">(list)</span>
        </Label>
        <FlowExpressionInput
          value={cmdStr}
          onChange={setCmd}
          flow={flow}
          currentStepId={currentStepId ?? ''}
          rows={2}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Space-separated command and args (e.g. echo hello).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="container-env">
          Environment
          <span className="ml-1 text-muted-foreground font-normal">(map)</span>
        </Label>
        <FlowCodeEditor
          value={envStr}
          onChange={setEnv}
          language="json"
          flow={flow}
          currentStepId={currentStepId ?? ''}
          minHeight={80}
          className="w-full"
        />
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function PipelineStepConfig({
  label,
  setLabel,
  config,
  setConfig,
  flow,
  flowModule,
  currentFlowId,
  currentStepId,
  onSave,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  flowModule?: string;
  currentFlowId?: string;
  currentStepId?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const { data: flowList } = useQuery({
    queryKey: ['flows', flowModule ?? ''],
    queryFn: () => fetchFlowList(flowModule),
    enabled: true,
  });

  const flows = flowList?.flows ?? [];
  const availableFlows = flows.filter((f) => f.id !== currentFlowId);
  const pipelineRef = (config.pipelineRef as string) ?? '';
  const argsStr =
    typeof config.args === 'object' && config.args !== null
      ? JSON.stringify(config.args, null, 2)
      : typeof config.args === 'string'
        ? config.args
        : '{}';

  const setArgs = (v: string) => {
    try {
      const parsed = v.trim() ? JSON.parse(v) : {};
      setConfig({ ...config, args: parsed });
    } catch {
      setConfig({ ...config, args: v });
    }
  };

  return (
    <div className="flex flex-col gap-4 overflow-auto">
      <div className="space-y-2">
        <Label htmlFor="step-name">
          Name
          <span className="ml-1 text-muted-foreground font-normal">(string)</span>
        </Label>
        <Input
          id="step-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Step name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pipeline-ref">
          Pipeline
          <span className="ml-1 text-muted-foreground font-normal">(reference)</span>
        </Label>
        {availableFlows.length > 0 ? (
          <Select
            value={pipelineRef}
            onValueChange={(v) => setConfig({ ...config, pipelineRef: v })}
          >
            <SelectTrigger id="pipeline-ref" className="w-full">
              <SelectValue placeholder="Select pipeline" />
            </SelectTrigger>
            <SelectContent>
              {availableFlows.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name || f.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="pipeline-ref"
            value={pipelineRef}
            onChange={(e) => setConfig({ ...config, pipelineRef: e.target.value })}
            placeholder="e.g. my_flow"
            className="w-full font-mono text-sm"
          />
        )}
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Flow/pipeline to invoke (same module).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pipeline-args">
          Args
          <span className="ml-1 text-muted-foreground font-normal">(map)</span>
        </Label>
        <FlowCodeEditor
          value={argsStr}
          onChange={setArgs}
          language="json"
          flow={flow}
          currentStepId={currentStepId ?? ''}
          minHeight={100}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          JSON map of argument names to values (e.g. {JSON.stringify({ param1: 'value' })}).
        </p>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
