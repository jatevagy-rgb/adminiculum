"use client";

/**
 * Inline Teendők request response (stacked on the #404 entry-point repair).
 *
 * Renders the EXISTING canonical `CustomerRequestDetail` — and therefore the
 * existing `RequestResponseCard` text/upload flow, the canonical unavailable
 * declaration and the canonical correction flow — inside the Teendők surface.
 * This component only wires the canonical customer-safe fetches (published
 * matter, canonical request, canonical submissions); it implements no response,
 * upload or submission logic of its own.
 */
import { useCallback, useEffect, useState } from "react";
import { getPortalMatter, type PortalDocument, type PortalMatter } from "@/lib/clientPortalApi";
import {
  clientSafeError,
  customerInteractionApi,
  type CustomerRequestDTO,
  type CustomerSubmissionDTO,
} from "@/lib/clientInteractionApi";
import { CustomerRequestDetail } from "./CustomerRequestDetail";

type DetailMatter = PortalMatter & { documents: PortalDocument[] };

type InlineState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable" }
  | { status: "ready"; caseId: string; matter: DetailMatter; request: CustomerRequestDTO; submission?: CustomerSubmissionDTO };

export function TeendokInlineRequestDetail({ matterId, requestId }: { matterId: string; requestId: string }) {
  const [state, setState] = useState<InlineState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const matter = await getPortalMatter(matterId);
      try {
        const request = await customerInteractionApi.getRequest(matter.caseId, requestId);
        const submissionPage = await customerInteractionApi.listSubmissions(matter.caseId, requestId);
        setState({
          status: "ready",
          caseId: matter.caseId,
          matter,
          request,
          submission: (submissionPage.items || [])[0],
        });
      } catch {
        setState({ status: "unavailable" });
      }
    } catch (error) {
      setState({ status: "error", message: clientSafeError(error) });
    }
  }, [matterId, requestId]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === "loading") {
    return <p role="status" className="px-1 py-2 text-sm text-[var(--adm-text-muted)]">A bekérés betöltése…</p>;
  }
  if (state.status === "error") {
    return <p role="status" className="px-1 py-2 text-sm text-[var(--adm-text-muted)]">{state.message}</p>;
  }
  if (state.status === "unavailable") {
    return (
      <p role="status" className="px-1 py-2 text-sm text-[var(--adm-text-muted)]">
        A bekérés jelenleg nem érhető el ezen az ügyfélfelületen. Előfordulhat, hogy lezárult, vagy nincs hozzá jogosultsága.
      </p>
    );
  }
  return (
    <CustomerRequestDetail
      caseId={state.caseId}
      publicationId={matterId}
      request={state.request}
      submission={state.submission}
      matter={state.matter}
      canSendMessages={false}
      onChanged={load}
    />
  );
}
