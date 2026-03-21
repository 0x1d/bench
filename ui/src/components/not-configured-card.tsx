interface NotConfiguredCardProps {
  title: string;
  description: string;
}

/**
 * Empty state card when a resource type is not configured.
 * Same style and link to the Configuration page across feature pages.
 */
export function NotConfiguredCard({ title, description }: NotConfiguredCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <a
        href="#configuration"
        className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
      >
        Open configuration
      </a>
    </div>
  );
}
