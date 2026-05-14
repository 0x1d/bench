import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TriggerEntry, TriggerType } from '@/services/api';
import type { Dispatch, SetStateAction } from 'react';

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: 'schedule', label: 'Schedule' },
  { value: 'alert', label: 'Alert' },
  { value: 'http', label: 'HTTP' },
  { value: 'notification', label: 'Notification' },
];

interface TriggerFormProps {
  draft: TriggerEntry;
  onChange: Dispatch<SetStateAction<TriggerEntry>>;
  modules?: string[];
  workspaces?: string[];
  availablePipelines?: { id: string; name?: string }[];
}

export function TriggerForm({
  draft,
  onChange,
  modules = [],
  workspaces = [],
  availablePipelines = [],
}: TriggerFormProps) {
  const updateField = <K extends keyof TriggerEntry>(field: K, value: TriggerEntry[K]) => {
    onChange((prev) => ({ ...prev, [field]: value }));
  };

  const updateConfig = (key: string, value: unknown) => {
    onChange((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  return (
    <div className="space-y-4">
      {/* Basic Fields */}
      <div className="space-y-1">
        <Label>ID *</Label>
        <Input
          value={draft.id}
          onChange={(e) => updateField('id', e.target.value)}
          placeholder="my_trigger"
        />
      </div>

      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          value={draft.label || ''}
          onChange={(e) => updateField('label', e.target.value)}
          placeholder="My Trigger"
        />
      </div>

      <div className="space-y-1">
        <Label>Type *</Label>
        <Select
          value={draft.type}
          onValueChange={(value) => updateField('type', value as TriggerType)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Module *</Label>
        {modules.length > 0 ? (
          <Select
            value={draft.module}
            onValueChange={(value) => updateField('module', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={draft.module}
            onChange={(e) => updateField('module', e.target.value)}
            placeholder="module_name (empty for root)"
          />
        )}
        <p className="text-xs text-muted-foreground">
          The Flowpipe module where the trigger will be defined.
        </p>
      </div>

      {workspaces.length > 0 && (
        <div className="space-y-1">
          <Label>Workspace</Label>
          <Select
            value={draft.workspace || ''}
            onValueChange={(value) => updateField('workspace', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select workspace (optional)" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Type-specific Config Fields */}
      {draft.type === 'schedule' && (
        <ScheduleConfigFields
          config={draft.config}
          onChange={updateConfig}
          availablePipelines={availablePipelines}
        />
      )}

      {draft.type === 'alert' && (
        <AlertConfigFields
          config={draft.config}
          onChange={updateConfig}
          availablePipelines={availablePipelines}
        />
      )}

      {draft.type === 'http' && (
        <HttpConfigFields
          config={draft.config}
          onChange={updateConfig}
          availablePipelines={availablePipelines}
        />
      )}

      {draft.type === 'notification' && (
        <NotificationConfigFields
          config={draft.config}
          onChange={updateConfig}
          availablePipelines={availablePipelines}
        />
      )}
    </div>
  );
}

/** Inline pipeline reference selector with autocomplete. */
function PipelineRefInput({
  value,
  onChange,
  availablePipelines,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  availablePipelines: { id: string; name?: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  if (availablePipelines.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'e.g. pipeline.my_pipeline'}
        className="w-full font-mono text-sm"
      />
    );
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Select or type pipeline name'}
        className="w-full font-mono text-sm"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-auto">
          {availablePipelines
            .filter(
              (f) =>
                !value ||
                f.id.toLowerCase().includes(value.toLowerCase()) ||
                (f.name ?? '').toLowerCase().includes(value.toLowerCase())
            )
            .map((f) => (
              <div
                key={f.id}
                className="px-3 py-2 text-sm cursor-pointer font-mono hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(f.id);
                  setOpen(false);
                }}
              >
                {f.name && f.name !== f.id ? (
                  <span>
                    {f.name}{' '}
                    <span className="text-muted-foreground text-xs">({f.id})</span>
                  </span>
                ) : (
                  f.id
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ScheduleConfigFields({
  config,
  onChange,
  availablePipelines,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  availablePipelines: { id: string; name?: string }[];
}) {
  const args = (config.args as Record<string, string>) || {};

  const addArg = () => {
    onChange('args', { ...args, '': '' });
  };

  const updateArg = (oldKey: string, newKey: string, value: string) => {
    const updated = { ...args };
    if (oldKey !== newKey) {
      delete updated[oldKey];
    }
    updated[newKey] = value;
    onChange('args', updated);
  };

  const removeArg = (key: string) => {
    const updated = { ...args };
    delete updated[key];
    onChange('args', updated);
  };

  return (
    <>
      <div className="space-y-1">
        <Label>Cron Expression *</Label>
        <Input
          value={(config.cron as string) || ''}
          onChange={(e) => onChange('cron', e.target.value)}
          placeholder="0 */6 * * *"
        />
        <p className="text-xs text-muted-foreground">
          Standard cron expression (e.g., `0 */6 * * *` for every 6 hours).
        </p>
      </div>
      <div className="space-y-1">
        <Label>Timezone</Label>
        <Input
          value={(config.timezone as string) || ''}
          onChange={(e) => onChange('timezone', e.target.value)}
          placeholder="UTC"
        />
      </div>
      <div className="space-y-1">
        <Label>Pipeline *</Label>
        <PipelineRefInput
          value={(config.pipeline as string) || ''}
          onChange={(v) => onChange('pipeline', v)}
          availablePipelines={availablePipelines}
          placeholder="pipeline.my_pipeline"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Args</Label>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={addArg}
          >
            + Add arg
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pipeline parameters passed when the trigger fires.
        </p>
        {Object.entries(args).map(([key, value], idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <Input
              value={key}
              onChange={(e) => updateArg(key, e.target.value, value)}
              placeholder="param name"
              className="flex-1 font-mono text-sm"
            />
            <Input
              value={value}
              onChange={(e) => updateArg(key, key, e.target.value)}
              placeholder="value"
              className="flex-1 font-mono text-sm"
            />
            <button
              type="button"
              className="mt-1 text-muted-foreground hover:text-destructive"
              onClick={() => removeArg(key)}
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function AlertConfigFields({
  config,
  onChange,
  availablePipelines,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  availablePipelines: { id: string; name?: string }[];
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>Source *</Label>
        <Input
          value={(config.source as string) || ''}
          onChange={(e) => onChange('source', e.target.value)}
          placeholder="monitoring_system"
        />
      </div>
      <div className="space-y-1">
        <Label>Condition *</Label>
        <Textarea
          value={(config.condition as string) || ''}
          onChange={(e) => onChange('condition', e.target.value)}
          placeholder="CPU usage > 90% for 5 minutes"
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label>Pipeline *</Label>
        <PipelineRefInput
          value={(config.pipeline as string) || ''}
          onChange={(v) => onChange('pipeline', v)}
          availablePipelines={availablePipelines}
          placeholder="pipeline.my_pipeline"
        />
      </div>
    </>
  );
}

function HttpConfigFields({
  config,
  onChange,
  availablePipelines,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  availablePipelines: { id: string; name?: string }[];
}) {
  const args = (config.args as Record<string, string>) || {};

  const addArg = () => {
    onChange('args', { ...args, '': 'self.request_body' });
  };

  const updateArg = (oldKey: string, newKey: string, value: string) => {
    const updated = { ...args };
    if (oldKey !== newKey) {
      delete updated[oldKey];
    }
    updated[newKey] = value;
    onChange('args', updated);
  };

  const removeArg = (key: string) => {
    const updated = { ...args };
    delete updated[key];
    onChange('args', updated);
  };

  return (
    <>
      <div className="space-y-1">
        <Label>Pipeline *</Label>
        <PipelineRefInput
          value={(config.pipeline as string) || ''}
          onChange={(v) => onChange('pipeline', v)}
          availablePipelines={availablePipelines}
          placeholder="pipeline.my_pipeline"
        />
        <p className="text-xs text-muted-foreground">
          Flowpipe pipeline to execute when HTTP request is received.
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Args</Label>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={addArg}
          >
            + Add arg
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pipeline arguments to receive from the request. Use{' '}
          <code className="text-xs">self.request_body</code> or{' '}
          <code className="text-xs">self.request_headers</code> to pass request data.
        </p>
        {Object.entries(args).map(([key, value], idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <Input
              value={key}
              onChange={(e) => updateArg(key, e.target.value, value)}
              placeholder="param name"
              className="flex-1 font-mono text-sm"
            />
            <Input
              value={value}
              onChange={(e) => updateArg(key, key, e.target.value)}
              placeholder="e.g. self.request_body"
              className="flex-1 font-mono text-sm"
            />
            <button
              type="button"
              className="mt-1 text-muted-foreground hover:text-destructive"
              onClick={() => removeArg(key)}
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label>Execution Mode</Label>
        <Select
          value={(config.executionMode as string) || 'asynchronous'}
          onValueChange={(value) => onChange('executionMode', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asynchronous">Asynchronous</SelectItem>
            <SelectItem value="synchronous">Synchronous</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Whether the pipeline runs async (default) or returns output in the response.
        </p>
      </div>
    </>
  );
}

function NotificationConfigFields({
  config,
  onChange,
  availablePipelines,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  availablePipelines: { id: string; name?: string }[];
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>Source *</Label>
        <Input
          value={(config.source as string) || ''}
          onChange={(e) => onChange('source', e.target.value)}
          placeholder="notification_system"
        />
      </div>
      <div className="space-y-1">
        <Label>Channel *</Label>
        <Input
          value={(config.channel as string) || ''}
          onChange={(e) => onChange('channel', e.target.value)}
          placeholder="slack, email, webhook"
        />
      </div>
      <div className="space-y-1">
        <Label>Conditions</Label>
        <Textarea
          value={((config.conditions as string[]) || []).join('\n')}
          onChange={(e) =>
            onChange(
              'conditions',
              e.target.value
                .split('\n')
                .filter((line) => line.trim())
            )
          }
          placeholder="One condition per line"
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label>Pipeline *</Label>
        <PipelineRefInput
          value={(config.pipeline as string) || ''}
          onChange={(v) => onChange('pipeline', v)}
          availablePipelines={availablePipelines}
          placeholder="pipeline.my_pipeline"
        />
      </div>
    </>
  );
}
