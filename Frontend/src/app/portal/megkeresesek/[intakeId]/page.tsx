import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default async function PortalIntakeDetailPage({ params }: { params: Promise<{ intakeId: string }> }) {
  const { intakeId } = await params;
  return <ClientPortalShell view="intake" resourceId={intakeId} />;
}
