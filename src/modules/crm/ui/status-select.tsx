"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CRM_STATUSES, CRM_STATUS_LABELS, type CrmStatus } from "@/domain";
import { setStatusAction } from "../actions";

/** Cambio rápido de estado desde las tarjetas del pipeline. */
export function StatusSelect({ companyId, status, name }: { companyId: number; status: CrmStatus; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <select
        aria-label={`Cambiar estado de ${name}`}
        className="h-6 w-full rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink-2 hover:border-ink-2 focus:border-accent focus:outline-none disabled:opacity-60"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          start(async () => {
            const res = await setStatusAction(companyId, next);
            if (res.error) setError(res.error);
            else router.refresh();
          });
        }}
      >
        {CRM_STATUSES.map((s) => (
          <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>
        ))}
      </select>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </>
  );
}
