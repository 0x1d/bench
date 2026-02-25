import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from '@/components/ui/sidebar';

export function SidebarRight({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="none"
      className={cn('hidden border-l lg:flex', className)}
      {...props}
    >
      <SidebarHeader className="border-sidebar-border h-14 border-b justify-center px-4">
        <span className="text-sm font-medium">Overview</span>
      </SidebarHeader>
      <SidebarContent className="px-4 py-3 text-sm text-muted-foreground">
        API health and version details are displayed in the status panel.
      </SidebarContent>
    </Sidebar>
  );
}
