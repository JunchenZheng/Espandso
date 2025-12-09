import React from "react";

export interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
