import Link from 'next/link';

const cards = [
  {
    mode: 'individual',
    title: 'Magánügyfél',
    body: 'Saját ügyei, teendői, státuszfrissítései és megosztott dokumentumai egy egyszerű privát ügyfélszobában.',
    points: ['saját ügyek', 'ügyfélre váró teendők', 'dokumentumok', 'következő lépés'],
    cta: 'Belépés magánügyfélként',
  },
  {
    mode: 'organization',
    title: 'Szervezeti ügyfél',
    body: 'Céges ügyek, ügyenkénti kommunikáció, publikált dokumentumok, szervezeti egységek és jogosultság szerinti vezetői összesítés.',
    points: ['saját és megosztott céges ügyek', 'új megkeresések', 'ügyenkénti kommunikáció', 'publikált dokumentumok', 'szervezeti egységek', 'vezetői összesítés jogosultság szerint'],
    cta: 'Belépés szervezeti ügyfélként',
  },
  {
    mode: 'case-relay',
    title: 'Ügyátvezető',
    body: 'Saját vállalati rendszer mellett kezelt ügyek regisztrációjának és aktuális állapotának követése.',
    points: ['regisztrált ügyek', 'aktuális állapot', 'következő mérföldkő', 'vezetői összesítés'],
    cta: 'Belépés az Ügyátvezetőbe',
  },
] as const;

export function PortalEntryLanding() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-stone-950" data-testid="portal-entry-landing">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8"><span className="font-serif text-2xl font-semibold">Adminiculum</span></div>
      </header>
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b85f4b]">Ügyfélportál</p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">Melyik ügyfélfelületre szeretne belépni?</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-650">Válassza ki, milyen együttműködési módon használja az Adminiculumot. A tényleges hozzáférést a meghívása és az ügyvédi iroda által beállított jogosultságai határozzák meg.</p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3" role="list" aria-label="Ügyfélfelület kiválasztása">
          {cards.map((card, index) => (
            <article key={card.mode} role="listitem" className="flex min-w-0 flex-col rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-[0_18px_50px_rgba(53,42,35,0.08)] sm:p-7">
              <span className="text-sm font-semibold text-[#b85f4b]">0{index + 1}</span>
              <h2 className="mt-5 font-serif text-3xl font-semibold">{card.title}</h2>
              <p className="mt-4 leading-7 text-stone-700">{card.body}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-stone-700">{card.points.map((point) => <li key={point} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b85f4b]" />{point}</li>)}</ul>
              <Link aria-label={`${card.cta} – ${card.title}`} href={`/portal/login?mode=${card.mode}`} className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#3e2f29] px-5 py-3 text-center font-semibold text-white transition hover:bg-[#b85f4b] focus:outline-none focus:ring-4 focus:ring-[#d99b8e]/50">{card.cta}</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
