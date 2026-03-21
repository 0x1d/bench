import yaml from 'js-yaml';

/** One publish/subscribe side on a channel. */
export interface AsyncAPIOperation {
  channel: string;
  direction: 'publish' | 'subscribe';
  operationId?: string;
  summary?: string;
}

/** Channel entry from an AsyncAPI document. */
export interface AsyncAPIChannel {
  name: string;
  publish?: Record<string, unknown>;
  subscribe?: Record<string, unknown>;
}

/** Structured view of an AsyncAPI spec for UI browsing. */
export interface AsyncAPIParsed {
  channels: AsyncAPIChannel[];
  operations: AsyncAPIOperation[];
}

/** Parse AsyncAPI JSON or YAML and extract channels and operations. */
export function parseAsyncAPI(content: string): AsyncAPIParsed {
  const trimmed = content.trim();
  let doc: Record<string, unknown> | undefined;
  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      doc = JSON.parse(content) as Record<string, unknown>;
    } else {
      doc = yaml.load(content) as Record<string, unknown>;
    }
  } catch {
    return { channels: [], operations: [] };
  }
  if (!doc || typeof doc !== 'object') {
    return { channels: [], operations: [] };
  }

  const channelsRaw = doc.channels as Record<string, Record<string, unknown>> | undefined;
  if (!channelsRaw || typeof channelsRaw !== 'object') {
    return { channels: [], operations: [] };
  }

  const channels: AsyncAPIChannel[] = [];
  const operations: AsyncAPIOperation[] = [];

  for (const [name, ch] of Object.entries(channelsRaw)) {
    if (!ch || typeof ch !== 'object') continue;
    const pub = ch.publish as Record<string, unknown> | undefined;
    const sub = ch.subscribe as Record<string, unknown> | undefined;
    channels.push({ name, publish: pub, subscribe: sub });
    if (pub) {
      operations.push({
        channel: name,
        direction: 'publish',
        operationId: typeof pub.operationId === 'string' ? pub.operationId : undefined,
        summary: typeof pub.summary === 'string' ? pub.summary : undefined,
      });
    }
    if (sub) {
      operations.push({
        channel: name,
        direction: 'subscribe',
        operationId: typeof sub.operationId === 'string' ? sub.operationId : undefined,
        summary: typeof sub.summary === 'string' ? sub.summary : undefined,
      });
    }
  }

  return { channels, operations };
}
