import * as React from 'react';
import { Activity, Boxes, Database, FolderOpen, Globe, Workflow } from 'lucide-react';
import { NavMain } from '@/components/nav-main';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

const navItems = [
  { title: 'Status', url: '#status', icon: Activity },
  { title: 'Resources', url: '#resources', icon: Boxes },
  { title: 'Filesystem', url: '#filesystem', icon: FolderOpen },
  { title: 'Database', url: '#database', icon: Database },
  { title: 'REST', url: '#rest', icon: Globe },
  { title: 'Flows', url: '#flows', icon: Workflow },
];

export function SidebarLeft({
  className,
  currentHash = 'status',
  ...props
}: React.ComponentProps<typeof Sidebar> & { currentHash?: string }) {
  const items = navItems.map((item) => {
    const hash = item.url.slice(1);
    const isActive = hash === 'flows'
      ? currentHash === 'flows' || currentHash.startsWith('flows/')
      : currentHash === hash;
    return { ...item, isActive };
  });

  return (
    <Sidebar className={cn('border-r-0', className)} {...props}>
      <SidebarHeader>
        <NavMain items={items} />
      </SidebarHeader>
      <SidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}
