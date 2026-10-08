"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export function useTaskCreateCapabilities(caseIds: string[]) {
  const scope = [...new Set(caseIds.filter(Boolean))].join(",");
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState<{ scope: string; status: "ready" | "unavailable"; caseIds: string[] } | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    if (!scope) { setResult({ scope, status: "ready", caseIds: [] }); return; }
    const ids = scope.split(",");
    const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_item, index) => ids.slice(index * 50, (index + 1) * 50));
    Promise.all(batches.map((batch) => fetchApi<{ canCreateCaseIds: string[] }>(`/tasks/create-capabilities?caseIds=${encodeURIComponent(batch.join(","))}`)))
      .then((responses) => { if (active) {
        const requested = new Set(ids);
        setResult({ scope, status: "ready", caseIds: [...new Set(responses.flatMap((response) => response.canCreateCaseIds).filter((id) => requested.has(id)))] });
      } })
      .catch(() => { if (active) setResult({ scope, status: "unavailable", caseIds: [] }); });
    return () => { active = false; };
  }, [scope, retryKey]);

  return {
    status: result?.scope === scope ? result.status : "loading" as const,
    allowedCaseIds: result?.scope === scope ? result.caseIds : [],
    retry: () => setRetryKey((value) => value + 1),
  };
}
