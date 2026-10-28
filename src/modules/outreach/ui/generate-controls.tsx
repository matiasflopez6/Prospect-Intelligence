"use client";

import { useState, useTransition } from "react";
import { MESSAGE_CHANNEL_LABELS, MESSAGE_CHANNELS, type MessageChannel } from "@/domain";
import { JobProgress, useJob } from "@/components/jobs/job-button";
import { Button, Select } from "@/components/ui";
import { startMessageGeneration } from "../actions";

export function GenerateControls({
  companyId,
  opportunities,
  hasMessages,
  initialJobId,
  initialError,
}: {
  companyId: number;
  opportunities: { id: number; title: string }[];
  hasMessages: boolean;
  initialJobId: number | null;
  initialError: string | null;
}) {
  const [channels, setChannels] = useState<MessageChannel[]>([...MESSAGE_CHANNELS]);
  const [opportunityId, setOpportunityId] = useState<number | undefined>(undefined);
  const { phase, track, fail, running } = useJob(initialJobId, initialError);
  const [pending, startTransition] = useTransition();

  const toggle = (c: MessageChannel) => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const run = () =>
    startTransition(async () => {
      const res = await startMessageGeneration({ companyId, channels, opportunityId });
      if ("error" in res) fail(res.error);
      else track(res.jobId);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">Abrir la conversación sobre</span>
          <Select value={opportunityId ?? ""} onChange={(e) => setOpportunityId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">La oportunidad de mayor prioridad</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </label>
        <fieldset className="flex items-center gap-3 pb-1.5 text-sm">
          <legend className="sr-only">Canales</legend>
          {MESSAGE_CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-1.5">
              <input type="checkbox" className="accent-accent" checked={channels.includes(c)} onChange={() => toggle(c)} />
              {MESSAGE_CHANNEL_LABELS[c]}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="primary" onClick={run} disabled={running || pending || channels.length === 0}>
          {hasMessages ? "Generar nueva versión" : "Generar mensajes"}
        </Button>
        <JobProgress phase={phase} />
      </div>
    </div>
  );
}
