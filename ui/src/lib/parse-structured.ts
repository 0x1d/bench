import yaml from 'js-yaml';

export type StructuredFormat = 'json' | 'yaml';

export function detectFormat(filename: string): StructuredFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  return 'json';
}

export function parseStructured(
  content: string,
  format: StructuredFormat
): unknown {
  if (format === 'json') {
    return JSON.parse(content);
  }
  return yaml.load(content);
}

export function serializeStructured(
  data: unknown,
  format: StructuredFormat
): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }
  return yaml.dump(data, { indent: 2 });
}

export function tryParseStructured(
  content: string,
  format: StructuredFormat
): { success: true; data: unknown } | { success: false; error: string } {
  try {
    const data = parseStructured(content, format);
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
