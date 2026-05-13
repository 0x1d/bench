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
import { FilesystemPage } from '@/pages/filesystem-page';
import { ConfigurationPage } from '@/pages/configuration-page';
import { RestPage } from '@/pages/rest-page';
import { SchemaBrowserPage } from '@/pages/schema-browser-page';
import { StatusPage } from '@/pages/status-page';
import { DatabasePage } from '@/pages/database-page';
import { FlowsPage } from '@/pages/flows-page';
import FlowEditorPage from '@/pages/flow-editor-page';
import { InfrastructurePage } from '@/pages/infrastructure-page';
import { TriggersPage } from '@/pages/triggers-page';
import { AgentChatProvider } from '@/contexts/agent-chat-context';
import { AgentChat } from '@/components/agent-chat';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import {
  getFlowsListView,
  getInfrastructureView,
  isFlowEditorRoute,
  isFlowsListRoute,
  isFlowsSection,
  isResourceSettingsHash,
  isTriggersRoute,
} from '@/lib/app-hash';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';

function normalizeHashSegment(raw: string) {
  return raw === 'resources' ? 'configuration' : raw;
}

function getHash() {
  return normalizeHashSegment(window.location.hash.slice(1) || 'status');
}

function ClearFileViewOnNavigate({ hash }: { hash: string }) {
  const { setViewedFile } = useFileView();
  useEffect(() => {
    if (!hash.startsWith('filesystem')) {
      setViewedFile(null);
    }
  }, [hash, setViewedFile]);
  return null;
}

function ClearDatabaseViewOnNavigate({ hash }: { hash: string }) {
  const { setPanelMode } = useDatabaseView();
  useEffect(() => {
    if (!hash.startsWith('database')) {
      setPanelMode(null);
    }
  }, [hash, setPanelMode]);
  return null;
}

function ClearInfrastructureViewOnNavigate({ hash }: { hash: string }) {
  const { setSelectedNode, setSelectedFile, setFileContent, setOutputCommand } = useInfrastructureView();
  useEffect(() => {
    if (!hash.startsWith('infrastructure')) {
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
    if (!isFlowsSection(hash) || isFlowsListRoute(hash)) {
      setSelectedStep(null);
      setExecutionId(null);
      setModuleEditPath(null);
      setFlow(null);
    } else if (hash.startsWith('flows/')) {
      setModuleEditPath(null);
      setSelectedStep(null);
      setExecutionId(null);
    }
  }, [hash, setSelectedStep, setExecutionId, setModuleEditPath, setFlow]);
  return null;
}

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
      window.dispatchEvent(new CustomEvent(BENCH_CLOSE_PANEL_EVENT));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewedFile, setPanelMode, setSelectedStep, setExecutionId, setModuleEditPath, setSelectedNode, setSelectedFile]);
  return null;
}

function MainRoutes({ hash }: { hash: string }) {
  if (hash === 'configuration') {
    return <ConfigurationPage />;
  }
  if (hash === 'filesystem' || hash === 'filesystem/settings') {
    return <FilesystemPage mode={hash === 'filesystem/settings' ? 'settings' : 'browse'} />;
  }
  if (hash === 'database' || hash === 'database/settings') {
    return <DatabasePage mode={hash === 'database/settings' ? 'settings' : 'browse'} />;
  }
  if (hash === 'rest' || hash === 'rest/settings') {
    return <RestPage />;
  }
  if (hash === 'schemas') {
    return <SchemaBrowserPage />;
  }
  if (isTriggersRoute(hash)) {
    return <TriggersPage />;
  }
  if (isFlowsListRoute(hash)) {
    return <FlowsPage view={getFlowsListView(hash)} />;
  }
  if (isFlowEditorRoute(hash)) {
    return <FlowEditorPage />;
  }
  if (hash === 'infrastructure' || hash === 'infrastructure/files' || hash === 'infrastructure/settings') {
    return <InfrastructurePage view={getInfrastructureView(hash)} />;
  }
  return <StatusPage />;
}

export function App() {
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    if (window.location.hash === '#resources') {
      window.location.replace('#configuration');
    }
  }, []);

  useEffect(() => {
    if (hash === 'rest/settings') {
      window.location.replace('#rest');
    }
  }, [hash]);

  useEffect(() => {
    const onHashChange = () => setHash(getHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /** Close all context panels that listen for {@link BENCH_CLOSE_PANEL_EVENT} (same signal as Escape). */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(BENCH_CLOSE_PANEL_EVENT));
  }, [hash]);

  const insetOverflowHidden =
    hash.startsWith('flows/') ||
    hash === 'configuration' ||
    hash === 'schemas' ||
    hash === 'rest' ||
    hash === 'flows/triggers' ||
    isResourceSettingsHash(hash);

  const mainStretch =
    hash === 'configuration' ||
    hash === 'schemas' ||
    hash === 'filesystem' ||
    hash.startsWith('filesystem/') ||
    hash === 'database' ||
    hash.startsWith('database/') ||
    hash === 'rest' ||
    hash.startsWith('rest/') ||
    hash === 'infrastructure' ||
    hash.startsWith('infrastructure/') ||
    isFlowsSection(hash) ||
    hash === 'flows/triggers';

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
                          className={cn('min-h-0', insetOverflowHidden ? 'overflow-hidden' : 'overflow-auto')}
                        >
                          <section
                            id="main"
                            className={
                              hash === 'configuration' || hash === 'schemas' || hash === 'rest'
                                ? 'flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch'
                                : mainStretch
                                  ? isResourceSettingsHash(hash)
                                    ? 'flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch overflow-hidden p-0'
                                    : 'flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch p-4 md:p-6'
                                  : 'flex flex-1 items-start justify-center p-4 md:min-h-min'
                            }
                          >
                            <MainRoutes hash={hash} />
                          </section>
                        </SidebarInset>
                        <FileViewer />
                        {hash.startsWith('database') && <DatabasePanel />}
                        {isFlowsSection(hash) && <FlowStepPanel />}
                        {hash.startsWith('infrastructure') && <InfrastructurePanel />}
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
