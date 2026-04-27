// ============================================================================
// ANONYMIZE SERVICE - Dokumentum anonimizálás AI feldolgozáshoz
// ============================================================================

import prisma from '../../config/database.js';
import { extractText } from '../documents/textExtractor.js';
import { default as driveService } from '../sharepoint/driveService.js';

const TimelineType = {
  CASE_CREATED: 'CASE_CREATED',
  CASE_STATUS_CHANGED: 'CASE_STATUS_CHANGED',
  CASE_REOPENED: 'CASE_REOPENED',
  CLIENT_DATA_REGISTERED: 'CLIENT_DATA_REGISTERED',
  CONTRACT_GENERATED: 'CONTRACT_GENERATED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_MOVED: 'DOCUMENT_MOVED',
  SENT_TO_REVIEW: 'SENT_TO_REVIEW',
  CONTRACT_APPROVED: 'CONTRACT_APPROVED',
  CONTRACT_REJECTED: 'CONTRACT_REJECTED',
  SENT_TO_CLIENT: 'SENT_TO_CLIENT',
  CLIENT_FEEDBACK_RECEIVED: 'CLIENT_FEEDBACK_RECEIVED',
  CASE_COMPLETED: 'CASE_COMPLETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_STARTED: 'TASK_STARTED',
  TASK_SUBMITTED: 'TASK_SUBMITTED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_REJECTED: 'TASK_REJECTED',
  DOCUMENT_ANONYMIZED_FOR_AI: 'DOCUMENT_ANONYMIZED_FOR_AI',
  CHECKED_OUT: 'CHECKED_OUT',
  CHECKED_IN: 'CHECKED_IN',
  VERSION_CREATED: 'VERSION_CREATED',
  PERMISSION_GRANTED: 'PERMISSION_GRANTED'
} as const;

// ============================================================================
// Redakció patterns
// ============================================================================

interface RedactionItem {
  type: string;
  original: string;
  replacement: string;
  position: number;
}

// ============================================================================
// Counterparty structured input (minimal shape for extra-party context)
// ============================================================================

interface CounterpartyInput {
  name: string;
  side: 'OPPONENT' | 'ADDITIONAL_PARTY';
  partyType?: 'PERSON' | 'COMPANY' | 'UNKNOWN';
}

interface AnonymizationMetadataInput {
  clientName?: string;
  clientRole?: string;
  counterparty?: string;
  notes?: string;
}

