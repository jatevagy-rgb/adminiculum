import MailboxAccountsPanel from "@/components/communications/MailboxAccountsPanel";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

export const metadata = { title: "Email-fiókok" };

export default function MailboxesPage() {
  return (
    <AuthenticatedApp section="communications">
      <MailboxAccountsPanel />
    </AuthenticatedApp>
  );
}
