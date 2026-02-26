import { useEffect, useState } from 'react';
import { FileViewProvider } from '@/contexts/file-view-context';
import { FileViewer } from '@/components/file-viewer';
import { SidebarLeft } from '@/components/sidebar-left';
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
    <FileViewProvider>
      <div className="[--header-height:calc(--spacing(14))] h-svh overflow-hidden flex flex-col">
        <SidebarProvider className="flex flex-col min-h-0 flex-1 overflow-hidden">
        <SiteHeader />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SidebarLeft
            currentHash={hash}
            className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]"
          />
          <SidebarInset className="min-h-0 overflow-auto">
            <section
              id="status"
              className="flex flex-1 items-start justify-center p-4 md:min-h-min"
            >
              {hash === 'resources' ? <ResourcesPage /> : <StatusPage />}
            </section>
          </SidebarInset>
          <FileViewer />
        </div>
      </SidebarProvider>
    </div>
    </FileViewProvider>
  );
}
