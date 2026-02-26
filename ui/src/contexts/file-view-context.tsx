/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useContext, useState } from 'react';

export interface ViewedFile {
  root: string;
  path: string;
  name: string;
  type: 'text' | 'image' | 'video' | 'audio';
}

interface FileViewContextValue {
  viewedFile: ViewedFile | null;
  setViewedFile: (file: ViewedFile | null) => void;
}

const FileViewContext = createContext<FileViewContextValue | null>(null);

export function FileViewProvider({ children }: { children: React.ReactNode }) {
  const [viewedFile, setViewedFile] = useState<ViewedFile | null>(null);
  return (
    <FileViewContext.Provider value={{ viewedFile, setViewedFile }}>
      {children}
    </FileViewContext.Provider>
  );
}

export function useFileView(): FileViewContextValue {
  const ctx = useContext(FileViewContext);
  if (!ctx) {
    throw new Error('useFileView must be used within FileViewProvider');
  }
  return ctx;
}
