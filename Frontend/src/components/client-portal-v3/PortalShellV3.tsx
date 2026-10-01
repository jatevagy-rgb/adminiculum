"use client";

import type { ReactNode } from "react";
import type { PortalIdentityContext } from "@/lib/clientPortalApi";
import { PortalHeader } from "./PortalHeader";
import { PortalMobileNav } from "./PortalMobileNav";
import { PortalPage } from "./PortalPage";

export type PortalShellV3Props = {
  /** The canonical route view key resolved by ClientPortalShell (never authorization input). */
  view: string;
  /** Server-resolved identity context; selectedWorkspace is authoritative. */
  context: PortalIdentityContext;
  /** Route body content. In this checkpoint the existing org route bodies render inside the V3 frame. */
  children: ReactNode;
  onSwitchWorkspace: () => void;
  onLogout: () => void;
};

/**
 * Client Portal 3.0 shell — the ORGANIZATION runtime chrome.
 *
 * This is a presentation layer only. The entire auth/workspace state machine
 * still lives in ClientPortalShell and is passed down through `context`; this
 * component never acquires tokens, never resolves workspaces and never changes
 * authorization. Kommunikáció gating reuses the canonical communication mode.
 */
export function PortalShellV3({ view, context, children, onSwitchWorkspace, onLogout }: PortalShellV3Props) {
  const workspace = context.selectedWorkspace;
  if (!workspace) return null;
  const communicationEnabled = workspace.communicationMode !== "EXTERNAL_ONLY";
  const canSwitchWorkspace = context.workspaces.length > 1;
  return (
    <div
      className="min-h-screen bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-primary)]"
      data-testid="client-portal-shell-v3"
    >
      <PortalHeader
        view={view}
        workspaceName={workspace.clientDisplayName || workspace.name}
        communicationEnabled={communicationEnabled}
        canSwitchWorkspace={canSwitchWorkspace}
        onSwitchWorkspace={onSwitchWorkspace}
        onLogout={onLogout}
      />
      <PortalPage>{children}</PortalPage>
      <PortalMobileNav view={view} communicationEnabled={communicationEnabled} />
    </div>
  );
}
