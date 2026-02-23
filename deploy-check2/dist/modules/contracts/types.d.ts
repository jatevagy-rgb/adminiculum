/**
 * Contract Generation Types
 * Type definitions for contract template management and generation
 */
export interface ContractTemplate {
    id: string;
    name: string;
    description: string | null;
    category: string;
    templatePath: string;
    originalFileName: string | null;
    variables: TemplateVariable[];
    isActive: boolean;
    isDefault: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface TemplateVariable {
    name: string;
    label?: string;
    type: 'string' | 'number' | 'date' | 'address' | 'person' | 'money';
    required?: boolean;
    defaultValue?: string;
    placeholder?: string;
    description?: string;
}
export type TemplateCategory = 'ADASVETEL' | 'BERLET' | 'MEGBIZAS' | 'MUNKASZERZODES' | 'VALLALKOZAS' | 'EGYEB';
export interface GenerateContractInput {
    templateId: string;
    caseId?: string;
    data: Record<string, any>;
    title?: string;
    userId?: string;
}
export interface GeneratePreviewInput {
    templateId: string;
    data: Record<string, any>;
}
export interface ContractGenerationResult {
    success: boolean;
    document?: {
        id: string;
        title: string;
        fileName: string;
        filePath: string;
        fileSize: number;
        templateId: string;
        caseId?: string;
        generatedAt: Date;
    };
    preview?: {
        base64Content: string;
        fileName: string;
    };
    error?: string;
}
export interface ContractListItem {
    id: string;
    title: string;
    templateName: string;
    category: string;
    status: string;
    caseId?: string;
    generatedAt: Date;
}
export declare const ADASVETEL_VARIABLES: TemplateVariable[];
//# sourceMappingURL=types.d.ts.map