import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRoots,
  fetchResourceList,
  downloadFile,
  uploadFile,
  createFolder,
  renameResource,
  deleteResource,
  type ResourceListResponse,
  type RootsResponse,
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

export async function triggerDownload(root: string, path: string) {
  const blob = await downloadFile(root, path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? 'download';
  a.click();
  URL.revokeObjectURL(url);
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
