import {
  Globe,
  Database,
  LogIn,
  Mail,
  Clock,
  Binary,
  Box,
  GitBranch,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type FlowStepType =
  | 'http'
  | 'query'
  | 'input'
  | 'message'
  | 'sleep'
  | 'transform'
  | 'container'
  | 'pipeline'
  | 'output';

const STEP_ICONS: Record<FlowStepType, React.ComponentType<{ className?: string }>> = {
  http: Globe,
  query: Database,
  input: LogIn,
  message: Mail,
  sleep: Clock,
  transform: Binary,
  container: Box,
  pipeline: GitBranch,
  output: LogOut,
};

const STEP_LABELS: Record<FlowStepType, string> = {
  http: 'HTTP',
  query: 'Query',
  input: 'Input',
  message: 'Message',
  sleep: 'Sleep',
  transform: 'Transform',
  container: 'Container',
  pipeline: 'Pipeline',
  output: 'Output',
};

interface FlowPaletteProps {
  hasInputStep: boolean;
  onAdd: (type: FlowStepType) => void;
  className?: string;
}

export function FlowPalette({
  hasInputStep,
  onAdd,
  className,
}: FlowPaletteProps) {
  const stepTypes: FlowStepType[] = [
    ...(!hasInputStep ? (['input'] as const) : []),
    'http',
    'query',
    'message',
    'sleep',
    'transform',
    'container',
    'pipeline',
    'output',
  ];

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-sm',
        className
      )}
    >
      <span className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Steps
      </span>
      {stepTypes.map((type) => {
        const Icon = STEP_ICONS[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
              'hover:bg-accent/50 transition-colors',
              'border border-transparent hover:border-border'
            )}
            title={STEP_LABELS[type]}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{STEP_LABELS[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
