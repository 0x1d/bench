import { memo } from 'react';
import { type NodeProps, Handle, Position } from '@xyflow/react';
import {
  Box,
  Database,
  FileCode,
  FileOutput,
  FolderInput,
  Globe,
  Layers,
  Variable,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  provider: Globe,
  variable: Variable,
  resource: Box,
  data: Database,
  module: FolderInput,
  output: FileOutput,
  locals: Layers,
  group: FileCode,
};

export const InfraProviderNode = memo(function InfraProviderNode({
  data,
  selected,
}: NodeProps) {
  const Icon = NODE_ICONS.provider;
  const label = (data?.label as string) ?? (data?.name as string) ?? 'Provider';
  const source = (data?.source as string) ?? '';
  const version = (data?.version as string) ?? '';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[200px] min-h-[48px] bg-card shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground font-mono truncate">
          {source || version ? `${source} ${version}` : 'provider'}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

export const InfraVariableNode = memo(function InfraVariableNode({
  data,
  selected,
}: NodeProps) {
  const Icon = NODE_ICONS.variable;
  const label = (data?.label as string) ?? (data?.name as string) ?? 'Variable';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[180px] min-h-[44px] bg-card shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium font-mono">{label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

export const InfraResourceNode = memo(function InfraResourceNode({
  data,
  selected,
}: NodeProps) {
  const Icon = NODE_ICONS.resource;
  const type = (data?.type as string) ?? 'resource';
  const name = (data?.name as string) ?? 'unnamed';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[220px] min-h-[48px] bg-card shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-[10px] text-muted-foreground font-mono truncate">{type}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

export const InfraDataNode = memo(function InfraDataNode({
  data,
  selected,
}: NodeProps) {
  const Icon = NODE_ICONS.data;
  const type = (data?.type as string) ?? 'data';
  const name = (data?.name as string) ?? 'unnamed';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[220px] min-h-[48px] bg-card shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-[10px] text-muted-foreground font-mono truncate">data.{type}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

export const InfraModuleNode = memo(function InfraModuleNode({
  data,
  selected,
}: NodeProps) {
  const Icon = NODE_ICONS.module;
  const name = (data?.name as string) ?? (data?.label as string) ?? 'module';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[180px] min-h-[48px] bg-card shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium font-mono">{name}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

export const InfraOutputNode = memo(function InfraOutputNode({
  data,
  selected,
}: NodeProps) {
  const Icon = NODE_ICONS.output;
  const name = (data?.name as string) ?? (data?.label as string) ?? 'output';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 w-[180px] min-h-[44px] bg-card shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium font-mono">{name}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

export const InfraGroupNode = memo(function InfraGroupNode({
  data,
  selected,
}: NodeProps) {
  const label = (data?.label as string) ?? 'Group';
  const childCount = (data?.childCount as number) ?? 0;
  return (
    <div
      className={cn(
        'rounded-lg border-2 px-4 py-3 min-w-[160px] bg-muted/50 shadow-sm',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      )}
    >
      <div className="text-sm font-medium">{label}</div>
      {childCount > 0 && (
        <div className="text-xs text-muted-foreground mt-1">{childCount} items</div>
      )}
    </div>
  );
});
