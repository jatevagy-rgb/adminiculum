/**
 * Clause Library Service
 * 
 * Provides:
 * 1. Clause CRUD (shared + per-lawyer)
 * 2. Lawyer profile CRUD
 * 3. Recommendation engine (evaluate triggerConditions against intake answers)
 * 4. Contract assembly draft persistence
 * 5. Assembly-to-generation payload mapping
 * 
 * API:
 * - GET  /api/v1/clause-library/clauses?contractType=&category=&lawyerProfileId=&includeInactive=
 * - GET  /api/v1/clause-library/clauses/:id
 * - POST /api/v1/clause-library/clauses
 * - PUT  /api/v1/clause-library/clauses/:id
 * - DELETE /api/v1/clause-library/clauses/:id
 * 
 * - GET  /api/v1/clause-library/lawyer-profiles
 * - GET  /api/v1/clause-library/lawyer-profiles/:id
 * - PUT  /api/v1/clause-library/lawyer-profiles/:id
 * 
 * - GET  /api/v1/clause-library/assembly/:caseId
 * - POST /api/v1/clause-library/assembly/recommend
 * - PUT  /api/v1/clause-library/assembly/:caseId
 * - DELETE /api/v1/clause-library/assembly/:caseId
 */

import { prisma } from '../../prisma/prisma.service';
import { ClauseContractType, ClauseKind, RepresentedSide, ClauseCategory, AssemblyStatus } from '@prisma/client';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ClauseFilter {
  contractType?: ClauseContractType;
  clauseKind?: ClauseKind;
  representedSide?: RepresentedSide;
  category?: ClauseCategory;
  lawyerProfileId?: string | null; // null = shared only
  includeInactive?: boolean;
  search?: string; // keyword search
}

export interface TriggerCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
  value: any;
}

export interface IntakeAnswer {
  [key: string]: any;
}

export interface ClauseRecommendation {
  clauseId: string;
  slug: string;
  title: string;
  kind: ClauseKind;
  representedSide: RepresentedSide;
  category: ClauseCategory;
  triggerMatched: TriggerCondition[];
  reason: string;
}

export interface ClauseGuidanceItem {
  clauseId: string;
  slug: string;
  title: string;
  kind: ClauseKind;
  category: ClauseCategory;
  reason: string;
}

export interface ReviewGuidanceResult {
  documentId: string;
  contractType: ClauseContractType;
  analyzedField: string;
  detected: ClauseGuidanceItem[];
  missing: ClauseGuidanceItem[];
  suggested: ClauseGuidanceItem[];
}

export interface AssemblyClauseEntry {
  clauseId: string;
  sortOrder: number;
  editedBody?: string | null;
  isManual: boolean;
}

export interface AssemblyUpsertParams {
  caseId: string;
  contractType?: ClauseContractType;
  intakeData: IntakeAnswer;
  selectedClauses: AssemblyClauseEntry[];
  assembledText?: string;
  status?: AssemblyStatus;
  lawyerProfileId?: string;
  templateId?: string;
  userId?: string;
}

// ============================================================================
// Clause Library Service
// ============================================================================

class ClauseLibraryService {

  // --------------------------------------------------------------------------
  // CLAUSE CRUD
  // --------------------------------------------------------------------------

