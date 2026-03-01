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

export function useDatabaseTables(dbId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['database', dbId, 'tables'],
    queryFn: () => fetchDatabaseTables(dbId ?? undefined),
    enabled: enabled && dbId != null,
  });
}

export function useTableData(
  tableName: string | null,
  page: number,
  search: string,
  dbId: string | null,
  enabled: boolean
) {
  const limit = 20;
  const offset = (page - 1) * limit;

  return useQuery<TableDataResponse>({
    queryKey: ['database', dbId, 'table', tableName, page, search],
    queryFn: () => fetchTableData(tableName!, limit, offset, search, dbId ?? undefined),
    enabled: enabled && dbId != null && tableName != null,
  });
}

export function useTableLookup(
  tableName: string | null,
  valueColumn: string,
  search: string,
  dbId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['database', dbId, 'lookup', tableName, valueColumn, search],
    queryFn: () => fetchTableLookup(tableName!, valueColumn, search, 50, dbId ?? undefined),
    enabled: enabled && dbId != null && tableName != null && valueColumn.length > 0,
    staleTime: 10_000,
  });
}

export function useTableSchema(tableName: string | null, dbId: string | null, enabled: boolean) {
  return useQuery<TableSchemaResponse>({
    queryKey: ['database', dbId, 'schema', tableName],
    queryFn: () => fetchTableSchema(tableName!, dbId ?? undefined),
    enabled: enabled && dbId != null && tableName != null && tableName.length > 0,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useCreateTable(dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateTableRequest) => createTable(req, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId, 'tables'] });
    },
  });
}

export function useAlterTable(tableName: string | null, dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: AlterTableRequest) => alterTable(tableName!, req, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId, 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', dbId, 'schema', tableName] });
        queryClient.invalidateQueries({ queryKey: ['database', dbId, 'table', tableName] });
      }
    },
  });
}

export function useDropTable(dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tableName: string) => dropTable(tableName, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId] });
    },
  });
}

export function useUpdateRow(tableName: string | null, dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      where,
      set,
    }: {
      where: Record<string, unknown>;
      set: Record<string, unknown>;
    }) => updateRow(tableName!, where, set, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId, 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', dbId, 'table', tableName] });
      }
    },
  });
}

export function useDeleteRow(tableName: string | null, dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (where: Record<string, unknown>) => deleteRow(tableName!, where, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId, 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', dbId, 'table', tableName] });
      }
    },
  });
}

export function useInsertRow(tableName: string | null, dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (row: Record<string, unknown>) => insertRow(tableName!, row, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId, 'tables'] });
      if (tableName) {
        queryClient.invalidateQueries({ queryKey: ['database', dbId, 'table', tableName] });
      }
    },
  });
}

export function useExecuteQuery(dbId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<QueryResponse | QueryRowsAffectedResponse, Error, string>({
    mutationFn: (sql: string) => executeQuery(sql, dbId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbId] });
    },
  });
}
