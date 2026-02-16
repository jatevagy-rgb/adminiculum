interface RedactionItem {
    type: string;
    original: string;
    replacement: string;
    position: number;
}
export declare function anonymizeDocument(params: {
    documentId: string;
    userId: string;
    aiTask?: string;
    customPrompt?: string;
    redactionLevel?: 'FULL' | 'CLIENT_ONLY';
}): Promise<{
    success: boolean;
    anonymizedDocumentId?: string;
    redactedText?: string;
    redactedItems?: RedactionItem[];
    aiReadyPrompt?: string;
    error?: string;
}>;
export declare function getClientRedactionProfile(clientId: string): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    clientId: string;
    addresses: import("@prisma/client/runtime/library.js").JsonValue | null;
    fullName: string | null;
    aliases: import("@prisma/client/runtime/library.js").JsonValue | null;
    taxId: string | null;
    patterns: import("@prisma/client/runtime/library.js").JsonValue;
    personas: import("@prisma/client/runtime/library.js").JsonValue;
    useLLM: boolean;
    llmPrompt: string | null;
}>;
export declare function upsertRedactionProfile(params: {
    clientId: string;
    fullName: string;
    aliases?: string[];
    addresses?: string[];
    taxId?: string;
    personalId?: string;
    bankAccounts?: string[];
    phones?: string[];
    emails?: string[];
}): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    clientId: string;
    addresses: import("@prisma/client/runtime/library.js").JsonValue | null;
    fullName: string | null;
    aliases: import("@prisma/client/runtime/library.js").JsonValue | null;
    taxId: string | null;
    patterns: import("@prisma/client/runtime/library.js").JsonValue;
    personas: import("@prisma/client/runtime/library.js").JsonValue;
    useLLM: boolean;
    llmPrompt: string | null;
}>;
export declare function getAnonymousDocument(docId: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    caseId: string | null;
    spItemId: string | null;
    spWebUrl: string | null;
    content: string | null;
    addresses: import("@prisma/client/runtime/library.js").JsonValue | null;
    originalDocId: string | null;
    redactedAt: Date;
    patternCount: number;
    sourceDocId: string;
}>;
declare const _default: {
    anonymizeDocument: typeof anonymizeDocument;
    getClientRedactionProfile: typeof getClientRedactionProfile;
    upsertRedactionProfile: typeof upsertRedactionProfile;
    getAnonymousDocument: typeof getAnonymousDocument;
};
export default _default;
//# sourceMappingURL=services.d.ts.map