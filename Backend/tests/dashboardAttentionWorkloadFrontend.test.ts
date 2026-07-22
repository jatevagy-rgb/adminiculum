import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const active = fs.readFileSync(
  path.join(repoRoot, 'Frontend/src/components/DashboardFocused.tsx'),
  'utf8',
);

describe('dashboard attention workload block is wired into the ACTIVE dashboard', () => {
  it('renders the workload block component in DashboardFocused', () => {
    expect(active).toContain('function DashboardAttentionWorkloadBlock');
    expect(active).toContain('<DashboardAttentionWorkloadBlock');
    expect(active).toContain('Milyen munkák várnak rám?');
  });

  it('reads the attentionWorkload projection from operational-overview (no second fetch)', () => {
    expect(active).toContain('operational?.attentionWorkload');
    // No new endpoint / no parallel workload fetch helper is introduced.
    expect(active).not.toContain('getAttentionWorkload(');
  });

  it('gates unavailability on the operational endpoint availability (partial-load safe)', () => {
    expect(active).toContain('unavailable={!loading && !availability.operational}');
    // The block itself renders an unavailable and an empty state.
    expect(active).toContain('A munkaterhelési adatok most nem érhetők el.');
    expect(active).toContain('Nincs besorolt, Önre váró feladat.');
  });

  it('renders all five categories plus the unclassified bucket', () => {
    expect(active).toContain('workload!.categories.map');
    expect(active).toContain('attentionPresentation(item.attentionCategory)');
    expect(active).toContain('formatEstimateRange(item.minMinutes, item.maxMinutes)');
    expect(active).toContain('workload!.unclassified.count');
    expect(active).toContain('UNCLASSIFIED_LABEL');
  });

  it('places the block between the KPI summary and the operational cases section', () => {
    const kpi = active.indexOf('aria-label="Napi munka összefoglaló"');
    const block = active.indexOf('<DashboardAttentionWorkloadBlock');
    const ops = active.indexOf('dashboard-operational-cases-heading');
    expect(kpi).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(kpi);
    expect(ops).toBeGreaterThan(block);
  });

  it('preserves the existing dashboard blocks (no regression)', () => {
    expect(active).toContain('aria-label="Napi munka összefoglaló"'); // six-card KPI grid
    expect(active).toContain('Ügyek, ahol lépés szükséges'); // operational groups
    expect(active).toContain('Mai munkám'); // daily work
    expect(active).toContain('A műszerfal alapadatai nem tölthetők be.'); // partial-load critical banner
    expect(active).toContain('Gyors műveletek'); // quick actions
  });
});
