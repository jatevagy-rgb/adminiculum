"use client";

import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ComplianceCenter } from "@/components/compliance-center/ComplianceCenter";

export default function ComplianceCenterPage() {
  return (
    <AuthenticatedApp section="compliance">
      <ComplianceCenter />
    </AuthenticatedApp>
  );
}
