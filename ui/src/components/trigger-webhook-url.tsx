import { useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getTriggerWebhookUrl } from '@/services/api';
import { cn } from '@/lib/utils';

interface TriggerWebhookUrlProps {
  module: string;
  triggerId: string;
  className?: string;
}

export function TriggerWebhookUrl({ module, triggerId, className }: TriggerWebhookUrlProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['trigger-webhook', module, triggerId],
    queryFn: () => getTriggerWebhookUrl(module, triggerId),
  });

  if (isLoading) {
    return <p className={cn('text-[10px] text-muted-foreground', className)}>Loading webhook URL…</p>;
  }

  if (error || !data?.url) {
    return null;
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(data.url).then(() => {
      toast.success('Webhook URL copied');
    }).catch(() => {
      toast.message(data.url);
    });
  };

  return (
    <div className={cn('flex items-start gap-1', className)}>
      <code className="min-w-0 flex-1 break-all text-[10px] text-muted-foreground">{data.url}</code>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={copyUrl}
        title="Copy webhook URL"
        className="size-5 shrink-0"
      >
        <Copy className="size-2.5" />
      </Button>
    </div>
  );
}
