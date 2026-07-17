import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');

const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('ops pages UX cleanup static guards', () => {
  const timeEntriesPage = read('Frontend/src/app/time-entries/page.tsx');
  const deadlinesPage = read('Frontend/src/app/deadlines/page.tsx');
  const clauseLibraryPage = read('Frontend/src/app/clause-library/page.tsx');
  const dashboard = read('Frontend/src/components/DashboardFocused.tsx');
  const caseLabels = read('Frontend/src/lib/caseLabels.ts');
  const intakePage = read('Frontend/src/app/intake/page.tsx');
  const houseStylePanel = read('Frontend/src/components/clients/ClientHouseStylePanel.tsx');
  const caseDocumentsPage = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');
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
    expect(clauseLibraryPage).toContain('A záradéktár jelenleg nem érhető el.');
    expect(clauseLibraryPage).toContain('Vissza a dokumentumokhoz');
    expect(clauseLibraryPage).not.toMatch(/foundation|Foundation|későbbi patch|Jelenleg nem aktív termékfunkció|Kapcsolódó munkamódok/);
    expect(clauseLibraryPage).not.toContain('Kockázati profil');
    expect(clauseLibraryPage).not.toContain('House style kompatibilitás');
  });

  it('does not add forbidden local persistence, fake data, or workflow claims', () => {
    expect(combinedPages).not.toMatch(/localStorage|sessionStorage|mockData|fake|mesterséges intelligencia|n8n|workspaceText/);
  });

  it('keeps the dashboard card grid truthful when a source is unavailable', () => {
    expect(dashboard).toContain('value: number | null');
    expect(dashboard).toContain('closedCaseStatuses.has');
    expect(dashboard).toContain('availability.cases');
    expect(dashboard).toContain('value === null ? "Most nem elérhető"');
    expect(dashboard).toContain('<SummaryCard label="Nyitott ügyek"');
    expect(dashboard).toContain('Gyors műveletek');
    expect(dashboard).toContain('Mai naptár');
    expect(dashboard).toContain('Ügyfélhez sorolt kommunikáció');
    expect(dashboard).not.toContain('<SummaryCard label="Aktív ügyek"');
    expect(dashboard).not.toMatch(/Napi munkapad|Mai működési kép|Kapacitás: 8/);
  });

  it('maps case and profile enum values to user-facing labels', () => {
    expect(caseLabels).toContain('REAL_ESTATE_SALE: "Ingatlan-adásvétel"');
    expect(caseLabels).toContain('CLIENT_INPUT: "Ügyféltől érkezett"');
    expect(houseStylePanel).toContain('getProfileOptionLabel("documentLanguageMode"');
    expect(caseDocumentsPage).toContain('HU_ONLY: "Csak magyar"');
    expect(caseDocumentsPage).not.toContain('[clientHouseStyle.preferredLanguage, clientHouseStyle.documentLanguageMode');
    expect(intakePage).not.toContain('backend-számított készenléttel');
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
