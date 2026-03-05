/**
 * File extensions that can be viewed inline as text.
 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log', 'ini', 'cfg', 'conf',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'rb', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'sql', 'sh',
  'bash', 'zsh', 'ps1', 'bat', 'env', 'fp', 'gitignore', 'dockerignore',
]);

/**
 * File extensions for images.
 */
const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif',
]);

/**
 * File extensions for video.
 */
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v',
]);

/**
 * File extensions for audio.
 */
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'weba',
]);

export type ViewableType = 'text' | 'image' | 'video' | 'audio';

export function getViewableType(filename: string): ViewableType | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return null;
}

export function isViewable(filename: string): boolean {
  return getViewableType(filename) != null;
}

export function isImage(filename: string): boolean {
  return getViewableType(filename) === 'image';
}

const FORM_EXTENSIONS = new Set(['json', 'yml', 'yaml']);

export function supportsFormMode(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext != null && FORM_EXTENSIONS.has(ext);
}
