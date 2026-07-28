import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default async function PortalActionRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <ClientPortalShell view="action" resourceId={requestId} />;
}
