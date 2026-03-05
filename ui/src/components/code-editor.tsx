import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { tokyoNight } from '@uiw/codemirror-themes-all';
import { loadLanguage } from '@uiw/codemirror-extensions-langs';
import { hcl } from 'codemirror-lang-hcl';
import { getCodeMirrorLanguage } from '@/lib/syntax-language';
import { cn } from '@/lib/utils';

/** Editor styling: transparent bg, 0.75rem font, monospace, 0.75rem padding. */
const editorViewTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '0.75rem',
    fontFamily: 'ui-monospace, monospace',
  },
  '.cm-scroller': {
    padding: '0.75rem',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
  },
});

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  filename?: string;
  className?: string;
}

export function CodeEditor({
  value,
  onChange,
  filename = 'file.yaml',
  className,
}: CodeEditorProps) {
  const extensions = useMemo(() => {
    const langId = getCodeMirrorLanguage(filename);
    const lang =
      langId === 'hcl'
        ? hcl()
        : loadLanguage(langId as Parameters<typeof loadLanguage>[0]);
    const exts = lang ? [lang] : [];
    return [tokyoNight, ...exts, editorViewTheme];
  }, [filename]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      basicSetup={{ lineNumbers: true, foldGutter: true }}
      className={cn(
        '[&_.cm-editor]:min-h-[200px] [&_.cm-scroller]:min-h-[200px] [&_.cm-editor]:rounded-md [&_.cm-editor]:border [&_.cm-editor]:border-input',
        className
      )}
    />
  );
}
