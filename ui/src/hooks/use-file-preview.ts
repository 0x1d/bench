import { useQuery } from '@tanstack/react-query';
import {
  downloadFile,
  downloadFileIfExists,
  getPreviewCachePaths,
} from '@/services/api';
import type { ViewableType } from '@/lib/viewable-types';

/** Try thumbnail cache first; fall back to full file only if cache returns 404. */
async function fetchImageOrVideo(
  root: string,
  path: string,
  type: 'image' | 'video',
  hasCache: boolean
): Promise<{ blob: Blob; fromCache: boolean }> {
  if (!hasCache) {
    const blob = await downloadFile(root, path);
    return { blob, fromCache: false };
  }
  const cachePaths = getPreviewCachePaths(path, type === 'video');
  for (const cachePath of cachePaths) {
    const blob = await downloadFileIfExists(root, cachePath);
    if (blob) return { blob, fromCache: true };
  }
  const blob = await downloadFile(root, path);
  return { blob, fromCache: false };
}

export function useFilePreview(
  root: string | null,
  path: string | null,
  type: ViewableType | null,
  enabled: boolean,
  hasCache: boolean
) {
  return useQuery({
    queryKey: ['resources', 'preview', root, path, hasCache],
    queryFn: async () => {
      if (type === 'text') {
        const blob = await downloadFile(root!, path!);
        return { type: 'text' as const, data: await blob.text() };
      }
      if (type === 'image' || type === 'video') {
        const { blob, fromCache } = await fetchImageOrVideo(root!, path!, type, hasCache);
        return { type, data: blob, fromCache };
      }
      const blob = await downloadFile(root!, path!);
      return { type: type!, data: blob };
    },
    enabled: enabled && root != null && path != null && type != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
