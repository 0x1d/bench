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
  fp: 'hcl',
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

/** Map Prism language to CodeMirror loadLanguage identifier. */
const PRISM_TO_CODEMIRROR: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  json: 'json',
  yaml: 'yaml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  xml: 'xml',
  markdown: 'markdown',
  python: 'py',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  java: 'java',
  kotlin: 'kt',
  c: 'c',
  cpp: 'cpp',
  sql: 'sql',
  bash: 'bash',
  powershell: 'ps1',
  batch: 'text',
  ini: 'ini',
  hcl: 'hcl',
  plaintext: 'text',
};

export function getCodeMirrorLanguage(filename: string): string {
  const prism = getSyntaxLanguage(filename);
  return PRISM_TO_CODEMIRROR[prism] ?? 'text';
}
