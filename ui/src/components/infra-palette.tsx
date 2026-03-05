import {
  Box,
  Database,
  FileOutput,
  FolderInput,
  Globe,
  Variable,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaletteBlockKind =
  | 'provider'
  | 'variable'
  | 'resource'
  | 'data'
  | 'module'
  | 'output';

interface PaletteItem {
  kind: PaletteBlockKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'provider', label: 'Provider', icon: Globe, description: 'Provider configuration' },
  { kind: 'variable', label: 'Variable', icon: Variable, description: 'Input variable' },
  { kind: 'resource', label: 'Resource', icon: Box, description: 'Infrastructure resource' },
  { kind: 'data', label: 'Data', icon: Database, description: 'Data source' },
  { kind: 'module', label: 'Module', icon: FolderInput, description: 'Terraform module' },
  { kind: 'output', label: 'Output', icon: FileOutput, description: 'Output value' },
];

interface InfraPaletteProps {
  onAddBlock: (kind: PaletteBlockKind) => void;
  onDragStart?: (kind: PaletteBlockKind) => void;
  className?: string;
}

export function InfraPalette({
  onAddBlock,
  onDragStart,
  className,
}: InfraPaletteProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-sm',
        className
      )}
    >
      <span className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Add block
      </span>
      {PALETTE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.kind}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/terraform-block', item.kind);
              e.dataTransfer.effectAllowed = 'move';
              onDragStart?.(item.kind);
            }}
            onClick={() => onAddBlock(item.kind)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
              'hover:bg-accent/50 transition-colors cursor-grab active:cursor-grabbing',
              'border border-transparent hover:border-border'
            )}
            title={item.description ?? item.label}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
