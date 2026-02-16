/**
 * Contracts Service
 * Handles contract template management and document generation
 */
import { ContractTemplate, GenerateContractInput, GeneratePreviewInput, ContractGenerationResult, TemplateCategory } from './types';
declare class ContractsService {
    /**
     * Initialize template directory
     */
    private initDirectories;
    /**
     * Get all active templates
     */
    getTemplates(category?: TemplateCategory): Promise<ContractTemplate[]>;
    /**
     * Get template by ID
     */
    getTemplateById(id: string): Promise<ContractTemplate | null>;
    /**
     * Create new template
     */
    createTemplate(data: {
        name: string;
        description?: string;
        category: TemplateCategory;
        templatePath: string;
        originalFileName?: string;
        variables: any[];
        isDefault?: boolean;
    }): Promise<ContractTemplate | null>;
    /**
     * Process template data - format dates, convert numbers to words, etc.
     */
    private processTemplateData;
    /**
     * Format date to Hungarian locale format
     */
    private formatDate;
    /**
     * Generate contract document
     */
    generateContract(input: GenerateContractInput): Promise<ContractGenerationResult>;
    /**
     * Generate preview (temporary file, auto-deleted)
     */
    generatePreview(input: GeneratePreviewInput): Promise<ContractGenerationResult>;
    /**
     * Get generated contracts for a case
     */
    getCaseContracts(caseId: string): Promise<{
        id: string;
        title: string;
        templateName: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        status: import(".prisma/client").$Enums.GenerationStatus;
        fileName: string;
        fileSize: number | null;
        generatedAt: Date;
    }[]>;
    /**
     * Delete expired previews (cleanup job)
     */
    cleanupExpiredPreviews(): Promise<number>;
    /**
     * Save uploaded template file
     */
    saveTemplateFile(file: {
        name: string;
        data: Buffer;
    }): Promise<string>;
    /**
     * Upload generated contract to SharePoint
     */
    uploadToSharePoint(generationId: string): Promise<{
        success: boolean;
        spItemId?: string;
        spWebUrl?: string;
        error?: string;
    }>;
    /**
     * Get SharePoint upload status for a generation
     */
    getSharePointStatus(generationId: string): Promise<{
        uploaded: boolean;
        spItemId?: string;
        spWebUrl?: string;
        status: string;
    } | null>;
}
declare const _default: ContractsService;
export default _default;
//# sourceMappingURL=services.d.ts.map