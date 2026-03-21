import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FilesystemResource } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function FilesystemResourceFields({
  draft,
  onChange,
}: {
  draft: FilesystemResource;
  onChange: Dispatch<SetStateAction<FilesystemResource>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>ID</Label>
        <Input
          value={draft.id}
          onChange={(e) => onChange((prev) => ({ ...prev, id: e.target.value }))}
          placeholder="data"
        />
      </div>
      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Data"
        />
      </div>
      <div className="space-y-1">
        <Label>Path</Label>
        <Input
          value={draft.path}
          onChange={(e) => onChange((prev) => ({ ...prev, path: e.target.value }))}
          placeholder="/mnt/data"
          className="font-mono"
        />
      </div>
    </div>
  );
}
