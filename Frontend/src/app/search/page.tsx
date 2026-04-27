"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCases,
  getClients,
  getMyTasks,
  searchDocuments,
  type CaseListItem,
  type Client,
  type DocumentSearchItem,
  type TaskItem,
} from "@/lib/api";
import {
  search,
  hasMoreResults,
  highlightMatch,
  type SearchResultItem,
} from "@/lib/search";

export default function SearchPage() {
  return (
    <AuthenticatedApp section="search">
      <SearchPageContent />
    </AuthenticatedApp>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams?.get("q") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [documents, setDocuments] = useState<DocumentSearchItem[]>([]);
  const [searchInput, setSearchInput] = useState(query);

  // Fetch data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [casesRes, clientsRes, tasksRes] = await Promise.all([
          getCases(1, 100).then((r) => r.data),
          getClients().then((r) => r.data),
          getMyTasks(),
        ]);
        setCases(casesRes);
        setClients(clientsRes);
        setTasks(tasksRes);
      } catch (err) {
        console.error("Search data load failed:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Handle search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    } else {
      router.push(`/search`);
    }
  };

  // Sync input with URL on mount/change
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    let isCancelled = false;

    const loadDocumentMatches = async () => {
      if (!query.trim()) {
        setDocuments([]);
        return;
      }

      try {
        const data = await searchDocuments(query, 50);
        if (!isCancelled) {
          setDocuments(data);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Document search load failed:", error);
          setDocuments([]);
        }
      }
    };

    loadDocumentMatches();

    return () => {
      isCancelled = true;
    };
  }, [query]);

  // Search results (computed from cached data)
  const results = useMemo(() => {
    return search(cases, clients, tasks, query, documents);
  }, [query, cases, clients, tasks, documents]);

  const totalResults = results.totalCase + results.totalClient + results.totalTask + results.totalDocument;

  return (
    <div className="flex-1 flex min-h-0 bg-[#fbf9f4]">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-serif text-[#1F2821] mb-1">Keresés</h1>
            <p className="text-xs text-[#7B776D]">Ügyek, ügyfelek és feladatok keresése</p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Keresés: ügy szám, ügyfél neve, feladat címe, dokumentum név..."
                className="flex-1 px-4 py-3 border border-[#DDD7CA] text-sm bg-white"
                autoFocus
              />
              <button
                type="submit"
                className="px-6 py-3 bg-[#06190d] text-white text-sm font-bold uppercase tracking-widest hover:opacity-90"
              >
                Keresés
              </button>
            </div>
          </form>

          {/* Scope Note */}
          <div className="mb-6 p-3 bg-[#f5f3ee] border border-[#c3c8c1]/10">
            <p className="text-[10px] text-[#434843]">
              <strong>Megjegyzés:</strong> Ez a keresés metaadatokon alapul (ügy, ügyfél, feladat, dokumentum fájlnév/típus).
            </p>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-[#e5e2db] rounded w-3/4 mx-auto"></div>
                <div className="h-4 bg-[#e5e2db] rounded w-1/2 mx-auto"></div>
                <div className="h-4 bg-[#e5e2db] rounded w-2/3 mx-auto"></div>
              </div>
              <p className="mt-4 text-xs text-[#7B776D]">Keresés folyamatban...</p>
            </div>
          ) : !query.trim() ? (
            /* Empty Query State */
            <div className="py-12 text-center text-xs text-[#7B776D] border border-dashed border-[#DDD7CA]">
              <p>Kezdjen el gépelni a kereséshez.</p>
              <p className="mt-2 text-[11px] text-[#9C9890]">
                Kereshet ügy szám, ügyfél név, feladat cím alapján.
              </p>
            </div>
          ) : totalResults === 0 ? (
            /* No Results State */
            <div className="py-12 text-center text-xs text-[#7B776D] border border-dashed border-[#DDD7CA]">
              <p>Nincs találat a &quot;{query}&quot; keresésre.</p>
              <p className="mt-2 text-[11px] text-[#9C9890]">
                Próbáljon más kulcsszót: ügy szám, ügyfél neve, dokumentum címe, feladat címe.
              </p>
            </div>
          ) : (
            /* Results */
            <div className="space-y-8">
              {/* Cases */}
              {results.case.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Ügyek ({results.totalCase})
                  </h2>
                  <div className="space-y-2">
                    {results.case.map((item) => (
                      <SearchResultCard key={item.id} item={item} query={query} />
                    ))}
                    {hasMoreResults(results, "case") && (
                      <p className="text-[10px] text-[#9C9890] py-2">További találatok is vannak...</p>
                    )}
                  </div>
                </section>
              )}

              {/* Clients */}
              {results.client.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Ügyfelek ({results.totalClient})
                  </h2>
                  <div className="space-y-2">
                    {results.client.map((item) => (
                      <SearchResultCard key={item.id} item={item} query={query} />
                    ))}
                    {hasMoreResults(results, "client") && (
                      <p className="text-[10px] text-[#9C9890] py-2">További találatok is vannak...</p>
                    )}
                  </div>
                </section>
              )}

              {/* Tasks */}
              {results.task.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Feladatok ({results.totalTask})
                  </h2>
                  <div className="space-y-2">
                    {results.task.map((item) => (
                      <SearchResultCard key={item.id} item={item} query={query} />
                    ))}
                    {hasMoreResults(results, "task") && (
                      <p className="text-[10px] text-[#9C9890] py-2">További találatok is vannak...</p>
                    )}
                  </div>
                </section>
              )}

              {/* Documents */}
              {results.document.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Dokumentumok ({results.totalDocument})
                  </h2>
                  <div className="space-y-2">
                    {results.document.map((item) => (
                      <SearchResultCard key={item.id} item={item} query={query} />
                    ))}
                    {hasMoreResults(results, "document") && (
                      <p className="text-[10px] text-[#9C9890] py-2">További találatok is vannak...</p>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Search result card with highlight matching text
 */
function SearchResultCard({ item, query }: { item: SearchResultItem; query: string }) {
  const titleSegments = highlightMatch(item.title, query);
  const subtitleSegments = highlightMatch(item.subtitle, query);

  return (
    <Link
      href={item.link}
      className="block p-4 border border-[#DDD7CA] bg-white hover:bg-[#FBF9F3] transition-colors"
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          {/* Title with highlight */}
          <p className="text-sm font-semibold text-[#1F2821] truncate">
            {titleSegments.map((seg, i) =>
              seg.highlight ? (
                <mark key={i} className="bg-yellow-200 px-0.5 rounded">
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </p>

          {/* Subtitle with highlight */}
          <p className="text-xs text-[#514D45] mt-1 truncate">
            {subtitleSegments.map((seg, i) =>
              seg.highlight ? (
                <mark key={i} className="bg-yellow-200 px-0.5 rounded">
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </p>

          {/* Case info for tasks */}
          {item.entityType === "task" && item.caseInfo && (
            <p className="text-[10px] text-[#9C9890] mt-1">
              Ügy: {item.caseInfo.caseNumber || "—"} {item.caseInfo.clientName || ""}
            </p>
          )}

          {/* Match indicator */}
          <p className="text-[10px] text-[#9C9890] mt-1">Találat: {item.matchedOn}</p>
        </div>

        {/* Status badge */}
        {item.status && (
          <span className="text-[9px] px-2 py-1 bg-[#f5f3ee] text-[#434843] shrink-0">
            {item.status}
          </span>
        )}
      </div>
    </Link>
  );
}
