import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useTheme } from '@/contexts/theme-context';

export function SiteHeader() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-background sticky top-0 z-20 flex h-[var(--header-height)] shrink-0 items-center border-b">
      <div className="flex w-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <div className="flex flex-1 items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">Bench</span>
          <span className="text-muted-foreground hidden text-sm md:inline">
            Integration Platform
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={
            theme === 'tokyo-night'
              ? 'Switch to Tokyo Day (light theme)'
              : 'Switch to Tokyo Night (dark theme)'
          }
          className="shrink-0"
        >
          {theme === 'tokyo-night' ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
