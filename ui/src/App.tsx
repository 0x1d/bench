import { SidebarLeft } from '@/components/sidebar-left';
import { SidebarRight } from '@/components/sidebar-right';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { StatusPage } from '@/pages/status-page';

export function App() {
  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <SidebarLeft className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]" />
          <SidebarInset>
            <section
              id="status"
              className="flex flex-1 items-start justify-center p-4 md:min-h-min"
            >
              <StatusPage />
            </section>
          </SidebarInset>
          <SidebarRight
            side="right"
            className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]"
          />
        </div>
      </SidebarProvider>
    </div>
  );
}
