import { IntakeTriageDetailView } from '@/components/client-portal/IntakeTriage';

export default async function IntakeTriageDetailPage({ params }: { params: Promise<{ intakeId: string }> }) {
  const { intakeId } = await params;
  return <IntakeTriageDetailView intakeId={intakeId} />;
}