const SOURCE_TEXT_LIMITATION_MESSAGE = 'A dokumentum teljes szöveges előnézete jelenleg nem érhető el. Az anonimizálás a feltöltött dokumentum backend feldolgozásán fut.';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function anonymizeDocument(params: {
  documentId: string;
  userId: string;
  aiTask?: string;
  customPrompt?: string;
  redactionLevel?: 'FULL' | 'CLIENT_ONLY';
  /** Structured extra-party context — counterparty names to redact */
  counterparties?: CounterpartyInput[];
  /** Optional visible text provided by the UI workspace */
  sourceText?: string;
  /** Optional UI metadata context */
  metadata?: AnonymizationMetadataInput;
}): Promise<{
  success: boolean;
  anonymizedDocumentId?: string;
  redactedText?: string;
  redactedItems?: RedactionItem[];
  aiReadyPrompt?: string;
  error?: string;
}> {
  try {
    // 1. Get document — accept both Document (client upload) and ContractGeneration (generated contract)
    // Frontend AnonymizeModal is opened from Document Ledger with contract.id (ContractGeneration.id).
    // This previously only handled Document records, causing 'Dokumentum nem található' for generated contracts.
    let document = await prisma.document.findUnique({
      where: { id: params.documentId },
      include: { case: { include: { client: { include: { redactorProfile: true } } } } }
    });

    let sourceType: 'document' | 'contract' = 'document';
    let contractGen: { filePath: string | null; fileName: string | null; caseId: string } | null = null;

    if (!document) {
      // Fallback: try ContractGeneration (generated contract from template)
      contractGen = await prisma.contractGeneration.findUnique({
        where: { id: params.documentId },
        select: { filePath: true, fileName: true, caseId: true }
      });
      if (contractGen) {
        sourceType = 'contract';
      }
    }

    if (!document && !contractGen) {
      return { success: false, error: 'Dokumentum nem található' };
    }

    // 2. Get case data and client data
    // Document path: include case.client for full client+redactorProfile in one query.
    // ContractGeneration path: fetch case with client+redactorProfile; use it directly (no separate client query).
    let caseData: any = null;
    if (sourceType === 'document') {
      caseData = document.case;
    } else if (contractGen) {
      caseData = await prisma.case.findUnique({
        where: { id: contractGen.caseId },
        include: { client: { include: { redactorProfile: true } } }
      });
    }

    // clientData: reuse eagerly-loaded case.client when available; otherwise fall back to query.
    // For Document path, case.client was included above; for ContractGeneration, same.
    let clientData: any = null;
    if (caseData?.client) {
      clientData = caseData.client;
    } else if (caseData?.clientId) {
      clientData = await prisma.client.findUnique({
        where: { id: caseData.clientId },
        include: { redactorProfile: true }
      });
    }

    // 3. Collect all items to redact
    const itemsToRedact: string[] = [];
    const redactedItems: RedactionItem[] = [];

    // Add client name
    if (caseData.clientName && (!params.redactionLevel || params.redactionLevel !== 'CLIENT_ONLY')) {
      itemsToRedact.push(caseData.clientName);
    }

    // Add case-level client role (e.g., "Megbízó", "Ellenérdekű fél") — helps catch role-prefixed name patterns
    if (caseData.clientRole && (!params.redactionLevel || params.redactionLevel !== 'CLIENT_ONLY')) {
      itemsToRedact.push(caseData.clientRole);
    }

    // Add client details
    if (clientData) {
      if (clientData.name) itemsToRedact.push(clientData.name);
      if (clientData.taxId) itemsToRedact.push(clientData.taxId);
      if (clientData.personalId) itemsToRedact.push(clientData.personalId);
      if (clientData.bankAccount) itemsToRedact.push(clientData.bankAccount);
      if (clientData.email) itemsToRedact.push(clientData.email);
      if (clientData.phone) itemsToRedact.push(clientData.phone);
      if (clientData.address) itemsToRedact.push(clientData.address);
      
      // Add from redactor profile
      if (clientData.redactorProfile) {
        const profile = clientData.redactorProfile;
        itemsToRedact.push(profile.fullName);
        profile.aliases?.forEach(a => itemsToRedact.push(a));
        profile.addresses?.forEach(a => itemsToRedact.push(a));
        profile.taxId && itemsToRedact.push(profile.taxId);
        profile.personalId && itemsToRedact.push(profile.personalId);
        profile.bankAccounts?.forEach(a => itemsToRedact.push(a));
        profile.phones?.forEach(a => itemsToRedact.push(a));
        profile.emails?.forEach(a => itemsToRedact.push(a));
      }
    }

    // Add structured counterparty (opposing party) names — manually provided extra-party context.
    // These are applied alongside known-party redactions for completeness.
    if (params.counterparties && params.counterparties.length > 0) {
      for (const cp of params.counterparties) {
        if (cp.name && cp.name.trim().length > 2) {
          itemsToRedact.push(cp.name.trim());
        }
      }
    }

    // Remove duplicates
    const uniqueItems = [...new Set(itemsToRedact)].filter(i => i && i.length > 2);

    // 4. Get document content (UI-provided text first, otherwise backend extraction)
    let content: string;

    const providedSourceText = typeof params.sourceText === 'string' ? params.sourceText.trim() : '';
    if (providedSourceText.length > 0) {
      content = providedSourceText;
    } else if (sourceType === 'contract' && contractGen?.filePath) {
      // ContractGeneration: read from local filePath (generated contracts are stored in uploads/generated/)
      const fs = require('fs');
      if (!fs.existsSync(contractGen.filePath)) {
        return { success: false, error: 'Generált szerződés fájl nem található: ' + contractGen.filePath };
      }
      const fileBuffer = fs.readFileSync(contractGen.filePath);
      const fileName = contractGen.fileName || 'contract.docx';
      
      const extractionResult = await extractText(
        fileBuffer,
        fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream',
        fileName
      );

      if (!extractionResult.success) {
        return { 
          success: false, 
          error: `Nem sikerült kiolvasni a dokumentum tartalmát: ${extractionResult.error}` 
        };
      }

      content = extractionResult.text || '';
      
      if (!content || content.trim().length === 0) {
        return { 
          success: false, 
          error: `A dokumentum üres vagy nem tartalmaz olvasható szöveget (${extractionResult.format})` 
        };
      }
    } else if (document.spItemId) {
      // Document is stored in SharePoint, fetch and extract
      const fileBuffer = await driveService.downloadDocument(document.spItemId);
      
      if (!fileBuffer) {
        return { success: false, error: 'Nem sikerült letölteni a dokumentumot a SharePointból' };
      }

      const extractionResult = await extractText(
        fileBuffer,
        document.mimeType || 'application/octet-stream',
        document.fileName || undefined
      );

      if (!extractionResult.success) {
        return { 
          success: false, 
          error: `Nem sikerült kiolvasni a dokumentum tartalmát: ${extractionResult.error}` 
        };
      }

      content = extractionResult.text || '';
      
      if (!content || content.trim().length === 0) {
        return { 
          success: false, 
          error: `A dokumentum üres vagy nem tartalmaz olvasható szöveget (${extractionResult.format})` 
        };
      }
    } else {
      // Fallback: no SharePoint ID - document content not accessible
      return { 
        success: false, 
        error: 'A dokumentum nincs feltöltve a SharePointba, nem anonimizálható' 
      };
    }

    // 5. Perform redaction
    let redactedContent = content;
    let position = 0;

    for (const item of uniqueItems) {
      const regex = new RegExp(escapeRegex(item), 'gi');
      const replacement = `[${item.toUpperCase().replace(/[^A-Z0-9]/g, '_')}]`;
      redactedContent = redactedContent.replace(regex, (match) => {
        redactedItems.push({
          type: 'CLIENT_DATA',
          original: match,
          replacement: replacement,
          position: position++
        });
        return replacement;
      });
    }

    // 6. Create AnonymousDocument record
    // Determine caseId and sourceName based on source type
    const sourceCaseId = sourceType === 'document' ? document!.caseId : (contractGen?.caseId || '');
    const sourceName = sourceType === 'document' 
      ? (document!.name || document!.fileName || 'document')
      : (contractGen?.fileName || 'contract');

    // Build effective customPrompt: append counterparty info if provided (for traceability)
    let effectiveCustomPrompt = params.customPrompt || '';
    if (params.counterparties && params.counterparties.length > 0) {
      const validCounterparties = params.counterparties.filter(cp => cp.name && cp.name.trim().length > 0);
      if (validCounterparties.length > 0) {
        const cpList = validCounterparties
          .map(cp => `  - ${cp.name.trim()} (${cp.side}${cp.partyType ? `, ${cp.partyType}` : ''})`)
          .join('\n');
        effectiveCustomPrompt += (effectiveCustomPrompt ? '\n\n' : '') + `Opposing parties (extra-party context):\n${cpList}`;
      }
    }

    if (params.metadata) {
      const metadataLines = [
        params.metadata.clientName ? `Client name: ${params.metadata.clientName}` : null,
        params.metadata.clientRole ? `Client role: ${params.metadata.clientRole}` : null,
        params.metadata.counterparty ? `Counterparty: ${params.metadata.counterparty}` : null,
        params.metadata.notes ? `Notes: ${params.metadata.notes}` : null,
      ].filter(Boolean) as string[];

      if (metadataLines.length > 0) {
        effectiveCustomPrompt += `${effectiveCustomPrompt ? '\n\n' : ''}Workspace metadata:\n${metadataLines.map((line) => `  - ${line}`).join('\n')}`;
      }
    }

    const anonymousDoc = await prisma.anonymousDocument.create({
      data: {
        sourceDocId: params.documentId,
        originalDocId: params.documentId,
        caseId: sourceCaseId,
        content: redactedContent,
        redactedItems: redactedItems as any,
        aiTask: params.aiTask,
        customPrompt: effectiveCustomPrompt,
        name: `[ANONYMIZED] ${sourceName}`,
        patternCount: uniqueItems.length
      } as any
    });

    // 7. Create timeline event
    await prisma.timelineEvent.create({
      data: {
        caseId: sourceCaseId,
        userId: params.userId,
        type: TimelineType.DOCUMENT_ANONYMIZED_FOR_AI,
        payload: {
          documentId: params.documentId,
          anonymousDocId: anonymousDoc.id,
          aiTask: params.aiTask,
          redactedCount: redactedItems.length
        }
      } as any
    });

    // 8. Generate AI-ready prompt
    let aiReadyPrompt = '';
    if (params.aiTask) {
      const taskInstructions: Record<string, string> = {
        'REVIEW_RISKS': 'Elemezd a dokumentumot jogi kockázatok szempontjából.',
        'COMPARE_TEMPLATE': 'Hasonlítsd össze a szerződést a standard mintával.',
        'SUMMARIZE': 'Készíts összefoglalót a dokumentum főbb pontjairól.',
        'CUSTOM': params.customPrompt || 'Elemezd a dokumentumot.'
      };
      
      aiReadyPrompt = `${taskInstructions[params.aiTask] || 'Elemezd a dokumentumot.'}\n\n`;
    }
    
    aiReadyPrompt += `=== ANONIMIZÁLT DOKUMENTUM ===\n\n${redactedContent}`;

    return {
      success: true,
      anonymizedDocumentId: anonymousDoc.id,
      redactedText: redactedContent,
      redactedItems,
      aiReadyPrompt
    };

  } catch (error) {
    console.error('Anonymize error:', error);
    return { success: false, error: 'Hiba az anonimizálás során' };
  }
}

