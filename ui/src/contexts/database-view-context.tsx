/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useContext, useState } from 'react';

export type DatabasePanelMode = 'create' | 'query' | 'add-row' | 'alter' | 'edit-row' | null;

export interface EditRowData {
  tableName: string;
  row: Record<string, unknown>;
}

interface DatabaseViewContextValue {
  panelMode: DatabasePanelMode;
  setPanelMode: (mode: DatabasePanelMode) => void;
  selectedTable: string | null;
  setSelectedTable: (table: string | null) => void;
  alterTableName: string | null;
  setAlterTableName: (table: string | null) => void;
  editRowData: EditRowData | null;
  setEditRowData: (data: EditRowData | null) => void;
  selectedDatabaseId: string | null;
  setSelectedDatabaseId: (id: string | null) => void;
}

const DatabaseViewContext = createContext<DatabaseViewContextValue | null>(null);
const SELECTED_DB_STORAGE_KEY = 'bench-selected-database-id';

export function DatabaseViewProvider({ children }: { children: React.ReactNode }) {
  const [panelMode, setPanelMode] = useState<DatabasePanelMode>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [alterTableName, setAlterTableName] = useState<string | null>(null);
  const [editRowData, setEditRowData] = useState<EditRowData | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SELECTED_DB_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setAndPersistSelectedDatabaseId = (id: string | null) => {
    setSelectedDatabaseId(id);
    try {
      if (id) {
        sessionStorage.setItem(SELECTED_DB_STORAGE_KEY, id);
      } else {
        sessionStorage.removeItem(SELECTED_DB_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  };
  return (
    <DatabaseViewContext.Provider
      value={{
        panelMode,
        setPanelMode,
        selectedTable,
        setSelectedTable,
        alterTableName,
        setAlterTableName,
        editRowData,
        setEditRowData,
        selectedDatabaseId,
        setSelectedDatabaseId: setAndPersistSelectedDatabaseId,
      }}
    >
      {children}
    </DatabaseViewContext.Provider>
  );
}

export function useDatabaseView(): DatabaseViewContextValue {
  const ctx = useContext(DatabaseViewContext);
  if (!ctx) {
    throw new Error('useDatabaseView must be used within DatabaseViewProvider');
  }
  return ctx;
}
