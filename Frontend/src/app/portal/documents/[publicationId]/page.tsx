import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default async function PortalDocumentPage({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  return <ClientPortalShell view="document" resourceId={publicationId} />;
}
