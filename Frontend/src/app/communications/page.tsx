import CommunicationsOverview from "@/components/communications/CommunicationsOverview";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

export const metadata = {
  title: "Ügykommunikáció",
};

export default function CommunicationsPage() {
  return (
    <AuthenticatedApp section="communications">
      <CommunicationsOverview />
    </AuthenticatedApp>
  );
}
