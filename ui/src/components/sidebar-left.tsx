import * as React from 'react';
import { Activity } from 'lucide-react';
import { NavMain } from '@/components/nav-main';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

const navItems = [
  {
    title: 'Status',
    url: '#status',
    icon: Activity,
    isActive: true,
  },
];

export function SidebarLeft({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className={cn('border-r-0', className)} {...props}>
      <SidebarHeader>
        <div className="px-2 py-1 text-sm font-semibold">bench</div>
        <NavMain items={navItems} />
      </SidebarHeader>
      <SidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}
