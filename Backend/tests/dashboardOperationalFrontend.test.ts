import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('dashboard operational frontend contract', () => {
  const shell = read('Frontend/src/components/AppShell.tsx');
  const topBar = read('Frontend/src/components/TopBar.tsx');
  const dashboard = read('Frontend/src/components/DashboardFocused.tsx');

  it('keeps the Dashboard page title once and uses a distinct shell context', () => {
    expect(shell).toContain('dashboard: "Belső munkapad"');
    expect(topBar).toContain('>Adminiculum</p>');
    expect(dashboard.match(/title="Műszerfal"/g)).toHaveLength(1);
  });

  it('renders authoritative resume labels and the honest empty state', () => {
    expect(dashboard).toContain('action: operational.resume.item.actionLabel');
    expect(dashboard).not.toContain('action: "Munka folytatása"');
    expect(dashboard).toContain('Nincs félbehagyott vagy azonnali beavatkozást igénylő munkája.');
    expect(dashboard).toContain('Az új feladatokat és határidőket az alábbi áttekintésekben találja.');
  });

  it('preserves calendar and communications while replacing the bare counter', () => {
    expect(dashboard).toContain('Array.from({ length: 7 }');
    expect(dashboard).toContain('Ügyek, ahol lépés szükséges');
    expect(dashboard).toContain('Nyitott ügyek:');
    expect(dashboard).toContain('Kommunikáció');
    expect(dashboard).not.toContain('aria-label="Nyitott ügyek összefoglaló"');
    // The legacy "Napi munka összefoglaló" colored work-summary cards were
    // restored (RESTORE-LEGACY-DASHBOARD-WORKLOAD-CARDS-1); the operational
    // case overview coexists with them, as it did historically at a948839.
    expect(dashboard).toContain('<SummaryCard');
    expect(dashboard).toContain('aria-label="Napi munka összefoglaló"');
    expect(dashboard.match(/getDashboardOperationalOverview\(\)/g)).toHaveLength(1);
  });

  it('keeps client accent decorative and status text independent', () => {
    expect(dashboard).toContain('<ClientAccent colorKey={item.client.clientColorKey}');
    expect(dashboard).toContain('getCaseStatusLabel(item.status)');
    expect(dashboard).toContain('item.waitingLabel');
  });
});
