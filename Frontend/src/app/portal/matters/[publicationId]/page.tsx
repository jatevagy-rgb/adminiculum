import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default async function PortalMatterPage({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  return <ClientPortalShell view="matter" resourceId={publicationId} />;
}
