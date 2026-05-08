import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FlowsConfig } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function FlowsConfigFields({
  draft,
  onChange,
}: {
  draft: FlowsConfig;
  onChange: Dispatch<SetStateAction<FlowsConfig>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Flows directory</Label>
        <Input
          value={draft.path}
          onChange={(e) => onChange((prev) => ({ ...prev, path: e.target.value }))}
          placeholder="./flows"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Path to store flow JSON and .fp files. Relative to config directory.
        </p>
      </div>
    </div>
  );
}
