import { getClientWorkgroups, getClient, getClientWorkloadSummary, type Workgroup, type WorkloadRecord } from '@/lib/api';
import WorkgroupsPageContent from './WorkgroupsPageContent';

interface PageProps {
  params: Promise<{ clientId: string }>;
}

export default async function WorkgroupsPage({ params }: PageProps) {
  const { clientId } = await params;

  let client = null;
  let workgroups: Workgroup[] = [];
  let initialSummary = null;
  const currentPeriod = new Date().toISOString().slice(0, 7);

  try {
    client = await getClient(clientId);
    workgroups = await getClientWorkgroups(clientId);
    initialSummary = await getClientWorkloadSummary(clientId, currentPeriod);
  } catch {
    // Errors handled in content component
  }

  return (
    <WorkgroupsPageContent
      client={client}
      workgroups={workgroups}
      initialSummary={initialSummary}
      currentPeriod={currentPeriod}
    />
  );
}
