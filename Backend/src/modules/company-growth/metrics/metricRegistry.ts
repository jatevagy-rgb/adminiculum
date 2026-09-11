/**
 * GROW WITH US V2 — T2A Canonical Process Metric Registry.
 *
 * Defines metadata, units, and Hungarian display names for the 12 canonical
 * deterministic process metrics.
 */

import { ProcessMetricCode, ProcessMetricUnit } from './metricTypes';

export interface ProcessMetricDefinition {
  code: ProcessMetricCode;
  nameHu: string;
  unit: ProcessMetricUnit;
  description: string;
}

export const CANONICAL_PROCESS_METRIC_CODES: readonly ProcessMetricCode[] = [
  'TOTAL_ACTIVE_MINUTES',
  'TOTAL_WAITING_MINUTES',
  'TOTAL_CYCLE_MINUTES',
  'WAITING_SHARE',
  'APPROVAL_STEP_COUNT',
  'DATA_ENTRY_STEP_COUNT',
  'HANDOFF_STEP_COUNT',
  'RESPONSIBLE_PERSON_CHANGE_COUNT',
  'SYSTEM_COUNT',
  'SYSTEM_SWITCH_COUNT',
  'UNASSIGNED_STEP_COUNT',
  'PROCESS_OWNER_PRESENT',
] as const;

export const PROCESS_METRIC_REGISTRY: Readonly<Record<ProcessMetricCode, ProcessMetricDefinition>> = {
  TOTAL_ACTIVE_MINUTES: {
    code: 'TOTAL_ACTIVE_MINUTES',
    nameHu: 'Összes aktív munkaidő',
    unit: 'MINUTES',
    description: 'A folyamat lépéseire becsült aktív ráfordítási percek összege.',
  },
  TOTAL_WAITING_MINUTES: {
    code: 'TOTAL_WAITING_MINUTES',
    nameHu: 'Összes várakozási idő',
    unit: 'MINUTES',
    description: 'A folyamat lépései között vagy lépéseinél felmerülő becsült várakozási percek összege.',
  },
  TOTAL_CYCLE_MINUTES: {
    code: 'TOTAL_CYCLE_MINUTES',
    nameHu: 'Teljes átfutási idő',
    unit: 'MINUTES',
    description: 'Az összes aktív munkaidő és összes várakozási idő összege.',
  },
  WAITING_SHARE: {
    code: 'WAITING_SHARE',
    nameHu: 'Várakozási idő aránya',
    unit: 'RATIO',
    description: 'A várakozási idő aránya a teljes átfutási időhöz képest. Nulla átfutás esetén értéke null.',
  },
  APPROVAL_STEP_COUNT: {
    code: 'APPROVAL_STEP_COUNT',
    nameHu: 'Jóváhagyási lépések száma',
    unit: 'COUNT',
    description: 'A folyamatban szereplő, kifejezetten jóváhagyásként megjelölt lépések száma.',
  },
  DATA_ENTRY_STEP_COUNT: {
    code: 'DATA_ENTRY_STEP_COUNT',
    nameHu: 'Adatbeviteli lépések száma',
    unit: 'COUNT',
    description: 'A DATA_ENTRY típusú lépések száma a folyamatban.',
  },
  HANDOFF_STEP_COUNT: {
    code: 'HANDOFF_STEP_COUNT',
    nameHu: 'Átadás-átvételi lépések száma',
    unit: 'COUNT',
    description: 'A kifejezetten HANDOFF típusú lépések száma a folyamatban.',
  },
  RESPONSIBLE_PERSON_CHANGE_COUNT: {
    code: 'RESPONSIBLE_PERSON_CHANGE_COUNT',
    nameHu: 'Felelősváltások száma',
    unit: 'COUNT',
    description: 'Az egymást közvetlenül követő lépések közötti felelősváltozások száma, ahol mindkét lépéshez tartozik felelős.',
  },
  SYSTEM_COUNT: {
    code: 'SYSTEM_COUNT',
    nameHu: 'Érintett rendszerek száma',
    unit: 'COUNT',
    description: 'A folyamat lépéseihez rendelt különböző üzleti rendszerek darabszáma.',
  },
  SYSTEM_SWITCH_COUNT: {
    code: 'SYSTEM_SWITCH_COUNT',
    nameHu: 'Rendszerváltások száma',
    unit: 'COUNT',
    description: 'Az egymást közvetlenül követő lépések közötti rendszerváltások száma, ahol mindkét lépéshez tartozik rendszer.',
  },
  UNASSIGNED_STEP_COUNT: {
    code: 'UNASSIGNED_STEP_COUNT',
    nameHu: 'Felelős nélküli lépések száma',
    unit: 'COUNT',
    description: 'Azon lépések száma, amelyekhez nincs kijelölt felelős személy.',
  },
  PROCESS_OWNER_PRESENT: {
    code: 'PROCESS_OWNER_PRESENT',
    nameHu: 'Folyamatgazda jelenléte',
    unit: 'BOOLEAN',
    description: 'Jelzi, hogy a folyamat rendelkezik-e kijelölt felelős folyamatgazdával.',
  },
};
