import { syntaxTree } from '@codemirror/language';
import type { CompletionContext } from '@codemirror/autocomplete';
import type { Flow } from '@/services/api';
import { normalizeStepName } from '@/lib/utils';
import { STEP_ATTRIBUTES as SCHEMA_ATTRIBUTES, STEP_TYPES } from '@/lib/flow-hcl-schema';

/** Step type to Flowpipe HCL step block key (e.g. http, query, message). */
function stepTypeKey(type: string): string {
  const t = type?.toLowerCase().trim() ?? '';
  return STEP_TYPES.includes(t as (typeof STEP_TYPES)[number]) ? t : type;
}

/** Attributes per step type from hclgen schema. */
const STEP_ATTRIBUTES: Record<string, string[]> = Object.fromEntries(
  Object.entries(SCHEMA_ATTRIBUTES).map(([k, v]) => [k, [...v]])
);

/** HCL functions from Flowpipe (Terraform-compatible). */
const HCL_FUNCTIONS = [
  'abs', 'ceil', 'floor', 'log', 'max', 'min', 'parseint', 'pow', 'signum', 'sum',
  'chomp', 'endswith', 'format', 'formatlist', 'indent', 'join', 'lower', 'regex',
  'regexall', 'replace', 'split', 'startswith', 'strcontains', 'strrev', 'substr',
  'title', 'trim', 'trimprefix', 'trimspace', 'trimsuffix', 'upper',
  'alltrue', 'anytrue', 'chunklist', 'coalesce', 'coalescelist', 'compact', 'concat',
  'contains', 'distinct', 'element', 'flatten', 'index', 'keys', 'length', 'list',
  'lookup', 'map', 'matchkeys', 'merge', 'one', 'range', 'reverse', 'setintersection',
  'setproduct', 'setsubtract', 'setunion', 'slice', 'sort', 'transpose', 'values', 'zipmap',
  'base64decode', 'base64encode', 'base64gzip', 'csvdecode', 'jsondecode', 'jsonencode',
  'textdecodebase64', 'textencodebase64', 'urlencode', 'yamldecode', 'yamlencode',
  'abspath', 'basename', 'dirname', 'pathexpand', 'file', 'fileexists', 'fileset', 'filebase64',
  'formatdate', 'timeadd', 'timecmp', 'timestamp',
  'base64sha256', 'base64sha512', 'bcrypt', 'md5', 'sha1', 'sha256', 'sha512', 'uuid', 'uuidv5',
  'can', 'nonsensitive', 'sensitive', 'tobool', 'tolist', 'tomap', 'tonumber', 'toset', 'tostring', 'try',
  'env', 'error_message', 'is_error',
];

export interface CompletionItem {
  label: string;
  detail?: string;
  apply?: string;
}

/**
 * Returns the set of step IDs that the current step can reference (transitive depends_on closure).
 * Excludes input steps (they contribute param.*) and the current step itself.
 */
export function getReachableSteps(flow: Flow | null, currentStepId: string): Set<string> {
  if (!flow?.steps) return new Set();
  const stepsById = new Map(flow.steps.map((s) => [s.id, s]));
  const current = stepsById.get(currentStepId);
  if (!current) return new Set();

  const visited = new Set<string>();
  const result = new Set<string>();

  function collect(stepId: string) {
    if (visited.has(stepId)) return;
    visited.add(stepId);
    const step = stepsById.get(stepId);
    if (!step || stepId === currentStepId) return;
    if (step.type?.toLowerCase() === 'input') return; // input contributes params, not step refs
    result.add(stepId);
    for (const depId of step.dependsOn ?? []) {
      collect(depId);
    }
  }

  for (const depId of current.dependsOn ?? []) {
    collect(depId);
  }
  return result;
}

/**
 * Returns completion items for the given context.
 * context: 'step' | 'param' | 'function' — what to suggest based on cursor position.
 */
