import fs from 'fs';
import path from 'path';
import {
  CLIENT_COLOR_KEYS,
  NEUTRAL_CLIENT_COLOR,
  getClientColorDefinition,
  getClientColorLabel,
} from '../../Frontend/src/lib/clientColors';

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('client color frontend contract', () => {
  const palette = read('Frontend/src/lib/clientColors.ts');
  const selector = read('Frontend/src/components/clients/ClientColorSelector.tsx');
  const clientsPage = read('Frontend/src/app/clients/page.tsx');
  const clientDetailPage = read('Frontend/src/app/clients/[clientId]/page.tsx');
  const tasksPage = read('Frontend/src/app/tasks/page.tsx');
  const casesList = read('Frontend/src/components/CasesList.tsx');

  it('keeps one explicit deterministic palette with a neutral fallback', () => {
    expect(CLIENT_COLOR_KEYS).toEqual(['RED', 'ORANGE', 'AMBER', 'GREEN', 'TEAL', 'BLUE', 'INDIGO', 'PURPLE', 'ROSE', 'SLATE']);
    for (const key of CLIENT_COLOR_KEYS) {
      expect(palette).toContain(`${key}:`);
    }
    expect(getClientColorDefinition(null)).toBe(NEUTRAL_CLIENT_COLOR);
    expect(getClientColorDefinition('UNKNOWN')).toBe(NEUTRAL_CLIENT_COLOR);
    expect(getClientColorDefinition('BLUE')).toBe(getClientColorDefinition('BLUE'));
    expect(getClientColorLabel('GREEN')).toBe('Zöld');
    expect(palette).toContain('NEUTRAL_CLIENT_COLOR');
    expect(palette).toContain('getClientColorDefinition');
    expect(palette).not.toContain('charCodeAt');
  });

  it('uses an accessible controlled selector and no free-form color input', () => {
    expect(selector).toContain('type="radio"');
    expect(palette).toContain('Nincs színjelölés');
    expect(selector).toContain('Kiválasztva');
    expect(`${clientsPage}\n${clientDetailPage}`).not.toContain('type="color"');
    expect(`${clientsPage}\n${clientDetailPage}`).not.toContain('localStorage');
  });

  it('renders inherited bars without changing lifecycle status components', () => {
    expect(tasksPage).toContain('getClientAccentBorderClass(task.case.clientColorKey)');
    expect(casesList).toContain('getClientAccentBorderClass(item.clientColorKey)');
    expect(tasksPage).toContain('AdminStatusPill');
    expect(casesList).toContain('AdminStatusPill');
    expect(casesList).not.toContain('getClientColor(item.clientName)');
    expect(casesList).not.toContain('charCodeAt');
  });

  it('removes the static client-page explanation panels and preserves names', () => {
    expect(clientsPage).not.toContain('Lista fókusz');
    expect(clientsPage).not.toContain('House style termékérték');
    expect(clientsPage).not.toContain('Külső prompt workflow');
    expect(clientsPage).toContain('client.name');
  });
});
