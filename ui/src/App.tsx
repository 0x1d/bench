import { useEffect, useState } from 'react';
import { SidebarLeft } from '@/components/sidebar-left';
import { SidebarRight } from '@/components/sidebar-right';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ResourcesPage } from '@/pages/resources-page';
import { StatusPage } from '@/pages/status-page';

function getHash() {
  return window.location.hash.slice(1) || 'status';
}

export function App() {
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    const onHashChange = () => setHash(getHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <SidebarLeft
            currentHash={hash}
            className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]"
          />
          <SidebarInset>
            <section
              id="status"
              className="flex flex-1 items-start justify-center p-4 md:min-h-min"
            >
              {hash === 'resources' ? <ResourcesPage /> : <StatusPage />}
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
