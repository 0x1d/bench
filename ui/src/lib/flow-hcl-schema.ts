/**
 * Flow HCL schema for expression autocomplete.
 * Must stay in sync with api/internal/service/flow/hclgen/schema.go.
 * Used by flowpipe-autocomplete for step.param.attr and param.x suggestions.
 */

/** Step block types emitted by hclgen (step.<type>.<name>). */
export const STEP_TYPES = [
  'http',
  'query',
  'message',
  'sleep',
  'transform',
  'container',
  'pipeline',
] as const;

/** Output attributes per step type for step.<type>.<name>.<attr>. */
export const STEP_ATTRIBUTES: Record<string, readonly string[]> = {
  http: ['response_body', 'response_status', 'request_body'],
  query: ['rows'],
  message: [],
  transform: ['output'],
  container: ['stdout', 'stderr', 'lines', 'exit_code', 'container_id'],
  pipeline: ['output'],
  sleep: [],
};

export type StepType = (typeof STEP_TYPES)[number];
