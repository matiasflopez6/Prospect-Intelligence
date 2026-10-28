import { CrmStatusBadge, EmptyState, Panel } from "@/components/ui";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { listRecentActivity } from "@/modules/activity/service";
import { followUpLabel, toDateInput } from "../dates";
import { getCrm, listMembers, listNotes } from "../service";
import { CrmForm, NoteForm } from "./crm-form";

/** Sección de la ficha de empresa: estado, responsable, próxima acción, notas y actividad. */
export function CrmPanel({ companyId }: { companyId: number }) {
  const crm = getCrm(companyId);
  if (!crm) return null;
  const members = listMembers();
  const notes = listNotes(companyId);
  const activity = listRecentActivity({ companyId, limit: 12 });
  const follow = crm.followUpAt && crm.status !== "won" && crm.status !== "lost" ? followUpLabel(crm.followUpAt) : null;

  return (
    <Panel
      id="crm"
      title="Seguimiento comercial"
      actions={<CrmStatusBadge status={crm.status} />}
      description={
        <>
          En este estado desde {formatDate(crm.statusChangedAt)}
          {crm.lastContactedAt && <> · Último contacto {formatDate(crm.lastContactedAt)}</>}
        </>
      }
    >
      {follow && (
        <p className={`mb-3 text-sm ${follow.overdue ? "font-medium text-bad" : "text-ink-2"}`}>
          Seguimiento: {formatDate(crm.followUpAt)} · {follow.text}
        </p>
      )}
      <CrmForm
        key={crm.updatedAt.getTime()}
        companyId={companyId}
        status={crm.status}
        ownerId={crm.ownerId}
        nextAction={crm.nextAction}
        followUpAt={toDateInput(crm.followUpAt)}
        lostReason={crm.lostReason}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
      />

      <h3 className="mt-5 mb-2 border-t border-line pt-4 text-xs font-semibold text-ink">Notas</h3>
      <NoteForm companyId={companyId} authorId={crm.ownerId} />
      {notes.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="py-2">
              <p className="whitespace-pre-wrap break-words text-sm text-ink">{n.body}</p>
              <p className="mt-0.5 text-xs text-faint">
                {formatDateTime(n.createdAt)}
                {n.authorName && <> · {n.authorName}</>}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 mb-2 border-t border-line pt-4 text-xs font-semibold text-ink">Actividad</h3>
      {activity.length === 0 ? (
        <EmptyState title="Sin actividad todavía" />
      ) : (
        <ul className="flex flex-col gap-2">
          {activity.map((a) => (
            <li key={a.id} className="text-sm">
              <span className="text-ink-2">{a.message}</span>
              <span className="ml-2 text-xs text-faint" title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
