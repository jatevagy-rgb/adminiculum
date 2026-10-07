"use client";
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { Button } from '@/components/ui';
import { GrowAssessmentResult } from '@/components/client-portal/GrowAdaptiveJourney';
import type { PortalGrowAssessmentResult } from '@/lib/clientPortalApi';

type Summary = { id: string; titleHu: string; packVersion: number; completedAt: string; submittedBy: string; processName: string | null; workspaceName: string | null; result: PortalGrowAssessmentResult | null; answers: Array<{ questionHu: string; answerHu: string }>; nextDecisionHu: string };

export function GrowAssessmentSummaries({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState<{ clientId: string; items: Summary[] } | null>(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false; setLoaded(null); setError(false);
    void fetchApi<{ items: Summary[] }>(`/client-company/clients/${encodeURIComponent(clientId)}/grow/assessment-summaries`).then(data => { if (!cancelled) setLoaded({ clientId, items: data.items }); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [clientId, nonce]);
  const items = loaded?.clientId === clientId ? loaded.items : null;
  return <section className="rounded-[12px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5" data-testid="grow-assessment-summaries">
    <h2 className="text-xl font-semibold">Ügyfélfelmérések – deklarált működési jelzések</h2>
    <p className="mt-2 text-sm text-[var(--adm-text-secondary)]">A legutóbbi kitöltések felmérésenként, verziónként, munkaterületenként és folyamatonként; legfeljebb 50 összefoglaló. A válaszok ügyfélközlések; szakmai ellenőrzést igényelnek.</p>
    {error ? <div role="alert"><p>A felmérések nem tölthetők be.</p><Button onClick={() => setNonce(n => n + 1)}>Újrapróbálás</Button></div> : !items ? <p role="status">Betöltés…</p> : items.length === 0 ? <p className="mt-4">Még nincs ügyfél által kitöltött felmérés.</p> : <div className="mt-4 space-y-3">{items.map(item => <details key={item.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] p-3">
      <summary className="min-h-10 cursor-pointer"><span className="font-semibold">{item.titleHu}</span><span className="block text-sm">{item.submittedBy} · {new Date(item.completedAt).toLocaleDateString('hu-HU')} · {item.processName || 'Folyamathoz nem kötött'}{item.workspaceName ? ` · ${item.workspaceName}` : ''}</span><span className="mt-2 block text-sm">{item.result ? item.result.findings.slice(0, 2).map(f => f.titleHu).join(' ') || item.result.summaryHu : 'A rögzített verzió eredménye nem elérhető.'}</span>{item.result?.unknownAreaCount ? <span className="block text-sm">Nincs elég információ: {item.result.unknownAreaCount} kérdés.</span> : null}</summary>
      <div className="mt-4 space-y-4">{item.result ? <GrowAssessmentResult result={item.result} processName={item.processName} /> : <p>A kitöltés megmaradt; másik verzióval nem értelmezzük újra.</p>}<p className="text-sm"><strong>Következő emberi döntés: </strong>{item.nextDecisionHu}</p>{item.answers.length ? <details><summary className="min-h-10 cursor-pointer py-2 font-semibold">Összes válasz · v{item.packVersion}</summary><dl className="space-y-3">{item.answers.map((a, i) => <div key={i}><dt className="font-medium">{a.questionHu}</dt><dd className="mt-1 text-sm">{a.answerHu}</dd></div>)}</dl></details> : null}</div>
    </details>)}</div>}
  </section>;
}
