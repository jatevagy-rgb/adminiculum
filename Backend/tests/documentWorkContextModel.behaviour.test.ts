/**
 * Canonical work-context model (CONTRACT-WS-WORK-CONTEXT-HEADER-1).
 *
 * The Contract Workspace header, the cockpit work card and the editor all derive
 * their display from one normaliser. These unit tests lock its behaviour so the
 * three surfaces cannot drift: human title primacy, filename fallback, human
 * status labels, partial-data / no-context detection, and — critically — that
 * the selected immutable version is never silently conflated with the current
 * version.
 */
import {
  toWorkContextView,
  workStatusLabel,
  workStatusAccent,
  DOCUMENT_WORK_STATUS_LABELS,
  type WorkContextCardInput,
} from '../../Frontend/src/lib/documents/workContext';

function card(extra: Partial<WorkContextCardInput> = {}): WorkContextCardInput {
  return {
    id: 'doc-1',
    title: 'Bérleti szerződés – felülvizsgálat',
    fileName: 'berleti_szerzodes_v3.docx',
    documentRole: 'Ügyfél szerződése',
    workStatus: 'IN_PROGRESS',
    workInstruction: 'Ellenőrizd a felmondási klauzulát és jelöld a kockázatokat.',
    workInstructionUpdatedAt: '2026-07-20T10:00:00Z',
    workInstructionUpdatedBy: { id: 'u1', name: 'dr. Balogh Anna' },
    responsible: { id: 'u1', name: 'dr. Balogh Anna' },
    reviewer: { id: 'u2', name: 'dr. Szabó Péter' },
    dueDate: '2026-07-29T17:00:00Z',
    workPriority: 'HIGH',
    nextStep: 'Ügyféllel egyeztetés',
    documentType: 'CONTRACT',
    currentVersion: 3,
    updatedAt: '2026-07-21T12:00:00Z',
    linkedTasks: [{ linkId: 'l1', taskId: 't1', title: 'Szerződés véleményezése', status: 'IN_PROGRESS', dueDate: null, assignee: { id: 'u1', name: 'dr. Balogh Anna' } }],
    source: { communicationId: 'c1', subject: 'Szerződéstervezet', sender: 'Kovács István', receivedAt: '2026-07-18T09:00:00Z' },
    ...extra,
  };
}

describe('identity', () => {
  it('leads with the human title when one is set', () => {
    expect(toWorkContextView(card()).humanTitle).toBe('Bérleti szerződés – felülvizsgálat');
    expect(toWorkContextView(card()).titleIsFallback).toBe(false);
  });

  it('keeps the original filename as separate secondary metadata', () => {
    const v = toWorkContextView(card());
    expect(v.originalFilename).toBe('berleti_szerzodes_v3.docx');
    expect(v.humanTitle).not.toContain('.docx');
  });

  it('falls back to the filename (without extension) only for a legacy record with no title', () => {
    const v = toWorkContextView(card({ title: null, fileName: 'iktatott_irat_2019.pdf' }));
    expect(v.humanTitle).toBe('iktatott_irat_2019');
    expect(v.titleIsFallback).toBe(true);
  });

  it('degrades to a safe placeholder when neither title nor filename exists', () => {
    expect(toWorkContextView(card({ title: null, fileName: null })).humanTitle).toBe('Névtelen dokumentum');
  });
});

describe('human status labels', () => {
  it('maps every logical status to the exact required Hungarian wording', () => {
    expect(DOCUMENT_WORK_STATUS_LABELS).toMatchObject({
      RECEIVED: 'Beérkezett',
      WAITING_FOR_PROCESSING: 'Feldolgozásra vár',
      IN_PROGRESS: 'Munka alatt',
      INTERNAL_REVIEW: 'Belső review',
      CHANGES_REQUESTED: 'Javításra visszaadva',
      APPROVED: 'Jóváhagyva',
      READY_FOR_CLIENT: 'Ügyfélnek kiküldhető',
      SENT: 'Kiküldve',
      ARCHIVED: 'Archivált',
    });
  });

  it('renders the human label, never the raw enum', () => {
    expect(toWorkContextView(card({ workStatus: 'CHANGES_REQUESTED' })).workStatusLabel).toBe('Javításra visszaadva');
    expect(workStatusLabel('INTERNAL_REVIEW')).toBe('Belső review');
  });

  it('assigns a stable accent per status meaning', () => {
    expect(workStatusAccent('CHANGES_REQUESTED')).toBe('terracotta');
    expect(workStatusAccent('APPROVED')).toBe('green');
    expect(workStatusAccent('ARCHIVED')).toBe('neutral');
    expect(workStatusAccent('RECEIVED')).toBe('petrol');
  });
});

describe('work instruction and responsibility', () => {
  it('exposes the instruction and marks it present', () => {
    const v = toWorkContextView(card());
    expect(v.hasWorkInstruction).toBe(true);
    expect(v.workInstruction).toContain('felmondási');
  });

  it('reports no instruction (for the compact empty state) when blank', () => {
    const v = toWorkContextView(card({ workInstruction: '   ' }));
    expect(v.hasWorkInstruction).toBe(false);
    expect(v.workInstruction).toBeNull();
  });

  it('carries owner, reviewer, due date and priority', () => {
    const v = toWorkContextView(card());
    expect(v.owner?.name).toBe('dr. Balogh Anna');
    expect(v.reviewer?.name).toBe('dr. Szabó Péter');
    expect(v.dueDateLabel).not.toBe('—');
    expect(v.priorityLabel).toBe('Magas');
  });

  it('carries linked task, next step and communication provenance', () => {
    const v = toWorkContextView(card());
    expect(v.linkedTasks).toHaveLength(1);
    expect(v.nextStep).toBe('Ügyféllel egyeztetés');
    expect(v.communicationProvenance).toBe('Szerződéstervezet · Kovács István');
  });
});

describe('version identity is never conflated', () => {
  it('defaults the selected version to the current version', () => {
    const v = toWorkContextView(card({ currentVersion: 3 }));
    expect(v.selectedVersion).toBe(3);
    expect(v.currentVersion).toBe(3);
    expect(v.isHistoricalVersion).toBe(false);
  });

  it('marks a strictly older selected version as historical, keeping current truthful', () => {
    const v = toWorkContextView(card(), { selectedVersion: 1, currentVersion: 3 });
    expect(v.selectedVersion).toBe(1);
    expect(v.currentVersion).toBe(3);
    expect(v.isHistoricalVersion).toBe(true);
  });

  it('does not treat the newest selected version as historical', () => {
    const v = toWorkContextView(card(), { selectedVersion: 3, currentVersion: 3 });
    expect(v.isHistoricalVersion).toBe(false);
  });
});

describe('coarse population states', () => {
  it('is fully populated for a real working document', () => {
    expect(toWorkContextView(card()).hasWorkContext).toBe(true);
  });

  it('detects the no-work-context state for an untouched received record', () => {
    const v = toWorkContextView(card({
      workStatus: 'RECEIVED', workInstruction: null, responsible: null, reviewer: null,
      dueDate: null, nextStep: null, documentRole: null, linkedTasks: [], source: null,
    }));
    expect(v.hasWorkContext).toBe(false);
  });

  it('treats a partially-populated record (owner only) as having work context', () => {
    const v = toWorkContextView(card({
      workStatus: 'RECEIVED', workInstruction: null, reviewer: null, dueDate: null,
      nextStep: null, documentRole: null, linkedTasks: [], source: null,
    }));
    expect(v.hasWorkContext).toBe(true);
    expect(v.owner?.name).toBe('dr. Balogh Anna');
  });
});
