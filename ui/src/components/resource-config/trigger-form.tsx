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
  { value: 'webhook', label: 'Webhook' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'alert', label: 'Alert' },
  { value: 'http', label: 'HTTP' },
  { value: 'notification', label: 'Notification' },
];

interface TriggerFormProps {
  draft: TriggerEntry;
  onChange: Dispatch<SetStateAction<TriggerEntry>>;
  flows?: string[];
  workspaces?: string[];
}

export function TriggerForm({ draft, onChange, flows = [], workspaces = [] }: TriggerFormProps) {
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
        <Label>Flow *</Label>
        {flows.length > 0 ? (
          <Select
            value={draft.flow}
            onValueChange={(value) => updateField('flow', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select flow" />
            </SelectTrigger>
            <SelectContent>
              {flows.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={draft.flow}
            onChange={(e) => updateField('flow', e.target.value)}
            placeholder="flow_name"
          />
        )}
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
      {draft.type === 'webhook' && (
        <WebhookConfigFields config={draft.config} onChange={updateConfig} />
      )}

      {draft.type === 'schedule' && (
        <ScheduleConfigFields config={draft.config} onChange={updateConfig} />
      )}

      {draft.type === 'alert' && (
        <AlertConfigFields config={draft.config} onChange={updateConfig} />
      )}

      {draft.type === 'http' && (
        <HttpConfigFields config={draft.config} onChange={updateConfig} />
      )}

      {draft.type === 'notification' && (
        <NotificationConfigFields config={draft.config} onChange={updateConfig} />
      )}
    </div>
  );
}

function WebhookConfigFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>Pipeline</Label>
        <Input
          value={(config.pipeline as string) || ''}
          onChange={(e) => onChange('pipeline', e.target.value)}
          placeholder="mod.pipe.pipeline_name"
        />
        <p className="text-xs text-muted-foreground">
          Flowpipe pipeline to execute when webhook is triggered.
        </p>
      </div>
    </>
  );
}

function ScheduleConfigFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
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
        <Label>Pipeline</Label>
        <Input
          value={(config.pipeline as string) || ''}
          onChange={(e) => onChange('pipeline', e.target.value)}
          placeholder="mod.pipe.pipeline_name"
        />
      </div>
    </>
  );
}

function AlertConfigFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
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
        <Label>Pipeline</Label>
        <Input
          value={(config.pipeline as string) || ''}
          onChange={(e) => onChange('pipeline', e.target.value)}
          placeholder="mod.pipe.pipeline_name"
        />
      </div>
    </>
  );
}

function HttpConfigFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>URL *</Label>
        <Input
          value={(config.url as string) || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://api.example.com/endpoint"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label>Method</Label>
        <Select
          value={(config.method as string) || 'POST'}
          onValueChange={(value) => onChange('method', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Body</Label>
        <Textarea
          value={(config.body as string) || ''}
          onChange={(e) => onChange('body', e.target.value)}
          placeholder='{"key": "value"}'
          rows={4}
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label>Pipeline</Label>
        <Input
          value={(config.pipeline as string) || ''}
          onChange={(e) => onChange('pipeline', e.target.value)}
          placeholder="mod.pipe.pipeline_name"
        />
      </div>
    </>
  );
}

function NotificationConfigFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
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
        <Label>Pipeline</Label>
        <Input
          value={(config.pipeline as string) || ''}
          onChange={(e) => onChange('pipeline', e.target.value)}
          placeholder="mod.pipe.pipeline_name"
        />
      </div>
    </>
  );
}
