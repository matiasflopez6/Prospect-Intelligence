"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteSearchAction, previewSearchDeletion, type DeletionPreview } from "@/app/searches/actions";
import { Button } from "@/components/ui";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Botón «Borrar» con diálogo de confirmación que explica qué se elimina y qué se conserva. */
export function DeleteSearchButton({
  searchId,
  label,
  size = "sm",
  variant = "ghost",
}: {
  searchId: number;
  /** «nicho en ubicación», para el título del diálogo. */
  label: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "danger";
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [deleting, startDeleting] = useTransition();

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function openDialog() {
    setPreview(null);
    setError(null);
    setOpen(true);
    startLoading(async () => {
      const res = await previewSearchDeletion(searchId);
      if ("error" in res) setError(res.error);
      else setPreview(res.preview);
    });
  }

  function close() {
    if (deleting) return;
    dialog.current?.close();
    setOpen(false);
  }

  function confirm() {
    setError(null);
    startDeleting(async () => {
      const res = await deleteSearchAction(searchId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      dialog.current?.close();
      setOpen(false);
      router.push(`/searches?borrada=1&quitadas=${res.removed}&conservadas=${res.kept}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={openDialog} aria-label={`Borrar la búsqueda ${label}`}>
        Borrar
      </Button>
      {open && (
        <dialog
          ref={dialog}
          aria-labelledby={`delete-search-${searchId}-title`}
          onClose={() => !deleting && setOpen(false)}
          onCancel={(e) => deleting && e.preventDefault()}
          onClick={(e) => e.target === dialog.current && close()}
          className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-ink/40"
        >
          <div className="p-5">
            <h2 id={`delete-search-${searchId}-title`} className="text-base font-semibold">
              ¿Borrar la búsqueda «{label}»?
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm text-ink-2">
              {loading && !preview && !error && <p role="status" className="text-muted">Calculando qué se verá afectado…</p>}
              {preview && <PreviewBody preview={preview} />}
              {error && (
                <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="secondary" onClick={close} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirm} disabled={!preview || deleting}>
              {deleting ? "Borrando…" : "Borrar búsqueda"}
            </Button>
          </div>
        </dialog>
      )}
    </>
  );
}

function PreviewBody({ preview }: { preview: DeletionPreview }) {
  const kept = preview.keepShared + preview.keepWorked;
  return (
    <>
      {preview.active && (
        <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
          La búsqueda sigue en curso: se cancelará y no se guardará ningún resultado más.
        </p>
      )}
      <p>Se borrarán la búsqueda y su historial. Esta acción no se puede deshacer.</p>
      {preview.total === 0 ? (
        <p>No tiene empresas asociadas.</p>
      ) : (
        <>
          <p>
            Tiene {plural(preview.total, "empresa", "empresas")}:{" "}
            <strong className="text-ink">{plural(preview.remove, "se eliminará", "se eliminarán")}</strong> y{" "}
            <strong className="text-ink">{plural(kept, "se conservará", "se conservarán")}</strong>.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink">Se eliminan</strong> las empresas que solo encontró esta búsqueda y no tienen seguimiento más allá de «Nueva» o «Analizada». Se borran con su análisis, oportunidades, puntuación, informes (y PDF) y mensajes en borrador
              {preview.remove > 0 ? ` (${preview.remove})` : ""}.
            </li>
            <li>
              <strong className="text-ink">Se conservan</strong> las que también aparecen en otra búsqueda
              {preview.keepShared > 0 ? ` (${preview.keepShared})` : ""} y las que ya tienen trabajo comercial: estado avanzado, notas, responsable, seguimiento o mensajes aprobados/enviados
              {preview.keepWorked > 0 ? ` (${preview.keepWorked})` : ""}.
            </li>
          </ul>
        </>
      )}
    </>
  );
}
