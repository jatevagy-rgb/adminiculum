import SzamlazasPageContent from './SzamlazasPageContent';

interface PageProps {
  params: Promise<{ clientId: string }>;
}

export default async function SzamlazasPage({ params }: PageProps) {
  const { clientId } = await params;
  return <SzamlazasPageContent clientId={clientId} />;
}
