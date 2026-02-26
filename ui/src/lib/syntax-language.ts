/**
 * Map file extension to Prism language identifier for syntax highlighting.
 * Uses plaintext for extensions without a Prism grammar.
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  xml: 'xml',
  md: 'markdown',
  py: 'python',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  bat: 'batch',
  yml: 'yaml',
  yaml: 'yaml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'bash',
  gitignore: 'plaintext',
  dockerignore: 'plaintext',
  log: 'plaintext',
  csv: 'plaintext',
  txt: 'plaintext',
};

export function getSyntaxLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? EXT_TO_LANGUAGE[ext] ?? 'plaintext' : 'plaintext';
}