// ============================================================================
// Get client redaction profile
// ============================================================================

export async function getClientRedactionProfile(clientId: string) {
  return prisma.clientRedactionProfile.findUnique({
    where: { clientId }
  });
}

// ============================================================================
// Create/update client redaction profile
// ============================================================================

export async function upsertRedactionProfile(params: {
  clientId: string;
  fullName: string;
  aliases?: string[];
  addresses?: string[];
  taxId?: string;
  personalId?: string;
  bankAccounts?: string[];
  phones?: string[];
  emails?: string[];
}) {
  return prisma.clientRedactionProfile.upsert({
    where: { clientId: params.clientId },
    update: {
      fullName: params.fullName,
      aliases: params.aliases || [],
      addresses: params.addresses || [],
      taxId: params.taxId,
      personalId: params.personalId,
      bankAccounts: params.bankAccounts || [],
      phones: params.phones || [],
      emails: params.emails || []
    } as any,
    create: {
      clientId: params.clientId,
      fullName: params.fullName,
      aliases: params.aliases || [],
      addresses: params.addresses || [],
      taxId: params.taxId,
      personalId: params.personalId,
      bankAccounts: params.bankAccounts || [],
      phones: params.phones || [],
      emails: params.emails || []
    } as any
  });
}

// ============================================================================
// Get anonymous document
// ============================================================================

