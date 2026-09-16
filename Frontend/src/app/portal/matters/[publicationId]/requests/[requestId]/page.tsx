import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default async function PortalMatterRequestPage({ params }: { params: Promise<{ publicationId: string; requestId: string }> }) {
  const { publicationId, requestId } = await params;
  return <ClientPortalShell view="matter" resourceId={publicationId} requestId={requestId} />;
}
