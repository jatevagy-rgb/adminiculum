"use client";

import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import CommunicationsPageContent from "./CommunicationsPageContent";

type CommunicationsPageProps = {
  params: Promise<{ caseId: string }>;
};

export default function CommunicationsPage({ params }: CommunicationsPageProps) {
  return (
    <AuthenticatedApp section="case-detail">
      <CommunicationsPageContent params={params} />
    </AuthenticatedApp>
  );
}