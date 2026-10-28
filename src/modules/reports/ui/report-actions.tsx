"use client";

import { JobButton } from "@/components/jobs/job-button";
import { startReportGeneration } from "../actions";

/** Genera un informe nuevo (o reintenta el PDF de `reportId`) y muestra el progreso. */
export function GenerateReportButton({
  companyId,
  reportId,
  label,
  variant = "primary",
  initialJobId,
  initialError,
  disabled,
}: {
  companyId: number;
  reportId?: number;
  label: string;
  variant?: "primary" | "secondary";
  initialJobId?: number | null;
  initialError?: string | null;
  disabled?: boolean;
}) {
  return (
    <JobButton
      variant={variant}
      start={() => startReportGeneration({ companyId, reportId })}
      initialJobId={initialJobId}
      initialError={initialError}
      disabled={disabled}
    >
      {label}
    </JobButton>
  );
}
