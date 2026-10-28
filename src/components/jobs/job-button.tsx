"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";

export type StartResult = { jobId: number } | { error: string };

type Phase = { kind: "idle" } | { kind: "running"; progress: number; label?: string | null } | { kind: "failed"; error: string };

/** Sigue un trabajo en segundo plano (GET /api/jobs/:id) y refresca la página al terminar. */
export function useJob(initialJobId?: number | null, initialError?: string | null) {
  const router = useRouter();
  const [jobId, setJobId] = useState<number | null>(initialJobId ?? null);
  const [phase, setPhase] = useState<Phase>(
    initialJobId ? { kind: "running", progress: 0 } : initialError ? { kind: "failed", error: initialError } : { kind: "idle" },
  );

  useEffect(() => {
    if (jobId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (res.ok) {
          const job = (await res.json()) as { status: string; progress: number; progressLabel?: string | null; error?: string | null };
          if (cancelled) return;
          if (job.status === "succeeded") {
            setJobId(null);
            setPhase({ kind: "idle" });
            router.refresh();
            return;
          }
          if (job.status === "failed" || job.status === "cancelled") {
            setJobId(null);
            setPhase({ kind: "failed", error: job.error ?? "El trabajo no se completó" });
            router.refresh();
            return;
          }
          setPhase({ kind: "running", progress: job.progress, label: job.progressLabel });
        }
      } catch {
        // error de red transitorio: se reintenta
      }
      if (!cancelled) timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  const track = useCallback((id: number) => {
    setPhase({ kind: "running", progress: 0 });
    setJobId(id);
  }, []);
  const fail = useCallback((error: string) => setPhase({ kind: "failed", error }), []);
  return { phase, track, fail, running: phase.kind === "running" };
}

export function JobProgress({ phase }: { phase: Phase }) {
  if (phase.kind === "running") {
    return (
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">{phase.label || "En curso…"}</span>
          <span className="tnum">{phase.progress}%</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(4, phase.progress)}%` }} />
        </div>
      </div>
    );
  }
  if (phase.kind === "failed") {
    return (
      <p role="alert" className="min-w-0 flex-1 rounded-md bg-bad-soft px-2.5 py-1.5 text-xs text-bad">
        {phase.error}
      </p>
    );
  }
  return null;
}

/** Botón que lanza un trabajo mediante una server action y muestra su progreso. */
export function JobButton({
  start,
  children,
  variant = "secondary",
  size = "md",
  initialJobId,
  initialError,
  disabled,
  title,
}: {
  start: () => Promise<StartResult>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  initialJobId?: number | null;
  initialError?: string | null;
  disabled?: boolean;
  title?: string;
}) {
  const { phase, track, fail, running } = useJob(initialJobId, initialError);
  const [pending, startTransition] = useTransition();
  const onClick = () =>
    startTransition(async () => {
      const res = await start();
      if ("error" in res) fail(res.error);
      else track(res.jobId);
    });
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Button variant={variant} size={size} onClick={onClick} disabled={disabled || running || pending} title={title}>
        {children}
      </Button>
      <JobProgress phase={phase} />
    </div>
  );
}
