import yaml from 'js-yaml';
import {
  parseOpenAPIOperationsGrouped,
  type OpenAPIOperationsGrouped,
} from './openapi';
import { parseAsyncAPI, type AsyncAPIParsed } from './asyncapi';

export type SchemaKind = 'openapi' | 'asyncapi' | 'json-schema' | 'unknown';

/** Infer schema kind from document content (JSON or YAML). */
export function detectSchemaType(content: string): SchemaKind {
  const trimmed = content.trim();
  let doc: Record<string, unknown> | undefined;
  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      doc = JSON.parse(content) as Record<string, unknown>;
    } else {
      doc = yaml.load(content) as Record<string, unknown>;
    }
  } catch {
    return 'unknown';
  }
  if (!doc || typeof doc !== 'object') return 'unknown';

  if (typeof doc.openapi === 'string' || typeof (doc as { swagger?: string }).swagger === 'string') {
    return 'openapi';
  }
  if (typeof doc.asyncapi === 'string') {
    return 'asyncapi';
  }
  const schema = doc.$schema;
  if (typeof schema === 'string' && schema.includes('json-schema')) {
    return 'json-schema';
  }
  if (doc.type === 'object' && doc.properties && typeof doc.properties === 'object') {
    return 'json-schema';
  }
  return 'unknown';
}

/** Minimal JSON Schema shape for browsing. */
export interface JsonSchemaParsed {
  title?: string;
  properties?: Record<string, unknown>;
}

export type SchemaParsed =
  | { type: 'openapi'; data: OpenAPIOperationsGrouped }
  | { type: 'asyncapi'; data: AsyncAPIParsed }
  | { type: 'json-schema'; data: JsonSchemaParsed }
  | { type: 'unknown'; data: null };

export function parseSchema(content: string, kind: string): SchemaParsed {
  const k = kind.toLowerCase();
  if (k === 'openapi') {
    return { type: 'openapi', data: parseOpenAPIOperationsGrouped(content) };
  }
  if (k === 'asyncapi') {
    return { type: 'asyncapi', data: parseAsyncAPI(content) };
  }
  if (k === 'json-schema' || k === 'json_schema') {
    const trimmed = content.trim();
    try {
      const doc = JSON.parse(trimmed) as Record<string, unknown>;
      return {
        type: 'json-schema',
        data: {
          title: typeof doc.title === 'string' ? doc.title : undefined,
          properties:
            typeof doc.properties === 'object' && doc.properties !== null
              ? (doc.properties as Record<string, unknown>)
              : undefined,
        },
      };
    } catch {
      return { type: 'unknown', data: null };
    }
  }
  return { type: 'unknown', data: null };
}
