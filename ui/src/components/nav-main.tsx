import { type LucideIcon, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { isFlowsSection } from '@/lib/app-hash';

function hashFromUrl(url: string): string {
  return url.startsWith('#') ? url.slice(1) : url;
}

export type NavItem =
  | { kind: 'link'; title: string; url: string; icon: LucideIcon }
  | {
      kind: 'group';
      title: string;
      icon: LucideIcon;
      items: { title: string; url: string }[];
    };

function linkIsActive(item: { url: string }, currentHash: string): boolean {
  const h = hashFromUrl(item.url);
  if (h === 'rest' && (currentHash === 'rest' || currentHash === 'rest/settings')) {
    return true;
  }
  return currentHash === h;
}

function groupIsActive(
  group: { items: { url: string }[] },
  currentHash: string
): boolean {
  return group.items.some((sub) => currentHash === hashFromUrl(sub.url));
}

export function NavMain({ items, currentHash }: { items: NavItem[]; currentHash: string }) {
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      {items.map((item) => {
        if (item.kind === 'link') {
          const active = linkIsActive(item, currentHash);
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                <a href={item.url} onClick={closeMobile}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        const openDefault =
          groupIsActive(item, currentHash) ||
          (item.title === 'Flows' && isFlowsSection(currentHash));

        return (
          <SidebarMenuItem key={item.title}>
            <Collapsible key={`${item.title}-${openDefault}`} defaultOpen={openDefault}>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={item.title}>
                  <item.icon />
                  <span>{item.title}</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items.map((subItem) => {
                    const subHash = hashFromUrl(subItem.url);
                    const subActive = currentHash === subHash;
                    return (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild isActive={subActive}>
                          <a href={subItem.url} onClick={closeMobile}>
                            <span>{subItem.title}</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
