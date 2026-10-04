"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import {
  getPortalWorkspace,
  type PortalWorkspaceMessage,
  type PortalWorkspaceSummary,
} from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * One conversation row from the canonical customer-safe workspace message
 * projection. Exactly the fields the projection provides: subject, matter
 * context, customer-safe status, updatedAt and the canonical actionUrl. No
 * unread count, sender, preview or delivery state is ever invented.
 */
function CommunicationRow({ message }: { message: PortalWorkspaceMessage }) {
  const updated = formatDate(message.updatedAt ?? null);
  return (
    <li data-testid="portal-communication-row" className="border-b border-[var(--adm-border-canonical)] last:border-b-0">
      <Link
        href={message.actionUrl}
        className="block px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="break-words text-sm font-semibold text-[var(--adm-text-primary)]">{message.subject}</p>
          <span className="text-xs font-medium text-[var(--adm-text-secondary)]">{message.status}</span>
        </div>
        <p className="mt-1 break-words text-xs text-[var(--adm-text-secondary)]">
          {message.matterTitle}
          {updated ? ` · Legutóbbi aktivitás: ${updated}` : ""}
        </p>
      </Link>
    </li>
  );
}

/**
 * Client Portal 3.0 communication overview — the /portal/uzenetek ORGANIZATION
 * body. Reuses the canonical customer-safe workspace message projection
 * (getPortalWorkspace().messages); it never rebuilds authorization or thread
 * state client-side. When the workspace communication mode is EXTERNAL_ONLY
 * the body shows truthful quiet copy and no message list, consistent with the
 * shell/navigation policy that hides the communication utility entirely.
 */
export function PortalCommunicationV3({ communicationMode }: { communicationMode?: PortalWorkspaceSummary["communicationMode"] }) {
  const [messages, setMessages] = useState<PortalWorkspaceMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const externalOnly = communicationMode === "EXTERNAL_ONLY";

  const load = useCallback(() => {
    if (externalOnly) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getPortalWorkspace()
      .then((workspace) => setMessages(workspace.messages))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [externalOnly]);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  return (
    <div className="space-y-4" data-testid="portal-communication-v3">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">Kommunikáció</h1>
        <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
          Itt tud az irodával az ügyeiről egyeztetni. Csak a portálon indított kérdések és az iroda kifejezetten elküldött válaszai jelennek meg.
        </p>
      </div>

      {externalOnly ? (
        <div
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4"
          data-testid="portal-communication-external-only"
        >
          <p className="text-sm text-[var(--adm-text-secondary)]">
            Ezen a munkaterületen a portálos üzenetváltás jelenleg nem aktív. Az iroda a megszokott módon, e-mailben tartja Önnel a kapcsolatot.
          </p>
        </div>
      ) : null}

      {!externalOnly && loading ? (
        <div
          aria-label="Beszélgetések betöltése"
          data-testid="portal-communication-loading"
          className="space-y-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4"
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="space-y-2 py-3">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--adm-canvas-subtle)]" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--adm-canvas-subtle)]" />
            </div>
          ))}
        </div>
      ) : null}

      {!externalOnly && !loading && error ? (
        <SafePanelError detail="A beszélgetések jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!externalOnly && !loading && !error && messages && messages.length === 0 ? (
        <PortalEmptyInline>Jelenleg nincs portálos beszélgetése.</PortalEmptyInline>
      ) : null}

      {!externalOnly && !loading && !error && messages && messages.length > 0 ? (
        <ul data-testid="portal-communication-list" className="overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
          {messages.map((message) => (
            <CommunicationRow key={message.id} message={message} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
