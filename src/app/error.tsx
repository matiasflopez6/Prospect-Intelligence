"use client";

import { Button, EmptyState, Panel } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel>
      <EmptyState
        title="Algo ha fallado"
        description={error.message}
        action={<Button onClick={reset}>Reintentar</Button>}
      />
    </Panel>
  );
}
