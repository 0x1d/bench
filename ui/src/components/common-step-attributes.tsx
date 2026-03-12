import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowExpressionInput } from '@/components/flow-expression-input';
import { FlowCodeEditor } from '@/components/flow-code-editor';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Flow } from '@/services/api';

/** Common step attributes per Flowpipe: https://flowpipe.io/docs/flowpipe-hcl/step#common-step-arguments */
export interface CommonStepAttributesConfig {
  title?: string;
  description?: string;
  timeout?: string | number;
  if?: string;
  for_each?: string;
  max_concurrency?: number;
  error?: {
    enabled?: boolean;
    ignore?: boolean;
    if?: string;
  };
  loop?: {
    enabled?: boolean;
    until?: string;
  };
  retry?: {
    enabled?: boolean;
    max_attempts?: number;
    strategy?: string;
    min_interval?: number;
    if?: string;
  };
  throw?: {
    enabled?: boolean;
    if?: string;
    message?: string;
  };
  output?: {
    enabled?: boolean;
    outputs?: Array<{ name: string; value: string }>;
  };
}

const RETRY_STRATEGIES = ['exponential', 'linear', 'constant'];

interface CommonStepAttributesProps {
  config: Record<string, unknown>;
  setConfig: (v: Record<string, unknown>) => void;
  flow?: Flow | null;
  currentStepId?: string;
}

function getCommon(config: Record<string, unknown>): CommonStepAttributesConfig {
  const c = config.commonAttributes as Record<string, unknown> | undefined;
  if (!c) return {};
  return {
    title: c.title as string | undefined,
    description: c.description as string | undefined,
    timeout: c.timeout as string | number | undefined,
    if: c.if as string | undefined,
    for_each: c.for_each as string | undefined,
    max_concurrency: c.max_concurrency as number | undefined,
    error: c.error as CommonStepAttributesConfig['error'],
    loop: c.loop as CommonStepAttributesConfig['loop'],
    retry: c.retry as CommonStepAttributesConfig['retry'],
    throw: c.throw as CommonStepAttributesConfig['throw'],
    output: c.output as CommonStepAttributesConfig['output'],
  };
}

function setCommon(
  config: Record<string, unknown>,
  updates: Partial<CommonStepAttributesConfig>
): Record<string, unknown> {
  const current = getCommon(config);
  const next = { ...current, ...updates };
  return { ...config, commonAttributes: next };
}

function hasText(value: string | undefined): boolean {
  return (value ?? '').trim().length > 0;
}

function hasCommonData(common: CommonStepAttributesConfig): boolean {
  if (hasText(common.title)) return true;
  if (hasText(common.description)) return true;
  if (common.timeout != null && (typeof common.timeout !== 'string' || hasText(common.timeout))) return true;
  if (hasText(common.if)) return true;
  if (hasText(common.for_each)) return true;
  if (typeof common.max_concurrency === 'number') return true;

  if (common.error?.enabled) return true;
  if (common.error?.ignore === true) return true;
  if (hasText(common.error?.if)) return true;

  if (common.loop?.enabled) return true;
  if (hasText(common.loop?.until)) return true;

  if (common.retry?.enabled) return true;
  if (typeof common.retry?.max_attempts === 'number') return true;
  if (hasText(common.retry?.strategy)) return true;
  if (typeof common.retry?.min_interval === 'number') return true;
  if (hasText(common.retry?.if)) return true;

  if (common.throw?.enabled) return true;
  if (hasText(common.throw?.if)) return true;
  if (hasText(common.throw?.message)) return true;

  if (common.output?.enabled) return true;
  if (
    (common.output?.outputs ?? []).some(
      (o) => hasText(o.name) || hasText(o.value)
    )
  ) {
    return true;
  }

  return false;
}

