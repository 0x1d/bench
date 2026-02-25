import * as React from 'react';
import { Activity, FolderOpen } from 'lucide-react';
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
  { title: 'Resources', url: '#resources', icon: FolderOpen },
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
        <div className="px-2 py-1 text-sm font-semibold">bench</div>
        <NavMain items={items} />
      </SidebarHeader>
      <SidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}
