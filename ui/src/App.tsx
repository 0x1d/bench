import { useEffect, useState } from 'react';
import { FileViewProvider, useFileView } from '@/contexts/file-view-context';
import { DatabaseViewProvider, useDatabaseView } from '@/contexts/database-view-context';
import { FlowViewProvider, useFlowView } from '@/contexts/flow-view-context';
import { UploadProvider } from '@/contexts/upload-context';
import { UploadProgress } from '@/components/upload-progress';
import { FileViewer } from '@/components/file-viewer';
import { DatabasePanel } from '@/components/database-panel';
import { FlowStepPanel } from '@/components/flow-step-panel';
import { SidebarLeft } from '@/components/sidebar-left';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { FilesystemPage } from '@/pages/resources-page';
import { ResourcesConfigPage } from '@/pages/resources-config-page';
import { RestPage } from '@/pages/rest-page';
import { StatusPage } from '@/pages/status-page';
import { DatabasePage } from '@/pages/database-page';
import { FlowsPage } from '@/pages/flows-page';
import FlowEditorPage from '@/pages/flow-editor-page';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';

function getHash() {
  return window.location.hash.slice(1) || 'status';
}

function isFlowsSection(hash: string) {
  return hash === 'flows' || hash.startsWith('flows/');
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

function ClearFlowViewOnNavigate({ hash }: { hash: string }) {
  const { setSelectedStep, setExecutionId, setModuleEditPath } = useFlowView();
  useEffect(() => {
    // Clear when leaving flows entirely, or when going back to flows list from editor
    if (!isFlowsSection(hash) || hash === 'flows') {
      setSelectedStep(null);
      setExecutionId(null);
      setModuleEditPath(null);
    }
  }, [hash, setSelectedStep, setExecutionId, setModuleEditPath]);
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
          <FlowViewProvider>
            <ClearFileViewOnNavigate hash={hash} />
            <ClearDatabaseViewOnNavigate hash={hash} />
            <ClearFlowViewOnNavigate hash={hash} />
            <div className="[--header-height:calc(--spacing(14))] h-svh overflow-hidden flex flex-col">
              <SidebarProvider className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <SiteHeader />
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <SidebarLeft
                    currentHash={hash}
                    className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]"
                  />
                  <SidebarInset
                    className={cn(
                      'min-h-0',
                      hash.startsWith('flows/') ? 'overflow-hidden' : 'overflow-auto'
                    )}
                  >
                    <section
                      id="main"
                      className={
                        hash === 'filesystem' || hash === 'database' || hash === 'resources' || hash === 'rest' || isFlowsSection(hash)
                          ? 'flex min-h-0 flex-1 flex-col items-stretch p-4 md:p-6'
                          : 'flex flex-1 items-start justify-center p-4 md:min-h-min'
                      }
                    >
                      {hash === 'filesystem' && <FilesystemPage />}
                      {hash === 'resources' && <ResourcesConfigPage />}
                      {hash === 'rest' && <RestPage />}
                      {hash === 'database' && <DatabasePage />}
                      {hash === 'flows' && <FlowsPage />}
                      {hash.startsWith('flows/') && <FlowEditorPage />}
                      {hash !== 'filesystem' && hash !== 'resources' && hash !== 'rest' && hash !== 'database' && !isFlowsSection(hash) && <StatusPage />}
                    </section>
                  </SidebarInset>
                  <FileViewer />
                  {hash === 'database' && <DatabasePanel />}
                  {(hash === 'flows' || hash.startsWith('flows/')) && <FlowStepPanel />}
                </div>
              </SidebarProvider>
            </div>
          </FlowViewProvider>
        </DatabaseViewProvider>
      </FileViewProvider>
      <UploadProgress />
      <Toaster
        position="top-center"
        closeButton
        richColors
        theme="dark"
        toastOptions={{
          style: {
            background: '#1f2335',
            border: '1px solid #3b4261',
            color: '#c0caf5',
          },
        }}
      />
    </UploadProvider>
  );
}
