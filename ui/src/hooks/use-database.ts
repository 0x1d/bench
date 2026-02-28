import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDatabaseTables,
  fetchTableData,
  fetchTableSchema,
  fetchTableLookup,
  createTable,
  alterTable,
  dropTable,
  insertRow,
  updateRow,
  deleteRow,
  executeQuery,
  type CreateTableRequest,
  type AlterTableRequest,
  type TableDataResponse,
  type TableSchemaResponse,
  type QueryResponse,
  type QueryRowsAffectedResponse,
} from '@/services/api';

export function useDatabaseTables(enabled: boolean) {
  return useQuery({
    queryKey: ['database', 'tables'],
    queryFn: fetchDatabaseTables,
    enabled,
  });
}

export function useTableData(
  tableName: string | null,
  page: number,
  search: string,
  enabled: boolean
) {
  const limit = 20;
  const offset = (page - 1) * limit;

  return useQuery<TableDataResponse>({
    queryKey: ['database', 'table', tableName, page, search],
    queryFn: () => fetchTableData(tableName!, limit, offset, search),
    enabled: enabled && tableName != null,
  });
}

export function useTableLookup(
  tableName: string | null,
  valueColumn: string,
  search: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['database', 'lookup', tableName, valueColumn, search],
    queryFn: () => fetchTableLookup(tableName!, valueColumn, search),
    enabled: enabled && tableName != null && valueColumn.length > 0,
    staleTime: 10_000,
  });
}

export function useTableSchema(tableName: string | null, enabled: boolean) {
  return useQuery<TableSchemaResponse>({
    queryKey: ['database', 'schema', tableName],
    queryFn: () => fetchTableSchema(tableName!),
    enabled: enabled && tableName != null && tableName.length > 0,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useCreateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateTableRequest) => createTable(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', 'tables'] });
    },
  });
}

export function useAlterTable(tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: AlterTableRequest) => alterTable(tableName!, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', 'schema', tableName] });
        queryClient.invalidateQueries({ queryKey: ['database', 'table', tableName] });
      }
    },
  });
}

export function useDropTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tableName: string) => dropTable(tableName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database'] });
    },
  });
}

export function useUpdateRow(tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      where,
      set,
    }: {
      where: Record<string, unknown>;
      set: Record<string, unknown>;
    }) => updateRow(tableName!, where, set),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', 'table', tableName] });
      }
    },
  });
}

export function useDeleteRow(tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (where: Record<string, unknown>) => deleteRow(tableName!, where),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', 'table', tableName] });
      }
    },
  });
}

export function useInsertRow(tableName: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (row: Record<string, unknown>) => insertRow(tableName!, row),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', 'table', tableName] });
      }
    },
  });
}

export function useExecuteQuery() {
  const queryClient = useQueryClient();

  return useMutation<QueryResponse | QueryRowsAffectedResponse, Error, string>({
    mutationFn: executeQuery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database'] });
    },
  });
}
