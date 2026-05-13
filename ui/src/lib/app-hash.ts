/**
 * Hash-route helpers for SPA navigation (`window.location.hash`).
 * Sub-routes use slash segments, e.g. `#filesystem/settings`, `#flows/executions`.
 */

/** Reserved first segment after `flows/` for list pages (not flow editor). */
const FLOWS_LIST_SEGMENTS = new Set(['executions', 'settings']);

/** Reserved first segment after `infrastructure/` for main app views. */
const INFRA_LIST_SEGMENTS = new Set(['files', 'settings']);

export function isFlowsListRoute(hash: string): boolean {
  return hash === 'flows' || hash === 'flows/executions' || hash === 'flows/settings';
}

/**
 * True when hash opens the flow graph editor (not modules/executions/settings list).
 */
export function isFlowEditorRoute(hash: string): boolean {
  if (!hash.startsWith('flows/')) return false;
  const rest = hash.slice('flows/'.length);
  const first = rest.split('/')[0] ?? '';
  return !FLOWS_LIST_SEGMENTS.has(first);
}

export function isFlowsSection(hash: string): boolean {
  return hash === 'flows' || hash.startsWith('flows/');
}

export type FlowsListView = 'modules' | 'executions' | 'settings';

export function getFlowsListView(hash: string): FlowsListView {
  if (hash === 'flows/executions') return 'executions';
  if (hash === 'flows/settings') return 'settings';
  return 'modules';
}

export type InfrastructureView = 'diagram' | 'files' | 'settings';

export function getInfrastructureView(hash: string): InfrastructureView {
  if (hash === 'infrastructure/files') return 'files';
  if (hash === 'infrastructure/settings') return 'settings';
  return 'diagram';
}

export function isInfrastructureRoute(hash: string): boolean {
  return hash === 'infrastructure' || hash.startsWith('infrastructure/');
}

/** True for main infra views (diagram/files/settings), not arbitrary deep paths. */
export function isInfrastructureMainView(hash: string): boolean {
  if (hash === 'infrastructure') return true;
  if (!hash.startsWith('infrastructure/')) return false;
  const rest = hash.slice('infrastructure/'.length);
  if (rest.includes('/')) return false;
  return INFRA_LIST_SEGMENTS.has(rest) || rest === '';
}

/**
 * Resource settings sub-routes use full-bleed main + side context panel; main padding is applied inside pages.
 */
export function isResourceSettingsHash(hash: string): boolean {
  return (
    hash === 'filesystem/settings' ||
    hash === 'database/settings' ||
    hash === 'flows/settings' ||
    hash === 'infrastructure/settings'
  );
}

/** True when hash opens the triggers management page. */
export function isTriggersRoute(hash: string): boolean {
  return hash === 'flows/triggers';
}
