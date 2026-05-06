import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/code-editor';
import { useExecuteQuery } from '@/hooks/use-database';
import { useDatabaseView } from '@/contexts/database-view-context';

export interface DatabaseQueryPanelContentProps {
  initialSql?: string;
}

export function DatabaseQueryPanelContent({
  initialSql = 'SELECT 1',
}: DatabaseQueryPanelContentProps) {
  const { selectedDatabaseId, querySql, setQuerySql, setQueryResult } = useDatabaseView();

  const executeMutation = useExecuteQuery(selectedDatabaseId);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pb-4">
        <CodeEditor
          value={querySql}
          onChange={setQuerySql}
          filename="query.sql"
          className="min-h-[120px]"
        />

        {executeMutation.isError && (
          <p className="text-sm text-destructive">{executeMutation.error?.message}</p>
        )}
      </div>
      <div className="shrink-0 border-t pt-3">
        <div className="flex justify-end">
          <Button
            onClick={handleRunQuery}
            disabled={executeMutation.isPending || !querySql.trim()}
            className="gap-2"
          >
            <Play className="size-4" />
            {executeMutation.isPending ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>
    </div>
  );
}