export async function getAnonymousDocument(docId: string) {
  return prisma.anonymousDocument.findUnique({
    where: { id: docId }
  });
}

// ============================================================================
// Get source text preview for anonymization workspace (best effort, honest fallback)
// ============================================================================

export async function getAnonymizationSourceText(documentId: string): Promise<{
  success: boolean;
  textAvailable: boolean;
  sourceText?: string;
  limitationMessage?: string;
  error?: string;
}> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        spItemId: true,
      },
    });

    if (document?.spItemId) {
      const fileBuffer = await driveService.downloadDocument(document.spItemId);
      if (fileBuffer) {
        const extracted = await extractText(
          fileBuffer,
          document.mimeType || 'application/octet-stream',
          document.fileName || undefined
        );

        const text = extracted.success ? (extracted.text || '').trim() : '';
        if (text.length > 0) {
          return {
            success: true,
            textAvailable: true,
            sourceText: text,
          };
        }
      }
    }

    const contract = await prisma.contractGeneration.findUnique({
      where: { id: documentId },
      select: {
        filePath: true,
        fileName: true,
      },
    });

    if (contract?.filePath) {
      const fs = require('fs');
      if (fs.existsSync(contract.filePath)) {
        const fileBuffer = fs.readFileSync(contract.filePath);
        const extracted = await extractText(
          fileBuffer,
          contract.fileName?.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/octet-stream',
          contract.fileName || undefined
        );

        const text = extracted.success ? (extracted.text || '').trim() : '';
        if (text.length > 0) {
          return {
            success: true,
            textAvailable: true,
            sourceText: text,
          };
        }
      }
    }

    return {
      success: true,
      textAvailable: false,
      limitationMessage: SOURCE_TEXT_LIMITATION_MESSAGE,
    };
  } catch (error) {
    console.error('Get anonymization source text error:', error);
    return {
      success: true,
      textAvailable: false,
      limitationMessage: SOURCE_TEXT_LIMITATION_MESSAGE,
    };
  }
}

