import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Node } from '@xyflow/react';
import type { FlowStep, RestResource } from '@/services/api';

interface DatabaseOption {
  id: string;
  label: string;
}

interface FlowStepConfigSheetProps {
  node: Node | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databases: DatabaseOption[];
  restResources: RestResource[];
  onSave: (step: FlowStep) => void;
}

export function FlowStepConfigSheet({
  node,
  open,
  onOpenChange,
  databases,
  restResources,
  onSave,
}: FlowStepConfigSheetProps) {
  const step = node?.data?.step as FlowStep | undefined;
  const [label, setLabel] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (step) {
      setLabel(step.label || step.id);
      setConfig(step.config || {});
    }
  }, [step]);

  if (!step) return null;

  const handleSave = () => {
    onSave({
      ...step,
      label,
      config,
    });
    onOpenChange(false);
  };

  const stepType = step.type;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Configure step: {step.id}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-6">
          <div>
            <Label htmlFor="step-label">Label</Label>
            <Input
              id="step-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Step label"
            />
          </div>

          {stepType === 'http' && (
            <>
              <div>
                <Label htmlFor="rest-id">REST resource</Label>
                <Select
                  value={(config.restId as string) ?? ''}
                  onValueChange={(v) => setConfig((c) => ({ ...c, restId: v }))}
                >
                  <SelectTrigger id="rest-id">
                    <SelectValue placeholder="Select REST resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {restResources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label || r.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="http-method">Method</Label>
                <Select
                  value={(config.method as string) ?? 'GET'}
                  onValueChange={(v) => setConfig((c) => ({ ...c, method: v }))}
                >
                  <SelectTrigger id="http-method">
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
              <div>
                <Label htmlFor="http-path">Path</Label>
                <Input
                  id="http-path"
                  value={(config.path as string) ?? '/'}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, path: e.target.value }))
                  }
                  placeholder="/v2/pet/1"
                />
              </div>
              <div>
                <Label htmlFor="http-body">Request body (optional)</Label>
                <Textarea
                  id="http-body"
                  value={(config.body as string) ?? ''}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, body: e.target.value }))
                  }
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            </>
          )}

          {stepType === 'query' && (
            <>
              <div>
                <Label htmlFor="database-id">Database</Label>
                <Select
                  value={(config.databaseId as string) ?? ''}
                  onValueChange={(v) =>
                    setConfig((c) => ({ ...c, databaseId: v }))
                  }
                >
                  <SelectTrigger id="database-id">
                    <SelectValue placeholder="Select database" />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label || d.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sql">SQL</Label>
                <Textarea
                  id="sql"
                  value={(config.sql as string) ?? ''}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, sql: e.target.value }))
                  }
                  placeholder="SELECT * FROM users LIMIT 10"
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
