import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/code-editor';
import { useExecuteQuery } from '@/hooks/use-database';

export interface DatabaseQueryPanelContentProps {
  initialSql?: string;
}

export function DatabaseQueryPanelContent({
  initialSql = 'SELECT 1',
}: DatabaseQueryPanelContentProps) {
  const [querySql, setQuerySql] = useState(initialSql);
  const [queryResult, setQueryResult] = useState<{
    columns?: string[];
    rows?: unknown[][] | null;
    rowsAffected?: number;
  } | null>(null);

  const executeMutation = useExecuteQuery();

  const handleRunQuery = () => {
    setQueryResult(null);
    executeMutation.mutate(querySql, {
      onSuccess: (data) => {
        if ('columns' in data) {
          setQueryResult({
            columns: Array.isArray(data.columns) ? data.columns : [],
            rows: Array.isArray(data.rows) ? data.rows : [],
          });
        } else {
          setQueryResult({ rowsAffected: data.rowsAffected });
        }
      },
      onError: () => {
        setQueryResult(null);
      },
    });
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <CodeEditor
        value={querySql}
        onChange={setQuerySql}
        filename="query.sql"
        className="min-h-[120px]"
      />

      {queryResult && (
        <div className="mt-2 space-y-2">
          {'rowsAffected' in queryResult && queryResult.rowsAffected !== undefined ? (
            <p className="text-sm text-muted-foreground">
              {queryResult.rowsAffected} row(s) affected
            </p>
          ) : queryResult.columns && queryResult.rows ? (
            queryResult.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records returned.</p>
            ) : (
              <div className="overflow-x-auto rounded border border-border text-sm max-h-48 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {queryResult.columns.map((c) => (
                        <th key={c} className="px-2 py-1 text-left font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1">
                            {cell == null ? (
                              <span className="text-muted-foreground">NULL</span>
                            ) : typeof cell === 'object' ? (
                              JSON.stringify(cell)
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}

      <Button
        onClick={handleRunQuery}
        disabled={executeMutation.isPending || !querySql.trim()}
        className="gap-2"
      >
        <Play className="size-4" />
        {executeMutation.isPending ? 'Running...' : 'Run'}
      </Button>
      {executeMutation.isError && (
        <p className="text-sm text-destructive">{executeMutation.error?.message}</p>
      )}
    </div>
  );
}