// ============================================================================
// List anonymous documents by case
// ============================================================================

export async function listAnonymousDocumentsByCase(caseId: string) {
  return prisma.anonymousDocument.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' }
  });
}

// ============================================================================
// List anonymous documents by source document
// ============================================================================

export async function listAnonymousDocumentsBySource(sourceDocId: string) {
  return prisma.anonymousDocument.findMany({
    where: { sourceDocId },
    orderBy: { createdAt: 'desc' }
  });
}

// ============================================================================
// Rehydration types
// ============================================================================

interface RehydrationWarning {
  token: string;
  reason: string;
  original?: string;
}

interface RehydrationResult {
  success: boolean;
  rehydratedContent: string | null;
  rehydrationStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  warnings: RehydrationWarning[];
  totalTokens: number;
  resolvedTokens: number;
  unresolvedTokens: number;
  error?: string;
}

// ============================================================================
// Rehydrate document using stored token mapping
// ============================================================================

function rehydrateDocument(
  aiResponseText: string,
  redactedItems: RedactionItem[]
): RehydrationResult {
  if (!aiResponseText || aiResponseText.trim().length === 0) {
    return {
      success: false,
      rehydratedContent: null,
      rehydrationStatus: 'FAILED',
      warnings: [{ token: '', reason: 'AI response text is empty' }],
      totalTokens: redactedItems.length,
      resolvedTokens: 0,
      unresolvedTokens: redactedItems.length,
      error: 'AI response text is empty'
    };
  }

  if (!redactedItems || redactedItems.length === 0) {
    return {
      success: true,
      rehydratedContent: aiResponseText,
      rehydrationStatus: 'COMPLETE',
      warnings: [],
      totalTokens: 0,
      resolvedTokens: 0,
      unresolvedTokens: 0
    };
  }

  const warnings: RehydrationWarning[] = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;

  // Build a map of replacement -> original for fast lookup
  // Key is the replacement token (e.g., "[NOVAK_JANOS]")
  const tokenMap = new Map<string, string>();

  for (const item of redactedItems) {
    const normalizedReplacement = item.replacement.toUpperCase().trim();
    tokenMap.set(normalizedReplacement, item.original);
  }

  // Find all placeholders in the AI response using regex
  // Format: [TOKEN_NAME] with alphanumeric and underscore
  const placeholderRegex = /\[([A-Z0-9_]+)\]/g;

  let result = aiResponseText;
  let match;

  // Track which tokens we've resolved
  const resolvedTokens = new Set<string>();

  // First pass: try exact replacement for placeholders in [TOKEN] format
  while ((match = placeholderRegex.exec(aiResponseText)) !== null) {
    const placeholder = match[0]; // e.g., "[NOVAK_JANOS]"
    const tokenKey = match[1].toUpperCase(); // e.g., "NOVAK_JANOS"

    const normalizedKey = `[${tokenKey}]`;
    const original = tokenMap.get(normalizedKey);

    if (original) {
      result = result.replace(new RegExp(escapeRegex(placeholder), 'g'), original);
      resolvedTokens.add(normalizedKey);
      resolvedCount++;
    } else {
      // Check if this looks like one of our tokens (all caps with underscores)
      if (tokenKey.includes('_') || /^[A-Z]{2,}$/.test(tokenKey)) {
        warnings.push({
          token: placeholder,
          reason: 'Token not found in mapping',
          original: undefined
        });
        unresolvedCount++;
      }
    }
  }

  // Second pass: check for any unresolved tokens by looking for common patterns
  for (const item of redactedItems) {
    const normalizedReplacement = item.replacement.toUpperCase().trim();

    if (!resolvedTokens.has(normalizedReplacement)) {
      // Check if we see our placeholder pattern anywhere unresolved
      const remainingPlaceholders = result.match(/\[([A-Z0-9_]+)\]/g) || [];
      for (const ph of remainingPlaceholders) {
        const phKey = ph.toUpperCase().trim();
        if (phKey === normalizedReplacement && !resolvedTokens.has(phKey)) {
          warnings.push({
            token: ph,
            reason: 'Placeholder still present in output - could not resolve',
            original: item.original
          });
          unresolvedCount++;
          resolvedTokens.add(phKey);
        }
      }
    }
  }

  // Determine overall status
  let status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  if (unresolvedCount === 0) {
    status = 'COMPLETE';
  } else if (resolvedCount > 0) {
    status = 'PARTIAL';
  } else {
    status = 'FAILED';
  }

  return {
    success: status !== 'FAILED',
    rehydratedContent: result,
    rehydrationStatus: status,
    warnings,
    totalTokens: redactedItems.length,
    resolvedTokens: resolvedCount,
    unresolvedTokens: unresolvedCount
  };
}

