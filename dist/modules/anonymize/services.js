// ============================================================================
// ANONYMIZE SERVICE - Dokumentum anonimizálás AI feldolgozáshoz
// ============================================================================
import prisma from '../../config/database.js';
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
};
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export async function anonymizeDocument(params) {
    try {
        // 1. Get document
        const document = await prisma.document.findUnique({
            where: { id: params.documentId },
            include: { case: true }
        });
        if (!document) {
            return { success: false, error: 'Dokumentum nem található' };
        }
        // 2. Get client data from case
        const caseData = document.case;
        let clientData = null;
        if (caseData.clientId) {
            clientData = await prisma.client.findUnique({
                where: { id: caseData.clientId },
                include: { redactorProfile: true }
            });
        }
        // 3. Collect all items to redact
        const itemsToRedact = [];
        const redactedItems = [];
        // Add client name
        if (caseData.clientName && (!params.redactionLevel || params.redactionLevel !== 'CLIENT_ONLY')) {
            itemsToRedact.push(caseData.clientName);
        }
        // Add client details
        if (clientData) {
            if (clientData.name)
                itemsToRedact.push(clientData.name);
            if (clientData.taxId)
                itemsToRedact.push(clientData.taxId);
            if (clientData.personalId)
                itemsToRedact.push(clientData.personalId);
            if (clientData.bankAccount)
                itemsToRedact.push(clientData.bankAccount);
            if (clientData.email)
                itemsToRedact.push(clientData.email);
            if (clientData.phone)
                itemsToRedact.push(clientData.phone);
            if (clientData.address)
                itemsToRedact.push(clientData.address);
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
        // Remove duplicates
        const uniqueItems = [...new Set(itemsToRedact)].filter(i => i && i.length > 2);
        // 4. Get document content (mock - in real app would fetch from SharePoint)
        let content = `Dokumentum: ${document.fileName}\n\n`;
        content += `Ügyfél: ${caseData.clientName}\n`;
        if (clientData) {
            if (clientData.taxId)
                content += `Adószám: ${clientData.taxId}\n`;
            if (clientData.bankAccount)
                content += `Bankszámla: ${clientData.bankAccount}\n`;
            if (clientData.address)
                content += `Cím: ${clientData.address}\n`;
            content += `\nSzerződéses feltételek...\n`;
            content += `${caseData.clientName} (a továbbiakban: Eladó)\n`;
            content += `kötelezettséget vállal arra, hogy...\n`;
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
        const anonymousDoc = await prisma.anonymousDocument.create({
            data: {
                originalDocId: params.documentId,
                caseId: document.caseId,
                content: redactedContent,
                redactedItems: redactedItems,
                aiTask: params.aiTask || null,
                customPrompt: params.customPrompt || null
            }
        });
        // 7. Create timeline event
        await prisma.timelineEvent.create({
            data: {
                caseId: document.caseId,
                userId: params.userId,
                type: TimelineType.DOCUMENT_ANONYMIZED_FOR_AI,
                payload: {
                    documentId: params.documentId,
                    anonymousDocId: anonymousDoc.id,
                    aiTask: params.aiTask,
                    redactedCount: redactedItems.length
                }
            }
        });
        // 8. Generate AI-ready prompt
        let aiReadyPrompt = '';
        if (params.aiTask) {
            const taskInstructions = {
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
    }
    catch (error) {
        console.error('Anonymize error:', error);
        return { success: false, error: 'Hiba az anonimizálás során' };
    }
}
// ============================================================================
// Get client redaction profile
// ============================================================================
export async function getClientRedactionProfile(clientId) {
    return prisma.clientRedactionProfile.findUnique({
        where: { clientId }
    });
}
// ============================================================================
// Create/update client redaction profile
// ============================================================================
export async function upsertRedactionProfile(params) {
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
        },
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
        }
    });
}
// ============================================================================
// Get anonymous document
// ============================================================================
export async function getAnonymousDocument(docId) {
    return prisma.anonymousDocument.findUnique({
        where: { id: docId }
    });
}
export default {
    anonymizeDocument,
    getClientRedactionProfile,
    upsertRedactionProfile,
    getAnonymousDocument
};
//# sourceMappingURL=services.js.map