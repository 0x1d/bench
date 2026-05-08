import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CHECK_MS = 850;

/**
 * Primary action for flow step panels: runs {@link onApply} then shows a short checkmark
 * instead of the "Apply" label.
 */
export function ApplyStepButton({
  onApply,
  className,
}: {
  onApply: () => void;
  className?: string;
}) {
  const [showCheck, setShowCheck] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    onApply();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowCheck(true);
    timeoutRef.current = setTimeout(() => {
      setShowCheck(false);
      timeoutRef.current = null;
    }, CHECK_MS);
  }, [onApply]);

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleClick}
      className={cn('min-w-[4.5rem]', className)}
      aria-label={showCheck ? 'Applied' : 'Apply'}
    >
      {showCheck ? (
        <Check
          className="size-4 animate-in zoom-in-95 duration-200"
          aria-hidden
          strokeWidth={2.5}
        />
      ) : (
        'Apply'
      )}
    </Button>
  );
}
