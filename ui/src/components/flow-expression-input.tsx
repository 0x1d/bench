import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { tokyoNight, tokyoNightDay } from '@uiw/codemirror-themes-all';
import { hcl } from 'codemirror-lang-hcl';
import { autocompletion } from '@codemirror/autocomplete';
import type { Flow } from '@/services/api';
import { useTheme } from '@/contexts/theme-context';
import {
  getCompletionsForStep,
  inferCompletionContext,
  type CompletionItem,
} from '@/lib/flowpipe-autocomplete';
import { cn } from '@/lib/utils';

function completionSource(flow: Flow | null, currentStepId: string) {
  return (context: import('@codemirror/autocomplete').CompletionContext) => {
    const inferred = inferCompletionContext(context);
    if (!inferred && !context.explicit) return null;

    let items: CompletionItem[] = [];
    if (inferred) {
      items = getCompletionsForStep(flow, currentStepId, inferred.context, inferred.prefix);
      if (inferred.context === 'function') items = [];
    } else if (context.explicit) {
      items = [
        ...getCompletionsForStep(flow, currentStepId, 'step', ''),
        ...getCompletionsForStep(flow, currentStepId, 'param', ''),
      ];
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

const editorViewTheme = EditorView.theme({
  '&': {
    fontSize: '0.75rem',
    fontFamily: 'ui-monospace, monospace',
  },
  '.cm-scroller': {
    padding: '0.5rem 0.75rem',
  },
  '.cm-gutters': {
    display: 'none',
  },
});

export interface FlowExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  flow?: Flow | null;
  currentStepId?: string;
  rows?: number;
  className?: string;
}

export function FlowExpressionInput({
  value,
  onChange,
  flow = null,
  currentStepId = '',
  rows = 3,
  className,
}: FlowExpressionInputProps) {
  const { theme } = useTheme();
  const extensions = useMemo(() => {
    const completion = autocompletion({
      override: [completionSource(flow, currentStepId)],
    });
    const cmTheme = theme === 'tokyo-day' ? tokyoNightDay : tokyoNight;
    return [cmTheme, hcl(), completion, editorViewTheme];
  }, [flow, currentStepId, theme]);

  const minHeight = Math.max(60, rows * 24);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      basicSetup={{ lineNumbers: false, foldGutter: false }}
      className={cn(
        '[&_.cm-editor]:rounded-md [&_.cm-editor]:border [&_.cm-editor]:border-input',
        '[&_.cm-content]:min-h-[var(--flow-expr-height)]',
        className
      )}
      style={{ ['--flow-expr-height' as string]: `${minHeight}px` }}
    />
  );
}
