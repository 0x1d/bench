import { useEffect, useState } from 'react';
import { FileViewProvider, useFileView } from '@/contexts/file-view-context';
import { DatabaseViewProvider, useDatabaseView } from '@/contexts/database-view-context';
import { UploadProvider } from '@/contexts/upload-context';
import { UploadProgress } from '@/components/upload-progress';
import { FileViewer } from '@/components/file-viewer';
import { DatabasePanel } from '@/components/database-panel';
import { SidebarLeft } from '@/components/sidebar-left';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { FilesystemPage } from '@/pages/resources-page';
import { ResourcesConfigPage } from '@/pages/resources-config-page';
import { RestPage } from '@/pages/rest-page';
import { StatusPage } from '@/pages/status-page';
import { DatabasePage } from '@/pages/database-page';

function getHash() {
  return window.location.hash.slice(1) || 'status';
}

function ClearFileViewOnNavigate({ hash }: { hash: string }) {
  const { setViewedFile } = useFileView();
  useEffect(() => {
    if (hash !== 'filesystem') {
      setViewedFile(null);
    }
  }, [hash, setViewedFile]);
  return null;
}

function ClearDatabaseViewOnNavigate({ hash }: { hash: string }) {
  const { setPanelMode } = useDatabaseView();
  useEffect(() => {
    if (hash !== 'database') {
      setPanelMode(null);
    }
  }, [hash, setPanelMode]);
  return null;
}


export function App() {
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    const onHashChange = () => setHash(getHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <UploadProvider>
    <FileViewProvider>
      <DatabaseViewProvider>
        <ClearFileViewOnNavigate hash={hash} />
        <ClearDatabaseViewOnNavigate hash={hash} />
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
                  id="main"
                  className={
                    hash === 'filesystem' || hash === 'database' || hash === 'resources' || hash === 'rest'
                      ? 'flex min-h-0 flex-1 items-start p-4 md:p-6'
                      : 'flex flex-1 items-start justify-center p-4 md:min-h-min'
                  }
                >
                  {hash === 'filesystem' && <FilesystemPage />}
                  {hash === 'resources' && <ResourcesConfigPage />}
                  {hash === 'rest' && <RestPage />}
                  {hash === 'database' && <DatabasePage />}
                  {hash !== 'filesystem' && hash !== 'resources' && hash !== 'rest' && hash !== 'database' && <StatusPage />}
                </section>
              </SidebarInset>
              <FileViewer />
              {hash === 'database' && <DatabasePanel />}
            </div>
          </SidebarProvider>
        </div>
      </DatabaseViewProvider>
    </FileViewProvider>
    <UploadProgress />
    </UploadProvider>
  );
}
