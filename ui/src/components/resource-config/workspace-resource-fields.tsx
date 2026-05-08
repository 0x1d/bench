import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkspaceResource } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function WorkspaceResourceFields({
  draft,
  onChange,
}: {
  draft: WorkspaceResource;
  onChange: Dispatch<SetStateAction<WorkspaceResource>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>ID</Label>
        <Input
          value={draft.id}
          onChange={(e) => onChange((prev) => ({ ...prev, id: e.target.value }))}
          placeholder="default"
        />
      </div>
      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Default"
        />
      </div>
      <div className="space-y-1">
        <Label>Flowpipe URL</Label>
        <Input
          value={draft.flowpipeUrl}
          onChange={(e) => onChange((prev) => ({ ...prev, flowpipeUrl: e.target.value }))}
          placeholder="http://localhost:7103"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Flowpipe server URL. Written as host in flows/workspaces.fpc when profile is initialized.
        </p>
      </div>
    </div>
  );
}