// ============================================================================
// Save rehydrated result as a document
// ============================================================================

export async function saveRehydratedResultToDocument(params: {
  anonymousDocId: string;
  userId?: string;
}): Promise<{
  success: boolean;
  documentId?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    // 1. Get the anonymous document with rehydrated content
    const anonDoc = await prisma.anonymousDocument.findUnique({
      where: { id: params.anonymousDocId }
    });

    if (!anonDoc) {
      return { success: false, error: 'Anoním dokumentum nem található' };
    }

    if (!anonDoc.rehydratedContent) {
      return { success: false, error: 'Nincs rehidratált tartalom' };
    }

    if (!anonDoc.caseId) {
      return { success: false, error: 'A dokumentum nincs esethez rendelve' };
    }

    if (anonDoc.rehydrationStatus === 'FAILED') {
      return { success: false, error: 'Rehydration failed - cannot save' };
    }

    // 2. Get the case to retrieve clientId
    const caseData = await prisma.case.findUnique({
      where: { id: anonDoc.caseId }
    });

    if (!caseData) {
      return { success: false, error: 'Esets adatok nem találhatók' };
    }

    if (!caseData.clientId) {
      return { success: false, error: 'Az esethez nincs ügyfél rendelve' };
    }

    // 3. Create a text file with the rehydrated content
    const fileName = `${anonDoc.name || 'document'}_ai_analysis.txt`;
    const fileContent = Buffer.from(anonDoc.rehydratedContent, 'utf-8');

    // 4. Upload to SharePoint using already-imported driveService
    const uploadResult = await driveService.uploadDocument({
      caseId: anonDoc.caseId,
      fileName: fileName,
      content: fileContent,
      mimeType: 'text/plain',
      folder: '08_Anonymized'
    });

    if (!uploadResult.success || !uploadResult.item) {
      return { success: false, error: uploadResult.error || 'SharePoint upload failed' };
    }

    // 5. Create Document record in database with required fields
    const document = await prisma.document.create({
      data: {
        caseId: anonDoc.caseId,
        clientId: caseData.clientId,
        name: fileName,
        category: 'RESEARCH' as any, // AI analysis is research
        spItemId: uploadResult.item.id,
        spWebUrl: uploadResult.webUrl || undefined,
        spPath: uploadResult.webUrl || undefined,
        fileName: fileName,
        folder: '08_Anonymized',
        version: '1',
        documentType: 'AI_ANALYSIS',
        isLatest: true
      }
    });

    // 6. Create TimelineEvent for traceability
    await prisma.timelineEvent.create({
      data: {
        caseId: anonDoc.caseId,
        userId: params.userId,
        type: 'DOCUMENT_UPLOADED' as any,
        payload: {
          documentId: document.id,
          fileName: fileName,
          documentType: 'AI_ANALYSIS',
          sourceAnonymousDocId: anonDoc.id,
          sourceDocId: anonDoc.sourceDocId,
          rehydrationStatus: anonDoc.rehydrationStatus,
          spItemId: uploadResult.item.id
        }
      } as any
    });

    return {
      success: true,
      documentId: document.id,
      fileName: fileName
    };

  } catch (error) {
    console.error('Save rehydrated result error:', error);
    return { success: false, error: 'Hiba a dokumentum mentése során' };
  }
}