export function getCompletionsForStep(
  flow: Flow | null,
  currentStepId: string,
  context: 'step' | 'param' | 'function',
  prefix = ''
): CompletionItem[] {
  if (!flow?.steps) return [];

  const reachable = getReachableSteps(flow, currentStepId);
  const items: CompletionItem[] = [];

  if (context === 'step') {
    for (const step of flow.steps) {
      if (!reachable.has(step.id)) continue;
      if (step.type?.toLowerCase() === 'input') continue;
      const typeKey = stepTypeKey(step.type?.toLowerCase() ?? '');
      const name = normalizeStepName(step.label, step.id);
      const base = `step.${typeKey}.${name}`;
      const attrs = STEP_ATTRIBUTES[typeKey];
      if (attrs?.length) {
        for (const attr of attrs) {
          const full = `${base}.${attr}`;
          if (!prefix || full.startsWith(prefix) || full.toLowerCase().includes(prefix.toLowerCase())) {
            items.push({ label: full, detail: `${step.label || step.id}`, apply: full });
          }
        }
      } else {
        if (!prefix || base.startsWith(prefix) || base.toLowerCase().includes(prefix.toLowerCase())) {
          items.push({ label: base, detail: `${step.label || step.id}`, apply: base });
        }
      }
    }
  }

  if (context === 'param') {
    for (const step of flow.steps) {
      if (step.type?.toLowerCase() !== 'input') continue;
      const params = (step.config?.params as Array<{ name?: string }>) ?? [];
      for (const p of params) {
        const name = p?.name;
        if (!name) continue;
        const ref = `param.${name}`;
        if (!prefix || ref.startsWith(prefix) || ref.toLowerCase().includes(prefix.toLowerCase())) {
          items.push({ label: ref, detail: `Input param`, apply: ref });
        }
      }
    }
    // Connection params (param.conn_<id>) from query steps, per hclgen
    const usedDBs = new Set<string>();
    for (const step of flow.steps) {
      if (step.type?.toLowerCase() !== 'query') continue;
      const dbId = (step.config?.databaseId as string) ?? '';
      if (dbId) usedDBs.add(dbId);
    }
    for (const dbId of usedDBs) {
      const ref = `param.conn_${dbId}`;
      if (!prefix || ref.startsWith(prefix) || ref.toLowerCase().includes(prefix.toLowerCase())) {
        items.push({ label: ref, detail: `DB connection`, apply: ref });
      }
    }
  }

  if (context === 'function') {
    const lowerPrefix = prefix.toLowerCase();
    for (const fn of HCL_FUNCTIONS) {
      if (!prefix || fn.startsWith(lowerPrefix)) {
        items.push({ label: fn, detail: 'HCL function', apply: fn });
      }
    }
  }

  return items;
}

/**
 * Infers completion context from the text before the cursor using AST when available.
 * Uses the HCL Lezer parser (from codemirror-lang-hcl) for AST-based inference when
 * the editor state has an HCL syntax tree; falls back to regex for partial/invalid input.
 */
export function inferCompletionContext(
  cmContext: CompletionContext
): { context: 'step' | 'param' | 'function'; prefix: string } | null {
  const text = cmContext.state.sliceDoc(0, cmContext.pos);
  const cursorPos = cmContext.pos;

  // Try AST-based inference when we have a syntax tree (HCL mode)
  const tree = syntaxTree(cmContext.state);
  if (tree.length > 0) {
    const inferred = inferFromAST(tree, cursorPos, {
      sliceDoc: (a, b) => cmContext.state.sliceDoc(a, b),
    });
    if (inferred) return inferred;
  }

  // Fallback: regex-based inference for partial input or non-HCL mode
  return inferFromRegex(text, cursorPos);
}

function inferFromAST(
  tree: ReturnType<typeof syntaxTree>,
  pos: number,
  state: { sliceDoc: (from: number, to: number) => string }
): { context: 'step' | 'param' | 'function'; prefix: string } | null {
  try {
    const cursor = tree.cursorAt(pos);
    let exprNode: { from: number; to: number } | null = null;

    for (let d = 0; d < 30; d++) {
      const name = cursor.node.type.name;
      if (name === 'VariableExpr' || name === 'GetAttr') {
        exprNode = { from: cursor.node.from, to: cursor.node.to };
      }
      if (name === 'FunctionCall') {
        const from = cursor.node.from;
        const to = Math.max(cursor.node.to, pos);
        const text = state.sliceDoc(from, to);
        const fnMatch = text.match(/^([a-z0-9_]+)\s*\(/i);
        if (fnMatch) {
          const beforeCursor = text.slice(0, pos - from);
          const prefixMatch = beforeCursor.match(/([a-z0-9_]*)$/i);
          return { context: 'function', prefix: prefixMatch?.[1] ?? '' };
        }
      }
      if (!cursor.parent()) break;
    }

    if (exprNode) {
      const text = state.sliceDoc(exprNode.from, Math.max(exprNode.to, pos));
      return inferFromRegex(text, pos - exprNode.from);
    }
  } catch {
    // Parser may fail on incomplete input
  }
  return null;
}

function inferFromRegex(
  text: string,
  cursorPos: number
): { context: 'step' | 'param' | 'function'; prefix: string } | null {
  const before = text.slice(0, cursorPos);
  const stepMatch = before.match(/step\.([a-z0-9_.]*)$/i);
  if (stepMatch) {
    return { context: 'step', prefix: `step.${stepMatch[1]}` };
  }
  const paramMatch = before.match(/param\.([a-z0-9_]*)$/i);
  if (paramMatch) {
    return { context: 'param', prefix: `param.${paramMatch[1]}` };
  }
  const identMatch = before.match(/([a-z0-9_]+)$/i);
  if (identMatch) {
    return { context: 'function', prefix: identMatch[1] };
  }
  return null;
}
