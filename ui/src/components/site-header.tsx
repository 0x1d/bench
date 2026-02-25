import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function SiteHeader() {
  return (
    <header className="bg-background sticky top-0 z-20 flex h-[var(--header-height)] shrink-0 items-center border-b">
      <div className="flex w-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">bench</span>
          <span className="text-muted-foreground hidden text-sm md:inline">
            ComfyUI Workflow Manager
          </span>
        </div>
      </div>
    </header>
  );
}
