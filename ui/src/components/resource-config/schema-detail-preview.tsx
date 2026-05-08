import type { SchemaParsed } from '@/lib/schema-registry';
import type { SchemaResourceEntry } from '@/lib/resource-config';

export function SchemaDetailPreview({
  entry,
  schemaId,
  loading,
  fetchError,
  raw,
  parsed,
}: {
  entry: SchemaResourceEntry;
  schemaId: string;
  loading: boolean;
  fetchError: unknown;
  raw: string | null | undefined;
  parsed: SchemaParsed | null;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">ID</span>
          <p className="break-all">{entry.id}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Label</span>
          <p>{entry.label?.trim() || '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Type</span>
          <p>{entry.type}</p>
        </div>
        <div className="sm:col-span-2">
          <span className="text-muted-foreground">Source path</span>
          <p className="break-all">{entry.source.path}</p>
        </div>
      </div>

      {schemaId === '' && (
        <p className="text-destructive text-sm">
          This schema has no ID. Set an ID in Edit schema to load content.
        </p>
      )}
      {loading && <p className="text-muted-foreground">Loading schema content...</p>}
      {fetchError != null && (
        <p className="text-destructive">
          {fetchError instanceof Error ? fetchError.message : 'Failed to load schema content'}
        </p>
      )}
      {raw != null && parsed && (
        <div className="rounded-lg border border-border bg-card p-4">
          {parsed.type === 'openapi' && (
            <div className="space-y-4">
              {parsed.data.groups.map((g) => (
                <div key={g.tag}>
                  <h3 className="mb-2 font-medium">{g.tag}</h3>
                  <ul className="space-y-1 font-mono text-xs">
                    {g.operations.map((op, i) => (
                      <li key={`${op.path}-${op.method}-${i}`}>
                        <span className="text-muted-foreground">{op.method}</span> {op.path}
                        {op.summary ? (
                          <span className="ml-2 text-muted-foreground">— {op.summary}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {parsed.type === 'asyncapi' && (
            <div className="space-y-3">
              <h3 className="font-medium">Channels</h3>
              <ul className="space-y-2">
                {parsed.data.operations.map((op, i) => (
                  <li key={`${op.channel}-${op.direction}-${i}`} className="font-mono text-xs">
                    <span className="text-muted-foreground">{op.direction}</span> {op.channel}
                    {op.summary ? (
                      <span className="ml-2 text-muted-foreground">— {op.summary}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parsed.type === 'json-schema' && (
            <div className="space-y-2">
              {parsed.data.title && <p className="font-medium">{parsed.data.title}</p>}
              <p className="text-muted-foreground">Properties</p>
              <ul className="list-inside list-disc font-mono text-xs">
                {parsed.data.properties
                  ? Object.keys(parsed.data.properties).map((k) => <li key={k}>{k}</li>)
                  : null}
              </ul>
            </div>
          )}
          {parsed.type === 'unknown' && (
            <p className="text-muted-foreground">Could not parse this schema for preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