export function CommonStepAttributes({
  config,
  setConfig,
  flow,
  currentStepId = '',
}: CommonStepAttributesProps) {
  const common = getCommon(config);
  const hasData = hasCommonData(common);
  const stepKey = currentStepId || '__default__';
  const [collapsedByStep, setCollapsedByStep] = useState<Record<string, boolean>>({});
  const isExpanded = collapsedByStep[stepKey] !== undefined ? !collapsedByStep[stepKey] : hasData;

  const update = (updates: Partial<CommonStepAttributesConfig>) => {
    setConfig(setCommon(config, updates));
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-3">
      <button
        type="button"
        onClick={() =>
          setCollapsedByStep((previous) => ({
            ...previous,
            [stepKey]: isExpanded,
          }))
        }
        className="flex w-full items-center justify-between text-left"
        aria-expanded={isExpanded}
      >
        <span className="text-xs font-medium text-muted-foreground">
          Common step attributes
        </span>
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <>
      {/* Simple attributes */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="common-title" className="text-xs font-normal text-muted-foreground">
            title
          </Label>
          <Input
            id="common-title"
            value={common.title ?? ''}
            onChange={(e) => update({ title: e.target.value || undefined })}
            placeholder="Display title"
            className="w-full text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="common-description" className="text-xs font-normal text-muted-foreground">
            description
          </Label>
          <Input
            id="common-description"
            value={common.description ?? ''}
            onChange={(e) => update({ description: e.target.value || undefined })}
            placeholder="Step description"
            className="w-full text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="common-timeout" className="text-xs font-normal text-muted-foreground">
            timeout
          </Label>
          <FlowExpressionInput
            value={common.timeout != null ? String(common.timeout) : ''}
            onChange={(v) => {
              const n = parseFloat(v);
              update({ timeout: v === '' ? undefined : (Number.isNaN(n) ? v : n) });
            }}
            flow={flow}
            currentStepId={currentStepId}
            rows={1}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Duration (e.g. 30s, 60) or number of seconds.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="common-if" className="text-xs font-normal text-muted-foreground">
            if
          </Label>
          <FlowExpressionInput
            value={common.if ?? ''}
            onChange={(v) => update({ if: v || undefined })}
            flow={flow}
            currentStepId={currentStepId}
            rows={2}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Condition to run the step (e.g. param.enabled == true).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="common-for-each" className="text-xs font-normal text-muted-foreground">
            for_each
          </Label>
          <FlowExpressionInput
            value={common.for_each ?? ''}
            onChange={(v) => update({ for_each: v || undefined })}
            flow={flow}
            currentStepId={currentStepId}
            rows={2}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Map or list (e.g. {`{ a = 1, b = 2 }`} or {`["x","y"]`}).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="common-max-concurrency" className="text-xs font-normal text-muted-foreground">
            max_concurrency
          </Label>
          <Input
            id="common-max-concurrency"
            type="number"
            min={1}
            value={common.max_concurrency ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update({ max_concurrency: v === '' ? undefined : parseInt(v, 10) });
            }}
            placeholder="e.g. 5"
            className="w-full text-sm font-mono"
          />
        </div>
      </div>

      {/* Error block */}
      <div className="space-y-2 rounded border border-border/60 bg-background/50 p-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="common-error-enabled"
            checked={common.error?.enabled ?? false}
            onCheckedChange={(v) =>
              update({
                error: v
                  ? { enabled: true, ignore: false }
                  : { enabled: false },
              })
            }
          />
          <Label htmlFor="common-error-enabled" className="cursor-pointer text-xs font-medium">
            error
          </Label>
        </div>
        {common.error?.enabled && (
          <div className="ml-6 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="common-error-ignore"
                checked={common.error?.ignore ?? false}
                onCheckedChange={(v) =>
                  update({
                    error: { ...common.error!, ignore: v === true },
                  })
                }
              />
              <Label htmlFor="common-error-ignore" className="cursor-pointer text-xs font-normal">
                ignore — continue despite error
              </Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">if</Label>
              <FlowExpressionInput
                value={common.error?.if ?? ''}
                onChange={(v) =>
                  update({ error: { ...common.error!, if: v || undefined } })
                }
                flow={flow}
                currentStepId={currentStepId}
                rows={2}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Loop block */}
      <div className="space-y-2 rounded border border-border/60 bg-background/50 p-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="common-loop-enabled"
            checked={common.loop?.enabled ?? false}
            onCheckedChange={(v) =>
              update({
                loop: v ? { enabled: true } : { enabled: false },
              })
            }
          />
          <Label htmlFor="common-loop-enabled" className="cursor-pointer text-xs font-medium">
            loop
          </Label>
        </div>
        {common.loop?.enabled && (
          <div className="ml-6 space-y-2">
            <Label className="text-xs font-normal text-muted-foreground">until</Label>
            <FlowExpressionInput
              value={common.loop?.until ?? ''}
              onChange={(v) =>
                update({ loop: { ...common.loop!, until: v || undefined } })
              }
              flow={flow}
              currentStepId={currentStepId}
              rows={2}
              className="w-full"
            />
            <p className="text-[10px] text-muted-foreground">
              Condition that breaks the loop when true.
            </p>
          </div>
        )}
      </div>

      {/* Retry block */}
      <div className="space-y-2 rounded border border-border/60 bg-background/50 p-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="common-retry-enabled"
            checked={common.retry?.enabled ?? false}
            onCheckedChange={(v) =>
              update({
                retry: v
                  ? { enabled: true, max_attempts: 3, strategy: 'exponential' }
                  : { enabled: false },
              })
            }
          />
          <Label htmlFor="common-retry-enabled" className="cursor-pointer text-xs font-medium">
            retry
          </Label>
        </div>
        {common.retry?.enabled && (
          <div className="ml-6 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">max_attempts</Label>
              <Input
                type="number"
                min={1}
                value={common.retry?.max_attempts ?? 3}
                onChange={(e) =>
                  update({
                    retry: {
                      ...common.retry!,
                      max_attempts: parseInt(e.target.value, 10) || 3,
                    },
                  })
                }
                className="w-full text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">strategy</Label>
              <select
                value={common.retry?.strategy ?? 'exponential'}
                onChange={(e) =>
                  update({
                    retry: { ...common.retry!, strategy: e.target.value },
                  })
                }
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono"
              >
                {RETRY_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">min_interval (ms)</Label>
              <Input
                type="number"
                min={0}
                value={common.retry?.min_interval ?? ''}
                onChange={(e) =>
                  update({
                    retry: {
                      ...common.retry!,
                      min_interval: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    },
                  })
                }
                placeholder="e.g. 1000"
                className="w-full text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">if</Label>
              <FlowExpressionInput
                value={common.retry?.if ?? ''}
                onChange={(v) =>
                  update({ retry: { ...common.retry!, if: v || undefined } })
                }
                flow={flow}
                currentStepId={currentStepId}
                rows={2}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Throw block */}
      <div className="space-y-2 rounded border border-border/60 bg-background/50 p-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="common-throw-enabled"
            checked={common.throw?.enabled ?? false}
            onCheckedChange={(v) =>
              update({
                throw: v ? { enabled: true } : { enabled: false },
              })
            }
          />
          <Label htmlFor="common-throw-enabled" className="cursor-pointer text-xs font-medium">
            throw
          </Label>
        </div>
        {common.throw?.enabled && (
          <div className="ml-6 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">if</Label>
              <FlowExpressionInput
                value={common.throw?.if ?? ''}
                onChange={(v) =>
                  update({ throw: { ...common.throw!, if: v || undefined } })
                }
                flow={flow}
                currentStepId={currentStepId}
                rows={2}
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">message</Label>
              <FlowExpressionInput
                value={common.throw?.message ?? ''}
                onChange={(v) =>
                  update({ throw: { ...common.throw!, message: v || undefined } })
                }
                flow={flow}
                currentStepId={currentStepId}
                rows={2}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Output block (per-step output) */}
      <div className="space-y-2 rounded border border-border/60 bg-background/50 p-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="common-output-enabled"
            checked={common.output?.enabled ?? false}
            onCheckedChange={(v) =>
              update({
                output: v
                  ? { enabled: true, outputs: [{ name: 'result', value: '' }] }
                  : { enabled: false },
              })
            }
          />
          <Label htmlFor="common-output-enabled" className="cursor-pointer text-xs font-medium">
            output
          </Label>
        </div>
        {common.output?.enabled && (
          <div className="ml-6 space-y-2">
            <p className="text-[10px] text-muted-foreground">
              Custom values returned from this step.
            </p>
            {(common.output?.outputs ?? []).map((o, i) => (
              <div key={i} className="flex gap-2 rounded border border-border/40 p-2">
                <Input
                  placeholder="name"
                  value={o.name}
                  onChange={(e) => {
                    const outputs = [...(common.output?.outputs ?? [])];
                    outputs[i] = { ...outputs[i], name: e.target.value.replace(/\s/g, '_') };
                    update({ output: { ...common.output!, outputs } });
                  }}
                  className="min-w-0 flex-1 font-mono text-sm"
                />
                <div className="flex-1 min-w-0">
                  <FlowCodeEditor
                    value={o.value}
                    onChange={(v) => {
                      const outputs = [...(common.output?.outputs ?? [])];
                      outputs[i] = { ...outputs[i], value: v };
                      update({ output: { ...common.output!, outputs } });
                    }}
                    language="hcl"
                    flow={flow}
                    currentStepId={currentStepId}
                    minHeight={50}
                    className="w-full"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    const outputs = (common.output?.outputs ?? []).filter((_, j) => j !== i);
                    update({ output: { ...common.output!, outputs } });
                  }}
                  aria-label="Remove output"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const outputs = [...(common.output?.outputs ?? []), { name: 'result', value: '' }];
                update({ output: { ...common.output!, outputs } });
              }}
              className="gap-1"
            >
              <Plus className="size-3" />
              Add output
            </Button>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
