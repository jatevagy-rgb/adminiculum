"use client";

import React, { useEffect, useState } from "react";
import { ApiError, getCaseAnonymousDocuments } from "@/lib/api";

export type AnonymizationCapability = "CHECKING" | "AVAILABLE" | "DISABLED" | "UNAUTHORIZED" | "UNAVAILABLE";

export function useAnonymizationCapability(caseId: string | null | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ caseId: string | null; status: AnonymizationCapability }>({ caseId: null, status: "CHECKING" });
  const scope = caseId || null;

  useEffect(() => {
    let active = true;
    if (!scope) return;
    getCaseAnonymousDocuments(scope).then(
      () => { if (active) setResult({ caseId: scope, status: "AVAILABLE" }); },
      (error: unknown) => {
        if (!active) return;
        const status = error instanceof ApiError && error.status === 501 && error.code === "FEATURE_DISABLED"
          ? "DISABLED"
          : error instanceof ApiError && (error.status === 401 || error.status === 403)
            ? "UNAUTHORIZED"
            : "UNAVAILABLE";
        setResult({ caseId: scope, status });
      },
    );
    return () => { active = false; };
  }, [scope, attempt]);

  return {
    status: !scope ? "UNAVAILABLE" as const : result.caseId === scope ? result.status : "CHECKING" as const,
    retry: () => {
      setResult({ caseId: null, status: "CHECKING" });
      setAttempt((current) => current + 1);
    },
  };
}

export function AnonymizationCapabilityNotice({ status, onRetry }: { status: AnonymizationCapability; onRetry: () => void }) {
  if (status === "AVAILABLE") return null;
  return <div role="status" className="text-xs text-[var(--adm-text-secondary)]" data-testid="anonymization-capability-state">
    {status === "CHECKING" ? "Az anonimizálás elérhetőségének ellenőrzése…"
      : status === "DISABLED" ? "Az anonimizálás jelenleg ki van kapcsolva; új munkapéldány nem készíthető."
        : status === "UNAUTHORIZED" ? "Az anonimizálás elérhetősége ezen az ügyön nem tekinthető meg."
          : "Az anonimizálás elérhetősége most nem ellenőrizhető. Ez nem jelenti azt, hogy nincs mentett munkapéldány."}
    {status === "UNAVAILABLE" ? <button type="button" onClick={onRetry} className="ml-2 underline">Újrapróbálás</button> : null}
  </div>;
}
