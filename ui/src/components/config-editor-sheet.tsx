import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CodeEditor } from '@/components/code-editor';
import { fetchConfigExample, saveConfig } from '@/services/api';
import { cn } from '@/lib/utils';

interface ConfigEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ConfigEditorSheet({
  open,
  onOpenChange,
  onSaved,
}: ConfigEditorSheetProps) {
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    fetchConfigExample()
      .then((text) => {
        setContent(text);
        setEditContent(text);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load example');
      })
      .finally(() => setLoading(false));
  }, [open]);

  const hasUnsavedChanges = content !== editContent;

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setSaving(true);
    setError(null);
    try {
      await saveConfig(editContent);
      setContent(editContent);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [editContent, hasUnsavedChanges, onOpenChange, onSaved]);

  useEffect(() => {
    if (!open || !hasUnsavedChanges) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, hasUnsavedChanges, handleSave]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex flex-col p-0 sm:max-w-none w-full sm:w-[min(90vw,640px)]'
        )}
      >
        <SheetHeader className="shrink-0 flex-row items-center justify-between gap-4 border-b px-4 py-3 pr-14">
          <SheetTitle>config.yaml</SheetTitle>
          <Button
            variant={hasUnsavedChanges ? 'default' : 'outline'}
            size="sm"
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saving}
            className="gap-2"
          >
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <p className="text-muted-foreground text-sm">Loading...</p>
          )}
          {error && (
            <p className="text-destructive text-sm mb-3">{error}</p>
          )}
          {!loading && (
            <CodeEditor
              value={editContent}
              onChange={setEditContent}
              filename="config.yaml"
              className="h-full min-h-[400px]"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
