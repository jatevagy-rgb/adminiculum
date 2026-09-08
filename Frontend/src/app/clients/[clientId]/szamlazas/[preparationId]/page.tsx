import BillingReviewWorkspace from './BillingReviewWorkspace';

interface PageProps {
  params: Promise<{ clientId: string; preparationId: string }>;
}

export default async function BillingReviewPage({ params }: PageProps) {
  const { clientId, preparationId } = await params;
  return <BillingReviewWorkspace clientId={clientId} preparationId={preparationId} />;
}
