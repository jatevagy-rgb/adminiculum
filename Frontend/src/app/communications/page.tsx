"use client";

import CommunicationWorkspace from "@/components/communications/CommunicationWorkspace";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

export default function CommunicationsPage() {
  return (
    <AuthenticatedApp section="communications">
      <CommunicationWorkspace />
    </AuthenticatedApp>
  );
}
