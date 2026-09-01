import CommunicationWorkspace from "@/components/communications/CommunicationWorkspace";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

export const metadata = {
  title: "Kommunikáció",
};

export default function CommunicationsPage() {
  return (
    <AuthenticatedApp section="communications">
      <CommunicationWorkspace />
    </AuthenticatedApp>
  );
}
