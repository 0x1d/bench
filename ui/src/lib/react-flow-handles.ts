import { cn } from '@/lib/utils';

/** Connection dots: hidden until hover or selection (parent needs `group`). */
export function reactFlowHandleClassName(selected: boolean): string {
  return cn(
    '!bg-primary !opacity-0 transition-opacity duration-150 group-hover:!opacity-100',
    selected && '!opacity-100'
  );
}
