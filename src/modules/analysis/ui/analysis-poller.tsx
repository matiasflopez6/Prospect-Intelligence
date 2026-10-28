"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refresca la ficha mientras hay un análisis en curso para que el resultado aparezca solo. */
export function AnalysisPoller({ intervalMs = 2500 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