// ============================================================================
// Import AI response and rehydrate
// ============================================================================

export async function importAIResponse(params: {
  anonymousDocId: string;
  aiResponseText: string;
  userId?: string;
}): Promise<{
  success: boolean;
  anonymousDocId?: string;
  rehydrationStatus?: 'PENDING' | 'COMPLETE' | 'PARTIAL' | 'FAILED';
  rehydratedContent?: string;
  warnings?: RehydrationWarning[];
  totalTokens?: number;
  resolvedTokens?: number;
  unresolvedTokens?: number;
  error?: string;
}> {
  try {
    // 1. Get the anonymous document with its redacted items
    const anonDoc = await prisma.anonymousDocument.findUnique({
      where: { id: params.anonymousDocId }
    });

    if (!anonDoc) {
      return { success: false, error: 'Anoním dokumentum nem található' };
    }

    // 2. Parse redacted items
    let redactedItems: RedactionItem[] = [];
    if (anonDoc.redactedItems) {
      if (typeof anonDoc.redactedItems === 'string') {
        redactedItems = JSON.parse(anonDoc.redactedItems as string);
      } else {
        redactedItems = anonDoc.redactedItems as unknown as RedactionItem[];
      }
    }

    // 3. Perform rehydration
    const rehydrationResult = rehydrateDocument(params.aiResponseText, redactedItems);

    // 4. Update the anonymous document with AI response and rehydrated content
    await prisma.anonymousDocument.update({
      where: { id: params.anonymousDocId },
      data: {
        aiResponseText: params.aiResponseText,
        rehydratedContent: rehydrationResult.rehydratedContent,
        rehydrationStatus: rehydrationResult.rehydrationStatus,
        rehydrationWarnings: rehydrationResult.warnings as any,
        rehydratedAt: new Date()
      } as any
    });

    // 5. Create timeline event for audit trail
    if (anonDoc.caseId) {
      await prisma.timelineEvent.create({
        data: {
          caseId: anonDoc.caseId,
          userId: params.userId,
          type: 'ANONYMIZATION_COMPLETED',
          payload: {
            anonymousDocId: params.anonymousDocId,
            sourceDocId: anonDoc.sourceDocId,
            rehydrationStatus: rehydrationResult.rehydrationStatus,
            resolvedTokens: rehydrationResult.resolvedTokens,
            unresolvedTokens: rehydrationResult.unresolvedTokens
          }
        } as any
      });
    }

    return {
      success: rehydrationResult.success,
      anonymousDocId: params.anonymousDocId,
      rehydrationStatus: rehydrationResult.rehydrationStatus as 'PENDING' | 'COMPLETE' | 'PARTIAL' | 'FAILED',
      rehydratedContent: rehydrationResult.rehydratedContent || undefined,
      warnings: rehydrationResult.warnings,
      totalTokens: rehydrationResult.totalTokens,
      resolvedTokens: rehydrationResult.resolvedTokens,
      unresolvedTokens: rehydrationResult.unresolvedTokens
    };

  } catch (error) {
    console.error('Import AI response error:', error);
    return { success: false, error: 'Hiba az AI válasz importálása során' };
  }
}

export default {
  anonymizeDocument,
  getClientRedactionProfile,
  upsertRedactionProfile,
  getAnonymousDocument,
  getAnonymizationSourceText,
  listAnonymousDocumentsByCase,
  listAnonymousDocumentsBySource,
  importAIResponse,
  saveRehydratedResultToDocument
};
