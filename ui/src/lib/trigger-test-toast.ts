import type { TriggerTestResponse } from '@/services/api';

/** Formats a trigger test result for toast display. */
export function formatTriggerTestToast(result: TriggerTestResponse): string {
  const parts: string[] = [];
  if (result.status) {
    parts.push(`status: ${result.status}`);
  }
  if (result.executionId) {
    parts.push(`exec: ${result.executionId}`);
  }
  return parts.length > 0 ? `Trigger test — ${parts.join(', ')}` : 'Trigger test completed';
}
