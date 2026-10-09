"use client";

import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AgendaWorkspace } from "@/components/agenda/AgendaWorkspace";

export default function AgendaPage() {
  return <AuthenticatedApp section="calendar"><AgendaWorkspace /></AuthenticatedApp>;
}
