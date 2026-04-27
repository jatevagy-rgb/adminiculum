"use client";

import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CaseDetail } from "@/components/CaseDetail";

export default function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  return (
    <AuthenticatedApp section="case-detail">
      <CaseDetail params={params} />
    </AuthenticatedApp>
  );
}