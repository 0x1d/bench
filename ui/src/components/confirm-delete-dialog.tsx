import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  /** Shown when isLoading is true (e.g. "Deleting…", "Dropping…") */
  loadingLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  /** Extra content between description and footer (e.g. checkboxes) */
  children?: React.ReactNode;
  /** Custom focus behavior when dialog opens */
  onOpenAutoFocus?: (e: Event) => void;
  /** Ref for the confirm button (e.g. for focus management) */
  confirmButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Reusable delete confirmation dialog. Styling matches other dialogs.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = 'Delete',
  loadingLabel = 'Deleting…',
  cancelLabel = 'Cancel',
  isLoading = false,
  children,
  onOpenAutoFocus,
  confirmButtonRef,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={isLoading}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              ref={confirmButtonRef}
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? loadingLabel : confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
