import type { Flow } from '@/services/api';
import { fetchFlow } from '@/services/api';

export interface PipelineParamSpec {
  name: string;
  required: boolean;
  defaultValue?: string;
}

export function pipelineIdFromRef(pipelineRef: string): string {
  const trimmed = pipelineRef.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('pipeline.') ? trimmed.slice('pipeline.'.length) : trimmed;
}

/** Extract input-step params from a flow definition. */
export function pipelineParamSpecs(flow: Flow | undefined): PipelineParamSpec[] {
  if (!flow?.steps) return [];
  const specs: PipelineParamSpec[] = [];
  for (const step of flow.steps) {
    if (step.type?.toLowerCase() !== 'input') continue;
    const params = step.config?.params;
    if (!Array.isArray(params)) continue;
    for (const raw of params) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as { name?: string; default?: unknown };
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!name) continue;
      const def = p.default;
      const hasDefault =
        def !== undefined &&
        def !== null &&
        (typeof def !== 'string' || def.trim() !== '');
      specs.push({
        name,
        required: !hasDefault,
        defaultValue: hasDefault ? String(def) : undefined,
      });
    }
  }
  return specs;
}

export interface HttpTriggerArgValidation {
  missingRequired: string[];
  unknownKeys: string[];
}

/**
 * Validates HTTP trigger args against pipeline input params.
 * Connection args (conn_*) are auto-injected by the API and are not validated here.
 */
export function validateHttpTriggerArgs(
  flow: Flow | undefined,
  args: Record<string, string> | undefined
): HttpTriggerArgValidation {
  const specs = pipelineParamSpecs(flow);
  const allowed = new Set(specs.map((s) => s.name));
  const userArgs = args ?? {};
  const missingRequired: string[] = [];
  const unknownKeys: string[] = [];

  for (const spec of specs) {
    if (!spec.required) continue;
    const v = userArgs[spec.name];
    if (v === undefined || String(v).trim() === '') {
      missingRequired.push(spec.name);
    }
  }

  for (const key of Object.keys(userArgs)) {
    const k = key.trim();
    if (!k || k.startsWith('conn_')) continue;
    if (!allowed.has(k)) {
      unknownKeys.push(k);
    }
  }

  return { missingRequired, unknownKeys };
}

export function formatHttpTriggerArgError(
  result: HttpTriggerArgValidation,
  paramSpecs: PipelineParamSpec[]
): string | null {
  const parts: string[] = [];
  if (result.missingRequired.length > 0) {
    const hint = result.missingRequired[0];
    parts.push(
      `Missing required pipeline args: ${result.missingRequired.join(', ')} (e.g. ${hint} = self.request_body)`
    );
  }
  if (result.unknownKeys.length > 0) {
    const accepted = paramSpecs.map((s) => s.name).join(', ') || '(none)';
    parts.push(
      `Unknown arg keys: ${result.unknownKeys.join(', ')} (pipeline params: ${accepted})`
    );
  }
  return parts.length > 0 ? parts.join('. ') : null;
}

/** Client-side validation before save; returns error message or null. */
export async function validateHttpTriggerDraft(
  module: string,
  pipelineRef: string,
  args: Record<string, string> | undefined
): Promise<string | null> {
  const pipelineId = pipelineIdFromRef(pipelineRef);
  if (!module.trim() || !pipelineId) {
    return 'Pipeline and module are required for HTTP triggers.';
  }
  try {
    const flow = await fetchFlow(pipelineId, module);
    const specs = pipelineParamSpecs(flow);
    const result = validateHttpTriggerArgs(flow, args);
    return formatHttpTriggerArgError(result, specs);
  } catch {
    return null;
  }
}