  /**
   * List clauses with filtering
   */
  async listClauses(filter: ClauseFilter = {}): Promise<any[]> {
    const {
      contractType,
      clauseKind,
      representedSide,
      category,
      lawyerProfileId,
      includeInactive = false,
      search,
    } = filter;

    const where: any = {};

    if (contractType) where.contractType = contractType;
    if (clauseKind) where.clauseKind = clauseKind;
    if (representedSide) where.representedSide = representedSide;
    if (category) where.category = category;

    if (!includeInactive) where.isActive = true;

    // Shared + or specific lawyer's clauses
    if (lawyerProfileId === null) {
      where.lawyerProfileId = null;
    } else if (lawyerProfileId) {
      where.OR = [
        { lawyerProfileId: lawyerProfileId },
        { lawyerProfileId: null },
      ];
    } else {
      // Default: shared clauses + active profile's clauses (if any)
      where.OR = [
        { lawyerProfileId: null },
        { lawyerProfileId: { not: null } },
      ];
    }

    if (search) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { keywords: { hasSome: [search.toLowerCase()] } },
          { summary: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const clauses = await prisma.clauseLibraryItem.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    return clauses.map(c => this._formatClause(c));
  }

  /**
   * Get single clause by ID
   */
  async getClause(id: string): Promise<any | null> {
    const clause = await prisma.clauseLibraryItem.findUnique({ where: { id } });
    if (!clause) return null;
    return this._formatClause(clause);
  }

  /**
   * Create a new clause
   */
  async createClause(data: {
    title: string;
    slug: string;
    body: string;
    summary?: string;
    contractType: ClauseContractType;
    clauseKind: ClauseKind;
    representedSide: RepresentedSide;
    category: ClauseCategory;
    keywords?: string[];
    triggerConditions?: TriggerCondition[];
    sortOrder?: number;
    sourceType?: string;
    bankPackTag?: string;
    lawyerProfileId?: string;
  }): Promise<any> {
    const clause = await prisma.clauseLibraryItem.create({
      data: {
        title: data.title,
        slug: data.slug,
        body: data.body,
        summary: data.summary,
        contractType: data.contractType,
        clauseKind: data.clauseKind,
        representedSide: data.representedSide,
        category: data.category,
        keywords: data.keywords || [],
        triggerConditions: data.triggerConditions as any || undefined,
        sortOrder: data.sortOrder ?? 0,
        sourceType: data.sourceType,
        bankPackTag: data.bankPackTag,
        lawyerProfileId: data.lawyerProfileId,
      },
    });
    return this._formatClause(clause);
  }

  /**
   * Update a clause
   */
  async updateClause(id: string, data: Partial<{
    title: string;
    slug: string;
    body: string;
    summary: string;
    keywords: string[];
    triggerConditions: TriggerCondition[];
    sortOrder: number;
    isActive: boolean;
    clauseKind: ClauseKind;
    representedSide: RepresentedSide;
    category: ClauseCategory;
  }>): Promise<any> {
    const clause = await prisma.clauseLibraryItem.update({
      where: { id },
      data: {
        ...data,
        triggerConditions: data.triggerConditions as any,
      },
    });
    return this._formatClause(clause);
  }

  /**
   * Delete a clause
   */
  async deleteClause(id: string): Promise<boolean> {
    try {
      await prisma.clauseLibraryItem.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // LAWYER PROFILE CRUD
  // --------------------------------------------------------------------------

  /**
   * List all lawyer profiles
   */
  async listLawyerProfiles(): Promise<any[]> {
    const profiles = await prisma.lawyerProfile.findMany({
      where: { isActive: true },
      orderBy: { lawyerName: 'asc' },
    });
    return profiles.map(p => this._formatLawyerProfile(p));
  }

  /**
   * Get lawyer profile by ID
   */
  async getLawyerProfile(id: string): Promise<any | null> {
    const profile = await prisma.lawyerProfile.findUnique({ where: { id } });
    if (!profile) return null;
    return this._formatLawyerProfile(profile);
  }

  /**
   * Get lawyer profile by email
   */
  async getLawyerProfileByEmail(email: string): Promise<any | null> {
    const profile = await prisma.lawyerProfile.findUnique({ where: { lawyerEmail: email } });
    if (!profile) return null;
    return this._formatLawyerProfile(profile);
  }

  /**
   * Upsert lawyer profile
   */
  async upsertLawyerProfile(data: {
    lawyerName: string;
    lawyerEmail?: string;
    preferredNumbering?: string;
    defaultClosingText?: string;
    styleNotes?: string;
  }): Promise<any> {
    const existing = data.lawyerEmail
      ? await prisma.lawyerProfile.findUnique({ where: { lawyerEmail: data.lawyerEmail } })
      : null;

    if (existing) {
      const updated = await prisma.lawyerProfile.update({
        where: { id: existing.id },
        data: {
          lawyerName: data.lawyerName,
          preferredNumbering: data.preferredNumbering,
          defaultClosingText: data.defaultClosingText,
          styleNotes: data.styleNotes,
        },
      });
      return this._formatLawyerProfile(updated);
    } else {
      const created = await prisma.lawyerProfile.create({
        data: {
          lawyerName: data.lawyerName,
          lawyerEmail: data.lawyerEmail,
          preferredNumbering: data.preferredNumbering,
          defaultClosingText: data.defaultClosingText,
          styleNotes: data.styleNotes,
        },
      });
      return this._formatLawyerProfile(created);
    }
  }

  // --------------------------------------------------------------------------
  // RECOMMENDATION ENGINE
  // --------------------------------------------------------------------------

  /**
   * Get recommended clauses for a given contract type and intake answers.
   * Evaluates triggerConditions on each clause against the intakeData.
   * 
   * Strategy:
   * - REQUIRED clauses: always recommended (no trigger evaluation needed)
   * - RECOMMENDED clauses: include if triggerConditions are met OR if no triggers
   * - OPTIONAL clauses: include only if triggers are met
   * - SPECIAL clauses: same as RECOMMENDED
   */
  async recommendClauses(params: {
    contractType: ClauseContractType;
    intakeData: IntakeAnswer;
    lawyerProfileId?: string;
  }): Promise<ClauseRecommendation[]> {
    const { contractType, intakeData, lawyerProfileId } = params;

    // Fetch all active clauses for this contract type
    const where: any = {
      contractType,
      isActive: true,
      OR: [
        { lawyerProfileId: null },
        ...(lawyerProfileId ? [{ lawyerProfileId }] : []),
      ],
    };

    const clauses = await prisma.clauseLibraryItem.findMany({ where });

    const recommendations: ClauseRecommendation[] = [];

    for (const clause of clauses) {
      if (clause.clauseKind === 'REQUIRED') {
        recommendations.push({
          clauseId: clause.id,
          slug: clause.slug,
          title: clause.title,
          kind: clause.clauseKind,
          representedSide: clause.representedSide,
          category: clause.category,
          triggerMatched: [],
          reason: 'Kötelező záradék — minden szerződéstípushoz kötelezően mellékelendő.',
        });
        continue;
      }

      const triggers: TriggerCondition[] = (clause.triggerConditions as any) || [];
      const { matches, matchedTriggers } = this._evaluateTriggers(triggers, intakeData);

      if (matches) {
        const reason = matchedTriggers.length > 0
          ? `A(z) ${matchedTriggers.map(t => t.field).join(', ')} tényállás alapján javasolt.`
          : 'A tényállás alapján releváns.';

        recommendations.push({
          clauseId: clause.id,
          slug: clause.slug,
          title: clause.title,
          kind: clause.clauseKind,
          representedSide: clause.representedSide,
          category: clause.category,
          triggerMatched: matchedTriggers,
          reason,
        });
      }
    }

    // Sort by category then sortOrder
    return recommendations.sort((a, b) => {
      const catOrder = Object.keys(ClauseCategory);
      const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
      if (catDiff !== 0) return catDiff;
      return a.title.localeCompare(b.title);
    });
  }

  /**
   * Evaluate trigger conditions against intake answers.
   * Returns true if ALL triggers match (AND logic).
   */
  private _evaluateTriggers(triggers: TriggerCondition[], intakeData: IntakeAnswer): {
    matches: boolean;
    matchedTriggers: TriggerCondition[];
  } {
    if (triggers.length === 0) {
      return { matches: false, matchedTriggers: [] };
    }

    const matchedTriggers: TriggerCondition[] = [];

    for (const trigger of triggers) {
      const fieldValue = intakeData[trigger.field];
      let matches = false;

      switch (trigger.operator) {
        case 'eq':
          matches = fieldValue === trigger.value;
          break;
        case 'neq':
          matches = fieldValue !== trigger.value;
          break;
        case 'in':
          matches = Array.isArray(trigger.value) && trigger.value.includes(fieldValue);
          break;
        case 'nin':
          matches = Array.isArray(trigger.value) && !trigger.value.includes(fieldValue);
          break;
        case 'gt':
          matches = typeof fieldValue === 'number' && fieldValue > trigger.value;
          break;
        case 'lt':
          matches = typeof fieldValue === 'number' && fieldValue < trigger.value;
          break;
        case 'gte':
          matches = typeof fieldValue === 'number' && fieldValue >= trigger.value;
          break;
        case 'lte':
          matches = typeof fieldValue === 'number' && fieldValue <= trigger.value;
          break;
        case 'contains':
          matches = typeof fieldValue === 'string' && fieldValue.includes(String(trigger.value));
          break;
        case 'exists':
          matches = trigger.value === true ? fieldValue !== undefined : fieldValue === undefined;
          break;
      }

      if (matches) {
        matchedTriggers.push(trigger);
      } else {
        // AND logic: any failure means the clause doesn't match
        return { matches: false, matchedTriggers: [] };
      }
    }

    return { matches: matchedTriggers.length > 0, matchedTriggers };
  }

  /**
   * Review guidance for an already generated contract:
   * - detected: clauses likely present in current assembled text
   * - missing: REQUIRED clauses not detected
   * - suggested: RECOMMENDED/SPECIAL clauses with matching triggers (or no triggers)
   */
  async getReviewGuidance(params: {
    documentId: string;
    contractType?: ClauseContractType;
    lawyerProfileId?: string;
  }): Promise<ReviewGuidanceResult> {
    const { documentId, contractType = 'ADASVETEL', lawyerProfileId } = params;

    const generation = await prisma.contractGeneration.findUnique({
      where: { id: documentId },
      select: { id: true, templateData: true },
    });

    if (!generation) {
      throw new Error('Contract generation not found');
    }

    const templateData = (generation.templateData || {}) as Record<string, any>;
    const assembledBody = [
      templateData.assembled_contract_body,
      templateData.assembledText,
      templateData.contract_body,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;

    const analyzedField = assembledBody ? 'assembled_contract_body' : 'templateData';
    const searchableText = assembledBody || JSON.stringify(templateData);
    const normalizedText = this._normalizeText(searchableText);

    const where: any = {
      contractType,
      isActive: true,
      OR: [
        { lawyerProfileId: null },
        ...(lawyerProfileId ? [{ lawyerProfileId }] : []),
      ],
    };

    const clauses = await prisma.clauseLibraryItem.findMany({
      where,
      orderBy: [{ clauseKind: 'asc' }, { category: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
    });

    const intakeData: IntakeAnswer = typeof templateData === 'object' && templateData ? templateData : {};
    const detected: ClauseGuidanceItem[] = [];
    const missing: ClauseGuidanceItem[] = [];
    const suggested: ClauseGuidanceItem[] = [];

    for (const clause of clauses) {
      const signals = this._extractClauseSignals(clause);
      const matchedSignals = signals.filter((signal) => normalizedText.includes(this._normalizeText(signal)));
      const isDetected = matchedSignals.length > 0;

      if (isDetected) {
        detected.push({
          clauseId: clause.id,
          slug: clause.slug,
          title: clause.title,
          kind: clause.clauseKind,
          category: clause.category,
          reason: `Detected by keyword/title signal: ${matchedSignals.slice(0, 2).join(', ')}`,
        });
        continue;
      }

      if (clause.clauseKind === 'REQUIRED') {
        missing.push({
          clauseId: clause.id,
          slug: clause.slug,
          title: clause.title,
          kind: clause.clauseKind,
          category: clause.category,
          reason: 'Required clause not detected in assembled text.',
        });
        continue;
      }

      if (clause.clauseKind === 'RECOMMENDED' || clause.clauseKind === 'SPECIAL') {
        const triggers: TriggerCondition[] = (clause.triggerConditions as any) || [];
        if (triggers.length === 0) {
          suggested.push({
            clauseId: clause.id,
            slug: clause.slug,
            title: clause.title,
            kind: clause.clauseKind,
            category: clause.category,
            reason: 'Recommended clause with no trigger condition.',
          });
          continue;
        }

        const { matches, matchedTriggers } = this._evaluateTriggers(triggers, intakeData);
        if (matches) {
          suggested.push({
            clauseId: clause.id,
            slug: clause.slug,
            title: clause.title,
            kind: clause.clauseKind,
            category: clause.category,
            reason: `Trigger matched on: ${matchedTriggers.map((trigger) => trigger.field).join(', ')}`,
          });
        }
      }
    }

    return {
      documentId: generation.id,
      contractType,
      analyzedField,
      detected: detected.slice(0, 20),
      missing: missing.slice(0, 20),
      suggested: suggested.slice(0, 20),
    };
  }

  private _normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private _extractClauseSignals(clause: {
    slug: string;
    title: string;
    keywords: string[];
  }): string[] {
    const slugParts = String(clause.slug || '')
      .split(/[-_]/g)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4);

    const titleParts = String(clause.title || '')
      .split(/\s+/g)
      .map((part) => part.replace(/[^\p{L}\p{N}]/gu, '').trim())
      .filter((part) => part.length >= 5);

    const keywordParts = Array.isArray(clause.keywords)
      ? clause.keywords.map((keyword) => String(keyword).trim()).filter((keyword) => keyword.length >= 4)
      : [];

    return Array.from(new Set([...slugParts, ...titleParts, ...keywordParts]));
  }

  // --------------------------------------------------------------------------
  // ASSEMBLY DRAFT MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Get assembly draft for a case
   */
  async getAssembly(caseId: string, contractType: ClauseContractType = 'ADASVETEL'): Promise<any | null> {
    const draft = await prisma.contractAssemblyDraft.findUnique({
      where: {
        caseId_contractType: {
          caseId,
          contractType,
        },
      },
      include: {
        clauses: {
          include: { clause: true },
          orderBy: { sortOrder: 'asc' },
        },
        lawyerProfile: true,
      },
    });
    if (!draft) return null;
    return this._formatAssembly(draft);
  }

  /**
   * Upsert assembly draft
   */
  async upsertAssembly(params: AssemblyUpsertParams): Promise<any> {
    const {
      caseId,
      contractType = 'ADASVETEL',
      intakeData,
      selectedClauses,
      assembledText,
      status = 'IN_PROGRESS',
      lawyerProfileId,
      templateId,
      userId,
    } = params;

    // Check if draft exists
    const existing = await prisma.contractAssemblyDraft.findUnique({
      where: {
        caseId_contractType: {
          caseId,
          contractType,
        },
      },
    });

    if (existing) {
      // Delete old clause associations and recreate
      await prisma.contractAssemblyClause.deleteMany({ where: { assemblyDraftId: existing.id } });

      const updated = await prisma.contractAssemblyDraft.update({
        where: { id: existing.id },
        data: {
          contractType,
          intakeData: intakeData as any,
          selectedClauses: selectedClauses as any,
          assembledText,
          status,
          lawyerProfileId,
          templateId,
          clauses: {
            create: selectedClauses.map((entry) => ({
              clauseId: entry.clauseId,
              sortOrder: entry.sortOrder,
              editedBody: entry.editedBody ?? null,
              isManual: entry.isManual,
            })),
          },
        },
        include: {
          clauses: { include: { clause: true }, orderBy: { sortOrder: 'asc' } },
          lawyerProfile: true,
        },
      });
      return this._formatAssembly(updated);
    } else {
      const created = await prisma.contractAssemblyDraft.create({
        data: {
          caseId,
          contractType,
          intakeData: intakeData as any,
          selectedClauses: selectedClauses as any,
          assembledText,
          status,
          lawyerProfileId,
          templateId,
          createdById: userId,
          clauses: {
            create: selectedClauses.map((entry) => ({
              clauseId: entry.clauseId,
              sortOrder: entry.sortOrder,
              editedBody: entry.editedBody ?? null,
              isManual: entry.isManual,
            })),
          },
        },
        include: {
          clauses: { include: { clause: true }, orderBy: { sortOrder: 'asc' } },
          lawyerProfile: true,
        },
      });
      return this._formatAssembly(created);
    }
  }

  /**
   * Update assembly status (e.g., mark READY or GENERATED)
   */
  async updateAssemblyStatus(
    caseId: string,
    status: AssemblyStatus,
    contractType: ClauseContractType = 'ADASVETEL'
  ): Promise<any | null> {
    const draft = await prisma.contractAssemblyDraft.update({
      where: {
        caseId_contractType: {
          caseId,
          contractType,
        },
      },
      data: { status },
      include: {
        clauses: { include: { clause: true }, orderBy: { sortOrder: 'asc' } },
        lawyerProfile: true,
      },
    });
    return this._formatAssembly(draft);
  }

  /**
   * Delete assembly draft
   */
  async deleteAssembly(caseId: string, contractType: ClauseContractType = 'ADASVETEL'): Promise<boolean> {
    try {
      await prisma.contractAssemblyDraft.delete({
        where: {
          caseId_contractType: {
            caseId,
            contractType,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // ASSEMBLY → GENERATION PAYLOAD MAPPER
  // --------------------------------------------------------------------------

  /**
   * Build the flat key-value data object required by generateContract()
   * from an assembly draft + intake data.
   * 
   * This maps clause body text into the template variable format expected
   * by the docxtemplater generation pipeline.
   */
  buildGenerationPayload(params: {
    assembly: any;
    caseId: string;
    title: string;
    userId: string;
    userEmail: string;
  }): {
    templateId: string | null;
    caseId: string;
    data: Record<string, any>;
    title: string;
    userId: string;
    userEmail: string;
  } {
    const { assembly, caseId, title, userId, userEmail } = params;

    // Build data object from intakeData + assembled clauses
    const data: Record<string, any> = {
      ...(assembly.intakeData || {}),
    };

    // Inject assembled contract body with deterministic numbering/title/body formatting
    const clauseEntries = Array.isArray(assembly.selectedClauses) ? assembly.selectedClauses : [];
    const preferredNumbering = assembly?.lawyerProfile?.preferredNumbering || '';
    const styleNotes = assembly?.lawyerProfile?.styleNotes || '';
    const assembledContractBody = this._formatAssembledContractBody({
      clauseEntries,
      preferredNumbering,
      styleNotes,
    });

    data.assembled_contract_body = assembledContractBody || assembly.assembledText || '';

    return {
      templateId: assembly.templateId || null,
      caseId,
      data,
      title,
      userId,
      userEmail,
    };
  }

  /**
   * Build readable plain-text contract body:
   * - optional heading
   * - numbered clause title
   * - clause body
   * - blank line separation
   */
  private _formatAssembledContractBody(params: {
    clauseEntries: Array<any>;
    preferredNumbering?: string;
    styleNotes?: string;
  }): string {
    const { clauseEntries, preferredNumbering = '', styleNotes = '' } = params;

    const sorted = clauseEntries
      .slice()
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const numberingPattern = preferredNumbering.toLowerCase();
    const useParenNumbering = numberingPattern.includes('1)') || numberingPattern.includes('arabic_paren');
    const stylePattern = styleNotes.toLowerCase();
    const uppercaseTitles = stylePattern.includes('uppercase') || stylePattern.includes('nagybet');

    const blocks: string[] = [];

    if (sorted.length > 0) {
      blocks.push('ÖSSZEÁLLÍTOTT SZERZŐDÉSES ZÁRADÉKOK');
    }

    sorted.forEach((entry: any, index: number) => {
      const clauseTitleRaw = String(entry?.clause?.title || `Záradék ${index + 1}`).trim();
      const clauseTitle = uppercaseTitles ? clauseTitleRaw.toUpperCase() : clauseTitleRaw;
      const clauseBody = String(entry?.editedBody || entry?.clause?.body || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const numberToken = useParenNumbering ? `${index + 1})` : `${index + 1}.`;
      const block = `${numberToken} ${clauseTitle}\n${clauseBody}`.trim();

      if (block) {
        blocks.push(block);
      }
    });

    return blocks.join('\n\n');
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _formatClause(clause: any) {
    return {
      id: clause.id,
      title: clause.title,
      slug: clause.slug,
      body: clause.body,
      summary: clause.summary,
      contractType: clause.contractType,
      clauseKind: clause.clauseKind,
      representedSide: clause.representedSide,
      category: clause.category,
      keywords: clause.keywords,
      isActive: clause.isActive,
      sortOrder: clause.sortOrder,
      version: clause.version,
      sourceType: clause.sourceType,
      bankPackTag: clause.bankPackTag,
      lawyerProfileId: clause.lawyerProfileId,
      triggerConditions: clause.triggerConditions,
      createdAt: clause.createdAt,
      updatedAt: clause.updatedAt,
    };
  }

  private _formatLawyerProfile(profile: any) {
    return {
      id: profile.id,
      lawyerName: profile.lawyerName,
      lawyerEmail: profile.lawyerEmail,
      preferredNumbering: profile.preferredNumbering,
      defaultClosingText: profile.defaultClosingText,
      styleNotes: profile.styleNotes,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private _formatAssembly(draft: any) {
    return {
      id: draft.id,
      caseId: draft.caseId,
      contractType: draft.contractType,
      intakeData: draft.intakeData,
      selectedClauses: draft.clauses.map((ac: any) => ({
        id: ac.id,
        clauseId: ac.clauseId,
        sortOrder: ac.sortOrder,
        editedBody: ac.editedBody,
        isManual: ac.isManual,
        clause: {
          id: ac.clause.id,
          title: ac.clause.title,
          slug: ac.clause.slug,
          body: ac.clause.body,
          summary: ac.clause.summary,
          clauseKind: ac.clause.clauseKind,
          representedSide: ac.clause.representedSide,
          category: ac.clause.category,
        },
      })),
      assembledText: draft.assembledText,
      status: draft.status,
      lawyerProfileId: draft.lawyerProfileId,
      lawyerProfile: draft.lawyerProfile ? this._formatLawyerProfile(draft.lawyerProfile) : null,
      templateId: draft.templateId,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      createdById: draft.createdById,
    };
  }
}

export default new ClauseLibraryService();
