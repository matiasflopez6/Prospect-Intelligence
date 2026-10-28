import { ButtonLink, EmptyState, Panel } from "@/components/ui";

export default function NotFound() {
  return (
    <Panel>
      <EmptyState title="No encontramos esta página" action={<ButtonLink href="/">Volver al panel</ButtonLink>} />
    </Panel>
  );
}
