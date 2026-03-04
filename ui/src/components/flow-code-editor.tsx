import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { tokyoNight } from '@uiw/codemirror-themes-all';
import { loadLanguage } from '@uiw/codemirror-extensions-langs';
import { autocompletion } from '@codemirror/autocomplete';
import type { Flow } from '@/services/api';
import {
  getCompletionsForStep,
  inferCompletionContext,
  type CompletionItem,
} from '@/lib/flowpipe-autocomplete';
import { cn } from '@/lib/utils';

const LANG_MAP: Record<string, string> = {
  sql: 'sql',
  json: 'json',
  hcl: 'javascript', // HCL-like; use JS as fallback for highlighting
};

/** Editor styling: transparent bg, 0.75rem font, monospace. */
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

function completionSource(
  flow: Flow | null,
  currentStepId: string,
  includeFunctions: boolean
) {
  return (context: import('@codemirror/autocomplete').CompletionContext) => {
    const text = context.state.sliceDoc(0, context.pos);
    const inferred = inferCompletionContext(text, context.pos);
    if (!inferred && !context.explicit) return null;

    let items: CompletionItem[] = [];
    if (inferred) {
      items = getCompletionsForStep(flow, currentStepId, inferred.context, inferred.prefix);
      if (inferred.context === 'function' && !includeFunctions) items = [];
    } else if (context.explicit) {
      items = [
        ...getCompletionsForStep(flow, currentStepId, 'step', ''),
        ...getCompletionsForStep(flow, currentStepId, 'param', ''),
      ];
      if (includeFunctions) {
        items = [...items, ...getCompletionsForStep(flow, currentStepId, 'function', '')];
      }
    }

    const word = context.state.sliceDoc(0, context.pos).match(/(?:step\.|param\.)?[a-z0-9_.]*$/i);
    const from = word ? context.pos - word[0].length : context.pos;

    return {
      from,
      options: items.map((item) => ({
        label: item.label,
        detail: item.detail,
        apply: item.apply ?? item.label,
      })),
    };
  };
}

export interface FlowCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: 'sql' | 'json' | 'hcl';
  flow?: Flow | null;
  currentStepId?: string;
  minHeight?: number;
  className?: string;
}

export function FlowCodeEditor({
  value,
  onChange,
  language = 'sql',
  flow = null,
  currentStepId = '',
  minHeight = 200,
  className,
}: FlowCodeEditorProps) {
  const extensions = useMemo(() => {
    const langKey = LANG_MAP[language] ?? 'sql';
    const lang = loadLanguage(langKey as 'sql');
    const exts = lang ? [lang] : [];
    const completion = autocompletion({
      override: [
        completionSource(flow, currentStepId, language === 'hcl'),
      ],
    });
    return [tokyoNight, ...exts, completion, editorViewTheme];
  }, [language, flow, currentStepId]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      basicSetup={{ lineNumbers: true, foldGutter: language !== 'hcl' }}
      className={cn(
        '[&_.cm-editor]:rounded-md [&_.cm-editor]:border [&_.cm-editor]:border-input',
        '[&_.cm-scroller]:min-h-[var(--flow-code-min-height,200px)] [&_.cm-editor]:min-h-[var(--flow-code-min-height,200px)]',
        className
      )}
      style={{ ['--flow-code-min-height' as string]: `${minHeight}px` }}
    />
  );
}
