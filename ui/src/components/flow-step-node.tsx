import { memo } from 'react';
import { type NodeProps, Handle, Position } from '@xyflow/react';
import { Globe, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  http: Globe,
  query: Database,
};

export const FlowStepNode = memo(function FlowStepNode({
  data,
  selected,
}: NodeProps) {
  const stepType = (data?.stepType as string) ?? 'http';
  const label = (data?.label as string) ?? 'Step';
  const Icon = icons[stepType] ?? Globe;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 min-w-[160px] bg-card shadow-sm',
        selected
          ? 'border-primary'
          : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground font-mono">{stepType}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});
