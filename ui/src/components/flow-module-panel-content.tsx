import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchFlowModule, updateFlowModule } from '@/services/api';

interface FlowModulePanelContentProps {
  modulePath: string;
  onClose: () => void;
}

function ModuleForm({
  modulePath,
  initial,
  onClose,
}: {
  modulePath: string;
  initial: { title: string; description: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);

  const updateMutation = useMutation({
    mutationFn: (payload: { title: string; description: string }) =>
      updateFlowModule(modulePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', 'entries', modulePath] });
      onClose();
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ title, description });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="module-title">Title</Label>
        <Input
          id="module-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Module title"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="module-description">Description</Label>
        <Input
          id="module-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Module description"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function FlowModulePanelContent({ modulePath, onClose }: FlowModulePanelContentProps) {
  const { data: meta, isLoading } = useQuery({
    queryKey: ['flows', 'module', modulePath],
    queryFn: () => fetchFlowModule(modulePath),
    enabled: !!modulePath,
  });

  if (isLoading || !meta) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading module settings…
      </div>
    );
  }

  return (
    <ModuleForm
      key={modulePath}
      modulePath={modulePath}
      initial={{ title: meta.title, description: meta.description }}
      onClose={onClose}
    />
  );
}
