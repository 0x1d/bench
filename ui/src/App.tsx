import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/contexts/theme-context';
import { FileViewProvider, useFileView } from '@/contexts/file-view-context';
import { DatabaseViewProvider, useDatabaseView } from '@/contexts/database-view-context';
import { FlowViewProvider, useFlowView } from '@/contexts/flow-view-context';
import { InfrastructureViewProvider, useInfrastructureView } from '@/contexts/infrastructure-view-context';
import { UploadProvider } from '@/contexts/upload-context';
import { UploadProgress } from '@/components/upload-progress';
import { FileViewer } from '@/components/file-viewer';
import { DatabasePanel } from '@/components/database-panel';
import { FlowStepPanel } from '@/components/flow-step-panel';
import { InfrastructurePanel } from '@/components/infrastructure-panel';
import { SidebarLeft } from '@/components/sidebar-left';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { FilesystemPage } from '@/pages/resources-page';
import { ResourcesConfigPage } from '@/pages/resources-config-page';
import { RestPage } from '@/pages/rest-page';
import { SchemaBrowserPage } from '@/pages/schema-browser-page';
import { StatusPage } from '@/pages/status-page';
import { DatabasePage } from '@/pages/database-page';
import { FlowsPage } from '@/pages/flows-page';
import FlowEditorPage from '@/pages/flow-editor-page';
import { InfrastructurePage } from '@/pages/infrastructure-page';
import { AgentChatProvider } from '@/contexts/agent-chat-context';
import { AgentChat } from '@/components/agent-chat';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';

function normalizeHashSegment(raw: string) {
  return raw === 'resources' ? 'configuration' : raw;
}

function getHash() {
  return normalizeHashSegment(window.location.hash.slice(1) || 'status');
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

function ClearInfrastructureViewOnNavigate({ hash }: { hash: string }) {
  const { setSelectedNode, setSelectedFile, setFileContent, setOutputCommand } = useInfrastructureView();
  useEffect(() => {
    if (hash !== 'infrastructure') {
      setSelectedNode(null);
      setSelectedFile(null);
      setFileContent('');
      setOutputCommand(null);
    }
  }, [hash, setSelectedNode, setSelectedFile, setFileContent, setOutputCommand]);
  return null;
}

function ClearFlowViewOnNavigate({ hash }: { hash: string }) {
  const { setSelectedStep, setExecutionId, setModuleEditPath, setFlow } = useFlowView();
  useEffect(() => {
    // Clear when leaving flows entirely, or when going back to flows list from editor
    if (!isFlowsSection(hash) || hash === 'flows') {
      setSelectedStep(null);
      setExecutionId(null);
      setModuleEditPath(null);
      setFlow(null);
    }
    // Close right panel when opening a flow in the editor
    else if (hash.startsWith('flows/')) {
      setModuleEditPath(null);
      setSelectedStep(null);
      setExecutionId(null);
    }
  }, [hash, setSelectedStep, setExecutionId, setModuleEditPath, setFlow]);
  return null;
}

const CLOSE_PANEL_EVENT = 'bench:close-panel';

function GlobalEscapeHandler() {
  const { setViewedFile } = useFileView();
  const { setPanelMode } = useDatabaseView();
  const { setSelectedStep, setExecutionId, setModuleEditPath } = useFlowView();
  const { setSelectedNode, setSelectedFile } = useInfrastructureView();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      if (target?.closest?.('dialog') || target?.closest?.('[role="dialog"]')) return;
      setViewedFile(null);
      setPanelMode(null);
      setSelectedStep(null);
      setExecutionId(null);
      setModuleEditPath(null);
      setSelectedNode(null);
      setSelectedFile(null);
      window.dispatchEvent(new CustomEvent(CLOSE_PANEL_EVENT));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewedFile, setPanelMode, setSelectedStep, setExecutionId, setModuleEditPath, setSelectedNode, setSelectedFile]);
  return null;
}


export function App() {
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    if (window.location.hash === '#resources') {
      window.location.replace('#configuration');
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setHash(getHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <ThemeProvider>
      <AgentChatProvider>
        <UploadProvider>
          <FileViewProvider>
            <DatabaseViewProvider>
              <FlowViewProvider>
                <InfrastructureViewProvider>
                  <ClearFileViewOnNavigate hash={hash} />
                  <ClearDatabaseViewOnNavigate hash={hash} />
                  <ClearFlowViewOnNavigate hash={hash} />
                  <ClearInfrastructureViewOnNavigate hash={hash} />
                  <GlobalEscapeHandler />
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
                            (hash.startsWith('flows/') || hash === 'configuration' || hash === 'schemas')
                              ? 'overflow-hidden'
                              : 'overflow-auto'
                          )}
                        >
                          <section
                            id="main"
                            className={
                              hash === 'configuration' || hash === 'schemas'
                                ? 'flex min-h-0 flex-1 flex-col items-stretch'
                                : hash === 'filesystem' || hash === 'database' || hash === 'rest' || hash === 'infrastructure' || isFlowsSection(hash)
                                  ? 'flex min-h-0 flex-1 flex-col items-stretch p-4 md:p-6'
                                  : 'flex flex-1 items-start justify-center p-4 md:min-h-min'
                            }
                          >
                            {hash === 'filesystem' && <FilesystemPage />}
                            {hash === 'configuration' && <ResourcesConfigPage />}
                            {hash === 'rest' && <RestPage />}
                            {hash === 'schemas' && <SchemaBrowserPage />}
                            {hash === 'database' && <DatabasePage />}
                            {hash === 'flows' && <FlowsPage />}
                            {hash.startsWith('flows/') && <FlowEditorPage />}
                            {hash === 'infrastructure' && <InfrastructurePage />}
                            {hash !== 'filesystem' && hash !== 'configuration' && hash !== 'rest' && hash !== 'schemas' && hash !== 'database' && hash !== 'infrastructure' && !isFlowsSection(hash) && <StatusPage />}
                          </section>
                        </SidebarInset>
                        <FileViewer />
                        {hash === 'database' && <DatabasePanel />}
                        {(hash === 'flows' || hash.startsWith('flows/')) && <FlowStepPanel />}
                        {hash === 'infrastructure' && <InfrastructurePanel />}
                        <AgentChat />
                      </div>
                    </SidebarProvider>
                  </div>
                </InfrastructureViewProvider>
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
      </AgentChatProvider>
    </ThemeProvider>
  );
}
