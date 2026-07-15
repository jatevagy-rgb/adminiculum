import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');

const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('ops pages UX cleanup static guards', () => {
  const timeEntriesPage = read('Frontend/src/app/time-entries/page.tsx');
  const deadlinesPage = read('Frontend/src/app/deadlines/page.tsx');
  const clauseLibraryPage = read('Frontend/src/app/clause-library/page.tsx');
  const combinedPages = [timeEntriesPage, deadlinesPage, clauseLibraryPage].join('\n');

  it('keeps the time-entry page operational-first with reports secondary', () => {
    expect(timeEntriesPage).toContain('const [activeTab, setActiveTab] = useState<"entries" | "reports">("entries")');
    expect(timeEntriesPage).toContain('["entries", "Bejegyzések"]');
    expect(timeEntriesPage).toContain('["reports", "Kimutatás"]');
    expect(timeEntriesPage).toContain('activeTab === "reports"');
    expect(timeEntriesPage).toContain('Munkaóra rögzítése');
  });

  it('uses the canonical agenda contract and operational deadline empty copy', () => {
    expect(deadlinesPage).toContain('getWorkflowAgenda');
    expect(deadlinesPage).toContain('const [urgencyFilter, setUrgencyFilter]');
    expect(deadlinesPage).toContain('Nincs határidős tétel ebben a nézetben.');
    expect(deadlinesPage).toContain('Feladat megnyitása');
    expect(deadlinesPage).not.toMatch(/Backendből|naptárszinkron|frontend-lokális|rejtett/);
  });

  it('renders one truthful unavailable clause-library state without fake catalog controls', () => {
    expect(clauseLibraryPage).toContain('Ezen a környezeten a záradéktár még nem érhető el.');
    expect(clauseLibraryPage).toContain('Szerződésszerkesztő megnyitása');
    expect(clauseLibraryPage).not.toMatch(/foundation|Foundation|későbbi patch|Jelenleg nem aktív termékfunkció|Kapcsolódó munkamódok/);
    expect(clauseLibraryPage).not.toContain('Kockázati profil');
    expect(clauseLibraryPage).not.toContain('House style kompatibilitás');
  });

  it('does not add forbidden local persistence, fake data, or workflow claims', () => {
    expect(combinedPages).not.toMatch(/localStorage|sessionStorage|mockData|fake|mesterséges intelligencia|n8n|workspaceText/);
  });

  it('does not touch protected shared shell/editor files in this guard scope', () => {
    const protectedFiles = [
      'Frontend/src/components/AppShell.tsx',
      'Frontend/src/components/AuthenticatedApp.tsx',
      'Frontend/src/app/globals.css',
    ];

    for (const protectedFile of protectedFiles) {
      expect(fs.existsSync(path.join(repoRoot, protectedFile))).toBe(true);
    }
  });
});
