import * as React from 'react';
import {
  Activity,
  Braces,
  Database,
  FolderOpen,
  Globe,
  Server,
  Settings,
  Workflow,
  Zap,
} from 'lucide-react';
import { type NavItem, NavMain } from '@/components/nav-main';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

const navItems: NavItem[] = [
  { kind: 'link', title: 'Status', url: '#status', icon: Activity },
  {
    kind: 'group',
    title: 'Filesystem',
    icon: FolderOpen,
    items: [
      { title: 'Browse', url: '#filesystem' },
      { title: 'Settings', url: '#filesystem/settings' },
    ],
  },
  {
    kind: 'group',
    title: 'Database',
    icon: Database,
    items: [
      { title: 'Browse', url: '#database' },
      { title: 'Settings', url: '#database/settings' },
    ],
  },
  {
    kind: 'group',
    title: 'Flows',
    icon: Workflow,
    items: [
      { title: 'Modules', url: '#flows' },
      { title: 'Executions', url: '#flows/executions' },
      { title: 'Triggers', url: '#flows/triggers', icon: Zap },
      { title: 'Settings', url: '#flows/settings' },
    ],
  },
  {
    kind: 'group',
    title: 'Infrastructure',
    icon: Server,
    items: [
      { title: 'Diagram', url: '#infrastructure' },
      { title: 'Files', url: '#infrastructure/files' },
      { title: 'Settings', url: '#infrastructure/settings' },
    ],
  },
  { kind: 'link', title: 'Schemas', url: '#schemas', icon: Braces },
  { kind: 'link', title: 'REST', url: '#rest', icon: Globe },
  { kind: 'link', title: 'Configuration', url: '#configuration', icon: Settings },
];

export function SidebarLeft({
  className,
  currentHash = 'status',
  ...props
}: React.ComponentProps<typeof Sidebar> & { currentHash?: string }) {
  return (
    <Sidebar collapsible="icon" className={cn('border-r-0', className)} {...props}>
      <SidebarHeader>
        <NavMain items={navItems} currentHash={currentHash} />
      </SidebarHeader>
      <SidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}
