"use client";

type RightPanelProps = {
  deadlines?: Array<{
    id: string;
    task: string;
    caseName: string;
    dueDate: string;
    owner: string;
  }>;
};

export function RightPanel({ deadlines = [] }: RightPanelProps) {
  return (
    <aside className="space-y-5">
      <section className="bg-white border border-[#DDD7CA] p-5">
        <h3 className="text-[22px] text-[#1A2E21] mb-3" style={{ fontFamily: 'var(--font-newsreader)' }}>Upcoming Deadlines</h3>
        {deadlines.length > 0 ? (
          <div className="space-y-3">
            {deadlines.map((deadline) => (
              <article key={deadline.id} className="border border-[#E5DFD4] p-3 bg-[#FAF8F2]">
                <p className="text-sm text-[#1F2821]" style={{ fontFamily: 'var(--font-newsreader)' }}>{deadline.task}</p>
                <p className="text-xs text-[#5D5A52] mt-1">{deadline.caseName}</p>
                <p className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mt-2">{deadline.dueDate} · {deadline.owner}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[#DDD7CA] bg-[#FAF8F2] p-4">
            <p className="text-xs text-[#5D5A52]">No upcoming deadlines are currently synced.</p>
            <p className="text-[10px] uppercase tracking-[0.26em] text-[#7B776D] mt-2">
              Calendar integration ready
            </p>
          </div>
        )}
        <button className="w-full mt-4 border border-[#1A2E21] text-[#1A2E21] py-2 text-[10px] uppercase tracking-[0.34em] hover:bg-[#1A2E21] hover:text-white transition-colors">
          View Full Calendar
        </button>
      </section>
    </aside>
  );
}
