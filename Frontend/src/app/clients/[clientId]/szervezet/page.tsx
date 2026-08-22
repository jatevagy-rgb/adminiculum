import { getClient } from '@/lib/api';
import { AuthenticatedApp } from '@/components/AuthenticatedApp';
import { SzervezetPageContent } from '@/components/org-workspace/SzervezetPageContent';

interface PageProps {
  params: Promise<{ clientId: string }>;
}

export default async function SzervezetPage({ params }: PageProps) {
  const { clientId } = await params;

  let clientName = '';
  try {
    const client = await getClient(clientId);
    clientName = client?.name ?? '';
  } catch {
    // name fallback handled in content component
  }

  return (
    <AuthenticatedApp section="clients">
      <SzervezetPageContent clientId={clientId} clientName={clientName} />
    </AuthenticatedApp>
  );
}