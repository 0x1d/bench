import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentConfig } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function AgentConfigFields({
  draft,
  onChange,
}: {
  draft: AgentConfig;
  onChange: Dispatch<SetStateAction<AgentConfig>>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Endpoint</Label>
        <Input
          value={draft.endpoint}
          onChange={(e) => onChange((prev) => ({ ...prev, endpoint: e.target.value }))}
          placeholder="http://localhost:3001"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label>Working directory</Label>
        <Input
          value={draft.workingDirectory}
          onChange={(e) => onChange((prev) => ({ ...prev, workingDirectory: e.target.value }))}
          placeholder="/home/user/bench/workspace"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">Mandatory path where the agent will perform tasks.</p>
      </div>
      <div className="space-y-1">
        <Label>Agent type</Label>
        <Select value={draft.agent} onValueChange={(v) => onChange((prev) => ({ ...prev, agent: v }))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cursor">Cursor</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Model (optional)</Label>
        <Input
          value={draft.model}
          onChange={(e) => onChange((prev) => ({ ...prev, model: e.target.value }))}
          placeholder="gemini-2.0-flash"
          className="font-mono"
        />
      </div>
    </div>
  );
}
