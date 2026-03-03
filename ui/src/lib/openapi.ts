import yaml from 'js-yaml';

/** OpenAPI 3.x / Swagger 2 path parameter or query parameter. */
export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie' | 'body';
  required?: boolean;
  schema?: OpenAPISchema;
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  items?: OpenAPISchema;
}

/** JSON Schema / OpenAPI schema (simplified). */
export interface OpenAPISchema {
  type?: string;
  format?: string;
  $ref?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  enum?: unknown[];
  items?: OpenAPISchema;
  description?: string;
}

/** OpenAPI operation (GET, POST, etc.) with its parameters. */
export interface OpenAPIOperation {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    content?: {
      'application/json'?: { schema?: OpenAPISchema };
    };
  };
  /** Swagger 2: body param schema (for in: body parameters). */
  bodySchema?: OpenAPISchema;
}

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

function methodSortIndex(m: string): number {
  const i = METHOD_ORDER.indexOf(m.toUpperCase() as (typeof METHOD_ORDER)[number]);
  return i >= 0 ? i : METHOD_ORDER.length;
}

/** Parse OpenAPI spec (JSON or YAML) and extract operations. */
export function parseOpenAPIOperations(specContent: string): OpenAPIOperation[] {
  const { groups } = parseOpenAPIOperationsGrouped(specContent);
  return groups.flatMap((g) => g.operations);
}

/** Grouped operations by tag, sorted like the OpenAPI spec (tags order, path, method). */
export interface OpenAPIOperationsGrouped {
  groups: { tag: string; operations: OpenAPIOperation[] }[];
}

/** Parse OpenAPI spec and return operations grouped by tag, sorted by spec order. */
export function parseOpenAPIOperationsGrouped(specContent: string): OpenAPIOperationsGrouped {
  let spec: Record<string, unknown> | undefined;
  try {
    const trimmed = (specContent ?? '').trim();
    if (!trimmed) return { groups: [] };
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      spec = JSON.parse(specContent) as Record<string, unknown>;
    } else {
      spec = yaml.load(specContent) as Record<string, unknown> | undefined;
    }
  } catch {
    return { groups: [] };
  }
  if (!spec || typeof spec !== 'object') return { groups: [] };

  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths || typeof paths !== 'object') return { groups: [] };

  const globalTags = (spec.tags as Array<{ name?: string } | string> | undefined) ?? [];
  const tagOrder = globalTags
    .map((t) => (typeof t === 'string' ? t : (t as { name?: string })?.name ?? ''))
    .filter(Boolean);

  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  const operations: OpenAPIOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pathItemObj = pathItem as Record<string, unknown>;

    for (const method of methods) {
      const op = pathItemObj[method] as Record<string, unknown> | undefined;
      if (!op || typeof op !== 'object') continue;

      const pathParams = (pathItemObj.parameters as OpenAPIParameter[] | undefined) ?? [];
      const opParams = (op.parameters as OpenAPIParameter[] | undefined) ?? [];
      const allParams = [...pathParams, ...opParams];

      // Swagger 2: body param with schema
      const bodyParam = allParams.find((p) => p.in === 'body');
      const bodySchema = bodyParam?.schema as OpenAPISchema | undefined;

      const tagsRaw = op.tags as string[] | undefined;
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter((t): t is string => typeof t === 'string') : [];

      operations.push({
        path,
        method: method.toUpperCase(),
        operationId: op.operationId as string | undefined,
        summary: op.summary as string | undefined,
        tags: tags.length > 0 ? tags : undefined,
        parameters: allParams.filter((p) => p.in !== 'body'),
        requestBody: op.requestBody as OpenAPIOperation['requestBody'],
        bodySchema: bodySchema ?? undefined,
      });
    }
  }

  const byTag = new Map<string, OpenAPIOperation[]>();
  for (const op of operations) {
    const tag = op.tags?.[0] ?? 'Untagged';
    const list = byTag.get(tag) ?? [];
    list.push(op);
    byTag.set(tag, list);
  }

  for (const list of byTag.values()) {
    list.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return methodSortIndex(a.method) - methodSortIndex(b.method);
    });
  }

  const allTags = [...byTag.keys()].sort((a, b) => {
    const ai = tagOrder.indexOf(a);
    const bi = tagOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });

  const groups = allTags.map((tag) => ({
    tag,
    operations: byTag.get(tag) ?? [],
  }));

  return { groups };
}

/** Resolve path with path parameter values. e.g. /pets/{id} + {id: "123"} => /pets/123 */
export function resolvePathTemplate(
  path: string,
  pathParams: Record<string, string>
): string {
  let result = path;
  for (const [key, value] of Object.entries(pathParams)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(value));
  }
  return result;
}

/** Resolve $ref in schema. Supports #/definitions/X (Swagger 2) and #/components/schemas/X (OpenAPI 3). */
export function resolveSchema(
  spec: Record<string, unknown>,
  schema: OpenAPISchema | undefined
): OpenAPISchema | null {
  if (!schema) return null;
  const ref = schema.$ref;
  if (!ref || typeof ref !== 'string') return schema;

  const parts = ref.replace(/^#\//, '').split('/');
  if (parts.length < 2) return null;

  let current: unknown = spec;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current as OpenAPISchema;
}

/** Resolved property for form rendering. */
export interface ResolvedSchemaProperty {
  name: string;
  schema: OpenAPISchema;
  required: boolean;
}

/** Get request body schema from operation. Returns resolved properties for form. */
export function getRequestBodySchema(
  specContent: string,
  operation: OpenAPIOperation
): { properties: ResolvedSchemaProperty[]; spec: Record<string, unknown> } | null {
  let spec: Record<string, unknown>;
  try {
    const trimmed = (specContent ?? '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      spec = JSON.parse(specContent) as Record<string, unknown>;
    } else {
      spec = (yaml.load(specContent) as Record<string, unknown>) ?? {};
    }
  } catch {
    return null;
  }

  let rawSchema: OpenAPISchema | undefined;

  // OpenAPI 3
  const jsonContent = operation.requestBody?.content?.['application/json'];
  if (jsonContent?.schema) {
    rawSchema = jsonContent.schema;
  }
  // Swagger 2
  else if (operation.bodySchema) {
    rawSchema = operation.bodySchema;
  }

  if (!rawSchema) return null;

  // Resolve $ref
  let schema = rawSchema;
  if (rawSchema.$ref) {
    const resolved = resolveSchema(spec, rawSchema);
    if (!resolved) return null;
    schema = resolved;
  }

  // Handle array of objects - use first item schema
  if (schema.type === 'array' && schema.items) {
    let itemSchema = schema.items;
    if (itemSchema.$ref) {
      const resolved = resolveSchema(spec, itemSchema);
      if (!resolved) return null;
      itemSchema = resolved;
    }
    schema = itemSchema;
  }

  if (!schema.properties) return null;

  const required = new Set(schema.required ?? []);
  const properties: ResolvedSchemaProperty[] = Object.entries(schema.properties).map(
    ([name, propSchema]) => {
      let resolved = propSchema;
      if (propSchema.$ref) {
        const r = resolveSchema(spec, propSchema);
        if (r) resolved = r;
      }
      return {
        name,
        schema: resolved,
        required: required.has(name),
      };
    }
  );

  return { properties, spec };
}
