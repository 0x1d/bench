import * as React from 'react';
import { Activity, Boxes, Database, FolderOpen, Globe } from 'lucide-react';
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
];

export function SidebarLeft({
  className,
  currentHash = 'status',
  ...props
}: React.ComponentProps<typeof Sidebar> & { currentHash?: string }) {
  const items = navItems.map((item) => ({
    ...item,
    isActive: currentHash === item.url.slice(1),
  }));

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
