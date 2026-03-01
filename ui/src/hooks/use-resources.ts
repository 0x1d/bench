import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRoots,
  fetchResourceList,
  fetchResourceTree,
  downloadFile,
  uploadFile,
  saveFile,
  createFolder,
  renameResource,
  deleteResource,
  type ResourceListResponse,
  type RootsResponse,
  type TreeResponse,
} from '@/services/api';

export function useRoots() {
  return useQuery<RootsResponse>({
    queryKey: ['resources', 'roots'],
    queryFn: fetchRoots,
  });
}

export function useResourceList(root: string | null, path: string) {
  return useQuery<ResourceListResponse>({
    queryKey: ['resources', 'list', root, path],
    queryFn: () => fetchResourceList(root!, path),
    enabled: root != null,
  });
}

export function useResourceTree(root: string | null, path: string, enabled: boolean) {
  return useQuery<TreeResponse>({
    queryKey: ['resources', 'tree', root, path],
    queryFn: () => fetchResourceTree(root!, path),
    enabled: root != null && enabled,
  });
}

export async function triggerDownload(root: string, path: string) {
  const blob = await downloadFile(root, path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? 'download';
  a.click();
  URL.revokeObjectURL(url);
}

export function useSaveFile(root: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      saveFile(root!, path, content),
    onSuccess: (_, { path }) => {
      const parts = path.split('/').filter(Boolean);
      parts.pop();
      const dirPath = parts.length > 0 ? parts.join('/') : '.';
      queryClient.invalidateQueries({ queryKey: ['resources', 'list', root, dirPath] });
    },
  });
}

export function useResourceMutations(root: string | null, path: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['resources', 'list', root, path] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(root!, path, file),
    onSuccess: invalidate,
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(root!, path, name),
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ itemPath, newName }: { itemPath: string; newName: string }) =>
      renameResource(root!, itemPath, newName),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (itemPath: string) => deleteResource(root!, itemPath),
    onSuccess: invalidate,
  });

  return { upload, createFolder: createFolderMutation, rename, delete: remove };
}
