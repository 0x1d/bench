import { useDatabaseView } from '@/contexts/database-view-context';
import { cn } from '@/lib/utils';

export function DatabaseQueryResult() {
  const { queryResult } = useDatabaseView();

  if (!queryResult) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="max-w-xs space-y-2">
          <p className="text-sm font-medium">Ready to query</p>
          <p className="text-sm text-muted-foreground">
            Enter a SQL query in the terminal panel and click Run to see the results here.
          </p>
        </div>
      </div>
    );
  }

  if ('rowsAffected' in queryResult && queryResult.rowsAffected !== undefined) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          {queryResult.rowsAffected} row(s) affected
        </p>
      </div>
    );
  }

  const { columns = [], rows = [] } = queryResult;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        No records returned.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 text-left font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'border-b border-border/50 last:border-b-0',
                  'hover:bg-accent/30'
                )}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2">
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
      <p className="text-sm text-muted-foreground">
        {rows.length} record(s) returned
      </p>
    </div>
  );
}
