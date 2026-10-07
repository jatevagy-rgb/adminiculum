/** Local QA data derived from the actual immutable registry; no database access. */
import fs from 'fs';
import { listCurrentAssessmentPacks, listAssessmentPacks, activeAssessmentQuestions } from '../src/modules/company-growth/assessments/registry';
import { buildResultDto } from '../src/modules/company-growth/assessments/service';
import { V2_PAIN_ROUTES } from '../src/modules/company-growth/assessments/v2Definitions';
import { SURVEY_CATEGORY_LABELS_HU } from '../src/modules/company-observatory/intake';
import { resolveCustomerEvidence } from '../src/modules/company-growth/assessments/evidence';

const target = process.env.GROW_V2_QA_FIXTURE;
if (!target) throw new Error('Set GROW_V2_QA_FIXTURE to a local scratch JSON path.');
const packs = listCurrentAssessmentPacks();
const overrides: Record<string, string> = { qs_duplicate_entry_frequency: 'WEEKLY', v2_data_already_digital: 'ALMOST_ALWAYS', v2_data_transfer_automation: 'NO', v2_source_of_truth_clarity: 'NO', v2_duplicate_entry_error_frequency: 'WEEKLY' };
const examples = Object.fromEntries(packs.map(pack => {
  const all = pack.questions.map(q => ({ questionKey: q.questionKey, answer: overrides[q.questionKey] || 'UNKNOWN' }));
  const active = activeAssessmentQuestions(pack, all);
  const answers = all.filter(a => active.some(q => q.questionKey === a.questionKey));
  return [pack.packKey, { definition: { ...pack, findings: undefined, evidenceCorpusKeys: undefined }, answers, result: buildResultDto(pack.packKey, pack.version, answers, '2026-10-07T08:00:00Z') }];
}));
fs.writeFileSync(target, JSON.stringify({ examples, categories: Object.entries(SURVEY_CATEGORY_LABELS_HU).map(([value, labelHu]) => ({ value, labelHu })), painRoutes: V2_PAIN_ROUTES, v1: listAssessmentPacks(), definitions: packs, evidence: resolveCustomerEvidence([...new Set(packs.flatMap(p => p.evidenceCorpusKeys))]) }, null, 2));
