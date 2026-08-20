"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getClient } from "@/lib/api";
import { ClientCompanyWorkspace } from "@/components/clients/ClientCompanyWorkspace";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

export default function CompanyWorkspacePage() {
  return (
    <AuthenticatedApp section="clients">
      <CompanyWorkspaceContent />
    </AuthenticatedApp>
  );
}

function CompanyWorkspaceContent() {
  const params = useParams();
  const clientId = (params?.clientId as string) || "";
  const [clientName, setClientName] = useState<string>("");

  useEffect(() => {
    if (!clientId) return;
    getClient(clientId)
      .then((client) => setClientName(client.name))
      .catch(() => setClientName(""));
  }, [clientId]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
      <div className="adm-board-container py-6">
        {clientId ? <ClientCompanyWorkspace clientId={clientId} clientName={clientName} /> : (
          <div className="adm-board-empty text-xs text-[var(--adm-text-muted)]">
            <p>Nincs kiválasztott ügyfél.</p>
            <Link href="/clients" className="text-[var(--adm-ochre-500)] hover:underline">Vissza az ügyfelekhez</Link>
          </div>
        )}
      </div>
    </div>
  );
}