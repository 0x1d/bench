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
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                <div className="bg-muted/50 aspect-video rounded-xl" />
                <div className="bg-muted/50 aspect-video rounded-xl" />
                <div className="bg-muted/50 aspect-video rounded-xl" />
              </div>
              <section
                id="status"
                className="bg-muted/50 flex-1 rounded-xl p-4 md:min-h-min"
              >
                <StatusPage />
              </section>
            </div>
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
