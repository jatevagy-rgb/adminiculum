'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ApiError,
  getClient,
  getClientWorkgroups,
  getClientWorkloadSummary,
  type Client,
  type Workgroup,
  type WorkloadSummary,
} from '@/lib/api';
import WorkgroupsPageContent from './WorkgroupsPageContent';

type WorkgroupsLoadState = 'loading' | 'ready' | 'not-found' | 'error';

function BackToClients() {
  return (
    <div className="mt-4">
      <Link href="/clients" className="text-blue-600 hover:underline">← Vissza az ügyfelekhez</Link>
    </div>
  );
}

export default function WorkgroupsPage() {
  const params = useParams();
  const clientId = String(params?.clientId || '');
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [loadState, setLoadState] = useState<WorkgroupsLoadState>('loading');
  const [client, setClient] = useState<Client | null>(null);
  const [workgroups, setWorkgroups] = useState<Workgroup[]>([]);
  const [initialSummary, setInitialSummary] = useState<WorkloadSummary | null>(null);

  useEffect(() => {
    if (!clientId) {
      setLoadState('error');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    setClient(null);
    setWorkgroups([]);
    setInitialSummary(null);

    void (async () => {
      try {
        const loadedClient = await getClient(clientId);
        const loadedWorkgroups = await getClientWorkgroups(clientId);
        const loadedSummary = await getClientWorkloadSummary(clientId, currentPeriod).catch(() => null);
        if (cancelled) return;
        setClient(loadedClient);
        setWorkgroups(loadedWorkgroups);
        setInitialSummary(loadedSummary);
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        setClient(null);
        setWorkgroups([]);
        setInitialSummary(null);
        setLoadState(error instanceof ApiError && error.status === 404 ? 'not-found' : 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, currentPeriod]);

  if (loadState === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Ügyfél betöltése…</div>;
  }

  if (loadState === 'not-found') {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-yellow-800">
          Ügyfél nem található.
        </div>
        <BackToClients />
      </div>
    );
  }

  if (loadState === 'error' || !client) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700" role="alert">
          Az ügyfél adatai jelenleg nem érhetők el. Ellenőrizd a kapcsolatot, vagy próbáld újra.
        </div>
        <BackToClients />
      </div>
    );
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
