import { createHash } from 'node:crypto';
import { createVersionedRegistry } from '../src/modules/company-growth/assessments/versionedRegistry';
import { ASSESSMENT_PACKS, ASSESSMENT_ANSWER_VALUES, evaluateAssessmentAnswers, getAssessmentPackVersion, getCurrentAssessmentPack } from '../src/modules/company-growth/assessments/registry';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

it('preserves all 35 V1 definitions and their 161 recorded evaluation cases from a989a6f9', () => {
  expect(ASSESSMENT_PACKS).toHaveLength(4);
  expect(hash(ASSESSMENT_PACKS)).toBe('d697591362c85b478066b70cbefb6615e095bbbb134f02ba78bb3e2836b1214e');
  const evaluations = [];
  for (const pack of ASSESSMENT_PACKS) {
    for (const q of pack.questions) for (const o of q.options) evaluations.push(evaluateAssessmentAnswers(pack.packKey, 1, pack.questions.map(x => ({ questionKey: x.questionKey, answer: x.questionKey === q.questionKey ? o.value : 'UNKNOWN' }))));
    for (const value of ASSESSMENT_ANSWER_VALUES) evaluations.push(evaluateAssessmentAnswers(pack.packKey, 1, pack.questions.map(x => ({ questionKey: x.questionKey, answer: x.options.some(o => o.value === value) ? value : 'UNKNOWN' }))));
    expect(getAssessmentPackVersion(pack.packKey, 1)).toBe(getCurrentAssessmentPack(pack.packKey));
    expect(Object.isFrozen(pack.questions[0].options[0])).toBe(true);
  }
  expect(evaluations).toHaveLength(161);
  expect(hash(evaluations)).toBe('77220c19e6c8019180fd92bc0177a8faeb3cb611da6f175147612d2a64e832b1');
});

it('selects an exact historical definition after a current version advances, never silently upgrades', () => {
  const registry = createVersionedRegistry([{ packKey: 'sample', version: 1, wording: 'original' }, { packKey: 'sample', version: 2, wording: 'new' }]);
  expect(registry.getCurrentAssessmentPack('sample')?.version).toBe(2);
  expect(registry.getAssessmentPackVersion('sample', 1)?.wording).toBe('original');
  expect(registry.getAssessmentPackVersion('sample', 3)).toBeUndefined();
  expect(registry.listCurrentAssessmentPacks()).toHaveLength(1);
  expect(() => createVersionedRegistry([{ packKey: 'x', version: 1 }, { packKey: 'x', version: 1 }])).toThrow('Duplicate');
});
