import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DatabaseResource } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function DatabaseResourceFields({
  draft,
  onChange,
}: {
  draft: DatabaseResource;
  onChange: Dispatch<SetStateAction<DatabaseResource>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>ID</Label>
        <Input
          value={draft.id}
          onChange={(e) => onChange((prev) => ({ ...prev, id: e.target.value }))}
          placeholder="main"
        />
      </div>
      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Main DB"
        />
      </div>
      <div className="space-y-1">
        <Label>URL</Label>
        <Input
          value={draft.url}
          onChange={(e) => onChange((prev) => ({ ...prev, url: e.target.value }))}
          placeholder="${BENCH_DB_MAIN_URL}"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          URL supports env placeholders like{' '}
          <code className="rounded bg-muted px-1">${'{BENCH_DB_MAIN_URL}'}</code>.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={draft.enabled}
          onCheckedChange={(v) => onChange((prev) => ({ ...prev, enabled: v === true }))}
        />
        Enabled
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={draft.default}
          onCheckedChange={(v) => onChange((prev) => ({ ...prev, default: v === true }))}
        />
        Default
      </label>
    </div>
  );
}
