import { memo } from 'react';
import { type NodeProps, Handle, Position } from '@xyflow/react';
import { Globe, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reactFlowHandleClassName } from '@/lib/react-flow-handles';
import { Button } from '@/components/ui/button';
import { flowStepIcons } from '@/lib/flow-step-icons';
import type { FlowStep } from '@/services/api';

export const FlowStepNode = memo(function FlowStepNode({
  data,
  selected,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
}: NodeProps) {
  const stepType = (data?.stepType as string) ?? 'http';
  const label = (data?.label as string) ?? 'Step';
  const Icon = flowStepIcons[stepType] ?? Globe;
  const onAddNextStep = data?.onAddNextStep as (nodeId: string, event: React.MouseEvent) => void;

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[200px] h-[56px] bg-card shadow-sm box-border relative',
        selected
          ? 'border-primary'
          : 'border-border hover:border-muted-foreground/50'
      )}
    >
      {stepType !== 'input' && (
        <Handle
          type="target"
          position={targetPosition}
          className={reactFlowHandleClassName(selected)}
        />
      )}
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{stepType}</span>
      </div>

      {stepType !== 'output' && (
        <Handle
          type="source"
          position={sourcePosition}
          className={reactFlowHandleClassName(selected)}
        />
      )}

      {onAddNextStep && stepType !== 'output' && (
        <Button
          type="button"
          variant="default"
          size="icon"
          className="absolute z-20 size-5 rounded-full border-2 border-primary shadow-md opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-100 flex items-center justify-center p-0 hover:shadow-lg hover:ring-2 hover:ring-primary/40"
          style={{
            ...(sourcePosition === Position.Bottom
              ? { bottom: -12, left: 'calc(50% + 20px)', transform: 'translateX(-50%) scale(0.9)' }
              : { right: -12, top: 'calc(50% + 20px)', transform: 'translateY(-50%) scale(0.9)' }
            )
          }}
          onClick={(e) => {
            e.stopPropagation();
            const step = (data as { step: FlowStep }).step;
            onAddNextStep(step.id, e);
          }}
        >
          <Plus className="size-3" />
        </Button>
      )}
    </div>
  );
});
