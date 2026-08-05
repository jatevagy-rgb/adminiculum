import { CustomerIntakeDetail } from '@/components/client-portal/CustomerIntake';

export default async function PortalIntakeDetailPage({ params }: { params: Promise<{ intakeId: string }> }) {
  const { intakeId } = await params;
  return <CustomerIntakeDetail intakeId={intakeId} />;
}
