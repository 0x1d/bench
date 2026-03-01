/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { uploadFileWithProgress } from '@/services/api';

export interface UploadItem {
  id: string;
  filename: string;
  targetPath: string;
  loaded: number;
  total: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface UploadContextValue {
  uploads: UploadItem[];
  trackUpload: (root: string, targetPath: string, file: File) => Promise<void>;
  clearCompleted: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

let nextId = 0;

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const trackUpload = useCallback(
    async (root: string, targetPath: string, file: File) => {
      const id = String(++nextId);
      const item: UploadItem = {
        id,
        filename: file.name,
        targetPath,
        loaded: 0,
        total: file.size,
        status: 'uploading',
      };
      setUploads((prev) => [...prev, item]);

      try {
        await uploadFileWithProgress(root, targetPath, file, (loaded, total) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, loaded, total } : u))
          );
        });
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: 'done', loaded: u.total } : u
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: 'error', error: msg } : u))
        );
      }
    },
    []
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === 'uploading'));
  }, []);

  return (
    <UploadContext.Provider value={{ uploads, trackUpload, clearCompleted }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error('useUpload must be used within UploadProvider');
  }
  return ctx;
}
