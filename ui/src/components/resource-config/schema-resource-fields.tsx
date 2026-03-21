import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SchemaResourceEntry } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function SchemaResourceFields({
  draft,
  onChange,
}: {
  draft: SchemaResourceEntry;
  onChange: Dispatch<SetStateAction<SchemaResourceEntry>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>ID</Label>
        <Input
          value={draft.id}
          onChange={(e) => onChange((prev) => ({ ...prev, id: e.target.value }))}
          placeholder="petstore-api"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Petstore API"
        />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select
          value={draft.type}
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              type: v as SchemaResourceEntry['type'],
            }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Schema type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openapi">openapi</SelectItem>
            <SelectItem value="asyncapi">asyncapi</SelectItem>
            <SelectItem value="json-schema">json-schema</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Source path</Label>
        <Input
          value={draft.source.path}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              source: { ...prev.source, path: e.target.value },
            }))
          }
          placeholder="./workspace/rest/openapi.json"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Path to the schema file, relative to the Bench config directory.
        </p>
      </div>
    </div>
  );
}
