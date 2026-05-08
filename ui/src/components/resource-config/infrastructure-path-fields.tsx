import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InfrastructureConfig } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function InfrastructurePathFields({
  draft,
  onChange,
}: {
  draft: InfrastructureConfig;
  onChange: Dispatch<SetStateAction<InfrastructureConfig>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Infrastructure directory</Label>
        <Input
          value={draft.path}
          onChange={(e) => onChange((prev) => ({ ...prev, path: e.target.value }))}
          placeholder="./workspace/infra"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Path for Terraform .tf files. Relative to config directory.
        </p>
      </div>
    </div>
  );
}
