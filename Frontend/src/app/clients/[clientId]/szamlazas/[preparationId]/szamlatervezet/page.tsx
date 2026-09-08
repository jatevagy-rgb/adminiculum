import InvoiceDraftWorkspace from './InvoiceDraftWorkspace';

interface PageProps {
  params: Promise<{ clientId: string; preparationId: string }>;
}

export default async function InvoiceDraftPage({ params }: PageProps) {
  const { clientId, preparationId } = await params;
  return <InvoiceDraftWorkspace clientId={clientId} preparationId={preparationId} />;
}
